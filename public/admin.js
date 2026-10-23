let menus = [];
let options = [];
let manualBlocks = [];
let currentConfig = null;
let allBookings = [];
let gcalEvents = [];
let selectedSlot = null;

const rows = document.querySelector("#bookingRows");
const emptyMessage = document.querySelector("#emptyMessage");
const notificationList = document.querySelector("#notificationList");
const resetRequestList = document.querySelector("#resetRequestList");
const refreshButton = document.querySelector("#refreshButton");
const logoutButton = document.querySelector("#logoutButton");
const passwordForm = document.querySelector("#passwordForm");
const passwordMessage = document.querySelector("#passwordMessage");
const settingsForm = document.querySelector("#settingsForm");
const settingsMessage = document.querySelector("#settingsMessage");
const menuEditor = document.querySelector("#menuEditor");
const optionEditor = document.querySelector("#optionEditor");
const addMenuButton = document.querySelector("#addMenuButton");
const addOptionButton = document.querySelector("#addOptionButton");
const blockDateInput = document.querySelector("#blockDateInput");
const manualBlockGrid = document.querySelector("#manualBlockGrid");
const manualBlockSummary = document.querySelector("#manualBlockSummary");
const scheduleDateInput = document.querySelector("#scheduleDateInput");
const schedulePrevButton = document.querySelector("#schedulePrevButton");
const scheduleTodayButton = document.querySelector("#scheduleTodayButton");
const scheduleNextButton = document.querySelector("#scheduleNextButton");
const scheduleDateLabel = document.querySelector("#scheduleDateLabel");
const scheduleCountLabel = document.querySelector("#scheduleCountLabel");
const weeklySchedule = document.querySelector("#weeklySchedule");
const slotDialog = document.querySelector("#slotDialog");
const slotActionForm = document.querySelector("#slotActionForm");
const slotDialogTitle = document.querySelector("#slotDialogTitle");
const slotDialogMeta = document.querySelector("#slotDialogMeta");
const slotDialogClose = document.querySelector("#slotDialogClose");
const slotExistingPanel = document.querySelector("#slotExistingPanel");
const slotCreatePanel = document.querySelector("#slotCreatePanel");
const dialogMenuInput = document.querySelector("#dialogMenuInput");
const dialogNameInput = document.querySelector("#dialogNameInput");
const dialogPhoneInput = document.querySelector("#dialogPhoneInput");
const dialogEmailInput = document.querySelector("#dialogEmailInput");
const dialogNoteInput = document.querySelector("#dialogNoteInput");
const bookingFields = document.querySelector("#bookingFields");
const blockFields = document.querySelector("#blockFields");
const dialogBlockEndInput = document.querySelector("#dialogBlockEndInput");
const dialogBlockReasonInput = document.querySelector("#dialogBlockReasonInput");
const slotDialogMessage = document.querySelector("#slotDialogMessage");
const slotSubmitButton = document.querySelector("#slotSubmitButton");
const gmailForm = document.querySelector("#gmailForm");
const emailWebhookUrlInput = document.querySelector("#emailWebhookUrlInput");
const gmailUserInput = document.querySelector("#gmailUserInput");
const gmailAppPasswordInput = document.querySelector("#gmailAppPasswordInput");
const notifyEmailInput = document.querySelector("#notifyEmailInput");
const gmailTestButton = document.querySelector("#gmailTestButton");
const gmailMessage = document.querySelector("#gmailMessage");

function menuName(menuId) {
  const menu = menus.find(item => item.id === menuId);
  return menu ? menu.name : menuId;
}

function optionNames(optionIds = []) {
  return options.filter(item => optionIds.includes(item.id)).map(item => item.name).join("、") || "なし";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setSettingsMessage(text, type = "") {
  settingsMessage.textContent = text;
  settingsMessage.className = `message ${type}`.trim();
}

function setGmailMessage(text, type = "") {
  gmailMessage.textContent = text;
  gmailMessage.className = `message ${type}`.trim();
}

function fillGmailSettings(settings) {
  if (emailWebhookUrlInput) {
    emailWebhookUrlInput.value = settings.emailWebhookUrl || "";
  }
  gmailUserInput.value = settings.gmailUser || "";
  gmailAppPasswordInput.value = "";
  gmailAppPasswordInput.placeholder = settings.gmailAppPasswordSet
    ? "（設定済み・変更する場合のみ入力）"
    : "xxxx xxxx xxxx xxxx";
  notifyEmailInput.value = settings.notifyEmail || "";
}

function setPasswordMessage(text, type = "") {
  passwordMessage.textContent = text;
  passwordMessage.className = `message ${type}`.trim();
}

function linesToList(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function specialHoursFromText(value) {
  return linesToList(value).map(line => {
    const [date, openTime, closeTime] = line.split(",").map(item => item.trim());
    return { date, openTime, closeTime };
  });
}

function specialHoursToText(value) {
  return (value || []).map(item => `${item.date},${item.openTime},${item.closeTime}`).join("\n");
}

function minutesFromTime(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeFromMinutes(total) {
  const hours = String(Math.floor(total / 60)).padStart(2, "0");
  const minutes = String(total % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function dateFromText(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(dateText, days) {
  const date = dateFromText(dateText) || new Date();
  date.setDate(date.getDate() + days);
  return dateToText(date);
}

function dateToText(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(dateText) {
  const date = dateFromText(dateText);
  if (!date) return dateText;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(date);
}

function formatShortDateLabel(dateText) {
  const date = dateFromText(dateText);
  if (!date) return dateText;
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return `${date.getMonth() + 1}/${date.getDate()}（${weekdays[date.getDay()]}）`;
}

function todayText() {
  return dateToText(new Date());
}

function weekStartText(dateText) {
  const date = dateFromText(dateText) || new Date();
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  return dateToText(date);
}

function weekDates(dateText) {
  const start = weekStartText(dateText);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function scheduleForDate(dateText) {
  if (!currentConfig) return null;
  const settings = currentConfig.settings;
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  if ((settings.closedDates || []).includes(dateText)) return null;
  if ((settings.closedWeekdays || []).includes(date.getDay())) return null;
  const special = (settings.specialHours || []).find(item => item.date === dateText);
  if (special) return special;
  return {
    openTime: settings.openTime,
    closeTime: settings.closeTime,
    lastReceptionTime: settings.lastReceptionTime || settings.closeTime
  };
}

function isBlocked(date, time) {
  return manualBlocks.some(block => block.date === date && block.time === time);
}

function manualBlockAt(date, time) {
  return manualBlocks.find(block => block.date === date && block.time === time);
}

function blockReason(block) {
  return block?.reason || "他の予定";
}

function bookingDuration(booking) {
  const menu = menus.find(item => item.id === booking.menuId);
  const selectedOptions = options.filter(item => (booking.optionIds || []).includes(item.id));
  return (menu?.duration || 60) + selectedOptions.reduce((sum, option) => sum + Number(option.duration || 0), 0);
}

function bookingOccupiedDuration(booking) {
  return bookingDuration(booking) + 30;
}

function bookingTimeRange(booking) {
  const start = minutesFromTime(booking.time);
  return `${booking.time}-${timeFromMinutes(start + bookingDuration(booking))}`;
}

function bookingOccupiedRange(booking) {
  const start = minutesFromTime(booking.time);
  return `${booking.time}-${timeFromMinutes(start + bookingOccupiedDuration(booking))}`;
}

function bookingStartsInSlot(booking, slotStart, slotEnd) {
  const start = minutesFromTime(booking.time);
  return start >= slotStart && start < slotEnd;
}

function bookingContinuesInSlot(booking, slotStart, slotEnd) {
  const start = minutesFromTime(booking.time);
  const end = start + bookingOccupiedDuration(booking);
  return start < slotEnd && end > slotStart && start < slotStart;
}

function bookingOverlapsSlot(booking, slotStart, slotEnd) {
  const start = minutesFromTime(booking.time);
  const end = start + bookingOccupiedDuration(booking);
  return start < slotEnd && end > slotStart;
}

function gcalOverlapsSlot(event, date, slotStart, slotEnd) {
  if (event.dateText !== date) return false;
  if (event.isAllDay) return true;
  return event.startMinutes < slotEnd && event.endMinutes > slotStart;
}

function groupedBlocksForDate(date) {
  const blocks = manualBlocks
    .filter(block => block.date === date)
    .slice()
    .sort((a, b) => a.time.localeCompare(b.time));
  const groups = [];

  for (const block of blocks) {
    const start = minutesFromTime(block.time);
    const reason = blockReason(block);
    const last = groups.at(-1);

    if (last && last.end === start && last.reason === reason) {
      last.end = start + 30;
      continue;
    }

    groups.push({
      date,
      start,
      end: start + 30,
      reason
    });
  }

  return groups;
}

function renderScheduleBlockList() {}

async function persistManualBlocks() {
  const res = await fetch("/api/manual-blocks", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manualBlocks })
  });

  if (res.status === 401) {
    location.href = "/login.html";
    return false;
  }

  if (!res.ok) {
    setSettingsMessage("ブロックを保存できませんでした。", "error");
    return false;
  }

  const data = await res.json();
  manualBlocks = data.manualBlocks || [];
  if (currentConfig) currentConfig.settings.manualBlocks = manualBlocks;
  return true;
}

async function addManualBlockRange(date, startTime, endTime, reason) {
  const start = minutesFromTime(startTime);
  const end = minutesFromTime(endTime);

  if (!date || !Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    setSettingsMessage("ブロックの開始・終了時間を確認してください。", "error");
    return;
  }

  for (let time = start; time < end; time += 30) {
    const timeText = timeFromMinutes(time);
    const existing = manualBlocks.find(block => block.date === date && block.time === timeText);
    if (existing) {
      existing.reason = reason || "他の予定";
    } else {
      manualBlocks.push({ date, time: timeText, reason: reason || "他の予定" });
    }
  }

  manualBlocks.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  if (await persistManualBlocks()) {
    setSettingsMessage("別予定をブロックしました。患者さん側ではこの時間を選べません。", "success");
    renderSchedule();
    renderManualBlocks();
  }
}

async function deleteManualBlockRange(date, start, end) {
  manualBlocks = manualBlocks.filter(block => {
    if (block.date !== date) return true;
    const time = minutesFromTime(block.time);
    return time < start || time >= end;
  });

  if (await persistManualBlocks()) {
    setSettingsMessage("ブロックを削除しました。", "success");
    renderSchedule();
    renderManualBlocks();
  }
}

function renderSchedule(bookings = allBookings) {
  if (!scheduleDateInput.value) scheduleDateInput.value = todayText();

  const dates = weekDates(scheduleDateInput.value);
  const schedules = dates.map(date => scheduleForDate(date));
  const confirmedBookings = bookings.filter(booking => booking.status !== "cancelled");
  const visibleBookings = confirmedBookings.filter(booking => dates.includes(booking.date));
  const weekBlocks = manualBlocks.filter(block => dates.includes(block.date));
  const openTimes = schedules.filter(Boolean).map(schedule => minutesFromTime(schedule.openTime));
  const closeTimes = schedules.filter(Boolean).map(schedule => minutesFromTime(schedule.closeTime));
  const open = openTimes.length ? Math.min(...openTimes) : 9 * 60;
  const close = closeTimes.length ? Math.max(...closeTimes) : 19 * 60;
  const rowTimes = [];

  for (let time = open; time < close; time += 30) rowTimes.push(time);

  scheduleDateLabel.textContent = `${formatShortDateLabel(dates[0])} - ${formatShortDateLabel(dates[6])}`;
  scheduleCountLabel.textContent = `週 ${visibleBookings.length}件 / 1日上限 ${currentConfig?.settings?.maxBookingsPerDay || "なし"}件`;
  weeklySchedule.innerHTML = "";

  const headerCorner = document.createElement("div");
  headerCorner.className = "week-corner";
  headerCorner.textContent = "時間/日付";
  weeklySchedule.append(headerCorner);

  dates.forEach((date, index) => {
    const header = document.createElement("div");
    const count = confirmedBookings.filter(booking => booking.date === date).length;
    header.className = `week-day-header${date === todayText() ? " today" : ""}${schedules[index] ? "" : " closed"}`;
    header.innerHTML = `
      <strong>${escapeHtml(formatShortDateLabel(date))}</strong>
      <span>${schedules[index] ? `A　${count}件` : "休業日"}</span>
    `;
    weeklySchedule.append(header);
  });

  for (const time of rowTimes) {
    const timeText = timeFromMinutes(time);
    const timeCell = document.createElement("div");
    timeCell.className = "week-time";
    timeCell.textContent = timeText.endsWith(":00") ? timeText : "";
    weeklySchedule.append(timeCell);

    dates.forEach((date, index) => {
      const schedule = schedules[index];
      const slotEnd = time + 30;
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "week-slot";
      cell.dataset.date = date;
      cell.dataset.time = timeText;
      cell.setAttribute("aria-label", `${date} ${timeText}`);

      if (!schedule || time < minutesFromTime(schedule.openTime) || time >= minutesFromTime(schedule.closeTime)) {
        cell.classList.add("closed");
        cell.disabled = !schedule;
      }
      if (schedule && time > minutesFromTime(schedule.lastReceptionTime || schedule.closeTime)) {
        cell.classList.add("closed");
      }

      const startingBooking = visibleBookings.find(booking => booking.date === date && bookingStartsInSlot(booking, time, slotEnd));
      const continuingBooking = visibleBookings.find(booking => booking.date === date && bookingContinuesInSlot(booking, time, slotEnd));
      const overlappingBooking = visibleBookings.find(booking => booking.date === date && bookingOverlapsSlot(booking, time, slotEnd));
      const block = manualBlockAt(date, timeText);
      const gcalBlock = gcalEvents.find(e => gcalOverlapsSlot(e, date, time, slotEnd));

      if (startingBooking) {
        cell.classList.add("has-booking");
        cell.dataset.bookingId = startingBooking.id;
        cell.innerHTML = `
          <span class="slot-name">${escapeHtml(startingBooking.name)}</span>
          <span class="slot-sub">${escapeHtml(menuName(startingBooking.menuId))}</span>
          <span class="slot-range">${escapeHtml(bookingOccupiedRange(startingBooking))}</span>
        `;
      } else if (continuingBooking) {
        cell.classList.add("treatment");
        cell.dataset.bookingId = continuingBooking.id;
        cell.innerHTML = `<span class="slot-sub">施術中</span>`;
      } else if (block) {
        cell.classList.add("blocked");
        cell.innerHTML = `<span class="slot-sub">手動ブロック</span><span class="slot-range">${escapeHtml(blockReason(block))}</span>`;
      } else if (overlappingBooking) {
        cell.classList.add("treatment");
        cell.dataset.bookingId = overlappingBooking.id;
        cell.innerHTML = `<span class="slot-sub">施術中</span>`;
      } else if (gcalBlock) {
        cell.classList.add("gcal-blocked");
        cell.title = `Googleカレンダー: ${gcalBlock.summary}`;
        cell.innerHTML = `
          <span class="slot-sub" style="font-weight:700; font-size:10px; color:#5e2a84;">📅 Google予定</span>
          <span class="slot-range" style="font-weight:600; color:#3b1e54; font-size:11px;">${escapeHtml(gcalBlock.summary)}</span>
        `;
      } else {
        cell.innerHTML = `<span class="slot-open">空き</span>`;
      }

      weeklySchedule.append(cell);
    });
  }

  if (!weekBlocks.length && !visibleBookings.length) {
    weeklySchedule.classList.add("quiet-week");
  } else {
    weeklySchedule.classList.remove("quiet-week");
  }
}

async function toggleManualBlock(date, time) {
  const index = manualBlocks.findIndex(block => block.date === date && block.time === time);
  if (index >= 0) {
    manualBlocks.splice(index, 1);
  } else {
    manualBlocks.push({ date, time, reason: "他の予定" });
  }
  manualBlocks.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  if (await persistManualBlocks()) {
    renderManualBlocks();
    renderSchedule();
  }
}

function renderManualBlocks() {
  const date = blockDateInput.value;
  manualBlockGrid.innerHTML = "";

  if (!date) {
    manualBlockSummary.textContent = "日付を選ぶと、時間ブロックのボタンが表示されます。";
    return;
  }

  const schedule = scheduleForDate(date);
  if (!schedule) {
    manualBlockSummary.textContent = "この日は定休日または不定休です。";
    return;
  }

  const open = minutesFromTime(schedule.openTime);
  const close = minutesFromTime(schedule.closeTime);
  for (let time = open; time < close; time += 30) {
    const timeText = timeFromMinutes(time);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `manual-block-button${isBlocked(date, timeText) ? " blocked" : ""}`;
    button.textContent = timeText;
    button.addEventListener("click", () => toggleManualBlock(date, timeText));
    manualBlockGrid.append(button);
  }

  const count = manualBlocks.filter(block => block.date === date).length;
  manualBlockSummary.textContent = count ? `${date} は ${count}枠をブロック中です。` : `${date} のブロックはありません。`;
}

function renderItemEditor(container, items, type) {
  container.innerHTML = "";
  items.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "edit-card";
    card.innerHTML = `
      <div class="two-col">
        <label>
          ${type === "menu" ? "メニュー名" : "オプション名"}
          <input data-field="name" data-index="${index}" value="${escapeHtml(item.name)}" required>
        </label>
        <label>
          管理用ID
          <input data-field="id" data-index="${index}" value="${escapeHtml(item.id)}" required>
        </label>
      </div>
      <div class="two-col">
        <label>
          ${type === "menu" ? "所要時間" : "追加時間"}（分）
          <input data-field="duration" data-index="${index}" type="number" min="0" step="5" value="${escapeHtml(item.duration)}" required>
        </label>
        <label>
          金額（円）
          <input data-field="price" data-index="${index}" type="number" min="0" step="100" value="${escapeHtml(item.price)}" required>
        </label>
      </div>
      <label>
        簡易説明
        <textarea data-field="description" data-index="${index}" rows="2">${escapeHtml(item.description || "")}</textarea>
      </label>
      ${type === "menu" ? `
      <label>
        治療の説明
        <textarea data-field="treatmentSummary" data-index="${index}" rows="3">${escapeHtml(item.treatmentSummary || "")}</textarea>
      </label>
      <label>
        メニュー画像URL
        <input data-field="imageUrl" data-index="${index}" type="url" value="${escapeHtml(item.imageUrl || "")}" placeholder="https://...">
      </label>` : ""}
      <button class="danger-button" data-delete-${type}="${index}" type="button">削除</button>
    `;
    container.append(card);
  });
}

function readItemsFromEditor(container) {
  const items = [];
  container.querySelectorAll(".edit-card").forEach((card, index) => {
    const item = {};
    card.querySelectorAll("[data-field]").forEach(input => {
      item[input.dataset.field] = input.value;
    });
    item.duration = Number(item.duration);
    item.price = Number(item.price);
    items[index] = item;
  });
  return items;
}

function fillSettings(config) {
  currentConfig = config;
  settingsForm.elements.clinicName.value = config.settings.clinicName || "";
  settingsForm.elements.description.value = config.settings.description || "";
  settingsForm.elements.openTime.value = config.settings.openTime || "09:00";
  settingsForm.elements.closeTime.value = config.settings.closeTime || "19:00";
  settingsForm.elements.lastReceptionTime.value = config.settings.lastReceptionTime || config.settings.closeTime || "18:00";
  settingsForm.elements.slotMinutes.value = String(config.settings.slotMinutes || 30);
  settingsForm.elements.maxBookingsPerDay.value = String(config.settings.maxBookingsPerDay || 0);
  settingsForm.elements.closedDates.value = (config.settings.closedDates || []).join("\n");
  settingsForm.elements.specialHours.value = specialHoursToText(config.settings.specialHours);
  settingsForm.elements.notice.value = config.settings.notice || "";
  settingsForm.elements.adminEmail.value = config.settings.adminEmail || "";
  settingsForm.elements.contactEmail.value = config.settings.contactEmail || "";
  settingsForm.elements.contactPhone.value = config.settings.contactPhone || "";
  settingsForm.elements.googleCalendarIcalUrl.value = config.settings.googleCalendarIcalUrl || "";
  manualBlocks = [...(config.settings.manualBlocks || [])];
  if (!blockDateInput.value) blockDateInput.value = todayText();
  settingsForm.querySelectorAll('input[name="closedWeekdays"]').forEach(input => {
    input.checked = (config.settings.closedWeekdays || []).includes(Number(input.value));
  });
  renderItemEditor(menuEditor, config.menus || [], "menu");
  renderItemEditor(optionEditor, config.options || [], "option");
  renderManualBlocks();
  fillGmailSettings(config.settings);
}

function buildSettingsPayload() {
  const formData = new FormData(settingsForm);
  return {
    settings: {
      clinicName: formData.get("clinicName"),
      description: formData.get("description"),
      openTime: formData.get("openTime"),
      closeTime: formData.get("closeTime"),
      lastReceptionTime: formData.get("lastReceptionTime"),
      slotMinutes: Number(formData.get("slotMinutes")),
      maxBookingsPerDay: Number(formData.get("maxBookingsPerDay")),
      closedWeekdays: formData.getAll("closedWeekdays").map(Number),
      closedDates: linesToList(formData.get("closedDates")),
      specialHours: specialHoursFromText(formData.get("specialHours")),
      manualBlocks,
      notice: formData.get("notice"),
      adminEmail: formData.get("adminEmail"),
      contactEmail: formData.get("contactEmail"),
      contactPhone: formData.get("contactPhone"),
      googleCalendarIcalUrl: formData.get("googleCalendarIcalUrl")
    },
    menus: readItemsFromEditor(menuEditor),
    options: readItemsFromEditor(optionEditor)
  };
}

function setSlotDialogMessage(text, type = "") {
  slotDialogMessage.textContent = text;
  slotDialogMessage.className = `message ${type}`.trim();
}

function renderDialogMenus() {
  dialogMenuInput.innerHTML = "";
  menus.forEach(menu => {
    const option = document.createElement("option");
    option.value = menu.id;
    option.textContent = `${menu.name}（${menu.duration}分 + 30分確保）`;
    dialogMenuInput.append(option);
  });
}

function updateDialogMode() {
  const mode = slotActionForm.elements.slotMode.value;
  const bookingMode = mode === "booking";
  bookingFields.hidden = !bookingMode;
  blockFields.hidden = bookingMode;
  [dialogMenuInput, dialogNameInput, dialogPhoneInput, dialogEmailInput, dialogNoteInput].forEach(input => {
    input.disabled = !bookingMode;
  });
  [dialogBlockEndInput, dialogBlockReasonInput].forEach(input => {
    input.disabled = bookingMode;
  });
  slotSubmitButton.textContent = mode === "booking" ? "予約を追加" : "ブロックを追加";
}

function showBookingDetails(booking) {
  slotExistingPanel.innerHTML = `
    <article class="dialog-detail booking-detail">
      <strong>${escapeHtml(bookingTimeRange(booking))} ${escapeHtml(booking.name)}</strong>
      <span>${escapeHtml(menuName(booking.menuId))}</span>
      <span>確保枠：${escapeHtml(bookingOccupiedRange(booking))}</span>
      <span>電話：${escapeHtml(booking.phone || "未入力")}</span>
      ${booking.email ? `<span>メール：${escapeHtml(booking.email)}</span>` : ""}
      ${booking.note ? `<p>${escapeHtml(booking.note)}</p>` : ""}
      <button class="danger-button" type="button" data-dialog-cancel="${booking.id}">キャンセル扱いにする</button>
    </article>
  `;
  slotCreatePanel.hidden = true;
}

function showBlockDetails(date, time, block) {
  slotExistingPanel.innerHTML = `
    <article class="dialog-detail block-detail">
      <strong>${escapeHtml(time)} 予約ブロック</strong>
      <span>${escapeHtml(blockReason(block))}</span>
      <button class="danger-button" type="button" data-dialog-delete-block="${date}" data-dialog-delete-time="${time}">ブロック解除</button>
    </article>
  `;
  slotCreatePanel.hidden = true;
}

function resetSlotForm() {
  slotActionForm.reset();
  renderDialogMenus();
  dialogNameInput.value = "";
  dialogPhoneInput.value = "";
  dialogEmailInput.value = "";
  dialogNoteInput.value = "";
  dialogBlockReasonInput.value = "";
  setSlotDialogMessage("");
  updateDialogMode();
}

function openSlotDialog(date, time) {
  selectedSlot = { date, time };
  const schedule = scheduleForDate(date);
  const start = minutesFromTime(time);
  const end = schedule ? Math.min(start + 60, minutesFromTime(schedule.closeTime)) : start + 60;
  const booking = allBookings.find(item => item.status !== "cancelled" && item.date === date && bookingOverlapsSlot(item, start, start + 30));
  const block = manualBlockAt(date, time);
  const gcalBlock = gcalEvents.find(e => gcalOverlapsSlot(e, date, start, start + 30));

  resetSlotForm();
  slotDialogTitle.textContent = `${formatShortDateLabel(date)} ${time}`;
  slotDialogMeta.textContent = schedule ? `予約開始 ${schedule.openTime} / 最終受付 ${schedule.lastReceptionTime || schedule.closeTime}` : "休業日";
  dialogBlockEndInput.value = timeFromMinutes(end);
  slotExistingPanel.innerHTML = "";
  slotCreatePanel.hidden = false;

  if (booking) {
    showBookingDetails(booking);
  } else if (block) {
    showBlockDetails(date, time, block);
  } else if (gcalBlock) {
    slotExistingPanel.innerHTML = `
      <div style="background:#f6f0fa; border:1px solid #c9aedb; border-radius:8px; padding:12px; margin-bottom:12px;">
        <strong style="color:#5e2a84; font-size:14px;">📅 Googleカレンダー連携ブロック</strong>
        <p style="margin:4px 0 0; color:#333; font-weight:600;">予定：${escapeHtml(gcalBlock.summary)}</p>
        <p style="margin:4px 0 0; font-size:12px; color:#666;">※ この予定は院長のGoogleカレンダーから自動同期されており、お客様の予約枠を自動でブロックしています。</p>
      </div>
    `;
    slotCreatePanel.hidden = true;
  } else if (!schedule) {
    slotExistingPanel.innerHTML = '<p class="message">この日は休業日です。</p>';
    slotCreatePanel.hidden = true;
  }

  if (typeof slotDialog.showModal === "function") {
    slotDialog.showModal();
  } else {
    slotDialog.setAttribute("open", "");
  }
}

async function createAdminBooking() {
  if (!selectedSlot) return;
  setSlotDialogMessage("予約を追加しています...");
  const res = await fetch("/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      adminEntry: true,
      date: selectedSlot.date,
      time: selectedSlot.time,
      menuId: dialogMenuInput.value,
      name: dialogNameInput.value.trim(),
      phone: dialogPhoneInput.value.trim(),
      email: dialogEmailInput.value.trim(),
      note: dialogNoteInput.value.trim()
    })
  });

  if (!res.ok) {
    const data = await res.json();
    const messages = {
      "time already booked": "この時間はすでに予約または施術中です。",
      "time blocked": "この時間は予約ブロック中です。",
      "daily booking limit reached": "この日は予約上限に達しています。",
      "outside business hours": "営業時間外です。"
    };
    setSlotDialogMessage(messages[data.error] || "予約を追加できませんでした。", "error");
    return;
  }

  slotDialog.close();
  await loadBookings();
}

async function createDialogBlock() {
  if (!selectedSlot) return;
  await addManualBlockRange(
    selectedSlot.date,
    selectedSlot.time,
    dialogBlockEndInput.value,
    dialogBlockReasonInput.value.trim()
  );
  slotDialog.close();
  await loadBookings();
}

async function cancelBooking(id) {
  if (!confirm("この予約をキャンセル扱いにしますか？")) return;
  await fetch(`/api/bookings/${id}/cancel`, { method: "POST" });
  await loadBookings();
}

async function loadBookings() {
  const [configRes, bookingsRes, notificationsRes, resetRequestsRes, gcalRes] = await Promise.all([
    fetch("/api/config"),
    fetch("/api/bookings"),
    fetch("/api/notifications"),
    fetch("/api/password-reset-requests"),
    fetch("/api/admin-calendar-blocks").catch(() => null)
  ]);
  if (bookingsRes.status === 401 || notificationsRes.status === 401 || resetRequestsRes.status === 401) {
    location.href = "/login.html";
    return;
  }
  const config = await configRes.json();
  const data = await bookingsRes.json();
  const notificationData = await notificationsRes.json();
  const resetRequestData = await resetRequestsRes.json();
  if (gcalRes && gcalRes.ok) {
    try {
      const gcalData = await gcalRes.json();
      gcalEvents = gcalData.events || [];
    } catch {
      gcalEvents = [];
    }
  }
  menus = config.menus || [];
  options = config.options || [];
  allBookings = data.bookings || [];
  fillSettings(config);
  renderSchedule(allBookings);

  rows.innerHTML = "";
  emptyMessage.textContent = data.bookings.length ? "" : "まだ予約はありません。";

  for (const booking of data.bookings) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(booking.date)}<br>${escapeHtml(booking.time)}</td>
      <td>${escapeHtml(menuName(booking.menuId))}<br><small>追加：${escapeHtml(optionNames(booking.optionIds))}</small></td>
      <td>${escapeHtml(booking.name)}<br>${escapeHtml(booking.kana)}</td>
      <td>${escapeHtml(booking.phone)}<br>${escapeHtml(booking.email)}</td>
      <td>${escapeHtml(booking.note)}</td>
      <td><span class="status ${booking.status}">${booking.status === "cancelled" ? "キャンセル" : "確定"}</span></td>
      <td>
        ${booking.status === "cancelled" ? "" : `<button class="danger-button" data-cancel="${booking.id}" type="button">キャンセル</button>`}
      </td>
    `;
    rows.append(tr);
  }

  notificationList.innerHTML = "";
  if (!notificationData.notifications.length) {
    notificationList.innerHTML = '<p class="message">まだ通知ログはありません。</p>';
  }
  for (const notification of notificationData.notifications.slice(0, 10)) {
    const item = document.createElement("article");
    item.className = "notification-item";
    item.innerHTML = `
      <strong>${escapeHtml(notification.subject)}</strong>
      <small>${escapeHtml(notification.createdAt)} / ${escapeHtml(notification.status)}</small>
      <pre>${escapeHtml(notification.body)}</pre>
    `;
    notificationList.append(item);
  }

  resetRequestList.innerHTML = "";
  if (!resetRequestData.requests.length) {
    resetRequestList.innerHTML = '<p class="message">まだ再設定申請はありません。</p>';
  }
  for (const request of resetRequestData.requests.slice(0, 10)) {
    const item = document.createElement("article");
    item.className = "notification-item";
    item.innerHTML = `
      <strong>${escapeHtml(request.requestedEmail || "メール未入力")}</strong>
      <small>${escapeHtml(request.createdAt)} / ${escapeHtml(request.status)} / token: ${request.hasToken ? "あり" : "なし"}</small>
      <pre>${escapeHtml(request.adminEmailConfigured ? "管理者メール設定済み" : "管理者メール未設定")}</pre>
    `;
    resetRequestList.append(item);
  }
}

settingsForm.addEventListener("submit", async event => {
  event.preventDefault();
  setSettingsMessage("設定を保存しています...");
  const res = await fetch("/api/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildSettingsPayload())
  });

  if (!res.ok) {
    const data = await res.json();
    setSettingsMessage(data.error || "保存できませんでした。入力内容を確認してください。", "error");
    return;
  }

  const config = await res.json();
  menus = config.menus || [];
  options = config.options || [];
  fillSettings(config);
  setSettingsMessage("設定を保存しました。予約ページの空き状況にも反映されています。", "success");
  await loadBookings();
});

passwordForm.addEventListener("submit", async event => {
  event.preventDefault();
  const formData = new FormData(passwordForm);
  const currentPassword = String(formData.get("currentPassword") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (newPassword !== confirmPassword) {
    setPasswordMessage("新しいパスワードが一致しません。", "error");
    return;
  }

  if (newPassword.length < 8) {
    setPasswordMessage("新しいパスワードは8文字以上にしてください。", "error");
    return;
  }

  setPasswordMessage("パスワードを変更しています...");
  const res = await fetch("/api/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword })
  });

  if (!res.ok) {
    const data = await res.json();
    const messages = {
      "current password is incorrect": "現在のパスワードが違います。",
      "new password is too short": "新しいパスワードは8文字以上にしてください。",
      "new password is same as current": "現在とは違うパスワードにしてください。"
    };
    setPasswordMessage(messages[data.error] || "変更できませんでした。", "error");
    return;
  }

  setPasswordMessage("変更しました。新しいパスワードでログインし直してください。", "success");
  passwordForm.reset();
  setTimeout(() => {
    location.href = "/login.html";
  }, 1200);
});

menuEditor.addEventListener("click", event => {
  const button = event.target.closest("[data-delete-menu]");
  if (!button) return;
  const nextMenus = readItemsFromEditor(menuEditor);
  if (nextMenus.length <= 1) {
    setSettingsMessage("基本メニューは最低1つ必要です。", "error");
    return;
  }
  nextMenus.splice(Number(button.dataset.deleteMenu), 1);
  renderItemEditor(menuEditor, nextMenus, "menu");
});

optionEditor.addEventListener("click", event => {
  const button = event.target.closest("[data-delete-option]");
  if (!button) return;
  const nextOptions = readItemsFromEditor(optionEditor);
  nextOptions.splice(Number(button.dataset.deleteOption), 1);
  renderItemEditor(optionEditor, nextOptions, "option");
});

addMenuButton.addEventListener("click", () => {
  const nextMenus = readItemsFromEditor(menuEditor);
  nextMenus.push({
    id: `menu-${nextMenus.length + 1}`,
    name: "新しいメニュー",
    duration: 60,
    price: 0,
    imageUrl: "",
    description: "",
    treatmentSummary: ""
  });
  renderItemEditor(menuEditor, nextMenus, "menu");
});

addOptionButton.addEventListener("click", () => {
  const nextOptions = readItemsFromEditor(optionEditor);
  nextOptions.push({
    id: `option-${nextOptions.length + 1}`,
    name: "新しいオプション",
    duration: 10,
    price: 0,
    description: ""
  });
  renderItemEditor(optionEditor, nextOptions, "option");
});

blockDateInput.addEventListener("change", renderManualBlocks);

scheduleDateInput.addEventListener("change", () => renderSchedule());

schedulePrevButton.addEventListener("click", () => {
  scheduleDateInput.value = addDays(scheduleDateInput.value || todayText(), -7);
  renderSchedule();
});

scheduleTodayButton.addEventListener("click", () => {
  scheduleDateInput.value = todayText();
  renderSchedule();
});

scheduleNextButton.addEventListener("click", () => {
  scheduleDateInput.value = addDays(scheduleDateInput.value || todayText(), 7);
  renderSchedule();
});

weeklySchedule.addEventListener("click", event => {
  const slot = event.target.closest(".week-slot");
  if (!slot || !slot.dataset.date || !slot.dataset.time) return;
  openSlotDialog(slot.dataset.date, slot.dataset.time);
});

slotActionForm.addEventListener("change", event => {
  if (event.target.name === "slotMode") updateDialogMode();
});

slotActionForm.addEventListener("submit", event => {
  event.preventDefault();
  if (slotActionForm.elements.slotMode.value === "booking") {
    createAdminBooking();
  } else {
    createDialogBlock();
  }
});

slotExistingPanel.addEventListener("click", event => {
  const cancelButton = event.target.closest("[data-dialog-cancel]");
  if (cancelButton) {
    slotDialog.close();
    cancelBooking(cancelButton.dataset.dialogCancel);
    return;
  }
  const deleteBlockButton = event.target.closest("[data-dialog-delete-block]");
  if (deleteBlockButton) {
    const date = deleteBlockButton.dataset.dialogDeleteBlock;
    const time = minutesFromTime(deleteBlockButton.dataset.dialogDeleteTime);
    slotDialog.close();
    deleteManualBlockRange(date, time, time + 30);
  }
});

slotDialogClose.addEventListener("click", () => {
  slotDialog.close();
});

rows.addEventListener("click", event => {
  const button = event.target.closest("[data-cancel]");
  if (button) cancelBooking(button.dataset.cancel);
});

gmailForm.addEventListener("submit", async event => {
  event.preventDefault();
  setGmailMessage("保存しています...");
  const formData = new FormData(gmailForm);
  const res = await fetch("/api/gmail-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      emailWebhookUrl: formData.get("emailWebhookUrl"),
      gmailUser: formData.get("gmailUser"),
      gmailAppPassword: formData.get("gmailAppPassword"),
      notifyEmail: formData.get("notifyEmail")
    })
  });
  if (res.status === 401) { location.href = "/login.html"; return; }
  const data = await res.json();
  if (!res.ok) {
    setGmailMessage(data.error || "保存できませんでした。", "error");
    return;
  }
  gmailAppPasswordInput.value = "";
  gmailAppPasswordInput.placeholder = data.gmailAppPasswordSet ? "（設定済み・変更する場合のみ入力）" : "xxxx xxxx xxxx xxxx";
  setGmailMessage("メール送信設定を保存しました。", "success");
});

gmailTestButton.addEventListener("click", async () => {
  setGmailMessage("テストメールを送信しています...");
  const res = await fetch("/api/gmail-test", { method: "POST" });
  const data = await res.json();
  if (!res.ok) {
    setGmailMessage(`送信失敗: ${data.error}${data.detail ? `（${data.detail}）` : ""}`, "error");
    return;
  }
  setGmailMessage(data.message || "テストメールを送信しました。", "success");
});

refreshButton.addEventListener("click", () => {
  loadBookings();
  loadGalleryAdmin();
});

logoutButton.addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  location.href = "/login.html";
});

// ─── 施術写真・臨床ギャラリー管理 ───
const galleryAdminGrid = document.getElementById("galleryAdminGrid");
const galleryAdminGlobalMessage = document.getElementById("galleryAdminGlobalMessage");

async function loadGalleryAdmin() {
  if (!galleryAdminGrid) return;
  try {
    const res = await fetch("/api/gallery");
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.gallery)) return;
    renderGalleryAdmin(data.gallery);
  } catch (err) {
    console.error("Failed to load gallery:", err);
  }
}

function renderGalleryAdmin(slots) {
  galleryAdminGrid.innerHTML = "";
  slots.forEach((slot, index) => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.cssText = "background:#fff;border:1px solid #e0dbd3;border-radius:10px;padding:16px;display:flex;flex-direction:column;gap:10px;";
    
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-weight:700;color:var(--primary,#5e2a84);font-size:13px;">スロット ${index + 1}</span>
        <span style="font-size:11px;background:#f0ece6;padding:2px 8px;border-radius:4px;color:#666;">${slot.tag || "タグ未設定"}</span>
      </div>
      <div style="aspect-ratio:4/3;background:#eee;border-radius:6px;overflow:hidden;position:relative;">
        <img id="preview_${slot.id}" src="${slot.image}?t=${Date.now()}" alt="${slot.label}" style="width:100%;height:100%;object-fit:cover;display:block;">
      </div>
      <div>
        <strong style="display:block;font-size:14px;color:#222;margin-bottom:2px;">${slot.label || "施術写真"}</strong>
        <p style="font-size:12px;color:#777;margin:0;line-height:1.4;">${slot.title || ""}</p>
      </div>
      <div style="margin-top:auto;display:flex;flex-direction:column;gap:8px;">
        <label class="secondary-button" style="text-align:center;cursor:pointer;font-size:12px;padding:8px 12px;display:block;">
          📷 新しい写真を選択
          <input type="file" id="file_${slot.id}" accept="image/*" style="display:none;">
        </label>
        <button type="button" id="uploadBtn_${slot.id}" style="font-size:12px;padding:8px 12px;display:none;background:#8a6d3b;color:#fff;border:none;border-radius:6px;cursor:pointer;">
          ⬆️ この写真に差し替える
        </button>
        <p id="msg_${slot.id}" class="message" style="margin:0;font-size:12px;min-height:18px;"></p>
      </div>
    `;

    galleryAdminGrid.appendChild(card);

    const fileInput = card.querySelector(`#file_${slot.id}`);
    const uploadBtn = card.querySelector(`#uploadBtn_${slot.id}`);
    const previewImg = card.querySelector(`#preview_${slot.id}`);
    const msgEl = card.querySelector(`#msg_${slot.id}`);

    let selectedDataUrl = null;

    fileInput.addEventListener("change", event => {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = e => {
        selectedDataUrl = e.target.result;
        previewImg.src = selectedDataUrl;
        uploadBtn.style.display = "block";
        uploadBtn.textContent = `⬆️ 「${file.name.slice(0, 15)}」に差し替える`;
        msgEl.textContent = "画像が選択されました。「差し替える」ボタンを押してください。";
        msgEl.className = "message";
      };
      reader.readAsDataURL(file);
    });

    uploadBtn.addEventListener("click", async () => {
      if (!selectedDataUrl) return;
      uploadBtn.disabled = true;
      uploadBtn.textContent = "アップロード中...";
      msgEl.textContent = "保存しています...";
      msgEl.className = "message";

      try {
        const res = await fetch("/api/gallery/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slotId: slot.id,
            dataUrl: selectedDataUrl
          })
        });

        if (res.status === 401) {
          location.href = "/login.html";
          return;
        }

        const data = await res.json();
        if (!res.ok) {
          msgEl.textContent = data.error || "アップロードに失敗しました。";
          msgEl.className = "message error";
          uploadBtn.disabled = false;
          uploadBtn.textContent = "再試行";
          return;
        }

        msgEl.textContent = "✨ 写真を正常に差し替えました！";
        msgEl.className = "message success";
        uploadBtn.style.display = "none";
        previewImg.src = `${data.updatedSlot.image}?t=${Date.now()}`;
      } catch (err) {
        msgEl.textContent = `通信エラー: ${err.message}`;
        msgEl.className = "message error";
        uploadBtn.disabled = false;
        uploadBtn.textContent = "再試行";
      }
    });
  });
}

loadBookings();
loadGalleryAdmin();
