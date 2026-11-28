import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm";
import { SUPABASE_CONFIG, hasSupabaseConfig } from "./supabase-config.js";

export const isSupabaseConfigured = hasSupabaseConfig();

const rememberedKey = SUPABASE_CONFIG.url === "https://ldozxltmzdbvfuupqsum.supabase.co"
  ? "little-sheep-house-auth-test"
  : "little-sheep-house-auth";
const tabKey = `${rememberedKey}-tab`;
const tabSessionKey = isSupabaseConfigured ? sessionStorage.getItem(tabKey) : null;

function createAuthSession(key, storage) {
  return {
    key,
    storage,
    client: createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: key,
        storage
      }
    })
  };
}

const activeSession = isSupabaseConfigured
  ? createAuthSession(tabSessionKey ?? rememberedKey, tabSessionKey ? sessionStorage : localStorage)
  : null;
export const supabase = activeSession?.client ?? null;

export function getLoginSession(remember) {
  if (remember === !tabSessionKey) return activeSession;
  if (remember) return createAuthSession(rememberedKey, localStorage);

  // Supabase also uses the storage key as its cross-tab auth channel name.
  return createAuthSession(`${tabKey}-${crypto.randomUUID()}`, sessionStorage);
}

export function activateLoginSession({ key }) {
  if (key === rememberedKey) sessionStorage.removeItem(tabKey);
  else sessionStorage.setItem(tabKey, key);
}

export async function signOutOfHouse({ client, key, storage } = activeSession) {
  try {
    const { error } = await client.auth.signOut();
    if (!error) return;
  } catch {
    // Clear the browser session even when Supabase cannot complete sign-out.
  }
  storage.removeItem(key);
  storage.removeItem(`${key}-user`);
}

export function onStoredSessionCleared(callback) {
  window.addEventListener("storage", (event) => {
    if (event.storageArea === activeSession.storage && event.key === activeSession.key && event.newValue === null) {
      callback();
    }
  });
}

export function siteRootUrl(extra = "") {
  const root = new URL("./", window.location.href);
  root.search = "";
  root.hash = "";
  return new URL(extra, root).href;
}
