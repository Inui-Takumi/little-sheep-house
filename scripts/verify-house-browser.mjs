import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";

const project = "https://ldozxltmzdbvfuupqsum.supabase.co";
const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const must = (r, text) => { if (r.error) throw new Error(text); return r.data; };
const check = (value, text) => { assert.ok(value, text); console.log(`✓ ${text}`); };

export async function verifyBrowser({key, first, second, firstLogin, secondLogin}) {
  const a = firstLogin.user.id, marker = `UI-QA-${randomUUID()}`;
  const edge = process.env.PLAYWRIGHT_BROWSER_PATH || [
    process.env["ProgramFiles(x86)"] && `${process.env["ProgramFiles(x86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`,
    process.env.ProgramFiles && `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`
  ].find((p)=>p && existsSync(p));
  if (!edge || !existsSync(edge)) throw new Error("未找到 Microsoft Edge，无法进行浏览器测试");
  const server = spawn(process.execPath, ["scripts/dev-server.mjs","--test-project"], {
    cwd: process.cwd(), env: {...process.env, SUPABASE_TEST_PUBLISHABLE_KEY:key}, stdio:["ignore","pipe","pipe"]
  });
  let browser, firstContext, secondContext, error, stage="启动测试服务";
  let started=false, uncertainImage=false;
  try {
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("测试服务启动超时")),12000);
      server.stdout.on("data",()=>{if(!started){started=true;clearTimeout(timer);resolve();}});
      server.once("exit",()=>{if(!started){clearTimeout(timer);reject(new Error("测试端口不可用"));}});
      server.once("error",()=>{clearTimeout(timer);reject(new Error("无法启动测试服务"));});
    });
    const response = await fetch("http://127.0.0.1:4174/supabase-config.js", {signal:AbortSignal.timeout(5000)});
    const config = await response.text();
    assert.ok(response.ok && config.includes(project) && !config.includes("cjeuimfyuvetfniidrgk"),"测试服务连接项目不正确");
    const proxy=process.env.HTTPS_PROXY ? {server:process.env.HTTPS_PROXY,bypass:"127.0.0.1,localhost"} : undefined;
    browser=await chromium.launch({executablePath:edge,headless:true,...(proxy?{proxy}:{})});
    const makePage=async(session)=>{
      const context=await browser.newContext({viewport:{width:390,height:844}});
      await context.route("**/*",async(route)=>{
        const u=new URL(route.request().url());
        if((u.hostname==="127.0.0.1" && u.port==="4174") || u.hostname==="ldozxltmzdbvfuupqsum.supabase.co" || u.hostname==="cdn.jsdelivr.net") await route.continue();
        else await route.abort();
      });
      await context.addInitScript((s)=>localStorage.setItem("little-sheep-house-auth-test",JSON.stringify(s)),session);
      const page=await context.newPage();let failures=0;page.on("pageerror",()=>failures++);
      await page.goto("http://127.0.0.1:4174/house.html",{waitUntil:"domcontentloaded"});
      await page.locator("#house").waitFor({state:"visible"});
      await page.locator("#notes-list > *").first().waitFor({state:"attached",timeout:15000});
      await page.locator("#items-list > *").first().waitFor({state:"attached",timeout:15000});
      await page.locator("#diary-latest .diary-summary-row").first().waitFor({state:"attached",timeout:15000});
      return {context,page,getFailures:()=>failures};
    };
    const openPanel = (page, id) => page.locator(`.house-nav a[href="#${id}"]`).click();
    const fitsViewport = (page) => page.evaluate(() =>
      document.documentElement.scrollWidth <= innerWidth &&
      document.documentElement.scrollHeight <= innerHeight
    );
    stage="小屋页面";
    const one=await makePage(firstLogin.session);firstContext=one.context;
    const page=one.page;
    check(await page.locator("#overview").isVisible(),"首页默认打开");
    check(await page.locator(".house-panel:visible").count()===1,"小屋每次显示一个分区");
    stage="留言";
    await openPanel(page, "notes");
    await page.locator("#note-body").fill(marker);await page.locator("#note-form button").click();
    await page.getByText(marker,{exact:true}).waitFor({timeout:15000});
    check(true,"测试账号一能在真实页面发布留言");
    stage="日期";
    await openPanel(page, "dates");
    await page.locator("#dates .add-date summary").click();
    await page.locator("#date-title").fill(marker);
    await page.locator("#date-value").fill("2035-03-21");
    await page.locator("#date-kind").selectOption("event");
    await page.locator("#date-form button").click();
    await page.locator("#dates-list").getByText(marker,{exact:true}).waitFor({timeout:15000});
    check(true,"真实页面能保存共享日子");
    stage="照片";
    await openPanel(page, "collections");
    await page.locator("#collections summary").click();
    await page.locator("#item-title").fill(marker);
    await page.locator("#item-image").setInputFiles({name:"test.png",mimeType:"image/png",buffer:image});
    uncertainImage=true;
    await page.locator("#item-form button").click();
    await page.getByRole("link",{name:`查看照片：${marker}`}).waitFor({timeout:20000});
    uncertainImage=false;
    check(true,"真实页面能上传并读取测试照片");
    stage="寄出日记";
    await openPanel(page, "capsules");
    const writeDiary = async (visibility, title) => {
      await page.locator("#diary-write").click();
      await page.locator(`#diary-compose input[value="${visibility}"]`).check();
      await page.locator("#diary-envelope-choices").getByText("紫罗兰",{exact:true}).click();
      await page.locator("#diary-next").click();
      await page.locator("#diary-paper-choices").getByText("淡紫格纹",{exact:true}).click();
      await page.locator("#diary-next").click();
      await page.locator("#diary-title").fill(title);
      await page.locator("#diary-body").fill("测试正文\n第二行");
      await page.locator("#diary-next").click();
      await page.locator("#diary-font-art").getByText("龙藏体",{exact:true}).click();
      await page.locator('#diary-compose-preview [data-font="longcang"]').waitFor();
      await page.locator("#diary-next").click();
      await page.locator("#diary-seal-choices").getByText("星月",{exact:true}).click();
      await page.locator("#diary-next").click();
      await page.locator("#diary-send").click();
      await page.locator("#diary-compose").waitFor({state:"hidden",timeout:15000});
      await page.locator("#diary-list").getByText(title,{exact:true}).waitFor({timeout:15000});
    };
    const privateDiary = `${marker} private`;
    const sharedDiary = `${marker} shared`;
    await writeDiary("private", privateDiary);
    await writeDiary("shared", sharedDiary);
    await openPanel(page, "overview");
    await page.locator("#diary-latest").getByText(privateDiary,{exact:true}).waitFor();
    await page.locator("#diary-latest").getByText(sharedDiary,{exact:true}).waitFor();
    stage="第二住客";
    const two=await makePage(secondLogin.session);secondContext=two.context;
    await two.page.locator("#diary-latest").getByText(sharedDiary,{exact:true}).waitFor();
    check(!(await two.page.getByText(privateDiary,{exact:true}).count()),"第二位住客首页无法看到对方的私密日记");
    await openPanel(two.page, "notes");
    await two.page.locator("#notes-list").getByText(marker,{exact:true}).waitFor({timeout:15000});
    await openPanel(two.page, "capsules");
    await two.page.locator("#diary-list").getByText(sharedDiary,{exact:true}).click();
    const letter=two.page.locator('#diary-reader [data-font="longcang"][data-paper="grid"] .diary-letter-body');
    await letter.waitFor({state:"visible",timeout:15000});
    check(await letter.textContent() === "测试正文\n第二行","第二位住客可以按所选样式阅读公开日记");
    check(!(await two.page.locator("#diary-edit").isVisible()),"第二位住客无法编辑对方的日记");
    await two.page.locator("#diary-close-reader").click();
    check(!(await two.page.getByText(privateDiary,{exact:true}).count()),"第二位住客在列表中看不到对方的私密日记");
    check(await fitsViewport(two.page),"手机页面固定在视口内");
    await page.setViewportSize({width:1280,height:900});
    check(await fitsViewport(page),"桌面页面固定在视口内");
    check(one.getFailures()===0 && two.getFailures()===0,"两个页面没有未捕获的脚本错误");
    stage="原故事";
    await openPanel(page, "overview");
    await page.getByRole("link",{name:/打开我们的故事/}).click();
    await page.locator("#auth-loading").waitFor({state:"hidden",timeout:15000});
    check(await page.locator("#story").isVisible(),"原七幕故事入口可用");
  } catch(e) { error=new Error(`浏览器测试在“${stage}”阶段停止`); }
  finally {
    if(firstContext)await firstContext.close().catch(()=>{});
    if(secondContext)await secondContext.close().catch(()=>{});
    if(browser)await browser.close().catch(()=>{});
    server.kill();
    try {
      const notes=must(await first.from("house_notes").select("id").eq("author_id",a).eq("body",marker),"无法核对临时留言");
      for(const row of notes) assert.equal(must(await first.from("house_notes").delete().eq("id",row.id).select("id"),"无法清理临时留言").length,1);
      const dates=must(await first.from("house_dates").select("id").eq("created_by",a).eq("title",marker),"无法核对临时日期");
      for(const row of dates) assert.equal(must(await first.from("house_dates").delete().eq("id",row.id).select("id"),"无法清理临时日期").length,1);
      const items=must(await first.from("house_items").select("id,image_path").eq("author_id",a).eq("title",marker),"无法核对临时收藏");
      for(const row of items){
        if(row.image_path) assert.equal(must(await first.storage.from("house-memories").remove([row.image_path]),"无法清理临时照片").length,1);
        assert.equal(must(await first.from("house_items").delete().eq("id",row.id).select("id"),"无法清理临时收藏").length,1);
      }
      const diary=must(await first.from("house_diary_entries").select("id").eq("author_id",a).in("title",[`${marker} private`,`${marker} shared`]),"无法核对临时日记");
      for(const row of diary) assert.equal(must(await first.from("house_diary_entries").delete().eq("id",row.id).select("id"),"无法清理临时日记").length,1);
      if(uncertainImage) throw new Error("image_status_unknown");
    } catch(e) { error=new Error("浏览器测试数据或照片状态不确定，请先检查测试项目后再重试"); }
  }
  if(error)throw error;
}
