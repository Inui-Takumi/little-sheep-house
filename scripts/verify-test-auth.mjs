import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

// This verifier is deliberately locked to the disposable test project.
const url = "https://ldozxltmzdbvfuupqsum.supabase.co";
const key = (process.env.SUPABASE_TEST_PUBLISHABLE_KEY ?? "").trim();
if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
  throw new Error("请通过 SUPABASE_TEST_PUBLISHABLE_KEY 提供测试项目的 publishable key。");
}
const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
const check = (condition, message) => {
  assert.ok(condition, message);
  console.log(`✓ ${message}`);
};

const status = await client.rpc("is_registration_open");
check(!status.error && status.data === false, "测试项目注册在未配置邀请码时关闭");
const profiles = await client.from("profiles").select("id");
check(Boolean(profiles.error), "匿名用户无法读取资料");
for (const [name, args] of [
  ["configure_registration", { p_invite_hash: "0".repeat(64) }],
  ["prepare_admin_seed", { p_seed_hash: "0".repeat(64) }]
]) {
  const result = await client.rpc(name, args);
  check(Boolean(result.error), `匿名用户无法调用 ${name}`);
}
const attempt = await client.auth.signUp({
  email: "invalid-invite-check@example.com",
  password: "test-only-not-a-user-password",
  options: { data: { nickname: "测试", gender: "保密", invite_hash: "0".repeat(64) } }
});
check(Boolean(attempt.error) && /invite_invalid/.test(attempt.error.message),
  "Before User Created Hook 拒绝错误邀请码");
