import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { readHidden } from "./read-hidden.mjs";

const url = "https://ldozxltmzdbvfuupqsum.supabase.co";
const publishable = "sb_publishable_qlA831EjHre15l3XLGtPFQ_kJXasNxW";
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const hash = (text) => createHash("sha256").update(text).digest("hex");
const check = (condition, label) => { assert.ok(condition, label); console.log(`✓ ${label}`); };
const close = async (client) => { await client.auth.signOut(); };

let stage = "准备";
try {
  const secret = (await readHidden("输入测试项目现有的 secret key（输入不显示）")).trim();
  const adminPassword = await readHidden("输入之前设置的测试管理员密码（输入不显示）");
  const guestEmail = (await readHidden("输入用于确认邮件的测试邮箱（输入不显示）")).trim().toLowerCase();
  const invite = (await readHidden("自设测试邀请码 SHEEP-XXXX-XXXX-XXXX，记住供网页注册使用（输入不显示）")).trim().toUpperCase();
  assert.ok(secret.startsWith("sb_secret_"), "需要测试项目 secret key");
  assert.ok(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail), "测试邮箱格式不正确");
  assert.ok(/^SHEEP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(invite), "测试邀请码格式不正确");
  const service = createClient(url, secret, options);
  const admin = createClient(url, publishable, options);
  const anon = createClient(url, publishable, options);
  const adminLogin = await admin.auth.signInWithPassword({ email: "admin@local.little-sheep-house.invalid", password: adminPassword });
  check(!adminLogin.error && !!adminLogin.data.session, "测试管理员登录成功");
  const profiles = await service.from("profiles").select("id, slot");
  check(!profiles.error && profiles.data.length === 1 && profiles.data[0].slot === 1 && profiles.data[0].id === adminLogin.data.user.id,
    "测试项目只有管理员占用槽位 1");
  const initial = await anon.rpc("is_registration_open");
  check(!initial.error && initial.data === false, "测试项目注册初始关闭");
  for (let page = 1; ; page += 1) {
    const users = await service.auth.admin.listUsers({ page, perPage: 100 });
    check(!users.error, "检查测试项目已有账号");
    check(!users.data.users.some((user) => user.email?.toLowerCase() === guestEmail), "测试邮箱尚未注册");
    if (users.data.users.length < 100) break;
  }

  stage = "并发测试";
  const fixtureHash = hash(randomBytes(32).toString("hex"));
  const config = await service.rpc("configure_registration", { p_invite_hash: fixtureHash });
  check(!config.error, "已配置一次性并发测试凭据");
  const prefix = `sheep-race-${randomBytes(12).toString("hex")}`;
  const emails = [`${prefix}-a@example.com`, `${prefix}-b@example.com`];
  const fixturePassword = randomBytes(32).toString("base64url");
  let fixtureUsers = [];
  try {
    // Admin createUser confirms fixtures directly and does not send email.
    const results = await Promise.allSettled(emails.map((email) => service.auth.admin.createUser({
      email, password: fixturePassword, email_confirm: true,
      user_metadata: { nickname: "并发测试", gender: "保密", invite_hash: fixtureHash }
    })));
    fixtureUsers = results.filter((r) => r.status === "fulfilled" && !r.value.error && r.value.data.user)
      .map((r) => r.value.data.user);
    check(results.every((r) => r.status === "fulfilled"), "并发请求均收到明确响应");
    check(fixtureUsers.length === 1, "并发创建最多成功一个测试账号");
    const rejected = results.find((r) => r.status === "fulfilled" && r.value.error);
    check(!!rejected && rejected.value.error.name !== "AuthRetryableFetchError" && rejected.value.error.status !== 429,
      "另一并发请求被服务端拒绝（具体数据库错误仍需核查）");
    const second = createClient(url, publishable, options);
    try {
      const login = await second.auth.signInWithPassword({ email: fixtureUsers[0].email, password: fixturePassword });
      check(!login.error && !!login.data.session, "第二槽位测试账号登录成功");
      const self = await second.from("profiles").select("id, slot");
      check(!self.error && self.data.length === 1 && self.data[0].id === fixtureUsers[0].id && self.data[0].slot === 2,
        "第二账号只能读取自己的资料");
      const first = await admin.from("profiles").select("id, slot");
      check(!first.error && first.data.length === 1 && first.data[0].id === adminLogin.data.user.id,
        "管理员只能读取自己的资料");
      const closed = await anon.rpc("is_registration_open");
      check(!closed.error && closed.data === false, "第二槽位占用后注册关闭");
    } finally { await close(second); }
  } finally {
    for (const user of fixtureUsers) {
      if (!user.id || !emails.includes(user.email?.toLowerCase())) throw new Error("临时测试账号身份异常，未执行清理");
      const current = await service.auth.admin.getUserById(user.id);
      if (current.error || current.data.user?.email?.toLowerCase() !== user.email.toLowerCase()) {
        throw new Error("无法确认临时测试账号，未执行清理");
      }
      const removed = await service.auth.admin.deleteUser(user.id);
      if (removed.error) throw new Error("临时测试账号清理失败，请先检查测试项目");
    }
  }
  const remaining = await service.from("profiles").select("slot");
  check(!remaining.error && remaining.data.length === 1 && remaining.data[0].slot === 1, "临时账号已清理，原账号保留");
  const consumed = await anon.rpc("is_registration_open");
  check(!consumed.error && consumed.data === false, "测试邀请码已消费");
  stage = "准备网页注册";
  const configured = await service.rpc("configure_registration", { p_invite_hash: hash(invite) });
  check(!configured.error, "已配置自设测试邀请码");
  const open = await anon.rpc("is_registration_open");
  check(!open.error && open.data === true, "测试项目已准备好网页注册");
  await close(admin);
} catch (error) {
  console.error(`测试在“${stage}”阶段停止：${error.message}`);
  console.error("请保留此窗口并反馈不含密钥、密码或邀请码的错误；不要直接重复运行。");
  process.exitCode = 1;
}
