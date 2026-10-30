import { createClient } from "@supabase/supabase-js";

const adminEmail = "admin@local.little-sheep-house.invalid";
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
const { data, error: listError } = await client.auth.admin.listUsers({ page: 1, perPage: 100 });
if (listError) throw new Error(`读取用户列表失败：${listError.message}`);
const admin = data.users.find((user) => user.email?.toLowerCase() === adminEmail);
if (!admin || admin.app_metadata?.is_seeded_admin !== true) throw new Error("没有找到可信的 admin 初始化账号。");

const { error } = await client.auth.admin.updateUserById(admin.id, { password });
if (error) throw new Error(`重置密码失败：${error.message}`);
console.log("admin 密码已在 Supabase 后台更新。");
