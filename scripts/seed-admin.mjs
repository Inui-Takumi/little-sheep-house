import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const ADMIN_EMAIL = "admin@local.little-sheep-house.invalid";
const ADMIN_NICKNAME = "全世界最聪明的小羊";
const required = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "ADMIN_PASSWORD"];
const missing = required.filter((name) => !(process.env[name] ?? "").trim());
if (missing.length) throw new Error(`缺少环境变量：${missing.join(", ")}`);

const url = process.env.SUPABASE_URL.trim().replace(/\/$/, "");
const secretKey = process.env.SUPABASE_SECRET_KEY.trim();
const adminPassword = process.env.ADMIN_PASSWORD;
const inviteHash = (process.env.INVITE_HASH ?? "").trim().toLowerCase();

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) throw new Error("SUPABASE_URL 格式不正确。");
if (!(secretKey.startsWith("sb_secret_") || secretKey.startsWith("eyJ"))) throw new Error("SUPABASE_SECRET_KEY 格式不正确。");
if (adminPassword.length < 8) throw new Error("ADMIN_PASSWORD 至少需要 8 位。");
if (inviteHash && !/^[0-9a-f]{64}$/.test(inviteHash)) throw new Error("INVITE_HASH 必须是 64 位 SHA-256 十六进制字符串。");

const client = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
});

const { data: usersData, error: listError } = await client.auth.admin.listUsers({ page: 1, perPage: 100 });
if (listError) throw new Error(`读取用户列表失败：${listError.message}`);
const existing = usersData.users.find((user) => user.email?.toLowerCase() === ADMIN_EMAIL);

let adminId;
if (existing) {
  if (existing.app_metadata?.is_seeded_admin !== true) {
    throw new Error("内部 admin 邮箱已被非初始化账号占用；请在后台核查并删除后重试。");
  }
  const { data, error } = await client.auth.admin.updateUserById(existing.id, {
    password: adminPassword,
    email_confirm: true,
    app_metadata: { ...existing.app_metadata, is_seeded_admin: true },
    user_metadata: { nickname: ADMIN_NICKNAME, gender: "女" }
  });
  if (error) throw new Error(`更新 admin 失败：${error.message}`);
  adminId = data.user.id;
} else {
  // Auth may insert auth.users before applying app_metadata. Use a private,
  // one-use random bootstrap proof rather than trusting client-editable metadata.
  const seedHash = randomBytes(32).toString("hex");
  const { error: prepareError } = await client.rpc("prepare_admin_seed", { p_seed_hash: seedHash });
  if (prepareError) throw new Error(`准备 admin 初始化失败：${prepareError.message}`);
  const { data, error } = await client.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: adminPassword,
    email_confirm: true,
    app_metadata: { is_seeded_admin: true },
    user_metadata: { nickname: ADMIN_NICKNAME, gender: "女", admin_seed_hash: seedHash }
  });
  if (error) throw new Error(`创建 admin 失败：${error.message}`);
  adminId = data.user.id;
  const { error: cleanupError } = await client.auth.admin.updateUserById(adminId, {
    app_metadata: { is_seeded_admin: true },
    user_metadata: { nickname: ADMIN_NICKNAME, gender: "女", admin_seed_hash: null }
  });
  if (cleanupError) throw new Error(`清理 admin 初始化凭据失败：${cleanupError.message}`);
}

const { data: profile, error: profileError } = await client
  .from("profiles")
  .select("id, slot, nickname, gender")
  .eq("id", adminId)
  .single();
if (profileError || profile?.slot !== 1) {
  throw new Error(`admin 资料校验失败：${profileError?.message ?? "slot 不是 1"}`);
}

if (inviteHash) {
  const { data: secondProfile, error: slotError } = await client
    .from("profiles")
    .select("slot")
    .eq("slot", 2)
    .maybeSingle();
  if (slotError) throw new Error(`检查注册名额失败：${slotError.message}`);
  if (secondProfile) throw new Error("第二个账号已存在，不能重新配置邀请码。");
  const { error: inviteError } = await client.rpc("configure_registration", {
    p_invite_hash: inviteHash
  });
  if (inviteError) throw new Error(`写入邀请码哈希失败：${inviteError.message}`);
}

console.log(`Supabase 初始化完成：admin 已占用槽位 1。${inviteHash ? "一次性邀请码哈希已写入私有配置。" : "未配置邀请码，第二账号注册保持关闭。"}`);
