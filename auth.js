import { ADMIN_LOGIN, SUPABASE_CONFIG } from "./supabase-config.js";
import { isSupabaseConfigured, siteRootUrl, supabase } from "./supabase-client.js";

const panels = {
  login: document.getElementById("login-panel"),
  register: document.getElementById("register-panel"),
  forgot: document.getElementById("forgot-panel"),
  recovery: document.getElementById("recovery-panel")
};
const tabs = document.getElementById("auth-tabs");
const loginTab = document.getElementById("login-tab");
const registerTab = document.getElementById("register-tab");
const fullHouse = document.getElementById("full-house");
const registrationPending = document.getElementById("registration-pending");
const formMessage = document.getElementById("form-message");
const serviceMessage = document.getElementById("service-message");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const forgotForm = document.getElementById("forgot-form");
const recoveryForm = document.getElementById("recovery-form");

let registrationOpen = false;
let recoveryMode = new URLSearchParams(window.location.search).get("mode") === "recovery"
  || new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery";

function showMessage(message, type = "info") {
  formMessage.textContent = message;
  formMessage.className = `form-message is-${type}`;
  formMessage.hidden = false;
}

function clearMessage() {
  formMessage.hidden = true;
  formMessage.textContent = "";
  formMessage.className = "form-message";
}

function selectPanel(name) {
  clearMessage();
  Object.entries(panels).forEach(([panelName, panel]) => {
    panel.hidden = panelName !== name;
  });

  const standalone = name === "forgot" || name === "recovery";
  tabs.hidden = standalone;
  loginTab.classList.toggle("is-active", name === "login");
  loginTab.setAttribute("aria-selected", String(name === "login"));
  registerTab.classList.toggle("is-active", name === "register");
  registerTab.setAttribute("aria-selected", String(name === "register"));
  fullHouse.hidden = standalone || registrationOpen || !SUPABASE_CONFIG.emailFlowsEnabled;
  registrationPending.hidden = standalone || SUPABASE_CONFIG.emailFlowsEnabled;
}

function setBusy(form, busy) {
  for (const element of form.elements) element.disabled = busy;
  form.setAttribute("aria-busy", String(busy));
}

function setServiceUnavailable() {
  serviceMessage.textContent = "登录服务还没有连接到 Supabase。请先完成项目配置，再开放这间小屋。";
  serviceMessage.hidden = false;
  for (const form of [loginForm, registerForm, forgotForm, recoveryForm]) {
    for (const element of form.elements) element.disabled = true;
  }
}

function normalizeLogin(identifier) {
  const value = identifier.trim().toLowerCase();
  return value === ADMIN_LOGIN.alias ? ADMIN_LOGIN.authEmail : value;
}

async function hashInvite(invite) {
  const bytes = new TextEncoder().encode(invite.trim().toUpperCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hasValidProfile() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return false;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, slot, nickname, gender")
    .eq("id", userData.user.id)
    .single();

  return !profileError && Boolean(profile?.id) && (profile.slot === 1 || profile.slot === 2);
}

async function goHomeIfSignedIn() {
  const { data } = await supabase.auth.getSession();
  if (!data.session || recoveryMode) return false;
  if (await hasValidProfile()) {
    window.location.replace("./home.html");
    return true;
  }
  await supabase.auth.signOut();
  return false;
}

async function refreshRegistrationStatus() {
  if (!SUPABASE_CONFIG.emailFlowsEnabled) {
    registrationOpen = false;
    registerTab.hidden = true;
    fullHouse.hidden = true;
    registrationPending.hidden = false;
    return;
  }
  const { data, error } = await supabase.rpc("is_registration_open");
  if (error) {
    registrationOpen = false;
    registerTab.hidden = true;
    fullHouse.hidden = true;
    serviceMessage.textContent = "暂时无法确认注册名额，请稍后刷新再试。";
    serviceMessage.hidden = false;
    return;
  }
  registrationOpen = data === true;
  registerTab.hidden = !registrationOpen;
  fullHouse.hidden = registrationOpen;
  if (!registrationOpen && !panels.register.hidden) selectPanel("login");
}

document.querySelectorAll("[data-panel]").forEach((button) => {
  button.addEventListener("click", () => selectPanel(button.dataset.panel));
});

document.querySelectorAll("[data-password-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.passwordToggle);
    const reveal = input.type === "password";
    input.type = reveal ? "text" : "password";
    button.textContent = reveal ? "隐藏" : "显示";
    button.setAttribute("aria-label", reveal ? "隐藏密码" : "显示密码");
    button.setAttribute("aria-pressed", String(reveal));
  });
});

document.getElementById("forgot-button").addEventListener("click", () => {
  document.getElementById("forgot-identifier").value = document.getElementById("login-identifier").value;
  selectPanel("forgot");
});
document.querySelectorAll("[data-back-login]").forEach((button) => {
  button.addEventListener("click", () => selectPanel("login"));
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();
  if (!loginForm.reportValidity()) return;

  setBusy(loginForm, true);
  try {
    const email = normalizeLogin(document.getElementById("login-identifier").value);
    const password = document.getElementById("login-password").value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.code === "email_not_confirmed") {
        showMessage("邮箱还没有完成确认，请先打开确认邮件里的链接。", "error");
      } else {
        showMessage("登录失败，请检查账号或密码。", "error");
      }
      return;
    }

    if (!(await hasValidProfile())) {
      await supabase.auth.signOut();
      showMessage("登录失败，请检查账号或密码。", "error");
      return;
    }
    window.location.replace("./home.html");
  } catch {
    showMessage("暂时连不上小屋，请检查网络后重试。", "error");
  } finally {
    setBusy(loginForm, false);
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();
  if (!registerForm.reportValidity()) return;
  if (!registrationOpen) {
    selectPanel("login");
    return;
  }

  const nickname = document.getElementById("register-nickname").value.trim();
  const email = document.getElementById("register-email").value.trim().toLowerCase();
  const password = document.getElementById("register-password").value;
  const confirmPassword = document.getElementById("register-confirm-password").value;
  const invite = document.getElementById("register-invite").value.trim().toUpperCase();
  const gender = new FormData(registerForm).get("gender");

  if (!nickname) return showMessage("请填写昵称。", "error");
  if (email === ADMIN_LOGIN.authEmail) return showMessage("请使用你的真实邮箱注册。", "error");
  if (password.length < 8) return showMessage("密码至少需要 8 位。", "error");
  if (password !== confirmPassword) return showMessage("两次输入的密码不一致。", "error");
  if (!/^SHEEP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(invite)) {
    return showMessage("邀请码格式不正确。", "error");
  }

  setBusy(registerForm, true);
  try {
    const inviteHash = await hashInvite(invite);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: siteRootUrl(),
        data: { nickname, gender, invite_hash: inviteHash }
      }
    });
    if (error) {
      const details = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
      if (details.includes("house_full") || details.includes("database error saving new user")) {
        await refreshRegistrationStatus();
        showMessage(registrationOpen ? "注册暂未完成，请稍后重试。" : "这间小屋已经住满啦。", "error");
      } else if (details.includes("invite_invalid")) {
        showMessage("邀请码不正确或已经使用。", "error");
      } else if (details.includes("weak_password")) {
        showMessage("密码强度不足，请换一个更安全的密码。", "error");
      } else if (details.includes("already") || details.includes("registered")) {
        showMessage("该邮箱无法完成注册，请检查后重试。", "error");
      } else {
        showMessage("注册没有成功，请检查填写内容后重试。", "error");
      }
      return;
    }

    registerForm.reset();
    registrationOpen = false;
    registerTab.hidden = true;
    selectPanel("login");
    showMessage("确认邮件已经寄出。请先在邮箱里确认，再回到这里登录。", "success");
  } catch {
    showMessage("暂时连不上小屋，请检查网络后重试。", "error");
  } finally {
    setBusy(registerForm, false);
  }
});

forgotForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();
  if (!forgotForm.reportValidity()) return;
  const identifier = document.getElementById("forgot-identifier").value.trim().toLowerCase();
  if (identifier === ADMIN_LOGIN.alias || identifier === ADMIN_LOGIN.authEmail) {
    showMessage("admin 没有绑定收件邮箱，请在 Supabase 后台手动重置密码。", "info");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
    showMessage("请输入注册时使用的真实邮箱。", "error");
    return;
  }
  if (!SUPABASE_CONFIG.emailFlowsEnabled) {
    showMessage("邮件找回正在准备中，请联系小屋主人。", "info");
    return;
  }

  setBusy(forgotForm, true);
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(identifier, {
      redirectTo: siteRootUrl("?mode=recovery")
    });
    if (error) {
      showMessage("邮件暂时没能发出，请稍后再试。", "error");
      return;
    }
    showMessage("如果这个邮箱已注册，重置链接会很快送达。", "success");
  } catch {
    showMessage("邮件暂时没能发出，请稍后再试。", "error");
  } finally {
    setBusy(forgotForm, false);
  }
});

recoveryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();
  if (!recoveryForm.reportValidity()) return;
  const password = document.getElementById("recovery-password").value;
  const confirmPassword = document.getElementById("recovery-confirm-password").value;
  if (password.length < 8) return showMessage("新密码至少需要 8 位。", "error");
  if (password !== confirmPassword) return showMessage("两次输入的新密码不一致。", "error");

  setBusy(recoveryForm, true);
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      showMessage("密码没有保存，请重新打开邮件里的链接再试。", "error");
      return;
    }
    await supabase.auth.signOut();
    recoveryMode = false;
    history.replaceState({}, "", siteRootUrl());
    selectPanel("login");
    showMessage("新密码已经保存，请重新登录。", "success");
  } catch {
    showMessage("暂时连不上小屋，请稍后再试。", "error");
  } finally {
    setBusy(recoveryForm, false);
  }
});

async function boot() {
  if (!isSupabaseConfigured) {
    setServiceUnavailable();
    return;
  }

  supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      recoveryMode = true;
      queueMicrotask(() => selectPanel("recovery"));
    }
  });

  if (recoveryMode) {
    const { data } = await supabase.auth.getSession();
    selectPanel("recovery");
    if (!data.session) showMessage("重置链接无效或已经过期，请重新申请。", "error");
    return;
  }

  if (await goHomeIfSignedIn()) return;
  await refreshRegistrationStatus();

  const error = new URLSearchParams(window.location.search).get("error");
  if (error === "session") showMessage("登录状态已经失效，请重新登录。", "error");
  if (error === "profile") showMessage("账号资料校验失败，请重新登录。", "error");
}

void boot();
