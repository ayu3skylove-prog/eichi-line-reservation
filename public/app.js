const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
let config = null;
let currentWeekStart = null;
let selectedDate = "";
let isReviewing = false;

const clinicName = document.querySelector("#clinicName");
const description = document.querySelector("#description");
const notice = document.querySelector("#notice");
const hours = document.querySelector("#hours");
const closedDays = document.querySelector("#closedDays");
const menuIdInput = document.querySelector("#menuIdInput");
const menuCardList = document.querySelector("#menuCardList");
const optionSection = document.querySelector("#optionSection");
const optionList = document.querySelector("#optionList");
const dateInput = document.querySelector("#dateInput");
const timeSelect = document.querySelector("#timeSelect");
const weekMatrix = document.querySelector("#weekMatrix");
const weekTitle = document.querySelector("#weekTitle");
const prevWeekButton = document.querySelector("#prevWeekButton");
const nextWeekButton = document.querySelector("#nextWeekButton");
const form = document.querySelector("#bookingForm");
const formMessage = document.querySelector("#formMessage");
const confirmationActions = document.querySelector("#confirmationActions");
const bookingReview = document.querySelector("#bookingReview");
const reviewButton = document.querySelector("#reviewButton");
const editBookingButton = document.querySelector("#editBookingButton");

function minutesFromTime(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
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
  return config?.menus.find(menu => menu.id === menuIdInput.value);
}

function selectedOptionIds() {
  return [...document.querySelectorAll('input[name="optionIds"]:checked')].map(input => input.value);
}

function selectedOptions() {
  const ids = selectedOptionIds();
  return (config?.options || []).filter(option => ids.includes(option.id));
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
  const options = config?.options || [];
  optionList.innerHTML = "";
  optionSection.hidden = !options.length;

  for (const option of options) {
    const label = document.createElement("label");
    label.className = "option-card";
    label.innerHTML = `
      <input type="checkbox" name="optionIds" value="${option.id}">
      <span>
        <strong>${escapeHtml(option.name)}</strong>
        <small>${option.duration}分 / ${formatPrice(option.price)}</small>
        <em>${escapeHtml(option.description)}</em>
      </span>
    `;
    optionList.append(label);
  }
}

function onMenuChange() {
  resetReview();
  updateStep(1);
  renderWeekMatrix();
}

function renderMenuCards() {
  menuCardList.innerHTML = "";
  if (!config) return;

  for (const menu of config.menus) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "menu-card" + (menuIdInput.value === menu.id ? " selected" : "");
    card.dataset.menuId = menu.id;

    const imgHtml = menu.imageUrl
      ? `<img class="menu-card-img" src="${escapeHtml(menu.imageUrl)}" alt="" loading="lazy">`
      : "";

    card.innerHTML = `
      ${imgHtml}
      <div class="menu-card-body">
        <div class="menu-card-tagline">${escapeHtml(menu.treatmentSummary || "")}</div>
        <div class="menu-card-name">${escapeHtml(menu.name)}</div>
        <div class="menu-card-meta">${menu.duration}分 ／ ${formatPrice(menu.price)}（税込）</div>
        <div class="menu-card-desc">${escapeHtml(menu.description || "")}</div>
      </div>
      <div class="menu-card-check" aria-hidden="true">✓</div>
    `;

    card.addEventListener("click", () => {
      menuIdInput.value = menu.id;
      document.querySelectorAll(".menu-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      onMenuChange();
    });

    menuCardList.append(card);
  }
}

function getWeekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

async function renderWeekMatrix() {
  if (!config || !menuIdInput.value) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (prevWeekButton) {
    prevWeekButton.disabled = currentWeekStart <= today;
  }

  const todayText = toDateString(today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  const dayStrings = days.map(toDateString);

  const first = days[0];
  const last = days[6];
  weekTitle.textContent = `${first.getFullYear()}年${first.getMonth() + 1}月${first.getDate()}日 〜 ${last.getMonth() + 1}月${last.getDate()}日`;

  weekMatrix.innerHTML = '<div class="wm-loading">読み込み中…</div>';

  const fetchedDays = await Promise.all(
    dayStrings.map(async (dateText) => {
      if (dateText < todayText) return { dateText, slots: [], isPast: true };
      try {
        const res = await fetch(`/api/availability?date=${dateText}&menuId=${encodeURIComponent(menuIdInput.value)}${optionQuery()}`);
        if (!res.ok) return { dateText, slots: [], isPast: false };
        const data = await res.json();
        return { dateText, slots: data.daySlots || [], isPast: false };
      } catch {
        return { dateText, slots: [], isPast: false };
      }
    })
  );

  const allTimes = [...new Set(fetchedDays.flatMap(d => d.slots.map(s => s.time)))].sort();

  weekMatrix.innerHTML = "";

  if (!allTimes.length) {
    weekMatrix.innerHTML = '<p class="wm-empty">この週に予約可能な時間枠はありません。</p>';
    return;
  }

  weekMatrix.style.gridTemplateColumns = `56px repeat(7, minmax(44px, 1fr))`;
  weekMatrix.style.gridTemplateRows = `auto repeat(${allTimes.length}, auto)`;

  const corner = document.createElement("div");
  corner.className = "wm-corner";
  corner.textContent = "時刻";
  weekMatrix.append(corner);

  days.forEach((day, i) => {
    const dateText = toDateString(day);
    const isToday = dateText === todayText;
    const dow = day.getDay();
    const header = document.createElement("div");
    header.className = [
      "wm-day-header",
      dow === 0 ? "wm-sun" : dow === 6 ? "wm-sat" : "",
      isToday ? "wm-today" : ""
    ].filter(Boolean).join(" ");
    header.innerHTML = `<strong>${day.getDate()}</strong><span>${weekdays[dow]}</span>`;
    weekMatrix.append(header);
  });

  for (const time of allTimes) {
    const timeCell = document.createElement("div");
    timeCell.className = "wm-time";
    timeCell.textContent = time;
    weekMatrix.append(timeCell);

    for (let i = 0; i < 7; i++) {
      const dayData = fetchedDays[i];
      const slotInfo = dayData.slots.find(s => s.time === time);
      const cell = document.createElement("div");
      cell.className = "wm-cell";

      const isSelected = dayData.dateText === selectedDate && time === timeSelect.value;

      if (dayData.isPast || !slotInfo || !slotInfo.available) {
        const x = document.createElement("span");
        x.className = "wm-x";
        x.textContent = "×";
        cell.append(x);
      } else {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "wm-circle-btn" + (isSelected ? " selected" : "");
        btn.textContent = "◯";
        btn.addEventListener("click", () => {
          dateInput.value = dayData.dateText;
          selectedDate = dayData.dateText;
          timeSelect.innerHTML = "";
          const opt = document.createElement("option");
          opt.value = time;
          opt.textContent = time;
          timeSelect.appendChild(opt);
          timeSelect.value = time;

          document.querySelectorAll(".wm-circle-btn").forEach(b => b.classList.remove("selected"));
          btn.classList.add("selected");

          setMessage(`${formatDateLabel(dayData.dateText)} ${time} を選択しました。`, "success");
          resetReview();
          updateStep(3);

          document.querySelector("[data-flow-step='3']")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        cell.append(btn);
      }

      weekMatrix.append(cell);
    }
  }
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
    <div style="display:flex; flex-direction:column; gap:10px; width:100%; margin-top:12px;">
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <a class="button-link" href="${googleUrl}" target="_blank" rel="noopener" style="flex:1 1 200px; text-align:center;">📅 Googleカレンダーに追加</a>
        <a class="button-link secondary-link" href="${data.calendar.icsUrl}" style="flex:1 1 200px; text-align:center;">🗓 iPhone/Macカレンダーに追加</a>
      </div>
      <button type="button" id="resetNewBookingButton" class="secondary-button" style="width:100%; margin-top:6px; padding:12px; font-weight:700;">
        ➕ 続けて別の予約を取る
      </button>
    </div>
  `;
  const resetBtn = document.getElementById("resetNewBookingButton");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      bookingReview.hidden = true;
      confirmationActions.hidden = true;
      updateStep(1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
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
    <p class="step-label">Step 4</p>
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
  updateStep(4);
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

  if (config.menus.length) menuIdInput.value = config.menus[0].id;
  renderMenuCards();
  renderOptions();

  const today = new Date();
  dateInput.min = today.toISOString().slice(0, 10);
  selectedDate = toDateString(today);
  currentWeekStart = getWeekStart(today);
  onMenuChange();
}

optionList.addEventListener("change", onMenuChange);

form.addEventListener("input", event => {
  if (event.target.closest("#bookingReview")) return;
  if (isReviewing) resetReview();
});

editBookingButton.addEventListener("click", () => {
  resetReview();
  setMessage("内容を修正できます。修正後にもう一度確認へ進んでください。");
  updateStep(3);
});

prevWeekButton.addEventListener("click", async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = addDays(currentWeekStart, -7);
  currentWeekStart = target < today ? today : target;
  await renderWeekMatrix();
});

nextWeekButton.addEventListener("click", async () => {
  currentWeekStart = addDays(currentWeekStart, 7);
  await renderWeekMatrix();
});

form.addEventListener("submit", async event => {
  event.preventDefault();

  if (!menuIdInput.value) {
    setMessage("メニューを選択してください。", "error");
    return;
  }

  if (!selectedDate || !dateInput.value) {
    setMessage("日時を選んでください。", "error");
    return;
  }

  if (!timeSelect.value) {
    setMessage("日時を選んでください。", "error");
    return;
  }

  if (!form.reportValidity()) return;

  const emailVal = String(form.elements.email?.value || "").trim();
  if (!emailVal || !emailVal.includes("@")) {
    setMessage("メールアドレスを入力してください（予約確定メールをお届けするために必須となっております）。", "error");
    if (form.elements.email) form.elements.email.focus();
    return;
  }

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
      "email is required": "メールアドレスを入力してください（予約確定メールをお届けするために必須となっております）。",
      "invalid email": "有効なメールアドレスを入力してください（例：name@example.com）。",
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

  const emailNotice = data.booking.email
    ? `<div><dt>確認メール</dt><dd><strong>${escapeHtml(data.booking.email)}</strong> 宛てに送信いたしました。<br><small style="color:#666;">※数分経っても届かない場合は迷惑メールフォルダをご確認いただくか、当院（公式LINEまたはお電話）までお問い合わせください。<br>なお、<strong>システム上ご予約は確実に確定しておりますのでご安心ください。</strong></small></dd></div>`
    : `<div><dt>確認メール</dt><dd><span style="color:#888;">メールアドレス未入力</span><br><small style="color:#666;">※ご予約は正常に確定しております。当日はお気をつけてお越しください。</small></dd></div>`;

  bookingReview.innerHTML = `
    <div style="text-align:center; padding:12px 0 18px; border-bottom:2px solid #e0dbd3; margin-bottom:16px;">
      <div style="display:inline-flex; align-items:center; justify-content:center; width:52px; height:52px; border-radius:50%; background:#e8f5e9; color:#2e7d32; font-size:26px; font-weight:bold; margin-bottom:10px;">✓</div>
      <p class="step-label" style="color:#2e7d32; font-weight:700; margin:0 0 4px;">Step 5 / 予約完了</p>
      <h2 style="margin:0 0 8px; font-size:22px; color:#2a241e;">ご予約が確定いたしました</h2>
      <p class="review-lead" style="font-size:14px; color:#444; line-height:1.6; margin:0;">
        <strong>${escapeHtml(data.booking.name)} 様</strong>、美身堂えいち鍼灸院へのご予約ありがとうございます。<br>
        下記の内容で予約システムに確実に登録されました。
      </p>
    </div>

    <dl class="review-list" style="margin-bottom:18px;">
      <div><dt>ご予約日時</dt><dd style="font-size:16px; font-weight:800; color:#5e2a84;">${escapeHtml(formatDateLabel(data.booking.date))} ${escapeHtml(data.booking.time)}〜</dd></div>
      <div><dt>メニュー</dt><dd><strong>${escapeHtml(data.calendar.menuName)}</strong></dd></div>
      ${data.calendar.optionNames && data.calendar.optionNames.length ? `<div><dt>追加オプション</dt><dd>${escapeHtml(data.calendar.optionNames.join("、"))}</dd></div>` : ""}
      <div><dt>お名前</dt><dd>${escapeHtml(data.booking.name)} 様 ${data.booking.kana ? `（${escapeHtml(data.booking.kana)}）` : ""}</dd></div>
      <div><dt>電話番号</dt><dd>${escapeHtml(data.booking.phone)}</dd></div>
      ${emailNotice}
    </dl>

    <div style="background:#fcf9f2; border:1px solid #e8dec8; border-radius:8px; padding:14px 16px; margin-bottom:16px;">
      <h3 style="font-size:13px; margin:0 0 6px; color:#5e2a84; font-weight:700;">📍 当院の所在地・アクセス</h3>
      <p style="font-size:12px; margin:0; line-height:1.6; color:#444;">
        〒790-0814 愛媛県松山市味酒町2丁目18-5 味酒04ビル3階（専用駐車場完備）<br>
        <a href="https://www.google.com/maps/search/?api=1&query=%E7%BE%8E%E8%BA%AB%E5%A0%82%E3%81%88%E3%81%84%E3%81%A1%E9%8D%BC%E7%81%B8%E9%99%A2+%E6%84%9B%E5%AA%9B%E7%9C%8C%E6%9D%BE%E5%B1%B1%E5%B8%82%E5%91%B3%E9%85%92%E7%94%BA2-18-5" target="_blank" rel="noopener" style="color:#1a73e8; font-weight:700; text-decoration:underline;">Googleマップで道順を確認する ↗</a>
      </p>
    </div>
  `;
  bookingReview.hidden = false;
  renderConfirmationActions(data);
  form.reset();
  isReviewing = false;
  reviewButton.textContent = "予約内容を確認する";
  editBookingButton.hidden = true;
  updateStep(5);
  bookingReview.scrollIntoView({ behavior: "smooth", block: "start" });
  selectedDate = toDateString(new Date());
  currentWeekStart = getWeekStart(new Date());
  if (config.menus.length) menuIdInput.value = config.menus[0].id;
  renderMenuCards();
  await renderWeekMatrix();
});

loadConfig().catch(() => {
  setMessage("予約ページを読み込めませんでした。", "error");
});
