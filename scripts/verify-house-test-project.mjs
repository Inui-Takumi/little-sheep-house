import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { readHidden } from "./read-hidden.mjs";

// This script is deliberately pinned to the separate test project.
const url = "https://ldozxltmzdbvfuupqsum.supabase.co";
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const ok = (condition, label) => { assert.ok(condition, label); console.log(`✓ ${label}`); };
const checked = (result, label) => { if (result.error) throw new Error(label); return result.data; };
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
let first, second, anonymous, noteId, capsuleId, imagePath, uncertainWrite = false;
try {
  console.log("只连接独立测试项目，临时测试数据将由作者账号清理；不会修改正式项目。");
  const key = (await readHidden("输入测试项目的 publishable key（输入不显示）")).trim();
  assert.ok(key.startsWith("sb_publishable_"), "需要测试项目的 publishable key");
  first = createClient(url, key, options); second = createClient(url, key, options); anonymous = createClient(url, key, options);
  let firstLogin, secondLogin;
  if (process.argv.includes("--admin-links")) {
    console.log("该模式为两个现有测试账号生成并立即使用一次性登录链接，不发送邮件、不修改密码。");
    const secret = (await readHidden("输入测试项目的现有 secret key（输入不显示）")).trim();
    assert.ok(secret.startsWith("sb_secret_"), "需要测试项目的 secret key");
    const service = createClient(url, secret, options);
    const profiles = checked(await service.from("profiles").select("id,slot").order("slot"), "读取测试项目资料失败，请核对密钥");
    ok(profiles.length === 2 && profiles[0].slot === 1 && profiles[1].slot === 2 && profiles[0].id !== profiles[1].id, "找到两个不同的测试住客");
    async function loginAs(profile, client) {
      const current = checked(await service.auth.admin.getUserById(profile.id), "读取现有测试账号失败");
      assert.ok(current.user?.id === profile.id && current.user.email && current.user.email_confirmed_at, "测试账号状态不符合预期");
      const generated = checked(await service.auth.admin.generateLink({type:"magiclink",email:current.user.email}), "生成一次性测试登录链接失败");
      assert.ok(generated.user?.id === profile.id && generated.properties?.hashed_token, "测试登录链接与账号不匹配");
      const login = checked(await client.auth.verifyOtp({type:"magiclink",token_hash:generated.properties.hashed_token}), "一次性测试登录失败");
      assert.ok(login.user?.id === profile.id,"测试登录账号不匹配");
      return login;
    }
    firstLogin = await loginAs(profiles[0], first);
    secondLogin = await loginAs(profiles[1], second);
  } else {
    const firstEmail = (await readHidden("输入测试账号一的邮箱（输入不显示）")).trim().toLowerCase();
    const firstPassword = await readHidden("输入测试账号一的密码（输入不显示）");
    const secondEmail = (await readHidden("输入测试账号二的邮箱（输入不显示）")).trim().toLowerCase();
    const secondPassword = await readHidden("输入测试账号二的密码（输入不显示）");
    firstLogin = checked(await first.auth.signInWithPassword({email:firstEmail,password:firstPassword}), "测试账号一登录失败");
    secondLogin = checked(await second.auth.signInWithPassword({email:secondEmail,password:secondPassword}), "测试账号二登录失败");
  }
  const a = firstLogin.user?.id, b = secondLogin.user?.id;
  ok(Boolean(a && b && a !== b), "两个不同的测试账号登录成功");
  const aProfile = checked(await first.from("profiles").select("id,slot").single(), "测试账号一资料读取失败");
  const bProfile = checked(await second.from("profiles").select("id,slot").single(), "测试账号二资料读取失败");
  ok(aProfile.id === a && bProfile.id === b && [1,2].includes(aProfile.slot) && [1,2].includes(bProfile.slot) && aProfile.slot !== bProfile.slot, "两个账号各自具有不同槽位的资料");
  const anon = await anonymous.from("house_notes").select("id");
  ok(([401,403].includes(anon.status)) || (!anon.error && Array.isArray(anon.data) && anon.data.length === 0), "未登录用户不能读取留言");
  const members = checked(await first.rpc("house_members"), "小屋成员读取失败");
  ok(members.length === 2 && members.some((m)=>m.id===a) && members.some((m)=>m.id===b), "成员清单只包含两个测试住客");

  uncertainWrite = true;
  const note = checked(await first.from("house_notes").insert({author_id:a,body:`临时测试 ${randomUUID()}`}).select("id").single(), "测试留言创建结果未确认");
  noteId = note.id; uncertainWrite = false;
  const shared = checked(await second.from("house_notes").select("id").eq("id",noteId), "第二账号读取留言失败");
  ok(shared.length === 1, "双方可以读取共享留言");
  const removed = checked(await second.from("house_notes").delete().eq("id",noteId).select("id"), "权限检查请求失败");
  ok(removed.length === 0, "第二账号不能删除对方的留言");

  imagePath = `${a}/${randomUUID()}`; uncertainWrite = true;
  checked(await first.storage.from("house-memories").upload(imagePath,png,{contentType:"image/png",upsert:false}), "图片上传结果未确认");
  uncertainWrite = false;
  const signed = await second.storage.from("house-memories").createSignedUrl(imagePath,60);
  ok(!signed.error && Boolean(signed.data?.signedUrl), "第二账号可以读取私有测试照片");
  const publicRead = await anonymous.storage.from("house-memories").download(imagePath);
  ok(publicRead.error?.name === "StorageApiError" && [400,401,403,404].includes(Number(publicRead.error.status)), "未登录用户不能下载私有测试照片");

  uncertainWrite = true;
  capsuleId = checked(await first.rpc("house_create_capsule",{p_recipient:b,p_title:"临时测试",p_body:"测试内容",p_opens_at:new Date(Date.now()+86400000).toISOString()}), "测试信件创建结果未确认");
  uncertainWrite = false;
  const early = await second.rpc("house_open_capsule",{p_id:capsuleId});
  ok(early.error?.code === "P0001" && /not_available/.test(early.error.message), "收信人不能提前读取信件正文");
  const own = checked(await first.rpc("house_open_capsule",{p_id:capsuleId}), "写信人无法读取自己的信件");
  ok(own === "测试内容", "写信人可以读取自己的信件");
  if(process.argv.includes("--browser")) {
    const {verifyBrowser}=await import("./verify-house-browser.mjs");
    await verifyBrowser({key,first,second,firstLogin,secondLogin});
  }
  console.log("独立测试项目关键共享流程已验证。");
} catch (error) {
  console.error(`测试停止：${error.message}`);
  process.exitCode = 1;
} finally {
  let cleanupFailed = uncertainWrite;
  if (capsuleId) { const r=await first.from("house_capsules").delete().eq("id",capsuleId).select("id"); cleanupFailed ||= Boolean(r.error) || r.data?.length !== 1; }
  if (imagePath) { const r=await first.storage.from("house-memories").remove([imagePath]); cleanupFailed ||= Boolean(r.error) || !Array.isArray(r.data) || r.data.length !== 1; }
  if (noteId) { const r=await first.from("house_notes").delete().eq("id",noteId).select("id"); cleanupFailed ||= Boolean(r.error) || r.data?.length !== 1; }
  if (cleanupFailed) { console.error("部分临时测试数据的状态不确定，请先核查测试项目后再重试。"); process.exitCode = 1; }
  if (first) await first.auth.signOut({scope:"local"});
  if (second) await second.auth.signOut({scope:"local"});
}
