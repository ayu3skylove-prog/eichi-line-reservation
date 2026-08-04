const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const SESSION_COOKIE = "aran_session";
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DB_PATH = process.env.DB_PATH || path.join(ROOT, "data", "db.json");
const DB_EXAMPLE_PATH = path.join(ROOT, "data", "db.example.json");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
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
  db.auth = db.auth || { adminPassword: "change-me-before-public", sessions: [] };
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
      if (body.length > 1_000_000) req.destroy();
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

function minutesFromTime(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

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

function availableSlotsForDate(db, dateText, menuId, optionIds = []) {
  const menu = db.menus.find(item => item.id === menuId);
  if (!menu) return [];

  const schedule = daySchedule(db, dateText);
  if (!schedule) return [];

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

    if (!hasBookingConflict && !hasManualBlockConflict) slots.push(timeFromMinutes(start));
  }

  return slots;
}

function publicSlotStatusForDate(db, dateText, menuId, optionIds = []) {
  const menu = db.menus.find(item => item.id === menuId);
  if (!menu) return [];

  const schedule = daySchedule(db, dateText);
  if (!schedule) return [];

  const duration = occupiedDuration(menu, selectedOptions(db, optionIds));
  const open = minutesFromTime(schedule.openTime);
  const close = minutesFromTime(schedule.closeTime);
  const lastReception = minutesFromTime(schedule.lastReceptionTime || schedule.closeTime);
  const latestStart = Math.min(close - duration, lastReception);
  const availableSlots = new Set(availableSlotsForDate(db, dateText, menuId, optionIds));
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
    contactPhone: String(settings.contactPhone || "").trim()
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
    const expected = process.env.ADMIN_PASSWORD || db.auth?.adminPassword || "change-me-before-public";
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
    const expected = process.env.ADMIN_PASSWORD || db.auth?.adminPassword || "change-me-before-public";

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
    sendJson(res, 200, isAuthed(req, db) ? { settings: db.settings, menus: db.menus, options: db.options || [] } : publicConfig(db));
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

    if (date) {
      sendJson(res, 200, {
        date,
        menuId,
        optionIds,
        slots: availableSlotsForDate(db, date, menuId, optionIds),
        daySlots: publicSlotStatusForDate(db, date, menuId, optionIds)
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
    res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream" });
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
