import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { readHidden } from "./read-hidden.mjs";

const url = "https://ldozxltmzdbvfuupqsum.supabase.co";
const publicKey = "sb_publishable_qlA831EjHre15l3XLGtPFQ_kJXasNxW";
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const check = (ok, label) => { assert.ok(ok, label); console.log(`✓ ${label}`); };
let stage = "准备";

try {
  const secret = (await readHidden("输入测试项目现有的 secret key（输入不显示）")).trim();
  const adminPassword = await readHidden("输入测试管理员密码（输入不显示）");
  const guestEmail = (await readHidden("输入用于确认邮件的测试邮箱（输入不显示）")).trim().toLowerCase();
  const invite = (await readHidden("输入自设测试邀请码 SHEEP-XXXX-XXXX-XXXX（输入不显示）")).trim().toUpperCase();
  assert.ok(secret.startsWith("sb_secret_"), "需要测试项目 secret key");
  assert.ok(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail), "测试邮箱格式不正确");
  assert.ok(/^SHEEP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(invite), "测试邀请码格式不正确");
  const service = createClient(url, secret, options);
  const admin = createClient(url, publicKey, options);
  const anonymous = createClient(url, publicKey, options);
  const login = await admin.auth.signInWithPassword({ email: "admin@local.little-sheep-house.invalid", password: adminPassword });
  check(!login.error && !!login.data.session, "测试管理员登录成功");
  const profiles = await service.from("profiles").select("id, slot");
  check(!profiles.error && profiles.data.length === 1 && profiles.data[0].slot === 1 && profiles.data[0].id === login.data.user.id,
    "测试项目只有管理员占用槽位 1");
  const initial = await anonymous.rpc("is_registration_open");
  check(!initial.error && initial.data === false, "测试注册当前关闭");
  for (let page = 1; ; page += 1) {
    const users = await service.auth.admin.listUsers({ page, perPage: 100 });
    check(!users.error, "检查测试项目账号");
    check(!users.data.users.some((u) => u.email?.toLowerCase() === guestEmail), "测试邮箱尚未注册");
    check(!users.data.users.some((u) => /^sheep-(race|rls)-[0-9a-f]+-[ab]@example\.com$/i.test(u.email ?? "")),
      "没有残留的专用临时测试账号");
    if (users.data.users.length < 100) break;
  }

  stage = "资料隔离测试";
  const fixtureHash = sha256(randomBytes(32).toString("hex"));
  const config = await service.rpc("configure_registration", { p_invite_hash: fixtureHash });
  check(!config.error, "已配置资料隔离测试凭据");
  const email = `sheep-rls-${randomBytes(12).toString("hex")}-a@example.com`;
  const password = randomBytes(32).toString("base64url");
  let temporaryUser = null;
  try {
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: { nickname: "隔离测试", gender: "保密", invite_hash: fixtureHash } });
    if (created.error || !created.data.user) throw new Error("临时账号创建未得到成功结果，请先核对测试项目状态");
    temporaryUser = created.data.user;
    const second = createClient(url, publicKey, options);
    try {
      const secondLogin = await second.auth.signInWithPassword({ email, password });
      check(!secondLogin.error && !!secondLogin.data.session, "第二槽位测试账号登录成功");
      const self = await second.from("profiles").select("id, slot");
      check(!self.error && self.data.length === 1 && self.data[0].id === temporaryUser.id && self.data[0].slot === 2,
        "第二账号只能读取自己的资料");
      const first = await admin.from("profiles").select("id, slot");
      check(!first.error && first.data.length === 1 && first.data[0].id === login.data.user.id,
        "管理员只能读取自己的资料");
      const closed = await anonymous.rpc("is_registration_open");
      check(!closed.error && closed.data === false, "第二槽位占用后注册关闭");
    } finally { await second.auth.signOut(); }
  } finally {
    if (temporaryUser) {
      const actual = await service.auth.admin.getUserById(temporaryUser.id);
      if (temporaryUser.email?.toLowerCase() !== email || actual.error || actual.data.user?.email?.toLowerCase() !== email) {
        throw new Error("无法确认临时账号身份，未执行清理");
      }
      const deleted = await service.auth.admin.deleteUser(temporaryUser.id);
      if (deleted.error) throw new Error("临时账号清理失败，请先检查测试项目");
    }
  }
  const remaining = await service.from("profiles").select("slot");
  check(!remaining.error && remaining.data.length === 1 && remaining.data[0].slot === 1, "临时账号已清理，原账号保留");
  const consumed = await anonymous.rpc("is_registration_open");
  check(!consumed.error && consumed.data === false, "隔离测试邀请码已消费");
  stage = "准备网页注册";
  const setInvite = await service.rpc("configure_registration", { p_invite_hash: sha256(invite) });
  check(!setInvite.error, "已配置自设测试邀请码");
  const open = await anonymous.rpc("is_registration_open");
  check(!open.error && open.data === true, "测试项目已准备好网页注册");
  await admin.auth.signOut();
} catch (error) {
  console.error(`测试在“${stage}”阶段停止：${error.message}`);
  console.error("请反馈不含密钥、密码、邮箱或邀请码的错误；不要直接重复运行。");
  process.exitCode = 1;
}
