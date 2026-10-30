import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm";
import { SUPABASE_CONFIG, hasSupabaseConfig } from "./supabase-config.js";

export const isSupabaseConfigured = hasSupabaseConfig();

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "little-sheep-house-auth"
      }
    })
  : null;

export function siteRootUrl(extra = "") {
  const root = new URL("./", window.location.href);
  root.search = "";
  root.hash = "";
  return new URL(extra, root).href;
}
