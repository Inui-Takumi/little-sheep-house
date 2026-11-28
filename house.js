import { isSupabaseConfigured, supabase } from "./supabase-client.js";
import { createHouseEffects } from "./house-effects.js";
import { createHouseDiary } from "./house-diary.js";

const $ = (id) => document.getElementById(id);
let user, members = new Map(), notes = [], likes = [], dates = [], quotes = [], items = [];
let calendarMonth = null;
let activePanel, pendingNotesRead;
let activityReady = false;
let recallHistory, drawnWishId;
const activitySources = new Set();
const itemKinds = { memory:"回忆", wish:"愿望", song:"歌曲", task:"待办", mood:"心情" };
const fallbacks = ["你在的日子，平常也闪闪发光。", "今天也要记得，好好照顾自己。", "有你一起，日子就有了期待。"];
const status = (message) => { $("status").textContent = message; };
const node = (tag, value, cls) => { const e = document.createElement(tag); if (value != null) e.textContent = value; if (cls) e.className = cls; return e; };
const nameOf = (id) => members.get(id) || "小屋住客";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const dateValue = (s) => Date.parse(s + "T00:00:00Z");
const daysBetween = (a, b) => Math.round((dateValue(b) - dateValue(a)) / 86400000);
function nextOccurrence(row) {
  if (row.kind !== "anniversary") return row.event_date;
  const now = today(), year = Number(now.slice(0, 4)), monthDay = row.event_date.slice(5);
  const occurrence = (y) => anniversaryInYear(monthDay,y);
  return occurrence(year) < now ? occurrence(year + 1) : occurrence(year);
}
function anniversaryInYear(monthDay,year) { return monthDay === "02-29" && new Date(Date.UTC(year,1,29)).getUTCMonth() !== 1 ? `${year}-02-28` : `${year}-${monthDay}`; }
function must(result) { if (result.error) throw result.error; return result.data; }
function report(error) { console.error("House request failed", error?.code || error?.status || "unknown"); status(error?.code === "23505" ? "这条记录已经存在，请刷新后重试；在一起的第一天只能设置一次。" : "暂时无法完成操作，请检查网络后重试。"); }

const houseContent = $("house-content");
const panels = new Map(Array.from(houseContent.querySelectorAll(":scope > .house-panel"), (panel) => [`#${panel.id}`, panel]));
const navLinks = document.querySelectorAll(".house-nav a");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const lamb = $("house-lamb");
const houseEffects = createHouseEffects($("house"), reduceMotion);
const diary = createHouseDiary({ supabase, nameOf, status, today });

function updateLamb() {
  if ($("house").hidden || activePanel !== $("overview") || document.hidden || reduceMotion.matches) {
    lamb.pause();
    return;
  }
  if (!lamb.hasAttribute("src")) lamb.src = lamb.dataset.src;
  if (!lamb.ended) void lamb.play().catch(() => {});
}

reduceMotion.addEventListener("change", updateLamb);
document.addEventListener("visibilitychange", updateLamb);

async function markNotesRead() {
  if (activePanel !== $("notes") || !pendingNotesRead) return;
  const { seenAt, hasPreviousRead } = pendingNotesRead;
  pendingNotesRead = null;
  try {
    const reads = supabase.from("house_reads");
    if (hasPreviousRead) {
      must(await reads.update({ notes_seen_at: seenAt }).eq("user_id", user.id).lt("notes_seen_at", seenAt));
    } else {
      must(await reads.upsert({ user_id: user.id, notes_seen_at: seenAt }, { ignoreDuplicates: true }));
    }
    $("nav-unread").hidden = true;
    $("notes-link").removeAttribute("aria-label");
  } catch (error) {
    pendingNotesRead = { seenAt, hasPreviousRead };
    console.error("Unable to mark notes read", error?.code || error?.status || "unknown");
  }
}

function showPanel(fragment, moveFocus = false) {
  const panel = panels.get(fragment) ?? $("overview");
  const closedReader = diary.leaveReader();
  if (panel === activePanel && !closedReader) return;
  activePanel = panel;
  for (const entry of panels.values()) entry.hidden = entry !== panel;
  for (const link of navLinks) {
    if (link.hash === `#${panel.id}`) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  houseContent.scrollTop = 0;
  if (moveFocus) {
    const heading = panel.querySelector("h1, h2");
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
  updateLamb();
  if (panel === $("activity")) refreshActivity();
  if (panel === $("capsules")) diary.refreshMailbox();
  void markNotesRead();
}

$("house").addEventListener("click", (event) => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || !panels.has(link.hash) || event.button !== 0 ||
      event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  event.preventDefault();
  if (location.hash !== link.hash && panels.get(link.hash) !== activePanel) {
    history.pushState(null, "", link.hash);
  }
  showPanel(link.hash, true);
  if (link.dataset.record) focusRecord(link.dataset.record);
});
window.addEventListener("hashchange", () => showPanel(location.hash, !$("house").hidden));

async function run(form, task) {
  const buttons = form.querySelectorAll("button"); buttons.forEach((b) => b.disabled = true);
  status("");
  try { await task(); } catch (error) { report(error); }
  finally { buttons.forEach((b) => b.disabled = false); }
}
function action(label, handler) {
  const button = node("button", label); button.type = "button";
  button.addEventListener("click", async () => { button.disabled = true; status(""); try { await handler(); } catch (e) { report(e); } finally { button.disabled = false; } });
  return button;
}
function timestamp(value) { return new Intl.DateTimeFormat("zh-CN", { timeZone:"Asia/Shanghai", year:"numeric", month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" }).format(new Date(value)); }

function focusRecord(id) {
  const record = $(id);
  if (!record) return;
  record.tabIndex = -1;
  record.focus({ preventScroll: true });
  record.scrollIntoView({ block: "nearest" });
}

function activityRow({ mark, description, title, date, dateLabel, section, record }) {
  const row = node("article", null, "activity-row");
  const symbol = node("span", mark, "activity-mark");
  symbol.setAttribute("aria-hidden", "true");
  const copy = node("div", null, "activity-copy");
  const time = node("time", dateLabel);
  time.dateTime = date;
  const text = node("p", null, "activity-title");
  if (record) {
    const link = node("a", title);
    link.href = `#${section}`;
    link.dataset.record = record;
    text.append(link);
  } else {
    text.textContent = title;
  }
  copy.append(node("p", description, "activity-description"), text, time);
  row.append(symbol, copy);
  return row;
}

function renderActivity() {
  const target = $("activity-list");
  const filter = $("activity-filter").value;
  const entries = [
    ...notes.map((note) => ({
      section: "notes", record: `note-${note.id}`, mark: "♡", title: note.body, date: note.created_at,
      description: `${nameOf(note.author_id)} · ${note.parent_id ? "回复" : "留言"}`
    })),
    ...items.map((item) => ({
      section: "collections", record: `item-${item.id}`, mark: "✿", title: item.title, date: item.created_at,
      description: `${nameOf(item.author_id)} · ${itemKinds[item.kind]}`
    })),
    ...dates.map((date) => ({
      section: "dates", record: `date-${date.id}`, mark: "✳", title: date.title, date: date.created_at,
      description: `${nameOf(date.created_by)} · 记下了一个日子`
    }))
  ].filter((entry) => entry.date && (filter === "all" || entry.section === filter));
  entries.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const rows = entries.slice(0, 16).map((entry) => activityRow({
    ...entry, dateLabel: timestamp(entry.date)
  }));
  if (!activityReady) rows.push(node("p", "正在读取小屋里的记录…", "empty"));
  else if (filter === "all" ? activitySources.size < 3 : !activitySources.has(filter)) {
    rows.push(node("p", "部分记录暂时无法加载，请稍后刷新。", "empty"));
  } else if (!rows.length) {
    const empty = node("div", null, "empty empty-notes");
    const link = node("a", { all:"写张纸条", notes:"写张纸条", collections:"添加收藏", dates:"记下一个日子" }[filter], "text-link");
    link.href = filter === "all" ? "#notes" : `#${filter}`;
    empty.append(node("p", "这里还没有记录。"), link);
    rows.push(empty);
  }
  target.replaceChildren(...rows);
}

async function loadDatedMemories() {
  // The collection view loads the newest 100 items. Search the older records as well.
  if (items.length < 100) return items.filter((item) => item.kind === "memory" && item.event_date);
  const memories = [];
  const pageSize = 500;
  for (let start = 0; ; start += pageSize) {
    const page = must(await supabase.from("house_items").select("title,event_date,author_id")
      .eq("kind", "memory").not("event_date", "is", null).order("id").range(start, start + pageSize - 1));
    memories.push(...page);
    if (page.length < pageSize) return memories;
  }
}

async function renderRecall() {
  const target = $("recall-list");
  if (!activityReady) {
    target.replaceChildren(node("p", "正在翻找以前的回忆…", "empty"));
    return;
  }
  const history = recallHistory ??= loadDatedMemories();
  try {
    const memories = await history;
    if (history !== recallHistory) return;
    const now = today();
    const match = (value) => value && value < now && value.slice(5) === now.slice(5);
    const entries = [
      ...memories.map((memory) => ({
        mark:"✿", title:memory.title, date:memory.event_date, description:`${nameOf(memory.author_id)} · 回忆`
      })),
      ...dates.map((date) => ({
        mark:"✳", title:date.title, date:date.event_date, description:"我们记下的日子"
      }))
    ].filter((entry) => match(entry.date)).sort((a, b) => b.date.localeCompare(a.date));
    const rows = entries.map((entry) => activityRow({ ...entry, dateLabel:entry.date }));
    if (!activitySources.has("collections") || !activitySources.has("dates")) {
      rows.push(node("p", "部分回忆暂时无法加载，请稍后刷新。", "empty"));
    } else if (!rows.length) {
      const empty = node("div", null, "empty empty-recall");
      const link = node("a", "收藏一段回忆", "text-link");
      link.href = "#collections";
      empty.append(node("p", "以前的今天还没有回忆。给新收藏填上日期，以后就能在这里重温。"), link);
      rows.push(empty);
    }
    target.replaceChildren(...rows);
  } catch (error) {
    if (history !== recallHistory) return;
    recallHistory = null;
    console.error("Recall unavailable", error?.code || error?.status || "unknown");
    target.replaceChildren(node("p", "往年今日暂时无法加载，请稍后再试。", "empty"));
  }
}

function refreshActivity() {
  renderActivity();
  void renderRecall();
}

function openWishes() {
  return items.filter((item) => item.kind === "wish" && !item.completed);
}

function renderWishDraw() {
  const wishes = openWishes();
  const drawn = wishes.find((wish) => wish.id === drawnWishId);
  drawnWishId = drawn?.id;
  $("draw-wish").disabled = !wishes.length;
  $("draw-wish").textContent = drawn ? "再抽一张" : "抽一张";
  $("view-wish").hidden = !drawn;
  $("wish-result").textContent = drawn ? drawn.title : wishes.length
    ? "从还没完成的愿望里随机挑一件。"
    : "还没有待完成的愿望。添加收藏时选择「愿望」，就可以来抽签。";
}

$("activity-filter").addEventListener("change", renderActivity);
$("draw-wish").addEventListener("click", () => {
  const wishes = openWishes();
  const choices = wishes.length > 1 ? wishes.filter((wish) => wish.id !== drawnWishId) : wishes;
  if (!choices.length) return;
  drawnWishId = choices[Math.floor(Math.random() * choices.length)].id;
  renderWishDraw();
  if (!reduceMotion.matches) {
    $("wish-result").animate?.(
      [{ opacity: 0.55, transform: "translateY(4px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 260, easing: "ease-out" }
    );
  }
});
$("view-wish").addEventListener("click", () => {
  focusRecord(`item-${drawnWishId}`);
});

function renderNotes() {
  const list = $("notes-list"); list.replaceChildren();
  const top = notes.filter((n) => !n.parent_id);
  if (!top.length) list.append(node("p", "还没有纸条，留下一句今天想说的话吧。", "empty empty-notes"));
  function card(note, reply = false) {
    const wrapper = node("article", null, "note");
    wrapper.id = `note-${note.id}`;
    const meta = node("div", null, "note-meta"); meta.append(node("strong", nameOf(note.author_id)), node("time", timestamp(note.created_at)));
    wrapper.append(meta, node("p", note.body, "note-body"));
    const controls = node("div", null, "note-actions");
    const itsLikes = likes.filter((l) => l.note_id === note.id), mine = itsLikes.some((l) => l.user_id === user.id);
    controls.append(action(`${mine ? "♥" : "♡"} ${itsLikes.length || "喜欢"}`, async () => {
      if (mine) must(await supabase.from("house_likes").delete().eq("note_id", note.id).eq("user_id", user.id));
      else must(await supabase.from("house_likes").insert({note_id:note.id,user_id:user.id}));
      await loadNotes();
    }));
    if (note.author_id === user.id) {
      controls.append(action("编辑", async () => {
        const value = prompt("修改这张纸条：", note.body); if (value === null) return;
        const body = value.trim(); if (!body || body.length > 1000) throw new Error("invalid body");
        must(await supabase.from("house_notes").update({body}).eq("id", note.id)); await loadNotes();
      }), action("删除", async () => {
        if (!confirm("删除这张纸条？")) return;
        must(await supabase.from("house_notes").delete().eq("id",note.id)); await loadNotes();
      }));
    }
    wrapper.append(controls);
    if (!reply) {
      const children = notes.filter((n) => n.parent_id === note.id).sort((a,b)=>a.created_at.localeCompare(b.created_at));
      if (children.length) { const group = node("div",null,"replies"); children.forEach((n)=>group.append(card(n,true))); wrapper.append(group); }
      const details = node("details"), summary = node("summary","回复这张纸条");
      const form = node("form",null,"reply-form"), text = node("textarea"); text.placeholder="写下你的回复……"; text.maxLength=1000; text.required=true; text.setAttribute("aria-label","回复内容");
      const submit = node("button","送出回复","button"); submit.type="submit";
      form.append(text,submit); form.addEventListener("submit",(event)=>{event.preventDefault();run(form,async()=>{must(await supabase.from("house_notes").insert({author_id:user.id,parent_id:note.id,body:text.value.trim()})); await loadNotes();});});
      details.append(summary,form); wrapper.append(details);
    }
    return wrapper;
  }
  top.forEach((n)=>list.append(card(n)));
  renderAchievements();
}
function renderDates() {
  const list = $("dates-list"); list.replaceChildren();
  const together = dates.find((d)=>d.kind === "together");
  $("together-count").textContent = together ? (daysBetween(together.event_date,today()) >= 0 ? `${daysBetween(together.event_date,today())} 天` : "期待第一天") : "等待一个日期";
  $("together-hint").textContent = together ? `从 ${together.event_date} 开始，慢慢收藏。` : "记下属于我们的第一天。";
  const upcoming = dates.filter((d)=>d.kind !== "together").map((d)=>({...d,next:nextOccurrence(d)})).filter((d)=>d.next >= today()).sort((a,b)=>a.next.localeCompare(b.next));
  $("next-date").textContent = upcoming[0]?.title || "还没有安排";
  $("next-date-hint").textContent = upcoming[0] ? (daysBetween(today(),upcoming[0].next) === 0 ? "就是今天 ♡" : `还有 ${daysBetween(today(),upcoming[0].next)} 天 · ${upcoming[0].next}`) : "一起把想见面的日子写下来吧。";
  if (!dates.length) list.append(node("p","还没有记录，写下第一个属于你们的日子吧。","empty empty-dates"));
  dates.forEach((row)=>{
    const line=node("div",null,"date-row"), copy=node("div"), actions=node("div",null,"date-actions");
    line.id = `date-${row.id}`;
    copy.append(node("strong",row.title),node("small",`${row.event_date} · ${({together:"在一起",anniversary:"每年纪念日",event:"一次性计划"})[row.kind]}`));
    actions.append(action("编辑",async()=>{
      const title=prompt("日子名称：",row.title); if(title===null)return;
      const event_date=prompt("日期（YYYY-MM-DD）：",row.event_date);if(event_date===null)return;
      if(!title.trim() || title.trim().length>60 || !/^\d{4}-\d{2}-\d{2}$/.test(event_date))throw new Error("invalid date");
      must(await supabase.from("house_dates").update({title:title.trim(),event_date}).eq("id",row.id));await loadDates();
    }),action("删除",async()=>{if(!confirm("删除这个日子？"))return;must(await supabase.from("house_dates").delete().eq("id",row.id));await loadDates();}));
    line.append(copy,actions);list.append(line);
  });
  renderCalendar();
}
function updateActivitySource(source) {
  activitySources.add(source);
  if (activityReady && activePanel === $("activity")) refreshActivity();
}

async function loadNotes() { const [n,l]=await Promise.all([supabase.from("house_notes").select("*").order("created_at",{ascending:false}).limit(200),supabase.from("house_likes").select("*")]);notes=must(n);likes=must(l);renderNotes();updateActivitySource("notes"); }
async function loadDates() { dates=must(await supabase.from("house_dates").select("*").order("event_date"));renderDates();updateActivitySource("dates"); }
async function loadQuotes() {
  quotes=must(await supabase.from("house_quotes").select("id,author_id,body").order("created_at"));
  const all=[...fallbacks,...quotes.map((q)=>q.body)];$("daily-quote").textContent=all[Math.floor(dateValue(today())/86400000)%all.length];
  const list=$("quote-list");list.replaceChildren();
  quotes.filter((q)=>q.author_id===user.id).forEach((q)=>{const row=node("div",null,"date-row");row.append(node("span",q.body),action("删除",async()=>{if(!confirm("删除这句话？"))return;must(await supabase.from("house_quotes").delete().eq("id",q.id));await loadQuotes();}));list.append(row);});
}
async function loadItems() {
  items=must(await supabase.from("house_items").select("*").order("created_at",{ascending:false}).limit(100));
  recallHistory = null;
  updateActivitySource("collections");
  renderWishDraw();
  const list=$("items-list");list.replaceChildren();
  renderCalendar();renderAchievements();
  if(!items.length){list.append(node("p","这里还空着，收藏第一个小小的瞬间吧。","empty empty-collections"));return;}
  for(const item of items){
    const card=node("article",null,"item-card");
    card.id = `item-${item.id}`;
    if(item.image_path){const image=node("img");image.alt=item.title;image.loading="lazy";const signed=await supabase.storage.from("house-memories").createSignedUrl(item.image_path,300);if(!signed.error){image.src=signed.data.signedUrl;const link=node("a");link.href=signed.data.signedUrl;link.target="_blank";link.rel="noopener noreferrer";link.setAttribute("aria-label",`查看照片：${item.title}`);link.append(image);card.append(link);}else card.append(node("p","照片暂时无法加载"));}
    card.append(node("small",`${itemKinds[item.kind]} · ${nameOf(item.author_id)}${item.event_date ? ` · ${item.event_date}` : ""}`),node("h3",item.title));
    if(item.body)card.append(node("p",item.body));
    if(item.url){try{const url=new URL(item.url);if(["http:","https:"].includes(url.protocol)){const link=node("a","打开链接 ↗");link.href=url.href;link.target="_blank";link.rel="noopener noreferrer";card.append(link);}}catch{}}
    const controls=node("div",null,"note-actions");
    if(["wish","task"].includes(item.kind)) controls.append(action(item.completed?"撤销完成":"标记完成",async()=>{must(await supabase.from("house_items").update({completed:!item.completed}).eq("id",item.id));await loadItems();}));
    if(item.author_id===user.id || ["wish","task"].includes(item.kind)) controls.append(action("编辑",async()=>{
      const title=prompt("标题：",item.title);if(title===null)return;
      const body=prompt("内容：",item.body);if(body===null)return;
      if(!title.trim() || title.trim().length>120 || body.length>2000)throw new Error("invalid item");
      must(await supabase.from("house_items").update({title:title.trim(),body:body.trim()}).eq("id",item.id));await loadItems();
    }));
    if(item.author_id===user.id || ["wish","task"].includes(item.kind)) controls.append(action("删除",async()=>{
      if(!confirm("删除这份收藏？"))return;
      must(await supabase.from("house_items").delete().eq("id",item.id));
      if(item.image_path && item.author_id===user.id){const removed=await supabase.storage.from("house-memories").remove([item.image_path]);if(removed.error)status("收藏已删除，但照片清理失败，请稍后检查存储。");}
      await loadItems();
    }));
    if(item.completed)card.append(node("p","✓ 已完成"));
    card.append(controls);list.append(card);
  }
}
function renderAchievements(){
  const achieved=[];
  if(notes.length)achieved.push("第一张小纸条");
  if(items.some((i)=>i.kind==="memory"))achieved.push("第一份回忆");
  if(items.some((i)=>i.kind==="wish" && i.completed))achieved.push("完成一个心愿");
  $("achievements").textContent=achieved.length ? `我们的小成就：${achieved.join(" · ")}` : "第一个小成就，等着我们一起点亮。";
}
function renderCalendar(){
  if(!calendarMonth){const [y,m]=today().split("-").map(Number);calendarMonth={year:y,month:m-1};}
  const {year,month}=calendarMonth,grid=$("calendar-grid");grid.replaceChildren();
  $("calendar-month").textContent=`${year} 年 ${month+1} 月`;
  ["日","一","二","三","四","五","六"].forEach((v)=>grid.append(node("div",v,"calendar-cell calendar-head")));
  for(let i=0;i<new Date(Date.UTC(year,month,1)).getUTCDay();i++)grid.append(node("div","","calendar-cell calendar-empty"));
  const length=new Date(Date.UTC(year,month+1,0)).getUTCDate();
  for(let d=1;d<=length;d++){
    const day=`${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`,cell=node("div",String(d),"calendar-cell");
    for(const event of dates){if((event.kind==="anniversary" && anniversaryInYear(event.event_date.slice(5),year)===day) || (event.kind!=="anniversary" && event.event_date===day))cell.append(node("small",event.title));}
    for(const item of items.filter((i)=>i.kind==="task" && i.event_date===day))cell.append(node("small",item.title));
    grid.append(cell);
  }
}
async function loadAnswers(){
  const question=$("question-choice").value;
  const answers=must(await supabase.rpc("house_question_answers",{p_question:question}));
  const target=$("question-results");target.replaceChildren();
  if(answers.length<2)target.append(node("p",answers.length?"已收到你的回答，等对方写完后一起打开。":"你们都还没有回答这个问题。","section-copy"));
  else answers.forEach((answer)=>{const card=node("div",null,"note");card.append(node("strong",nameOf(answer.author_id)),node("p",answer.answer,"note-body"));target.append(card);});
}
async function boot() {
  if (!isSupabaseConfigured) throw new Error("missing config");
  const result = await supabase.auth.getUser(); user = result.data.user;
  if (result.error || !user) { window.location.replace("./index.html"); return; }
  const profile = await supabase.from("profiles").select("nickname,slot").eq("id",user.id).maybeSingle();
  if (profile.error || !profile.data || ![1,2].includes(profile.data.slot)) { window.location.replace("./index.html?error=profile"); return; }
  $("current-name").textContent=profile.data.nickname;
  showPanel(location.hash);
  $("house").hidden=false; $("loading").hidden=true; document.documentElement.classList.remove("house-locked");
  houseEffects.setVisible(true);
  diary.connect(user.id);
  updateLamb();
  try {
    members = new Map(must(await supabase.rpc("house_members")).map((m)=>[m.id,m.nickname]));
    if (activePanel === $("capsules")) void diary.refreshList();
    const seen=must(await supabase.from("house_reads").select("notes_seen_at").eq("user_id",user.id).maybeSingle());
    const seenAt = new Date().toISOString();
    await Promise.all([loadNotes(),loadDates(),loadQuotes()]);
    const unread=notes.filter((n)=>n.author_id!==user.id && (!seen || n.created_at > seen.notes_seen_at)).length;
    if(unread){
      $("unread").textContent=`${unread} 条新纸条`;
      $("unread").hidden=false;
      $("nav-unread").textContent=unread;
      $("notes-link").setAttribute("aria-label", `留言，${unread} 条新纸条`);
      $("nav-unread").hidden=false;
    }
    pendingNotesRead = { seenAt, hasPreviousRead: Boolean(seen) };
    void markNotesRead();
  } catch(e) { console.error("House setup unavailable",e?.code || e?.status || "unknown"); status("小屋日常功能暂时不可用，请稍后重试；你仍可以打开我们的故事。"); }
  try { await loadItems(); } catch(e) {
    console.error("Collections unavailable",e?.code || e?.status || "unknown");
    $("items-list").replaceChildren(node("p","收藏功能暂时不可用，请稍后再来。","empty"));
    $("wish-result").textContent = "愿望暂时无法加载，请稍后刷新。";
  }
  activityReady = true;
  if (activePanel === $("activity")) refreshActivity();
  try { await loadAnswers(); } catch(e) { console.error("Questions unavailable",e?.code || e?.status || "unknown"); $("question-results").replaceChildren(node("p","暂时无法查看回答，请稍后再试。","empty")); }
}
$("logout").addEventListener("click",async()=>{await supabase.auth.signOut();window.location.replace("./index.html");});
$("note-form").addEventListener("submit",(e)=>{e.preventDefault();run(e.currentTarget,async()=>{const body=$("note-body").value.trim();if(!body)throw new Error("empty");must(await supabase.from("house_notes").insert({author_id:user.id,body}));$("note-body").value="";await loadNotes();});});
$("date-form").addEventListener("submit",(e)=>{e.preventDefault();const form=e.currentTarget;run(form,async()=>{const title=$("date-title").value.trim();if(!title)throw new Error("empty");must(await supabase.from("house_dates").insert({created_by:user.id,title,event_date:$("date-value").value,kind:$("date-kind").value}));form.reset();await loadDates();});});
$("quote-form").addEventListener("submit",(e)=>{e.preventDefault();run(e.currentTarget,async()=>{const body=$("quote-body").value.trim();if(!body)throw new Error("empty");must(await supabase.from("house_quotes").insert({author_id:user.id,body}));$("quote-body").value="";await loadQuotes();status("这句话已经收进小屋。");});});
$("item-form").addEventListener("submit",(e)=>{e.preventDefault();const form=e.currentTarget;run(form,async()=>{
  const kind=$("item-kind").value,title=$("item-title").value.trim(),body=$("item-body").value.trim(),file=$("item-image").files[0],url=$("item-url").value.trim();
  if(!title){status("请填写标题。");return;}
  if(file && kind!=="memory"){status("照片只能添加到回忆中。");return;}
  if(file && (file.size>10485760 || !["image/jpeg","image/png","image/webp"].includes(file.type))){status("请使用不超过 10 MB 的 JPG、PNG 或 WebP 图片。");return;}
  let image_path=null;
  if(file){image_path=`${user.id}/${crypto.randomUUID()}`;must(await supabase.storage.from("house-memories").upload(image_path,file,{contentType:file.type,upsert:false}));}
  const result=await supabase.from("house_items").insert({author_id:user.id,kind,title,body,event_date:$("item-date").value || null,url:url || null,image_path});
  if(result.error){if(image_path){const cleanup=await supabase.storage.from("house-memories").remove([image_path]);if(cleanup.error)console.error("Unlinked image cleanup failed");}throw result.error;}
  form.reset();await loadItems();
});});
async function allRows(table) {
  const rows=[];
  for(let start=0;;start+=500){
    const page=must(await supabase.from(table).select("*").order("created_at",{ascending:true}).range(start,start+499));
    rows.push(...page);if(page.length<500)return rows;
  }
}
function crc32(bytes) {
  let crc=0xffffffff;
  for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^(0xedb88320 & -(crc&1));}
  return (crc^0xffffffff)>>>0;
}
function zipArchive(files) {
  const parts=[], central=[];let offset=0;
  const head=(size)=>{const bytes=new Uint8Array(size);return {bytes,view:new DataView(bytes.buffer)};};
  for(const file of files){
    const filename=new TextEncoder().encode(file.name),sum=crc32(file.bytes),size=file.bytes.length;
    const local=head(30);local.view.setUint32(0,0x04034b50,true);local.view.setUint16(4,20,true);local.view.setUint16(6,0x0800,true);local.view.setUint32(14,sum,true);local.view.setUint32(18,size,true);local.view.setUint32(22,size,true);local.view.setUint16(26,filename.length,true);
    parts.push(local.bytes,filename,file.bytes);
    const record=head(46);record.view.setUint32(0,0x02014b50,true);record.view.setUint16(4,20,true);record.view.setUint16(6,20,true);record.view.setUint16(8,0x0800,true);record.view.setUint32(16,sum,true);record.view.setUint32(20,size,true);record.view.setUint32(24,size,true);record.view.setUint16(28,filename.length,true);record.view.setUint32(42,offset,true);central.push(record.bytes,filename);offset+=30+filename.length+size;
  }
  const centralSize=central.reduce((n,p)=>n+p.length,0),end=head(22);end.view.setUint32(0,0x06054b50,true);end.view.setUint16(8,files.length,true);end.view.setUint16(10,files.length,true);end.view.setUint32(12,centralSize,true);end.view.setUint32(16,offset,true);
  return new Blob([...parts,...central,end.bytes],{type:"application/zip"});
}
$("export-data").addEventListener("click",async()=>{
  const button=$("export-data");button.disabled=true;status("正在打包留言、收藏和照片，请稍候。");
  try {
    const [allNotes,allDates,allQuotes,allItems]=await Promise.all(["house_notes","house_dates","house_quotes","house_items"].map(allRows));
    const files=[];let total=0;
    for(const item of allItems.filter((i)=>i.image_path)){
      const blob=must(await supabase.storage.from("house-memories").download(item.image_path));total+=blob.size;
      if(total>200*1024*1024)throw new Error("export_too_large");
      const ext=({"image/jpeg":"jpg","image/png":"png","image/webp":"webp"})[blob.type] || "bin";
      const name=`photos/${item.id}.${ext}`;files.push({name,bytes:new Uint8Array(await blob.arrayBuffer())});item.image_file=name;delete item.image_path;
    }
    const data={exported_at:new Date().toISOString(),notes:allNotes,dates:allDates,quotes:allQuotes,items:allItems};
    files.unshift({name:"records.json",bytes:new TextEncoder().encode(JSON.stringify(data,null,2))});
    if(files.length>65535)throw new Error("export_too_large");
    const url=URL.createObjectURL(zipArchive(files)),link=node("a");link.href=url;link.download="小屋回忆.zip";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status("留言和收藏已打包，照片保存在压缩包的 photos 文件夹。");
  } catch(error) {if(error.message==="export_too_large")status("照片超过单次导出容量，请分批保存照片。");else report(error);}
  finally {button.disabled=false;}
});
$("question-form").addEventListener("submit",(e)=>{e.preventDefault();const form=e.currentTarget;run(form,async()=>{must(await supabase.rpc("house_answer_question",{p_question:$("question-choice").value,p_answer:$("question-answer").value.trim()}));$("question-answer").value="";await loadAnswers();});});
$("question-choice").addEventListener("change",()=>loadAnswers().catch(report));
$("wave").addEventListener("click",()=>{const greetings=["小羊向你挥了挥手，今天也要开心呀。 ♡","嗨，记得给今天的自己一个微笑。 ✿","不管今天怎么样，小屋都为你留着灯。 ✧"];const message=$("interaction-message");message.textContent=greetings[Math.floor(Math.random()*greetings.length)];message.classList.remove("greeting-wave");requestAnimationFrame(()=>message.classList.add("greeting-wave"));});
$("hug").addEventListener("click",async()=>{try{must(await supabase.from("house_notes").insert({author_id:user.id,body:"给你一个大大的拥抱 🫂"}));await loadNotes();status("拥抱已经放进留言墙。");}catch(e){report(e);}});
$("flower").addEventListener("click",async()=>{try{must(await supabase.from("house_notes").insert({author_id:user.id,body:"送你一朵小花，愿今天的你开心。 🌷"}));await loadNotes();status("小花已经放进留言墙。");}catch(e){report(e);}});
function moveMonth(delta){const d=new Date(Date.UTC(calendarMonth.year,calendarMonth.month+delta,1));calendarMonth={year:d.getUTCFullYear(),month:d.getUTCMonth()};renderCalendar();}
$("previous-month").addEventListener("click",()=>moveMonth(-1));
$("next-month").addEventListener("click",()=>moveMonth(1));
function hideHouse(){ $("house").hidden=true; $("loading").hidden=false; diary.disconnect(); houseEffects.setVisible(false); updateLamb(); }
if (supabase) supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT") {
    hideHouse();
    queueMicrotask(() => window.location.replace("./index.html"));
  } else if (user && session?.user.id && session.user.id !== user.id) {
    hideHouse();
    queueMicrotask(() => window.location.reload());
  }
});
window.addEventListener("pagehide",hideHouse);
window.addEventListener("pageshow",(event)=>{if(event.persisted)window.location.reload();});
boot().catch((e)=>{console.error("House failed",e?.code || e?.status || "unknown");$("loading").textContent="暂时无法打开小屋，请刷新重试。";});
