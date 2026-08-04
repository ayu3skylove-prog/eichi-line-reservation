const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
let config = null;
let currentMonth = new Date();
let selectedDate = "";
let isReviewing = false;

const clinicName = document.querySelector("#clinicName");
const description = document.querySelector("#description");
const notice = document.querySelector("#notice");
const hours = document.querySelector("#hours");
const closedDays = document.querySelector("#closedDays");
const menuSelect = document.querySelector("#menuSelect");
const menuDetail = document.querySelector("#menuDetail");
const optionSection = document.querySelector("#optionSection");
const optionList = document.querySelector("#optionList");
const dateInput = document.querySelector("#dateInput");
const timeSelect = document.querySelector("#timeSelect");
const form = document.querySelector("#bookingForm");
const formMessage = document.querySelector("#formMessage");
const confirmationActions = document.querySelector("#confirmationActions");
const bookingReview = document.querySelector("#bookingReview");
const reviewButton = document.querySelector("#reviewButton");
const editBookingButton = document.querySelector("#editBookingButton");
const calendarTitle = document.querySelector("#calendarTitle");
const availabilityCalendar = document.querySelector("#availabilityCalendar");
const selectedDateTitle = document.querySelector("#selectedDateTitle");
const slotList = document.querySelector("#slotList");
const prevMonthButton = document.querySelector("#prevMonthButton");
const nextMonthButton = document.querySelector("#nextMonthButton");

function minutesFromTime(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function timeFromMinutes(total) {
  const h = String(Math.floor(total / 60)).padStart(2, "0");
  const m = String(total % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function formatPrice(price) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0
  }).format(price);
}

function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toMonthString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatDateLabel(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  return `${date.getMonth() + 1}月${date.getDate()}日（${weekdays[date.getDay()]}）`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateStep(step) {
  document.querySelectorAll("[data-step-indicator]").forEach(item => {
    const value = Number(item.dataset.stepIndicator);
    item.classList.toggle("active", value === step);
    item.classList.toggle("complete", value < step);
  });
}

function resetReview() {
  isReviewing = false;
  bookingReview.hidden = true;
  bookingReview.innerHTML = "";
  reviewButton.textContent = "予約内容を確認する";
  editBookingButton.hidden = true;
  confirmationActions.hidden = true;
  confirmationActions.innerHTML = "";
}

function selectedMenu() {
  return config.menus.find(menu => menu.id === menuSelect.value);
}

function selectedOptionIds() {
  return [...document.querySelectorAll('input[name="optionIds"]:checked')].map(input => input.value);
}

function selectedOptions() {
  const ids = selectedOptionIds();
  return (config.options || []).filter(option => ids.includes(option.id));
}

function totalDuration(menu) {
  return menu.duration + selectedOptions().reduce((sum, option) => sum + option.duration, 0);
}

function totalPrice(menu) {
  return menu.price + selectedOptions().reduce((sum, option) => sum + option.price, 0);
}

function optionQuery() {
  const ids = selectedOptionIds();
  return ids.length ? `&optionIds=${encodeURIComponent(ids.join(","))}` : "";
}

function renderOptions() {
  const options = config.options || [];
  optionList.innerHTML = "";
  optionSection.hidden = !options.length;

  for (const option of options) {
    const label = document.createElement("label");
    label.className = "option-card";
    label.innerHTML = `
      <input type="checkbox" name="optionIds" value="${option.id}">
      <span>
        <strong>${option.name}</strong>
        <small>${option.duration}分 / ${formatPrice(option.price)}</small>
        <em>${option.description}</em>
      </span>
    `;
    optionList.append(label);
  }
}

function renderMenuDetail() {
  const menu = selectedMenu();
  if (!menu) return;
  const options = selectedOptions();
  menuDetail.innerHTML = `
    <strong>${menu.name}</strong><br>
    合計 ${totalDuration(menu)}分 / ${formatPrice(totalPrice(menu))}<br>
    ${menu.description}
    ${menu.treatmentSummary ? `<br><br>${menu.treatmentSummary}` : ""}
    ${options.length ? `<br><br>追加：${options.map(option => option.name).join("、")}` : ""}
  `;
  resetReview();
  updateStep(1);
  refreshAvailability();
}

function renderTimes(slots = []) {
  const menu = selectedMenu();
  if (!menu) return;

  timeSelect.innerHTML = "";

  if (!slots.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "空き時間がありません";
    timeSelect.append(option);
    return;
  }

  for (const time of slots) {
    const option = document.createElement("option");
    option.value = time;
    option.textContent = time;
    timeSelect.append(option);
  }
}

async function loadSlotsForDate(dateText) {
  const res = await fetch(`/api/availability?date=${dateText}&menuId=${menuSelect.value}${optionQuery()}`);
  if (!res.ok) return { slots: [], daySlots: [] };
  return res.json();
}

async function renderSlots(dateText, preferredTime = "") {
  selectedDate = dateText;
  dateInput.value = dateText;
  selectedDateTitle.textContent = `${formatDateLabel(dateText)}の空き時間`;
  slotList.innerHTML = "";

  const availability = await loadSlotsForDate(dateText);
  const slots = availability.slots || [];
  const daySlots = availability.daySlots?.length
    ? availability.daySlots
    : slots.map(time => ({ time, available: true }));
  renderTimes(slots);

  if (preferredTime && slots.includes(preferredTime)) {
    timeSelect.value = preferredTime;
  }

  if (!slots.length) {
    slotList.innerHTML = '<p class="message">この日は空き時間がありません。</p>';
    return;
  }

  for (const slotStatus of daySlots) {
    const slot = slotStatus.time;
    const button = document.createElement("button");
    button.type = "button";
    button.className = [
      "slot-button",
      slotStatus.available ? "" : "unavailable",
      slot === timeSelect.value ? "selected" : ""
    ].filter(Boolean).join(" ");
    button.disabled = !slotStatus.available;
    button.textContent = slotStatus.available ? slot : `${slot} 予約不可`;
    if (!slotStatus.available) {
      slotList.append(button);
      continue;
    }
      button.addEventListener("click", () => {
        timeSelect.value = slot;
        document.querySelectorAll(".slot-button").forEach(item => item.classList.remove("selected"));
        button.classList.add("selected");
        setMessage(`${formatDateLabel(dateText)} ${slot} を選択しました。`, "success");
        resetReview();
        updateStep(4);
      });
    slotList.append(button);
  }
}

async function renderCalendar() {
  const monthText = toMonthString(currentMonth);
  const res = await fetch(`/api/availability?month=${monthText}&menuId=${menuSelect.value}${optionQuery()}`);
  const data = await res.json();
  const todayText = toDateString(new Date());

  calendarTitle.textContent = `${currentMonth.getFullYear()}年${currentMonth.getMonth() + 1}月`;
  availabilityCalendar.innerHTML = "";

  for (let i = 0; i < data.firstWeekday; i += 1) {
    const spacer = document.createElement("div");
    spacer.className = "calendar-spacer";
    availabilityCalendar.append(spacer);
  }

  for (const day of data.days) {
    const button = document.createElement("button");
    const date = new Date(`${day.date}T00:00:00`);
    const isPast = day.date < todayText;
    const hasSlots = day.slotCount > 0 && !isPast;
    const isSelected = day.date === selectedDate;
    button.type = "button";
    button.className = [
      "calendar-day",
      hasSlots ? "available" : "unavailable",
      day.isClosed ? "closed" : "",
      isSelected ? "selected" : ""
    ].filter(Boolean).join(" ");
    button.disabled = !hasSlots;
    button.innerHTML = `
      <span class="day-number">${date.getDate()}</span>
      <span class="day-status">${day.isClosed ? "休" : hasSlots ? `空き${day.slotCount}` : "満"}</span>
    `;
    button.addEventListener("click", async () => {
      selectedDate = day.date;
      await renderCalendar();
      await renderSlots(day.date);
      resetReview();
      updateStep(3);
    });
    availabilityCalendar.append(button);
  }
}

async function refreshAvailability(preferredTime = "") {
  if (!config) return;
  const today = new Date();
  if (!selectedDate) selectedDate = toDateString(today);
  await renderCalendar();
  await renderSlots(selectedDate, preferredTime);
}

function setMessage(text, type = "") {
  formMessage.textContent = text;
  formMessage.className = `message ${type}`.trim();
}

function googleCalendarUrl(booking, calendar) {
  const start = new Date(`${booking.date}T${booking.time}:00+09:00`);
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + calendar.duration);
  const format = date => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const optionText = calendar.optionNames.length ? ` / ${calendar.optionNames.join("、")}` : "";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${config.settings.clinicName} ${calendar.menuName}`,
    dates: `${format(start)}/${format(end)}`,
    details: `メニュー: ${calendar.menuName}${optionText}`,
    ctz: "Asia/Tokyo"
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function renderConfirmationActions(data) {
  const googleUrl = googleCalendarUrl(data.booking, data.calendar);
  confirmationActions.hidden = false;
  confirmationActions.innerHTML = `
    <a class="button-link" href="${googleUrl}" target="_blank" rel="noopener">Googleカレンダーに追加</a>
    <a class="button-link secondary-link" href="${data.calendar.icsUrl}">iPhone/Macカレンダーに追加</a>
  `;
}

function bookingSummaryFromForm() {
  const formData = new FormData(form);
  const menu = selectedMenu();
  const options = selectedOptions();
  return {
    menu,
    options,
    date: String(formData.get("date") || ""),
    time: String(formData.get("time") || ""),
    name: String(formData.get("name") || ""),
    kana: String(formData.get("kana") || ""),
    phone: String(formData.get("phone") || ""),
    email: String(formData.get("email") || ""),
    note: String(formData.get("note") || "")
  };
}

function renderBookingReview() {
  const summary = bookingSummaryFromForm();
  const optionText = summary.options.length ? summary.options.map(option => option.name).join("、") : "なし";
  bookingReview.hidden = false;
  bookingReview.innerHTML = `
    <p class="step-label">Step 5</p>
    <h2>ご予約内容の確認</h2>
    <p class="review-lead">内容をご確認のうえ、よろしければ予約を確定してください。</p>
    <dl class="review-list">
      <div><dt>メニュー</dt><dd>${escapeHtml(summary.menu?.name || "")}</dd></div>
      <div><dt>オプション</dt><dd>${escapeHtml(optionText)}</dd></div>
      <div><dt>日時</dt><dd>${escapeHtml(formatDateLabel(summary.date))} ${escapeHtml(summary.time)}</dd></div>
      <div><dt>所要時間・料金</dt><dd>${totalDuration(summary.menu)}分 / ${formatPrice(totalPrice(summary.menu))}</dd></div>
      <div><dt>お名前</dt><dd>${escapeHtml(summary.name)}${summary.kana ? `（${escapeHtml(summary.kana)}）` : ""}</dd></div>
      <div><dt>電話番号</dt><dd>${escapeHtml(summary.phone)}</dd></div>
      <div><dt>メール</dt><dd>${escapeHtml(summary.email || "未入力")}</dd></div>
      <div><dt>相談内容</dt><dd>${escapeHtml(summary.note || "未入力")}</dd></div>
    </dl>
  `;
  isReviewing = true;
  reviewButton.textContent = "この内容で予約する";
  editBookingButton.hidden = false;
  updateStep(5);
  bookingReview.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadConfig() {
  const res = await fetch("/api/config");
  config = await res.json();
  clinicName.textContent = config.settings.clinicName;
  description.textContent = config.settings.description;
  notice.textContent = config.settings.notice;
  hours.textContent = `${config.settings.openTime}〜${config.settings.closeTime}`;
  closedDays.textContent = config.settings.closedWeekdays.map(day => `${weekdays[day]}曜日`).join("、") || "なし";

  menuSelect.innerHTML = "";
  for (const menu of config.menus) {
    const option = document.createElement("option");
    option.value = menu.id;
    option.textContent = `${menu.name}（${menu.duration}分）`;
    menuSelect.append(option);
  }
  renderOptions();

  const today = new Date();
  dateInput.min = today.toISOString().slice(0, 10);
  selectedDate = toDateString(today);
  dateInput.value = selectedDate;
  renderMenuDetail();
}

menuSelect.addEventListener("change", renderMenuDetail);

optionList.addEventListener("change", renderMenuDetail);

dateInput.addEventListener("change", async () => {
  selectedDate = dateInput.value;
  currentMonth = new Date(`${selectedDate}T00:00:00`);
  resetReview();
  updateStep(3);
  await refreshAvailability(timeSelect.value);
});

timeSelect.addEventListener("change", () => {
  document.querySelectorAll(".slot-button").forEach(item => {
    item.classList.toggle("selected", item.textContent === timeSelect.value);
  });
  resetReview();
  updateStep(4);
});

form.addEventListener("input", event => {
  if (event.target.closest("#bookingReview")) return;
  if (isReviewing) resetReview();
});

editBookingButton.addEventListener("click", () => {
  resetReview();
  setMessage("内容を修正できます。修正後にもう一度確認へ進んでください。");
  updateStep(4);
});

prevMonthButton.addEventListener("click", async () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
  await renderCalendar();
});

nextMonthButton.addEventListener("click", async () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  await renderCalendar();
});

form.addEventListener("submit", async event => {
  event.preventDefault();

  if (!form.reportValidity()) return;

  if (!isReviewing) {
    renderBookingReview();
    setMessage("予約内容をご確認ください。");
    return;
  }

  setMessage("予約を登録しています...");
  confirmationActions.hidden = true;
  confirmationActions.innerHTML = "";

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.optionIds = formData.getAll("optionIds");
  const res = await fetch("/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const data = await res.json();
    const messages = {
      "time already booked": "この時間はすでに予約が入っています。別の時間を選んでください。",
      "time blocked": "この時間は予約できない時間に設定されています。別の時間を選んでください。",
      "daily booking limit reached": "この日は予約枠が上限に達しています。別の日を選んでください。",
      "closed weekday": "選択した日は定休日です。別の日を選んでください。",
      "closed day": "選択した日はお休みです。別の日を選んでください。",
      "outside business hours": "営業時間外の予約です。別の時間を選んでください。"
    };
    setMessage(messages[data.error] || "予約できませんでした。内容を確認してください。", "error");
    return;
  }

  const data = await res.json();
  setMessage(`${data.booking.date} ${data.booking.time} で予約を受け付けました。ご来院を心よりお待ちしています。`, "success");
  bookingReview.innerHTML = `
    <p class="step-label">Step 6</p>
    <h2>予約を受け付けました</h2>
    <p class="review-lead">${escapeHtml(formatDateLabel(data.booking.date))} ${escapeHtml(data.booking.time)} にて承りました。変更が必要な場合は、直接お問い合わせください。</p>
  `;
  bookingReview.hidden = false;
  renderConfirmationActions(data);
  form.reset();
  isReviewing = false;
  reviewButton.textContent = "予約内容を確認する";
  editBookingButton.hidden = true;
  updateStep(6);
  bookingReview.scrollIntoView({ behavior: "smooth", block: "start" });
  selectedDate = toDateString(new Date());
  dateInput.value = selectedDate;
  await refreshAvailability();
});

loadConfig().catch(() => {
  setMessage("予約ページを読み込めませんでした。", "error");
});
