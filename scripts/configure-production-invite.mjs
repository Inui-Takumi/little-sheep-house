import assert from "node:assert/strict";
import { createHash, randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_CONFIG, ADMIN_LOGIN } from "../supabase-config.js";
import { readHidden } from "./read-hidden.mjs";

const production = "https://cjeuimfyuvetfniidrgk.supabase.co";
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const segment = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
const check = (condition, message) => { assert.ok(condition, message); console.log(`✓ ${message}`); };
let stage = "准备";

try {
  assert.equal(SUPABASE_CONFIG.url, production, "本地公开配置不是预期的正式项目");
  assert.equal(SUPABASE_CONFIG.emailFlowsEnabled, false, "前端开关不是预期的关闭状态");
  const secret = (await readHidden("输入正式项目现有的 secret key（输入不显示）")).trim();
  const password = await readHidden("输入正式管理员密码（输入不显示）");
  assert.ok(secret.startsWith("sb_secret_"), "需要正式项目 secret key");
  const service = createClient(production, secret, options);
  const user = createClient(production, SUPABASE_CONFIG.publishableKey, options);
  const anonymous = createClient(production, SUPABASE_CONFIG.publishableKey, options);
  const login = await user.auth.signInWithPassword({ email: ADMIN_LOGIN.authEmail, password });
  check(!login.error && !!login.data.session, "正式管理员登录成功");
  const profile = await service.from("profiles").select("id, slot");
  check(!profile.error && profile.data.length === 1 && profile.data[0].slot === 1 && profile.data[0].id === login.data.user.id,
    "正式项目只有管理员占用槽位 1");
  let count = 0;
  for (let page = 1; ; page += 1) {
    const result = await service.auth.admin.listUsers({ page, perPage: 100 });
    check(!result.error, "读取正式项目账号状态");
    for (const u of result.data.users) {
      count += 1;
      assert.equal(u.id, login.data.user.id, "检测到其他正式账号，已停止配置");
    }
    if (result.data.users.length < 100) break;
  }
  check(count === 1, "正式项目仅有管理员账号");
  const closed = await anonymous.rpc("is_registration_open");
  check(!closed.error && closed.data === false, "正式注册目前关闭");
  stage = "配置邀请码";
  const invite = `SHEEP-${segment()}-${segment()}-${segment()}`;
  const inviteHash = createHash("sha256").update(invite).digest("hex");
  console.log("正式邀请码明文如下，仅显示这一次；请私下保存，不要发送到聊天、仓库或日志：");
  console.log(invite);
  console.log("此时邀请码尚未配置，请以接下来的操作结果为准。");
  await readHidden("已保存请按回车，取消请按 Ctrl+C");
  const configured = await service.rpc("configure_registration", { p_invite_hash: inviteHash });
  if (configured.error) throw new Error("配置结果未确认，请核查正式项目状态，勿直接重试");
  const opened = await anonymous.rpc("is_registration_open");
  if (opened.error || opened.data !== true) throw new Error("配置后注册状态未确认，请核查正式项目状态，勿直接重试");
  console.log("✓ 正式邀请码哈希已配置，请将已保存的明文私下交给受邀住客。正式网页尚需发布后才显示注册入口。");
  await user.auth.signOut();
} catch (error) {
  console.error(`正式项目初始化在“${stage}”阶段停止：${error.message}`);
  console.error("请反馈不含密钥、密码或邀请码的错误；不要直接重复运行。");
  process.exitCode = 1;
}
