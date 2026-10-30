import { isSupabaseConfigured, supabase } from "./supabase-client.js";

const loading = document.getElementById("auth-loading");
const accountButton = document.getElementById("account-button");
const accountMenu = document.getElementById("account-menu");
const accountNickname = document.getElementById("account-nickname");
const accountMenuName = document.getElementById("account-menu-name");
const logoutButton = document.getElementById("logout-button");
let storyLoaded = false;
let signingOut = false;
let redirecting = false;

function hideStory() {
  document.documentElement.classList.add("auth-pending");
  loading.hidden = false;
}

function returnToLogin(reason = "session") {
  hideStory();
  if (redirecting) return;
  redirecting = true;
  window.location.replace(`./index.html${reason ? `?error=${encodeURIComponent(reason)}` : ""}`);
}

function loadStory() {
  if (storyLoaded) return;
  storyLoaded = true;
  const script = document.createElement("script");
  script.src = "./script.js";
  script.defer = true;
  script.addEventListener("error", () => returnToLogin("story"));
  document.body.append(script);
}

async function guardHome() {
  if (!isSupabaseConfigured) return returnToLogin("service");

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return returnToLogin("session");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("nickname, gender, slot")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile || ![1, 2].includes(profile.slot) || !profile.nickname) {
    await supabase.auth.signOut();
    returnToLogin("profile");
    return;
  }

  accountNickname.textContent = profile.nickname;
  accountMenuName.textContent = profile.nickname;
  accountButton.setAttribute("aria-label", `${profile.nickname}的账户菜单`);
  document.documentElement.classList.remove("auth-pending");
  loading.hidden = true;
  loadStory();
}

accountButton.addEventListener("click", () => {
  const open = accountMenu.hidden;
  accountMenu.hidden = !open;
  accountButton.setAttribute("aria-expanded", String(open));
});

document.addEventListener("click", (event) => {
  if (!accountMenu.hidden && !event.target.closest("#account-button") && !event.target.closest("#account-menu")) {
    accountMenu.hidden = true;
    accountButton.setAttribute("aria-expanded", "false");
  }
});

logoutButton.addEventListener("click", async () => {
  signingOut = true;
  hideStory();
  logoutButton.disabled = true;
  logoutButton.textContent = "正在退出…";
  try {
    await supabase.auth.signOut();
  } finally {
    returnToLogin("");
  }
});

// History restoration must revalidate the session before revealing cached content.
window.addEventListener("pagehide", hideStory);
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    redirecting = false;
    signingOut = false;
    guardHome().catch(() => returnToLogin("session"));
  }
});

if (supabase) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT" && !signingOut) queueMicrotask(() => returnToLogin("session"));
  });
}

guardHome().catch(() => returnToLogin("session"));
