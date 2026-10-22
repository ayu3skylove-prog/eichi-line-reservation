const http = require("http");
const https = require("https");
const tls = require("tls");
const net = require("net");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const SESSION_COOKIE = "aran_session";
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DB_PATH = process.env.DB_PATH || path.join(ROOT, "data", "db.json");
const DB_EXAMPLE_PATH = path.join(ROOT, "data", "db.example.json");
const UPLOAD_DIR = process.env.UPLOAD_DIR || (process.env.DB_PATH ? path.join(path.dirname(process.env.DB_PATH), "uploads") : path.join(PUBLIC_DIR, "images", "gallery"));

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp"
};

function readDb() {
  if (!fs.existsSync(DB_PATH) && fs.existsSync(DB_EXAMPLE_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.copyFileSync(DB_EXAMPLE_PATH, DB_PATH);
  }
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2) + "\n");
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map(cookie => cookie.trim())
      .filter(Boolean)
      .map(cookie => {
        const index = cookie.indexOf("=");
        return [cookie.slice(0, index), decodeURIComponent(cookie.slice(index + 1))];
      })
  );
}

function isAuthed(req, db) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return false;
  const now = Date.now();
  const sessions = db.auth?.sessions || [];
  return sessions.some(session => session.token === token && new Date(session.expiresAt).getTime() > now);
}

function cleanSessions(db) {
  const now = Date.now();
  db.auth = db.auth || { adminPassword: "aran2026", sessions: [] };
  db.auth.sessions = (db.auth.sessions || []).filter(session => new Date(session.expiresAt).getTime() > now);
}

function requireAuth(req, res, db) {
  cleanSessions(db);
  if (isAuthed(req, db)) return true;
  sendJson(res, 401, { error: "login required" });
  return false;
}

function publicConfig(db) {
  return {
    settings: {
      clinicName: db.settings.clinicName,
      description: db.settings.description,
      openTime: db.settings.openTime,
      closeTime: db.settings.closeTime,
      lastReceptionTime: db.settings.lastReceptionTime || db.settings.closeTime,
      slotMinutes: db.settings.slotMinutes,
      maxBookingsPerDay: db.settings.maxBookingsPerDay || 0,
      closedWeekdays: db.settings.closedWeekdays,
      closedDates: db.settings.closedDates,
      specialHours: db.settings.specialHours,
      notice: db.settings.notice,
      adminEmail: db.settings.adminEmail || "",
      contactEmail: db.settings.contactEmail || "",
      contactPhone: db.settings.contactPhone || ""
    },
    menus: db.menus,
    options: db.options || []
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 20_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

const DEFAULT_GALLERY = [
  {
    id: "slot-1",
    category: "route_back",
    tag: "首肩・背中",
    label: "ルート治療",
    image: "/images/gallery/01_route_back.jpg",
    title: "深部のコリを捉える「首肩・背中のルート治療」",
    desc: "何年も蓄積してきた頑固な首こり・肩甲骨周りの重だるさ、背中の張り。当院では筋肉の奥深くに潜む「コリのルート（滞りの連鎖）」を丁寧に見極め、的確に鍼を刺入していきます。"
  },
  {
    id: "slot-2",
    category: "dialogue",
    tag: "安心の対話",
    label: "和やかな時間",
    image: "/images/gallery/02_dialogue.jpg",
    title: "緊張をほどく、温かな対話と笑顔",
    desc: "「鍼が初めてで怖い」「痛かったらどうしよう」という不安を抱えて来られる方も少なくありません。当院では、お一人おひとりの表情や呼吸を感じ取りながら、リラックスしていただける対話を大切にしています。"
  },
  {
    id: "slot-3",
    category: "head",
    tag: "脳疲労・自律神経",
    label: "頭部刺鍼",
    image: "/images/gallery/03_head_acupuncture.jpg",
    title: "思考のオーバーヒートを鎮める「頭部ルート治療」",
    desc: "パソコン作業やスマートフォンの使いすぎ、考えすぎによる脳疲労・不眠・眼精疲労に。頭皮に張り巡らされたコリを捉え、氣の滞りを解きほぐします。"
  },
  {
    id: "slot-4",
    category: "beauty",
    tag: "お顔・デコルテ",
    label: "巡氣調律美容鍼",
    image: "/images/gallery/04_beauty_acupuncture.jpg",
    title: "内側から本来の表情を取り戻す「巡氣調律美容鍼」",
    desc: "顔だけに鍼をする一般的な美容鍼とは異なり、首・鎖骨・デコルテから頭皮まで、お顔の巡りを支える全体の筋膜と経絡を調律します。"
  },
  {
    id: "slot-5",
    category: "event",
    tag: "特別イベント",
    label: "倍音調律セッション",
    image: "/images/gallery/05_singing_bowl_event.jpg",
    title: "倍音の波動に包まれる「シンギングボウル調律イベント」",
    desc: "当院では定期的に、少人数限定の特別なグループ調律イベントやリトリートを開催しています。金属ボウルから生まれる豊かな倍音の響きに身を委ね、細胞と水分を微細に振動させながら深い瞑想へ導きます。"
  }
];

function getGallery(db) {
  if (Array.isArray(db.gallery) && db.gallery.length) {
    return db.gallery;
  }
  return DEFAULT_GALLERY;
}

function minutesFromTime(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

// ─── Gmail SMTP 連携 ─────────────────────────────────────

function formatJaDate(dateText) {
  const d = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateText;
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${weekdays[d.getDay()]}）`;
}

function trySmtp465(user, password, to, subject, body) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: "smtp.gmail.com",
      port: 465,
      servername: "smtp.gmail.com",
      family: 4
    });
    let buf = "";
    let step = 0;
    const write = (text) => socket.write(text + "\r\n");

    function onLine(line) {
      const code = parseInt(line.slice(0, 3), 10);
      if (step === 0) {
        step = 1;
        write("EHLO localhost");
      } else if (step === 1 && code === 250) {
        step = 2;
        write("AUTH LOGIN");
      } else if (step === 2) {
        step = 3;
        write(Buffer.from(user).toString("base64"));
      } else if (step === 3) {
        step = 4;
        write(Buffer.from(password).toString("base64"));
      } else if (step === 4) {
        if (code !== 235) { socket.destroy(); return reject(new Error(`Gmail auth failed: ${line}`)); }
        step = 5;
        write(`MAIL FROM:<${user}>`);
      } else if (step === 5) {
        if (code !== 250) { socket.destroy(); return reject(new Error(`MAIL FROM failed: ${line}`)); }
        step = 6;
        write(`RCPT TO:<${to}>`);
      } else if (step === 6) {
        if (code !== 250) { socket.destroy(); return reject(new Error(`RCPT TO failed: ${line}`)); }
        step = 7;
        write("DATA");
      } else if (step === 7) {
        if (code !== 354) { socket.destroy(); return reject(new Error(`DATA rejected: ${line}`)); }
        step = 8;
        const encSubject = `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;
        const raw = Buffer.from(body).toString("base64");
        const b64Body = (raw.match(/.{1,76}/g) || [""]).join("\r\n");
        write([
          `From: ${user}`,
          `To: ${to}`,
          `Subject: ${encSubject}`,
          "MIME-Version: 1.0",
          "Content-Type: text/plain; charset=UTF-8",
          "Content-Transfer-Encoding: base64",
          "",
          b64Body,
          "."
        ].join("\r\n"));
      } else if (step === 8) {
        if (code !== 250) { socket.destroy(); return reject(new Error(`Message rejected: ${line}`)); }
        step = 9;
        write("QUIT");
      } else if (step === 9) {
        socket.destroy();
        resolve({ ok: true });
      }
    }

    socket.setEncoding("utf8");
    socket.setTimeout(12000);
    socket.on("timeout", () => { socket.destroy(); reject(new Error("SMTP timeout (port 465)")); });
    socket.on("error", reject);
    socket.on("data", (chunk) => {
      buf += chunk;
      while (true) {
        const idx = buf.indexOf("\r\n");
        if (idx === -1) break;
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (line.length >= 4 && line[3] === "-") continue;
        onLine(line);
      }
    });
  });
}

function trySmtp587(user, password, to, subject, body) {
  return new Promise((resolve, reject) => {
    const rawSocket = net.connect({ host: "smtp.gmail.com", port: 587, family: 4 });
    let socket = rawSocket;
    let buf = "";
    let step = 0;
    const write = (text) => socket.write(text + "\r\n");

    function onLine(line) {
      const code = parseInt(line.slice(0, 3), 10);
      if (step === 0) {
        step = 1;
        write("EHLO localhost");
      } else if (step === 1 && code === 250) {
        step = 2;
        write("STARTTLS");
      } else if (step === 2 && code === 220) {
        step = 3;
        socket = tls.connect({ socket: rawSocket, host: "smtp.gmail.com", servername: "smtp.gmail.com" });
        socket.setEncoding("utf8");
        socket.on("data", onData);
        socket.on("error", reject);
        write("EHLO localhost");
      } else if (step === 3 && code === 250) {
        step = 4;
        write("AUTH LOGIN");
      } else if (step === 4) {
        step = 5;
        write(Buffer.from(user).toString("base64"));
      } else if (step === 5) {
        step = 6;
        write(Buffer.from(password).toString("base64"));
      } else if (step === 6) {
        if (code !== 235) { socket.destroy(); return reject(new Error(`Gmail auth failed: ${line}`)); }
        step = 7;
        write(`MAIL FROM:<${user}>`);
      } else if (step === 7) {
        if (code !== 250) { socket.destroy(); return reject(new Error(`MAIL FROM failed: ${line}`)); }
        step = 8;
        write(`RCPT TO:<${to}>`);
      } else if (step === 8) {
        if (code !== 250) { socket.destroy(); return reject(new Error(`RCPT TO failed: ${line}`)); }
        step = 9;
        write("DATA");
      } else if (step === 9) {
        if (code !== 354) { socket.destroy(); return reject(new Error(`DATA rejected: ${line}`)); }
        step = 10;
        const encSubject = `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;
        const raw = Buffer.from(body).toString("base64");
        const b64Body = (raw.match(/.{1,76}/g) || [""]).join("\r\n");
        write([
          `From: ${user}`,
          `To: ${to}`,
          `Subject: ${encSubject}`,
          "MIME-Version: 1.0",
          "Content-Type: text/plain; charset=UTF-8",
          "Content-Transfer-Encoding: base64",
          "",
          b64Body,
          "."
        ].join("\r\n"));
      } else if (step === 10) {
        if (code !== 250) { socket.destroy(); return reject(new Error(`Message rejected: ${line}`)); }
        step = 11;
        write("QUIT");
      } else if (step === 11) {
        socket.destroy();
        resolve({ ok: true });
      }
    }

    function onData(chunk) {
      buf += chunk;
      while (true) {
        const idx = buf.indexOf("\r\n");
        if (idx === -1) break;
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (line.length >= 4 && line[3] === "-") continue;
        onLine(line);
      }
    }

    rawSocket.setEncoding("utf8");
    rawSocket.setTimeout(12000);
    rawSocket.on("timeout", () => { rawSocket.destroy(); reject(new Error("SMTP timeout (port 587)")); });
    rawSocket.on("error", reject);
    rawSocket.on("data", onData);
  });
}

function sendGmailSmtp({ user, password, to, subject, body }) {
  const cleanUser = String(user || "").trim();
  const cleanPassword = String(password || "").replace(/\s+/g, "");
  const cleanTo = String(to || "").trim();

  return trySmtp465(cleanUser, cleanPassword, cleanTo, subject, body)
    .catch(err465 => {
      console.warn("SMTP 465 failed, trying 587 fallback:", err465.message);
      return trySmtp587(cleanUser, cleanPassword, cleanTo, subject, body);
    });
}

function buildPatientEmailBody(db, booking) {
  const { menu, options, duration, price } = bookingDetails(db, booking);
  const lines = [
    `${booking.name} 様`,
    "",
    "この度はご予約いただきありがとうございます。",
    "以下の内容でご予約を承りました。",
    "",
    "━━━━━━━━━━━━━━━━━━━━━",
    "■ ご予約内容",
    "━━━━━━━━━━━━━━━━━━━━━",
    `ご予約日時　：${formatJaDate(booking.date)} ${booking.time}〜`,
    `メニュー　　：${menu ? menu.name : booking.menuId}（${menu ? menu.duration : 0}分）　${(menu ? menu.price : 0).toLocaleString()}円`
  ];
  if (options.length) {
    lines.push("オプション　：");
    for (const opt of options) {
      lines.push(`  ・${opt.name}（+${opt.duration}分）　+${opt.price.toLocaleString()}円`);
    }
  }
  lines.push(
    `合計時間　　：${duration}分`,
    `合計金額　　：${price.toLocaleString()}円`,
    "",
    "━━━━━━━━━━━━━━━━━━━━━",
    "■ お支払いのご案内",
    "━━━━━━━━━━━━━━━━━━━━━",
    "※ 施術当日、受付にて現金にてお願い申し上げます。",
    "",
    "━━━━━━━━━━━━━━━━━━━━━",
    "■ サロン情報",
    "━━━━━━━━━━━━━━━━━━━━━",
    db.settings.clinicName,
    "愛媛県松山市",
    "院長：松岡あゆみ",
    db.settings.contactPhone ? `TEL：${db.settings.contactPhone}` : "",
    "",
    "━━━━━━━━━━━━━━━━━━━━━",
    "■ キャンセル・変更のご案内",
    "━━━━━━━━━━━━━━━━━━━━━",
    "ご予約のキャンセルや日時変更は、",
    "公式LINEまたはお電話にてご連絡ください。",
    "",
    "━━━━━━━━━━━━━━━━━━━━━",
    "このメールは自動送信です。",
    "ご返信いただいても対応できない場合がございます。",
    "ご不明な点はLINEまたはお電話でお問い合わせください。"
  );
  return lines.filter(l => l !== undefined).join("\n");
}

function buildClinicEmailBody(db, booking) {
  const { menu, options } = bookingDetails(db, booking);
  const optionText = options.length ? options.map(opt => opt.name).join("、") : "なし";
  const lines = [
    "新規予約が入りました。",
    "",
    "━━━━━━━━━━━━━━━━━━━━━",
    `患者名　　　　：${booking.name}${booking.kana ? `（${booking.kana}）` : ""}`,
    `電話番号　　　：${booking.phone}`,
    `メールアドレス：${booking.email || "未入力"}`,
    `ご希望日時　　：${formatJaDate(booking.date)} ${booking.time}`,
    `メニュー　　　：${menu ? menu.name : booking.menuId}`,
    `オプション　　：${optionText}`
  ];
  if (booking.note) lines.push(`相談内容　　　：${booking.note}`);
  lines.push(
    "━━━━━━━━━━━━━━━━━━━━━",
    "",
    "予約管理画面でご確認ください。"
  );
  return lines.join("\n");
}

async function sendBookingEmails(db, booking) {
  const user = db.settings.gmailUser || "";
  const pwd = db.settings.gmailAppPassword || "";
  if (!user || !pwd) return;

  const notifyTo = db.settings.notifyEmail || user;
  const mmdd = booking.date.slice(5).replace("-", "/");
  const results = [];

  if (booking.email) {
    try {
      await sendGmailSmtp({
        user, password: pwd, to: booking.email,
        subject: "【美身堂えいち鍼灸院】ご予約ありがとうございます（予約完了）",
        body: buildPatientEmailBody(db, booking)
      });
      results.push({ type: "patient", to: booking.email, status: "sent" });
    } catch (err) {
      console.error("[mail:patient]", err.message);
      results.push({ type: "patient", to: booking.email, status: "error", message: err.message });
    }
  }

  try {
    await sendGmailSmtp({
      user, password: pwd, to: notifyTo,
      subject: `【美身堂えいち】新規予約通知: ${booking.name}様（${mmdd} ${booking.time}）`,
      body: buildClinicEmailBody(db, booking)
    });
    results.push({ type: "clinic", to: notifyTo, status: "sent" });
  } catch (err) {
    console.error("[mail:clinic]", err.message);
    results.push({ type: "clinic", to: notifyTo, status: "error", message: err.message });
  }

  try {
    const freshDb = readDb();
    const notif = (freshDb.notifications || []).find(n => n.bookingId === booking.id);
    if (notif) {
      notif.emailResults = results;
      notif.status = results.every(r => r.status === "sent") ? "sent" : results.some(r => r.status === "sent") ? "partial" : "error";
    }
    writeDb(freshDb);
  } catch (err) {
    console.error("[mail:record]", err.message);
  }
}

// ─────────────────────────────────────────────────────────

// ─── Google Calendar iCal 連携 ────────────────────────────

const icalCache = { events: null, fetchedAt: 0 };
const ICAL_CACHE_TTL = 15 * 60 * 1000;

function fetchIcalText(url) {
  return new Promise((resolve) => {
    if (!url || !url.startsWith("http")) return resolve("");
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { timeout: 8000 }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { text += chunk; if (text.length > 500_000) req.destroy(); });
      res.on("end", () => resolve(text));
    });
    req.on("error", () => resolve(""));
    req.on("timeout", () => { req.destroy(); resolve(""); });
  });
}

function parseIcalDateValue(key, value) {
  const keyUpper = key.toUpperCase();
  if (/VALUE=DATE/i.test(keyUpper) || /^\d{8}$/.test(value)) {
    const m = value.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!m) return null;
    return { isAllDay: true, dateText: `${m[1]}-${m[2]}-${m[3]}` };
  }
  const dtm = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!dtm) return null;
  const [, yr, mo, dy, hr, mn, , z] = dtm;
  let dateText = `${yr}-${mo}-${dy}`;
  let totalMinutes = parseInt(hr) * 60 + parseInt(mn);
  if (z === "Z") {
    totalMinutes += 9 * 60;
    if (totalMinutes >= 24 * 60) {
      totalMinutes -= 24 * 60;
      const d = new Date(`${yr}-${mo}-${dy}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      dateText = toDateString(d);
    }
  }
  return { isAllDay: false, dateText, totalMinutes };
}

function parseIcalEvents(text) {
  const events = [];
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);
  let inEvent = false;
  let startKey = "", startVal = "", endKey = "", endVal = "";

  for (const line of lines) {
    const upper = line.trim().toUpperCase();
    if (upper === "BEGIN:VEVENT") {
      inEvent = true; startKey = startVal = endKey = endVal = "";
    } else if (upper === "END:VEVENT") {
      inEvent = false;
      if (!startVal) continue;
      const start = parseIcalDateValue(startKey, startVal);
      if (!start) continue;
      if (start.isAllDay) {
        const end = endVal ? parseIcalDateValue(endKey, endVal) : null;
        const endDateText = end ? end.dateText : start.dateText;
        let d = new Date(start.dateText + "T00:00:00Z");
        const endD = new Date(endDateText + "T00:00:00Z");
        while (d < endD) {
          events.push({ isAllDay: true, dateText: toDateString(d) });
          d.setUTCDate(d.getUTCDate() + 1);
        }
        if (d.getTime() === new Date(start.dateText + "T00:00:00Z").getTime()) {
          events.push({ isAllDay: true, dateText: start.dateText });
        }
      } else {
        const end = endVal ? parseIcalDateValue(endKey, endVal) : null;
        events.push({
          isAllDay: false,
          dateText: start.dateText,
          startMinutes: start.totalMinutes,
          endMinutes: end ? end.totalMinutes : start.totalMinutes + 60
        });
      }
    } else if (inEvent) {
      const ci = line.indexOf(":");
      if (ci === -1) continue;
      const k = line.slice(0, ci);
      const v = line.slice(ci + 1);
      const ku = k.toUpperCase();
      if (ku === "DTSTART" || ku.startsWith("DTSTART;")) { startKey = k; startVal = v; }
      else if (ku === "DTEND" || ku.startsWith("DTEND;")) { endKey = k; endVal = v; }
    }
  }
  return events;
}

async function getCalendarBlocks(url) {
  if (!url) return [];
  const now = Date.now();
  if (icalCache.events && now - icalCache.fetchedAt < ICAL_CACHE_TTL) return icalCache.events;
  const text = await fetchIcalText(url);
  const events = parseIcalEvents(text);
  icalCache.events = events;
  icalCache.fetchedAt = Date.now();
  return events;
}

function clearIcalCache() {
  icalCache.events = null;
  icalCache.fetchedAt = 0;
}

function hasCalendarConflict(calendarBlocks, dateText, slotStart, slotEnd) {
  return calendarBlocks.some((block) => {
    if (block.dateText !== dateText) return false;
    if (block.isAllDay) return true;
    return overlaps(slotStart, slotEnd, block.startMinutes, block.endMinutes);
  });
}

// ─────────────────────────────────────────────────────────

function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeFromMinutes(total) {
  const hours = String(Math.floor(total / 60)).padStart(2, "0");
  const minutes = String(total % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function normalizeDateList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item || "").trim()).filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item)))].sort();
}

function normalizeWeekdays(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort();
}

function normalizeSpecialHours(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => ({
      date: String(item.date || "").trim(),
      openTime: String(item.openTime || "").trim(),
      closeTime: String(item.closeTime || "").trim()
    }))
    .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date) && /^\d{2}:\d{2}$/.test(item.openTime) && /^\d{2}:\d{2}$/.test(item.closeTime))
    .filter(item => minutesFromTime(item.openTime) < minutesFromTime(item.closeTime))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeManualBlocks(value) {
  if (!Array.isArray(value)) return [];
  const blocks = value
    .map(item => ({
      date: String(item.date || "").trim(),
      time: String(item.time || "").trim(),
      reason: String(item.reason || "").trim()
    }))
    .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date) && /^\d{2}:\d{2}$/.test(item.time));

  const seen = new Set();
  return blocks
    .filter(item => {
      const key = `${item.date} ${item.time}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

function normalizeItems(value, fallbackPrefix) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const name = String(item.name || "").trim();
      const idBase = String(item.id || name || `${fallbackPrefix}-${index + 1}`).trim();
      return {
        id: idBase
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, "-")
          .replace(/^-+|-+$/g, "") || `${fallbackPrefix}-${index + 1}`,
        name,
        duration: Number(item.duration),
        price: Number(item.price),
        imageUrl: String(item.imageUrl || "").trim(),
        description: String(item.description || "").trim(),
        treatmentSummary: String(item.treatmentSummary || "").trim()
      };
    })
    .filter(item => item.name && Number.isFinite(item.duration) && item.duration >= 0 && Number.isFinite(item.price) && item.price >= 0);
}

function selectedOptions(db, optionIds = []) {
  const ids = Array.isArray(optionIds) ? optionIds : [];
  return (db.options || []).filter(option => ids.includes(option.id));
}

function totalDuration(menu, options) {
  return menu.duration + options.reduce((sum, option) => sum + option.duration, 0);
}

function bufferDurationForTreatment(duration) {
  return 30;
}

function occupiedDuration(menu, options) {
  const duration = totalDuration(menu, options);
  return duration + bufferDurationForTreatment(duration);
}

function maxBookingsPerDay(db) {
  const max = Number(db.settings.maxBookingsPerDay || 0);
  return Number.isFinite(max) && max > 0 ? max : 0;
}

function confirmedBookingsForDate(db, dateText) {
  return db.bookings.filter(booking => booking.status !== "cancelled" && booking.date === dateText);
}

function bookingDetails(db, booking) {
  const menu = db.menus.find(item => item.id === booking.menuId);
  const options = selectedOptions(db, booking.optionIds);
  const duration = menu ? totalDuration(menu, options) : 60;
  const price = menu ? menu.price + options.reduce((sum, option) => sum + option.price, 0) : 0;
  return { menu, options, duration, price };
}

function daySchedule(db, dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (db.settings.closedDates?.includes(dateText)) return null;
  if (db.settings.closedWeekdays?.includes(date.getDay())) return null;

  const special = db.settings.specialHours?.find(item => item.date === dateText);
  if (special) return {
    openTime: special.openTime,
    closeTime: special.closeTime,
    lastReceptionTime: special.lastReceptionTime || db.settings.lastReceptionTime || special.closeTime
  };

  return {
    openTime: db.settings.openTime,
    closeTime: db.settings.closeTime,
    lastReceptionTime: db.settings.lastReceptionTime || db.settings.closeTime
  };
}

function availableSlotsForDate(db, dateText, menuId, optionIds = [], calendarBlocks = []) {
  const menu = db.menus.find(item => item.id === menuId);
  if (!menu) return [];

  const schedule = daySchedule(db, dateText);
  if (!schedule) return [];

  if (hasCalendarConflict(calendarBlocks, dateText, 0, 24 * 60)) {
    const allDay = calendarBlocks.some(b => b.dateText === dateText && b.isAllDay);
    if (allDay) return [];
  }

  const options = selectedOptions(db, optionIds);
  const duration = occupiedDuration(menu, options);
  const open = minutesFromTime(schedule.openTime);
  const close = minutesFromTime(schedule.closeTime);
  const lastReception = minutesFromTime(schedule.lastReceptionTime || schedule.closeTime);
  const latestStart = Math.min(close - duration, lastReception);
  const bookings = confirmedBookingsForDate(db, dateText);
  const dailyLimit = maxBookingsPerDay(db);
  if (dailyLimit && bookings.length >= dailyLimit) return [];

  const manualBlocks = normalizeManualBlocks(db.settings.manualBlocks).filter(block => block.date === dateText);
  const slots = [];

  for (let start = open; start <= latestStart; start += db.settings.slotMinutes) {
    const end = start + duration;
    const hasBookingConflict = bookings.some(booking => {
      const bookedMenu = db.menus.find(item => item.id === booking.menuId);
      const bookedOptions = selectedOptions(db, booking.optionIds);
      const bookedStart = minutesFromTime(booking.time);
      const bookedEnd = bookedStart + (bookedMenu ? occupiedDuration(bookedMenu, bookedOptions) : 120);
      return overlaps(start, end, bookedStart, bookedEnd);
    });
    const hasManualBlockConflict = manualBlocks.some(block => {
      const blockStart = minutesFromTime(block.time);
      return overlaps(start, end, blockStart, blockStart + 30);
    });
    const hasCalendarBlock = hasCalendarConflict(calendarBlocks, dateText, start, end);

    if (!hasBookingConflict && !hasManualBlockConflict && !hasCalendarBlock) slots.push(timeFromMinutes(start));
  }

  return slots;
}

function publicSlotStatusForDate(db, dateText, menuId, optionIds = [], calendarBlocks = []) {
  const menu = db.menus.find(item => item.id === menuId);
  if (!menu) return [];

  const schedule = daySchedule(db, dateText);
  if (!schedule) return [];

  const duration = occupiedDuration(menu, selectedOptions(db, optionIds));
  const open = minutesFromTime(schedule.openTime);
  const close = minutesFromTime(schedule.closeTime);
  const lastReception = minutesFromTime(schedule.lastReceptionTime || schedule.closeTime);
  const latestStart = Math.min(close - duration, lastReception);
  const availableSlots = new Set(availableSlotsForDate(db, dateText, menuId, optionIds, calendarBlocks));
  const slots = [];

  for (let start = open; start <= latestStart; start += db.settings.slotMinutes) {
    const time = timeFromMinutes(start);
    slots.push({ time, available: availableSlots.has(time) });
  }

  return slots;
}

function availabilityForMonth(db, monthText, menuId, optionIds = []) {
  const [year, month] = monthText.split("-").map(Number);
  if (!year || !month) return null;

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const days = [];

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const date = new Date(year, month - 1, day);
    const dateText = toDateString(date);
    const schedule = daySchedule(db, dateText);
    const slots = availableSlotsForDate(db, dateText, menuId, optionIds);
    days.push({
      date: dateText,
      weekday: date.getDay(),
      isClosed: !schedule,
      openTime: schedule?.openTime || "",
      closeTime: schedule?.closeTime || "",
      slotCount: slots.length,
      slots
    });
  }

  return {
    month: monthText,
    firstWeekday: firstDay.getDay(),
    days
  };
}

function validateBooking(input, db) {
  const required = ["date", "time", "menuId", "name", "phone"];
  for (const field of required) {
    if (!String(input[field] || "").trim()) return `${field} is required`;
  }

  const menu = db.menus.find(item => item.id === input.menuId);
  if (!menu) return "menu not found";
  const optionIds = Array.isArray(input.optionIds) ? input.optionIds : [];

  const date = new Date(`${input.date}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "invalid date";
  const schedule = daySchedule(db, input.date);
  if (!schedule) return "closed day";

  const start = minutesFromTime(input.time);
  const selected = selectedOptions(db, optionIds);
  const end = start + occupiedDuration(menu, selected);
  const open = minutesFromTime(schedule.openTime);
  const close = minutesFromTime(schedule.closeTime);
  const lastReception = minutesFromTime(schedule.lastReceptionTime || schedule.closeTime);
  if (start < open || start > lastReception || end > close) return "outside business hours";

  const bookings = confirmedBookingsForDate(db, input.date);
  const dailyLimit = maxBookingsPerDay(db);
  if (dailyLimit && bookings.length >= dailyLimit) return "daily booking limit reached";

  const hasConflict = bookings
    .some(booking => {
      const bookedMenu = db.menus.find(item => item.id === booking.menuId);
      const bookedOptions = selectedOptions(db, booking.optionIds);
      const bookedStart = minutesFromTime(booking.time);
      const bookedEnd = bookedStart + (bookedMenu ? occupiedDuration(bookedMenu, bookedOptions) : 120);
      return overlaps(start, end, bookedStart, bookedEnd);
    });

  const hasManualBlockConflict = normalizeManualBlocks(db.settings.manualBlocks)
    .filter(block => block.date === input.date)
    .some(block => {
      const blockStart = minutesFromTime(block.time);
      return overlaps(start, end, blockStart, blockStart + 30);
    });

  if (hasConflict) return "time already booked";
  if (hasManualBlockConflict) return "time blocked";
  return null;
}

function createBooking(input) {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: "confirmed",
    date: input.date,
    time: input.time,
    menuId: input.menuId,
    optionIds: Array.isArray(input.optionIds) ? input.optionIds : [],
    name: String(input.name || "").trim(),
    kana: String(input.kana || "").trim(),
    phone: String(input.phone || "").trim(),
    email: String(input.email || "").trim(),
    note: String(input.note || "").trim()
  };
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function bookingsCsv(db) {
  const rows = [["予約日", "時間", "メニュー", "オプション", "合計時間", "合計金額", "名前", "電話", "メール", "メモ", "状態", "作成日時"]];
  for (const booking of db.bookings) {
    const { menu, options, duration, price } = bookingDetails(db, booking);
    rows.push([
      booking.date,
      booking.time,
      menu ? menu.name : booking.menuId,
      options.map(option => option.name).join(" / "),
      duration,
      price,
      booking.name,
      booking.phone,
      booking.email,
      booking.note,
      booking.status,
      booking.createdAt
    ]);
  }
  return rows.map(row => row.map(csvEscape).join(",")).join("\n");
}

function icsDate(dateText, timeText, addMinutes = 0) {
  const date = new Date(`${dateText}T${timeText}:00+09:00`);
  date.setMinutes(date.getMinutes() + addMinutes);
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function icsEscape(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function bookingIcs(db, booking) {
  const { menu, options, duration } = bookingDetails(db, booking);
  const optionText = options.length ? ` / ${options.map(option => option.name).join("、")}` : "";
  const summary = `${db.settings.clinicName} ${menu ? menu.name : "予約"}`;
  const description = [
    `メニュー: ${menu ? menu.name : booking.menuId}${optionText}`,
    `お名前: ${booking.name}`,
    booking.note ? `相談内容: ${booking.note}` : ""
  ].filter(Boolean).join("\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//aran-reservation//JP",
    "BEGIN:VEVENT",
    `UID:${booking.id}@aran-reservation`,
    `DTSTAMP:${icsDate(booking.date, booking.time)}`,
    `DTSTART:${icsDate(booking.date, booking.time)}`,
    `DTEND:${icsDate(booking.date, booking.time, duration)}`,
    `SUMMARY:${icsEscape(summary)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
}

function createNotification(db, booking) {
  const { menu, options, duration, price } = bookingDetails(db, booking);
  db.notifications = db.notifications || [];
  db.notifications.push({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: "pending",
    type: "booking_created",
    bookingId: booking.id,
    to: db.settings.contactEmail || "",
    subject: `新しい予約: ${booking.date} ${booking.time}`,
    body: [
      "新しい予約が入りました。",
      `日時: ${booking.date} ${booking.time}`,
      `メニュー: ${menu ? menu.name : booking.menuId}`,
      options.length ? `オプション: ${options.map(option => option.name).join("、")}` : "",
      `合計時間: ${duration}分`,
      `合計金額: ${price}円`,
      `名前: ${booking.name}`,
      `電話: ${booking.phone}`,
      booking.email ? `メール: ${booking.email}` : "",
      booking.note ? `相談内容: ${booking.note}` : ""
    ].filter(Boolean).join("\n")
  });
}

function updateConfig(db, input) {
  const settings = input.settings || {};
  const menus = normalizeItems(input.menus, "menu");
  const options = normalizeItems(input.options, "option");
  if (!menus.length) return "menu is required";

  const openTime = String(settings.openTime || db.settings.openTime).trim();
  const closeTime = String(settings.closeTime || db.settings.closeTime).trim();
  const lastReceptionTime = String(settings.lastReceptionTime || db.settings.lastReceptionTime || closeTime).trim();
  const slotMinutes = Number(settings.slotMinutes || db.settings.slotMinutes);
  const maxPerDay = Number(settings.maxBookingsPerDay || db.settings.maxBookingsPerDay || 0);
  if (!/^\d{2}:\d{2}$/.test(openTime) || !/^\d{2}:\d{2}$/.test(closeTime) || !/^\d{2}:\d{2}$/.test(lastReceptionTime)) return "invalid time";
  if (minutesFromTime(openTime) >= minutesFromTime(closeTime)) return "open time must be before close time";
  if (minutesFromTime(lastReceptionTime) < minutesFromTime(openTime) || minutesFromTime(lastReceptionTime) > minutesFromTime(closeTime)) return "invalid last reception time";
  if (!Number.isFinite(slotMinutes) || slotMinutes < 5 || slotMinutes > 180) return "invalid slot minutes";
  if (!Number.isFinite(maxPerDay) || maxPerDay < 0 || maxPerDay > 50) return "invalid daily booking limit";

  const newIcalUrl = String(settings.googleCalendarIcalUrl || "").trim();
  if (newIcalUrl !== (db.settings.googleCalendarIcalUrl || "")) clearIcalCache();

  db.settings = {
    ...db.settings,
    clinicName: String(settings.clinicName || "").trim() || db.settings.clinicName,
    description: String(settings.description || "").trim(),
    openTime,
    closeTime,
    lastReceptionTime,
    slotMinutes,
    maxBookingsPerDay: Math.floor(maxPerDay),
    closedWeekdays: normalizeWeekdays(settings.closedWeekdays),
    closedDates: normalizeDateList(settings.closedDates),
    specialHours: normalizeSpecialHours(settings.specialHours),
    manualBlocks: normalizeManualBlocks(settings.manualBlocks),
    notice: String(settings.notice || "").trim(),
    adminEmail: String(settings.adminEmail || "").trim(),
    contactEmail: String(settings.contactEmail || "").trim(),
    contactPhone: String(settings.contactPhone || "").trim(),
    googleCalendarIcalUrl: newIcalUrl
  };
  db.menus = menus;
  db.options = options;
  return null;
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const db = readDb();

  if (req.method === "GET" && url.pathname === "/api/session") {
    cleanSessions(db);
    writeDb(db);
    sendJson(res, 200, { loggedIn: isAuthed(req, db) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    const input = await readBody(req);
    cleanSessions(db);
    const expected = process.env.ADMIN_PASSWORD || db.auth?.adminPassword || "aran2026";
    if (String(input.password || "") !== expected) {
      sendJson(res, 401, { error: "invalid password" });
      return;
    }
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString();
    db.auth.sessions.push({ token, expiresAt });
    writeDb(db);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    const token = parseCookies(req)[SESSION_COOKIE];
    cleanSessions(db);
    db.auth.sessions = db.auth.sessions.filter(session => session.token !== token);
    writeDb(db);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/change-password") {
    if (!requireAuth(req, res, db)) return;
    const input = await readBody(req);
    const currentPassword = String(input.currentPassword || "");
    const newPassword = String(input.newPassword || "");
    const expected = process.env.ADMIN_PASSWORD || db.auth?.adminPassword || "aran2026";

    if (currentPassword !== expected) {
      sendJson(res, 400, { error: "current password is incorrect" });
      return;
    }

    if (newPassword.length < 8) {
      sendJson(res, 400, { error: "new password is too short" });
      return;
    }

    if (newPassword === expected) {
      sendJson(res, 400, { error: "new password is same as current" });
      return;
    }

    db.auth.adminPassword = newPassword;
    db.auth.sessions = [];
    writeDb(db);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/request-password-reset") {
    const input = await readBody(req);
    const email = String(input.email || "").trim();
    const adminEmail = String(db.settings.adminEmail || "").trim();

    db.passwordResetRequests = db.passwordResetRequests || [];
    db.passwordResetRequests.push({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      status: email && adminEmail && email.toLowerCase() === adminEmail.toLowerCase() ? "pending" : "unmatched",
      requestedEmail: email,
      adminEmailConfigured: Boolean(adminEmail),
      token: email && adminEmail && email.toLowerCase() === adminEmail.toLowerCase()
        ? crypto.randomBytes(24).toString("hex")
        : ""
    });
    writeDb(db);

    sendJson(res, 200, {
      ok: true,
      message: "If the email is registered, reset instructions will be prepared."
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/password-reset-requests") {
    if (!requireAuth(req, res, db)) return;
    const requests = (db.passwordResetRequests || [])
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(item => ({
        id: item.id,
        createdAt: item.createdAt,
        status: item.status,
        requestedEmail: item.requestedEmail,
        adminEmailConfigured: item.adminEmailConfigured,
        hasToken: Boolean(item.token)
      }));
    sendJson(res, 200, { requests });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/config") {
    if (isAuthed(req, db)) {
      const safeSettings = { ...db.settings };
      safeSettings.gmailAppPasswordSet = Boolean(safeSettings.gmailAppPassword);
      delete safeSettings.gmailAppPassword;
      sendJson(res, 200, { settings: safeSettings, menus: db.menus, options: db.options || [] });
    } else {
      sendJson(res, 200, publicConfig(db));
    }
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/config") {
    if (!requireAuth(req, res, db)) return;
    const input = await readBody(req);
    const error = updateConfig(db, input);
    if (error) {
      sendJson(res, 400, { error });
      return;
    }
    writeDb(db);
    sendJson(res, 200, { settings: db.settings, menus: db.menus, options: db.options || [] });
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/manual-blocks") {
    if (!requireAuth(req, res, db)) return;
    const input = await readBody(req);
    db.settings.manualBlocks = normalizeManualBlocks(input.manualBlocks);
    writeDb(db);
    sendJson(res, 200, { manualBlocks: db.settings.manualBlocks });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/bookings") {
    if (!requireAuth(req, res, db)) return;
    const bookings = db.bookings
      .slice()
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    sendJson(res, 200, { bookings });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/notifications") {
    if (!requireAuth(req, res, db)) return;
    const notifications = (db.notifications || [])
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    sendJson(res, 200, { notifications });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/availability") {
    const menuId = url.searchParams.get("menuId") || db.menus[0]?.id;
    const optionIds = (url.searchParams.get("optionIds") || "").split(",").map(item => item.trim()).filter(Boolean);
    const date = url.searchParams.get("date");
    const month = url.searchParams.get("month");

    if (!db.menus.some(menu => menu.id === menuId)) {
      sendJson(res, 404, { error: "menu not found" });
      return;
    }

    const calendarBlocks = await getCalendarBlocks(db.settings.googleCalendarIcalUrl || "");

    if (date) {
      sendJson(res, 200, {
        date,
        menuId,
        optionIds,
        slots: availableSlotsForDate(db, date, menuId, optionIds, calendarBlocks),
        daySlots: publicSlotStatusForDate(db, date, menuId, optionIds, calendarBlocks)
      });
      return;
    }

    if (month) {
      const availability = availabilityForMonth(db, month, menuId, optionIds);
      if (!availability) {
        sendJson(res, 400, { error: "invalid month" });
        return;
      }
      sendJson(res, 200, { menuId, optionIds, ...availability });
      return;
    }

    sendJson(res, 400, { error: "date or month is required" });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/gcal-sync") {
    if (!requireAuth(req, res, db)) return;
    clearIcalCache();
    sendJson(res, 200, { ok: true, message: "iCal cache cleared" });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/bookings") {
    const input = await readBody(req);
    if (input.adminEntry && !requireAuth(req, res, db)) return;
    const error = validateBooking(input, db);
    if (error) {
      sendJson(res, 400, { error });
      return;
    }

    const booking = createBooking(input);
    db.bookings.push(booking);
    createNotification(db, booking);
    writeDb(db);
    sendBookingEmails(db, booking).catch(err => console.error("[mail:unhandled]", err.message));
    const details = bookingDetails(db, booking);
    sendJson(res, 201, {
      booking,
      calendar: {
        duration: details.duration,
        menuName: details.menu?.name || booking.menuId,
        optionNames: details.options.map(option => option.name),
        icsUrl: `/api/bookings/${booking.id}.ics`
      }
    });
    return;
  }

  const icsMatch = url.pathname.match(/^\/api\/bookings\/([^/]+)\.ics$/);
  if (req.method === "GET" && icsMatch) {
    const booking = db.bookings.find(item => item.id === icsMatch[1] && item.status !== "cancelled");
    if (!booking) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename=booking-${booking.date}.ics`
    });
    res.end(bookingIcs(db, booking));
    return;
  }

  const cancelMatch = url.pathname.match(/^\/api\/bookings\/([^/]+)\/cancel$/);
  if (req.method === "POST" && cancelMatch) {
    if (!requireAuth(req, res, db)) return;
    const booking = db.bookings.find(item => item.id === cancelMatch[1]);
    if (!booking) {
      sendJson(res, 404, { error: "booking not found" });
      return;
    }
    booking.status = "cancelled";
    writeDb(db);
    sendJson(res, 200, { booking });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/bookings.csv") {
    if (!requireAuth(req, res, db)) return;
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=bookings.csv"
    });
    res.end("\uFEFF" + bookingsCsv(db));
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/gmail-settings") {
    if (!requireAuth(req, res, db)) return;
    const input = await readBody(req);
    const gmailUser = String(input.gmailUser || "").trim();
    const gmailAppPassword = String(input.gmailAppPassword || "").replace(/\s+/g, "");
    const notifyEmail = String(input.notifyEmail || "").trim();
    if (gmailUser && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gmailUser)) {
      sendJson(res, 400, { error: "Gmailアドレスの形式が正しくありません" });
      return;
    }
    db.settings.gmailUser = gmailUser;
    if (gmailAppPassword) db.settings.gmailAppPassword = gmailAppPassword;
    db.settings.notifyEmail = notifyEmail;
    writeDb(db);
    sendJson(res, 200, {
      ok: true,
      gmailUser: db.settings.gmailUser,
      gmailAppPasswordSet: Boolean(db.settings.gmailAppPassword),
      notifyEmail: db.settings.notifyEmail
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/gmail-test") {
    if (!requireAuth(req, res, db)) return;
    const user = db.settings.gmailUser || "";
    const pwd = db.settings.gmailAppPassword || "";
    if (!user || !pwd) {
      sendJson(res, 400, { error: "GmailアドレスとアプリパスワードをGmail設定に保存してください" });
      return;
    }
    const notifyTo = db.settings.notifyEmail || user;
    try {
      await sendGmailSmtp({
        user, password: pwd, to: notifyTo,
        subject: "【美身堂えいち鍼灸院】Gmail自動送信テスト",
        body: `テスト送信です。\n\nこのメールが届いていれば、Gmail自動送信の設定は正常です。\n\n送信元: ${user}\n送信先: ${notifyTo}`
      });
      sendJson(res, 200, { ok: true, to: notifyTo, message: `${notifyTo} にテストメールを送信しました。` });
    } catch (err) {
      console.error("Gmail test error details:", err);
      const detail = err ? (err.message || String(err)) : "unknown error";
      sendJson(res, 500, { error: "メール送信に失敗しました。", detail });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/gallery") {
    sendJson(res, 200, { ok: true, gallery: getGallery(db) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/gallery/upload") {
    if (!requireAuth(req, res, db)) return;
    try {
      const input = await readBody(req);
      const slotId = String(input.slotId || "").trim();
      const dataUrl = String(input.dataUrl || "").trim();
      const label = input.label ? String(input.label).trim() : "";
      const tag = input.tag ? String(input.tag).trim() : "";

      if (!slotId || !dataUrl) {
        sendJson(res, 400, { error: "スロットIDと画像データは必須です。" });
        return;
      }

      const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (!matches) {
        sendJson(res, 400, { error: "有効な画像データ形式ではありません。" });
        return;
      }

      const rawExt = matches[1].toLowerCase();
      const ext = rawExt === "png" ? "png" : rawExt === "webp" ? "webp" : "jpg";
      const buffer = Buffer.from(matches[2], "base64");
      const filename = `slot_${slotId}_${Date.now()}.${ext}`;
      const uploadDir = UPLOAD_DIR;
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const destPath = path.join(uploadDir, filename);
      fs.writeFileSync(destPath, buffer);

      db.gallery = JSON.parse(JSON.stringify(getGallery(db)));
      const slotIndex = db.gallery.findIndex(item => item.id === slotId);
      const newImagePath = `/images/gallery/${filename}`;

      if (slotIndex >= 0) {
        db.gallery[slotIndex].image = newImagePath;
        if (label) db.gallery[slotIndex].label = label;
        if (tag) db.gallery[slotIndex].tag = tag;
      } else {
        db.gallery.push({
          id: slotId,
          category: slotId,
          label: label || "施術写真",
          tag: tag || "臨床風景",
          image: newImagePath,
          title: label || "施術風景",
          desc: ""
        });
      }

      writeDb(db);
      sendJson(res, 200, {
        ok: true,
        message: "写真を正常に差し替えました！",
        gallery: db.gallery,
        updatedSlot: db.gallery.find(item => item.id === slotId)
      });
    } catch (err) {
      sendJson(res, 500, { error: "画像の保存に失敗しました。", detail: err.message });
    }
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/gallery") {
    if (!requireAuth(req, res, db)) return;
    const input = await readBody(req);
    if (Array.isArray(input.gallery)) {
      db.gallery = input.gallery;
      writeDb(db);
      sendJson(res, 200, { ok: true, message: "ギャラリー情報を更新しました。", gallery: db.gallery });
      return;
    }
    sendJson(res, 400, { error: "gallery配列が必要です。" });
    return;
  }

  sendJson(res, 404, { error: "not found" });
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const db = readDb();

  if (pathname === "/admin.html" && !isAuthed(req, db)) {
    redirect(res, "/login.html");
    return;
  }

  if (pathname === "/login.html" && isAuthed(req, db)) {
    redirect(res, "/admin.html");
    return;
  }

  if (pathname.startsWith("/images/gallery/")) {
    const filename = path.basename(pathname);
    const uploadedPath = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(uploadedPath)) {
      const ext = path.extname(uploadedPath);
      res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream" });
      fs.createReadStream(uploadedPath).pipe(res);
      return;
    }
  }

  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    const headers = {
      "Content-Type": contentTypes[ext] || "application/octet-stream"
    };
    if (ext === ".html") {
      headers["Cache-Control"] = "public, max-age=0, must-revalidate";
    } else {
      headers["Cache-Control"] = "public, max-age=86400";
    }
    res.writeHead(200, headers);
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }
    serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: "server error", detail: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Reservation system running at http://localhost:${PORT}`);
});
