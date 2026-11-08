import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const testUrl = "https://ldozxltmzdbvfuupqsum.supabase.co";
const key = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
const publicKey = (process.env.SUPABASE_TEST_PUBLISHABLE_KEY ?? "").trim();
const password = process.env.ADMIN_PASSWORD ?? "";
assert.equal(process.env.SUPABASE_URL, testUrl, "只允许初始化指定的测试项目");
assert.ok(key.startsWith("sb_secret_"), "需要测试项目 secret key");
assert.ok(/^sb_publishable_[A-Za-z0-9_-]+$/.test(publicKey), "需要测试项目 publishable key");
assert.ok(password.length >= 8, "测试管理员密码至少 8 位");

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(testUrl, key, options);
const email = "admin@local.little-sheep-house.invalid";
for (let page = 1; ; page += 1) {
  const result = await admin.auth.admin.listUsers({ page, perPage: 100 });
  if (result.error) throw new Error(`无法检查测试项目现有账号：${result.error.message}`);
  assert.ok(!result.data.users.some((user) => user.email?.toLowerCase() === email),
    "测试管理员已存在，为避免重置密码停止初始化");
  if (result.data.users.length < 100) break;
}
const slot = await admin.from("profiles").select("slot").eq("slot", 1).maybeSingle();
assert.ok(!slot.error && !slot.data, "无法确认测试项目的管理员槽位为空");
delete process.env.INVITE_HASH;
await import("./seed-admin.mjs");

const client = createClient(testUrl, publicKey, options);
const login = await client.auth.signInWithPassword({ email, password });
assert.ok(!login.error && login.data.session, "测试管理员登录失败");
const profile = await client.from("profiles").select("slot, nickname").single();
assert.ok(!profile.error && profile.data.slot === 1, "测试管理员资料检查失败");
await client.auth.signOut();
console.log("✓ 测试管理员登录与槽位 1 验证通过");
