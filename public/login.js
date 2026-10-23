const loginForm = document.querySelector("#loginForm");
const loginMessage = document.querySelector("#loginMessage");
const resetRequestForm = document.querySelector("#resetRequestForm");
const resetRequestMessage = document.querySelector("#resetRequestMessage");

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  loginMessage.textContent = "確認しています...";
  loginMessage.className = "message";

  const payload = Object.fromEntries(new FormData(loginForm).entries());
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    loginMessage.textContent = "パスワードが違います。";
    loginMessage.className = "message error";
    return;
  }

  loginMessage.textContent = "ログインに成功しました。管理画面を開きます...";
  loginMessage.className = "message success";

  if (window.top !== window.self) {
    try {
      window.top.location.href = "https://eichi-line-reservation.onrender.com/admin.html";
      return;
    } catch {
      window.open("https://eichi-line-reservation.onrender.com/admin.html", "_blank");
      return;
    }
  }

  location.href = "/admin.html";
});

resetRequestForm.addEventListener("submit", async event => {
  event.preventDefault();
  resetRequestMessage.textContent = "申請を受け付けています...";
  resetRequestMessage.className = "message";

  const payload = Object.fromEntries(new FormData(resetRequestForm).entries());
  await fetch("/api/request-password-reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  resetRequestForm.reset();
  resetRequestMessage.textContent = "登録済みのメールアドレスの場合、再設定の準備が行われます。";
  resetRequestMessage.className = "message success";
});
