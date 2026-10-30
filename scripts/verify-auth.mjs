import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_CONFIG, ADMIN_LOGIN } from "../supabase-config.js";

const password = process.env.ADMIN_PASSWORD;
if (!password) throw new Error("请通过私有环境变量 ADMIN_PASSWORD 提供登录验证密码。");
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const makeClient = () => createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.publishableKey, options);
const anonymous = makeClient();
const user = makeClient();
const check = (ok, label) => { assert.ok(ok, label); console.log(`✓ ${label}`); };

try {
  const closed = await anonymous.rpc("is_registration_open");
  check(!closed.error && closed.data === false, "邮件配置完成前，第二账号注册保持关闭");
  const anonRead = await anonymous.from("profiles").select("id");
  check(Boolean(anonRead.error), "匿名客户端不能读取资料表");
  for (const rpc of ["configure_registration", "prepare_admin_seed"]) {
    const key = rpc === "configure_registration" ? "p_invite_hash" : "p_seed_hash";
    const denied = await anonymous.rpc(rpc, { [key]: "0".repeat(64) });
    check(Boolean(denied.error), `匿名客户端不能调用 ${rpc}`);
  }
  const wrong = await makeClient().auth.signInWithPassword({ email: ADMIN_LOGIN.authEmail, password: "incorrect-test-password" });
  check(wrong.error?.code === "invalid_credentials", "错误密码被统一拒绝");
  const login = await user.auth.signInWithPassword({ email: ADMIN_LOGIN.authEmail, password });
  check(!login.error && Boolean(login.data.session), "admin 真实密码登录成功");
  const profile = await user.from("profiles").select("id, slot, nickname, gender").single();
  check(!profile.error && profile.data.slot === 1 && profile.data.nickname === "全世界最聪明的小羊" && profile.data.gender === "女", "admin 只能读取自己的槽位一资料");
  const other = await user.from("profiles").select("id").neq("id", login.data.user.id);
  check(!other.error && other.data.length === 0, "登录客户端无法枚举其他资料");
  const update = await user.from("profiles").update({ nickname: profile.data.nickname }).eq("id", login.data.user.id);
  check(Boolean(update.error), "登录客户端不能修改资料");
  const privateRpc = await user.rpc("prepare_admin_seed", { p_seed_hash: "0".repeat(64) });
  check(Boolean(privateRpc.error), "登录客户端不能预授权 admin 初始化");
  const refreshed = await user.auth.refreshSession();
  check(!refreshed.error && Boolean(refreshed.data.session), "会话刷新成功");
  const badInvite = await anonymous.auth.signUp({
    email: "auth-check@example.com",
    password: "temporary-test-password",
    options: { data: { nickname: "测试", gender: "保密", invite_hash: "0".repeat(64) } }
  });
  check(Boolean(badInvite.error) && /invite_invalid/.test(badInvite.error.message), "错误邀请码被云端注册 Hook 拦截");
} finally {
  await user.auth.signOut();
}
