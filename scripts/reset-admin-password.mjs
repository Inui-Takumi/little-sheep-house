import { createClient } from "@supabase/supabase-js";

const url = (process.env.SUPABASE_URL ?? "").trim().replace(/\/$/, "");
const secretKey = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
const password = process.env.ADMIN_PASSWORD ?? "";

if (!url || !secretKey || !password) {
  throw new Error("需要 SUPABASE_URL、SUPABASE_SECRET_KEY 和 ADMIN_PASSWORD 环境变量。");
}
if (password.length < 8) throw new Error("ADMIN_PASSWORD 至少需要 8 位。");

const client = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
});
const admins = [];
for (let page = 1; ; page++) {
  const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
  if (error) throw new Error("无法读取账号列表。");
  admins.push(...data.users.filter((user) => user.app_metadata?.is_seeded_admin === true));
  if (data.users.length < 100) break;
}
if (admins.length !== 1) throw new Error("无法确认唯一的管理员账号。");
const admin = admins[0];
const { data: profile, error: profileError } = await client.from("profiles").select("id, slot").eq("id", admin.id).maybeSingle();
if (profileError || profile?.id !== admin.id || ![1, 2].includes(profile.slot)) throw new Error("无法确认管理员资料。");

const { error } = await client.auth.admin.updateUserById(admin.id, { password });
if (error) throw new Error(`重置密码失败：${error.message}`);
console.log("admin 密码已在 Supabase 后台更新。");
