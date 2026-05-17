const TelegramBot = require("node-telegram-bot-api");

// ══════════════════════════════════════════════
//  הגדרות – שנה כאן בלבד
// ══════════════════════════════════════════════
const BOT_TOKEN  = "8683883313:AAGRsQhQ2Uptu3nY1Jep2phofVyHeutD4aw";
const GROUP_ID   = -5145188815;
const ADMIN_IDS  = [912083700];
// ══════════════════════════════════════════════

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// מאגר עבודות
const jobs = {};
let jobCounter = 0;

// מצב שיחה לכל משתמש
const userState = {};

function isAdmin(userId) {
  return ADMIN_IDS.includes(userId);
}

function jobPostText(job) {
  const left = job.workersLeft;
  const status = left > 0 ? `✅ ${left} מקומות פנויים` : "🔴 כל המקומות מולאו";
  const transport = job.transport ? `\n🚌 הסעה: ${job.transport}` : "";
  const notes = job.notes ? `\n📝 ${job.notes}` : "";
  return (
    `🏗️ *${job.title}*\n\n` +
    `📍 מיקום: ${job.location}\n` +
    `📅 תאריך: ${job.date}\n` +
    `👷 עובדים נדרשים: ${job.workersNeeded}` +
    transport + notes + `\n\n*${status}*`
  );
}

function jobKeyboard(jobId, job) {
  if (job.workersLeft > 0) {
    return {
      inline_keyboard: [[
        { text: "✅ אני מעוניין!", callback_data: `apply:${jobId}` }
      ]]
    };
  }
  return {
    inline_keyboard: [[
      { text: "🔴 אין יותר מקום", callback_data: "full" }
    ]]
  };
}

// ══════════════════════════════════════════════
//  פקודות
// ══════════════════════════════════════════════

bot.onText(/\/start/, (msg) => {
  const uid = msg.from.id;
  if (isAdmin(uid)) {
    bot.sendMessage(uid,
      "👋 שלום מנהל\\!\n\n" +
      "פקודות זמינות:\n" +
      "/newjob – פרסם עבודה חדשה\n" +
      "/myjobs – העבודות שלי\n" +
      "/workers – עובדים שנרשמו לעבודה"
    );
  } else {
    bot.sendMessage(uid,
      "👋 שלום\\!\n\nעקוב אחרי הקבוצה לעבודות חדשות\\.\n" +
      "כשתראה עבודה שמתאימה – לחץ על הכפתור 💪"
    );
  }
});

bot.onText(/\/newjob/, (msg) => {
  const uid = msg.from.id;
  if (!isAdmin(uid)) return bot.sendMessage(uid, "❌ אין לך הרשאה.");
  userState[uid] = { step: "j_title", data: {} };
  bot.sendMessage(uid, "➕ *עבודה חדשה*\n\nמה *שם / סוג* העבודה?", { parse_mode: "Markdown" });
});

bot.onText(/\/myjobs/, (msg) => {
  const uid = msg.from.id;
  if (!isAdmin(uid)) return;
  const myJobs = Object.entries(jobs).filter(([, j]) => j.clientId === uid);
  if (!myJobs.length) return bot.sendMessage(uid, "אין לך עבודות פעילות כרגע.");
  let text = "📋 *העבודות שלך:*\n\n";
  myJobs.forEach(([jid, j]) => {
    text += `*#${jid} – ${j.title}*\n📅 ${j.date} | 📍 ${j.location}\n`;
    text += `👷 ${j.applicants.length}/${j.workersNeeded} נרשמו | ${j.workersLeft > 0 ? "✅ פתוח" : "🔴 מלא"}\n\n`;
  });
  bot.sendMessage(uid, text, { parse_mode: "Markdown" });
});

bot.onText(/\/workers (.+)/, (msg, match) => {
  const uid = msg.from.id;
  if (!isAdmin(uid)) return;
  const jobId = parseInt(match[1]);
  const job = jobs[jobId];
  if (!job) return bot.sendMessage(uid, "עבודה לא נמצאה.");
  if (!job.applicants.length) return bot.sendMessage(uid, "אין עובדים רשומים עדיין.");
  let text = `👷 *עובדים לעבודה #${jobId} – ${job.title}:*\n\n`;
  job.applicants.forEach((a, i) => {
    text += `${i + 1}. ${a.name} (${a.username}) – ${a.transport}\n`;
  });
  bot.sendMessage(uid, text, { parse_mode: "Markdown" });
});

// ══════════════════════════════════════════════
//  שיחת הוספת עבודה + הגשת מועמדות
// ══════════════════════════════════════════════

bot.on("message", async (msg) => {
  const uid = msg.from.id;
  const text = msg.text;
  if (!text || text.startsWith("/")) return;

  const state = userState[uid];
  if (!state) return;

  // ─── לקוח מוסיף עבודה ───
  if (state.step === "j_title") {
    state.data.title = text;
    state.step = "j_location";
    return bot.sendMessage(uid, "📍 מה *הכתובת המדויקת* של האתר?", { parse_mode: "Markdown" });
  }
  if (state.step === "j_location") {
    state.data.location = text;
    state.step = "j_date";
    return bot.sendMessage(uid, "📅 מתי? (תאריך + שעת התחלה)\n_דוגמה: יום ג׳ 20/5 בשעה 07:00_", { parse_mode: "Markdown" });
  }
  if (state.step === "j_date") {
    state.data.date = text;
    state.step = "j_workers";
    return bot.sendMessage(uid, "👷 כמה עובדים נדרשים?", { parse_mode: "Markdown" });
  }
  if (state.step === "j_workers") {
    const n = parseInt(text);
    if (isNaN(n)) return bot.sendMessage(uid, "אנא הכנס מספר בלבד (לדוגמה: 3)");
    state.data.workers = n;
    state.step = "j_transport";
    return bot.sendMessage(uid, "🚌 האם יש הסעה?\n_כתוב פרטים (נקודת איסוף + שעה) או כתוב 'אין'_", { parse_mode: "Markdown" });
  }
  if (state.step === "j_transport") {
    state.data.transport = ["אין", "לא", "no", "-"].includes(text.toLowerCase()) ? "" : text;
    state.step = "j_notes";
    return bot.sendMessage(uid, "📝 הערות נוספות? (שכר, ציוד וכו׳)\n_או כתוב 'אין'_", { parse_mode: "Markdown" });
  }
  if (state.step === "j_notes") {
    const notes = ["אין", "לא", "no", "-"].includes(text.toLowerCase()) ? "" : text;
    const d = state.data;
    jobCounter++;
    const jobId = jobCounter;
    const job = {
      title: d.title,
      location: d.location,
      date: d.date,
      workersNeeded: d.workers,
      workersLeft: d.workers,
      transport: d.transport,
      notes,
      clientId: uid,
      applicants: [],
      messageId: null,
    };
    jobs[jobId] = job;
    delete userState[uid];

    const sentMsg = await bot.sendMessage(GROUP_ID, jobPostText(job), {
      parse_mode: "Markdown",
      reply_markup: jobKeyboard(jobId, job),
    });
    job.messageId = sentMsg.message_id;
    return bot.sendMessage(uid, `✅ עבודה #${jobId} פורסמה בקבוצה!\nכרגע ${job.workersLeft} מקומות פנויים.`);
  }

  // ─── פועל מגיש מועמדות ───
  if (state.step === "w_can_arrive") {
    if (["לא", "לא יכול", "no"].includes(text.toLowerCase())) {
      delete userState[uid];
      return bot.sendMessage(uid, "בסדר, אם יהיו עבודות אחרות נחזור אליך 🙂");
    }
    const job = jobs[state.jobId];
    let q = "🚗 איך אתה מגיע לאתר?\n\n";
    q += job && job.transport
      ? `יש הסעה מ: ${job.transport}\n\nכתוב: *הסעה* / *תחבורה ציבורית* / *רכב פרטי*`
      : "כתוב: *תחבורה ציבורית* / *רכב פרטי*";
    state.step = "w_transport";
    return bot.sendMessage(uid, q, { parse_mode: "Markdown" });
  }
  if (state.step === "w_transport") {
    const jobId = state.jobId;
    const job = jobs[jobId];
    delete userState[uid];

    if (!job || job.workersLeft <= 0) {
      return bot.sendMessage(uid, "😔 מצטערים, כל המקומות התמלאו בינתיים.");
    }

    const applicant = {
      name: `${msg.from.first_name || ""} ${msg.from.last_name || ""}`.trim(),
      username: msg.from.username ? `@${msg.from.username}` : String(uid),
      userId: uid,
      transport: text,
    };
    job.applicants.push(applicant);
    job.workersLeft--;

    // אישור לפועל
    bot.sendMessage(uid,
      `✅ *נרשמת!*\n\n📍 ${job.location}\n📅 ${job.date}\n🚗 הגעה: ${text}\n\nניצור איתך קשר לפני העבודה 💪`,
      { parse_mode: "Markdown" }
    );

    // עדכון פוסט בקבוצה
    bot.editMessageText(jobPostText(job), {
      chat_id: GROUP_ID,
      message_id: job.messageId,
      parse_mode: "Markdown",
      reply_markup: jobKeyboard(jobId, job),
    }).catch(() => {});

    // התראה ללקוח
    const left = job.workersLeft;
    const statusLine = left > 0 ? `נשארו עוד *${left}* מקומות.` : "🔴 *כל המקומות התמלאו!*";
    bot.sendMessage(job.clientId,
      `🔔 *נרשם עובד חדש לעבודה #${jobId}*\n\n` +
      `👤 ${applicant.name} (${applicant.username})\n` +
      `🚗 הגעה: ${text}\n\n${statusLine}`,
      { parse_mode: "Markdown" }
    );
  }
});

// ══════════════════════════════════════════════
//  כפתורים
// ══════════════════════════════════════════════

bot.on("callback_query", async (query) => {
  const uid = query.from.id;
  const data = query.data;

  if (data === "full") {
    return bot.answerCallbackQuery(query.id, { text: "כל המקומות כבר מולאו!", show_alert: true });
  }

  if (data.startsWith("apply:")) {
    const jobId = parseInt(data.split(":")[1]);
    const job = jobs[jobId];

    if (!job || job.workersLeft <= 0) {
      return bot.answerCallbackQuery(query.id, { text: "מצטערים, כל המקומות כבר מולאו!", show_alert: true });
    }

    bot.answerCallbackQuery(query.id);
    userState[uid] = { step: "w_can_arrive", jobId };

    bot.sendMessage(uid,
      `היי ${query.from.first_name} 👋\n\n` +
      `ראיתי שאתה מעוניין בעבודה: *${job.title}*\n` +
      `📅 ${job.date} | 📍 ${job.location}\n\n` +
      `האם אתה יכול להגיע? (כן / לא)`,
      { parse_mode: "Markdown" }
    );
  }
});

console.log("✅ הבוט רץ!");
