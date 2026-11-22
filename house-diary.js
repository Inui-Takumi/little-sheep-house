const table = "house_diary_entries";
const summaries = "id,author_id,visibility,title,envelope,seal,created_at";
const details = `${summaries},body,paper,font,version`;
const pageSize = 20;
const editable = ["visibility", "title", "body", "envelope", "paper", "font", "seal"];

const envelopes = { rose: "粉玫瑰", stock: "紫罗兰", post: "奶油邮局", night: "月夜星光" };
const papers = { ruled: "暖白横线", kraft: "素面牛皮", grid: "淡紫格纹", cloud: "浅蓝云纹" };
const seals = {
  lamb: { name: "小羊", mark: "🐑" },
  heart: { name: "爱心", mark: "♥" },
  moon: { name: "星月", mark: "☾" },
  flower: { name: "花朵", mark: "✿" }
};
const fonts = {
  serif: { name: "宋体", family: "Noto Serif SC" },
  sans: { name: "黑体", family: "Noto Sans SC" },
  xiaowei: { name: "小微宋", family: "ZCOOL XiaoWei" },
  kaishu: { name: "手写楷", family: "Ma Shan Zheng", art: true },
  longcang: { name: "龙藏体", family: "Long Cang", art: true },
  maocao: { name: "刘建毛草", family: "Liu Jian Mao Cao", art: true },
  kuaile: { name: "站酷快乐体", family: "ZCOOL KuaiLe", art: true },
  huangyou: { name: "站酷庆科黄油体", family: "ZCOOL QingKe HuangYou", art: true }
};
const stepNames = ["信封", "信纸", "正文", "字体", "蜡封", "寄出"];
const defaultStyles = { visibility: "private", envelope: "rose", paper: "ruled", font: "serif", seal: "lamb" };
const calendarDate = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric"
});
const countFormat = new Intl.NumberFormat("en-US");
const fontRequests = new Set();

function element(tag, text, className) {
  const value = document.createElement(tag);
  if (text != null) value.textContent = text;
  if (className) value.className = className;
  return value;
}

function useFont(key) {
  const font = fonts[key] ?? fonts.serif;
  if (font !== fonts.serif && !fontRequests.has(font.family)) {
    fontRequests.add(font.family);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    const family = encodeURIComponent(font.family).replaceAll("%20", "+");
    link.href = `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
    link.addEventListener("error", () => {
      fontRequests.delete(font.family);
      link.remove();
    }, { once: true });
    document.head.append(link);
  }
  return font;
}

function storageMissing(error) {
  return ["42P01", "PGRST205"].includes(error?.code);
}

function messageFor(error, fallback) {
  return storageMissing(error) ? "时光信箱的日记存储尚未启用。" : fallback;
}

function titleOf(entry) {
  return entry.title.trim() || (entry.created_at ? `${calendarDate.format(new Date(entry.created_at))}的日记` : "今天的日记");
}

function visibilityLabel(visibility) {
  return visibility === "shared" ? "公开" : "私密";
}

function wax(key) {
  const seal = seals[key] ?? seals.lamb;
  const stamp = element("span", seal.mark, "diary-wax");
  stamp.dataset.seal = key;
  stamp.setAttribute("aria-hidden", "true");
  return stamp;
}

function envelopeArt(style, seal) {
  const cover = element("span", null, "diary-envelope");
  cover.dataset.envelope = style;
  cover.setAttribute("aria-hidden", "true");
  cover.append(element("span", null, "diary-envelope-decoration"));
  if (seal) cover.append(wax(seal));
  return cover;
}

function letterPaper(entry) {
  const paper = element("article", null, "diary-paper diary-letter");
  const font = useFont(entry.font);
  paper.dataset.paper = entry.paper;
  paper.dataset.font = entry.font;
  paper.style.setProperty("--diary-family", `"${font.family}"`);
  paper.append(
    element("h3", titleOf(entry)),
    element("p", entry.body, "diary-letter-body")
  );
  return paper;
}

export function createHouseDiary({ supabase, nameOf, status }) {
  const $ = (id) => document.getElementById(id);
  const composer = $("diary-compose");
  const reader = $("diary-reader");
  const titleInput = $("diary-title");
  const bodyInput = $("diary-body");
  const preview = $("diary-compose-preview");
  const list = $("diary-list");
  const latest = $("diary-latest");
  const steps = Array.from(composer.querySelectorAll("[data-diary-step]"));
  const audienceInputs = Array.from(composer.querySelectorAll('input[name="visibility"]'));
  const filterButtons = Array.from(document.querySelectorAll("[data-diary-filter]"));
  const choices = [];
  let userId, draft, readerEntry, readerId;
  let step = 0;
  let page = 0;
  let filter = "all";
  let homeRequest = 0;
  let listRequest = 0;
  let readerRequest = 0;
  let saving = false;
  let deleting = false;

  function updateStorageNotice(error) {
    if (!error || storageMissing(error)) $("diary-storage-notice").hidden = !error;
  }

  function diaryQuery(columns = summaries) {
    return supabase.from(table).select(columns);
  }

  function byNewest(query) {
    return query.order("created_at", { ascending: false }).order("id", { ascending: false });
  }

  function loadEntry(id) {
    return diaryQuery(details).eq("id", id).maybeSingle();
  }

  function entryButton(entry, compact = false) {
    const button = element("button", null, compact ? "diary-compact-entry" : "diary-entry");
    button.type = "button";
    button.dataset.diaryId = entry.id;
    const copy = element("span", null, "diary-entry-copy");
    copy.append(element("strong", titleOf(entry)));
    if (!compact) {
      const author = entry.author_id === userId ? "我" : nameOf(entry.author_id);
      const date = calendarDate.format(new Date(entry.created_at));
      copy.append(element("small", `${visibilityLabel(entry.visibility)} · ${author} · ${date}`));
    }
    button.append(envelopeArt(entry.envelope, entry.seal), copy);
    button.addEventListener("click", () => void openEntry(entry.id));
    return button;
  }

  async function refreshHome() {
    if (!userId) return;
    const request = ++homeRequest;
    try {
      const [shared, own] = await Promise.all([
        byNewest(diaryQuery().eq("visibility", "shared")).limit(1).maybeSingle(),
        byNewest(diaryQuery().eq("visibility", "private").eq("author_id", userId)).limit(1).maybeSingle()
      ]);
      if (request !== homeRequest) return;
      if (shared.error || own.error) throw shared.error ?? own.error;
      const rows = [[shared.data, "最新公开"], [own.data, "我的私密"]].map(([entry, label]) => {
        const row = element("div", null, "diary-summary-row");
        row.append(element("span", label), entry ? entryButton(entry, true) : element("small", "还没有日记"));
        return row;
      });
      latest.replaceChildren(...rows);
    } catch (error) {
      if (request === homeRequest) latest.replaceChildren(element("p", messageFor(error, "暂时无法查看新信。")));
    }
  }

  async function refreshList(loading = false) {
    if (!userId) return;
    const request = ++listRequest;
    const message = $("diary-list-status");
    $("diary-retry").hidden = true;
    if (loading) {
      list.replaceChildren();
      $("diary-pages").hidden = true;
      message.textContent = "正在取信…";
    }
    try {
      let query = byNewest(diaryQuery());
      if (filter !== "all") query = query.eq("visibility", filter);
      if (filter === "private") query = query.eq("author_id", userId);
      const offset = page * pageSize;
      const { data, error } = await query.range(offset, offset + pageSize);
      if (request !== listRequest) return;
      updateStorageNotice(error);
      if (error) throw error;
      if (!data.length && page > 0) {
        page = 0;
        return refreshList(true);
      }
      const focused = list.contains(document.activeElement) ? document.activeElement.dataset.diaryId : null;
      list.replaceChildren(...data.slice(0, pageSize).map((entry) => entryButton(entry)));
      if (focused) {
        const replacement = Array.from(list.children).find((entry) => entry.dataset.diaryId === focused);
        replacement?.focus({ preventScroll: true });
      }
      message.textContent = data.length ? "" : filter === "all" ? "还没有日记。写一封，留住今天。" : "这里暂时没有这类日记。";
      $("diary-previous-page").disabled = page === 0;
      $("diary-next-page").disabled = data.length <= pageSize;
      $("diary-page-number").textContent = `第 ${page + 1} 页`;
      $("diary-pages").hidden = page === 0 && data.length <= pageSize;
    } catch (error) {
      if (request !== listRequest) return;
      list.replaceChildren();
      $("diary-pages").hidden = true;
      message.textContent = messageFor(error, "暂时无法读取日记，请重试。");
      $("diary-retry").hidden = false;
    }
  }

  function refresh() {
    void refreshHome();
    void refreshList();
  }

  function renderReader(entry, animate) {
    readerEntry = entry;
    const author = entry.author_id === userId ? "我" : nameOf(entry.author_id);
    const date = calendarDate.format(new Date(entry.created_at));
    $("diary-reader-meta").textContent = `${visibilityLabel(entry.visibility)} · ${author} · ${date}`;
    $("diary-reader-status").textContent = "";
    const contents = element("div", null, animate ? "diary-read-contents is-opening" : "diary-read-contents");
    contents.append(envelopeArt(entry.envelope, entry.seal), letterPaper(entry));
    $("diary-reader-content").replaceChildren(contents);
    $("diary-edit").hidden = entry.author_id !== userId;
    $("diary-delete").hidden = entry.author_id !== userId;
  }

  function clearReader(message = "") {
    readerEntry = null;
    $("diary-reader-meta").textContent = "";
    $("diary-reader-status").textContent = message;
    $("diary-reader-content").replaceChildren();
    $("diary-edit").hidden = true;
    $("diary-delete").hidden = true;
  }

  async function readCurrent(animate) {
    const request = ++readerRequest;
    try {
      const { data, error } = await loadEntry(readerId);
      if (request !== readerRequest) return;
      if (error) throw error;
      if (!data) {
        clearReader("这封日记已删除或目前不可见。");
        return;
      }
      if (data.version !== readerEntry?.version) renderReader(data, animate);
    } catch (error) {
      if (request === readerRequest) clearReader(messageFor(error, "这封日记暂时打不开，请关闭后重试。"));
    }
  }

  function openEntry(id) {
    if (!userId || reader.open) return;
    readerId = id;
    clearReader("正在拆信…");
    reader.showModal();
    $("diary-reader-scroll").scrollTop = 0;
    return readCurrent(true);
  }

  function closeReader() {
    ++readerRequest;
    readerId = null;
    clearReader();
    if (reader.open) reader.close();
  }

  function addChoices(target, field, catalog, sample) {
    for (const [key, label] of Object.entries(catalog)) {
      const button = element("button", null, "diary-choice");
      button.type = "button";
      button.setAttribute("aria-pressed", "false");
      if (sample) button.append(sample(key));
      button.append(element("span", label));
      button.addEventListener("click", () => {
        if (saving) return;
        draft[field] = key;
        updateSelections();
        renderPreview();
      });
      choices.push({ button, field, key });
      $(target).append(button);
    }
  }

  addChoices("diary-envelope-choices", "envelope", envelopes, (key) => envelopeArt(key));
  addChoices("diary-paper-choices", "paper", papers, (key) => {
    const sample = element("span", null, "diary-paper diary-paper-sample");
    sample.dataset.paper = key;
    sample.setAttribute("aria-hidden", "true");
    return sample;
  });
  addChoices("diary-seal-choices", "seal", Object.fromEntries(Object.entries(seals).map(([key, seal]) => [key, seal.name])), wax);
  for (const [key, font] of Object.entries(fonts)) {
    addChoices(font.art ? "diary-font-art" : "diary-font-standard", "font", { [key]: font.name });
  }

  function updateSelections() {
    for (const { button, field, key } of choices) button.setAttribute("aria-pressed", String(draft[field] === key));
    for (const input of audienceInputs) input.checked = input.value === draft.visibility;
    $("diary-audience-summary").textContent = draft.visibility === "shared"
      ? "公开日记 · 小屋里的两位住客都能看见。"
      : "私密日记 · 只有你自己能看见。";
  }

  function renderPreview() {
    preview.hidden = step < 3;
    preview.replaceChildren();
    if (preview.hidden) return;
    if (step >= 4) preview.append(envelopeArt(draft.envelope, draft.seal));
    if (step !== 4) preview.append(letterPaper(draft));
  }

  function showStep(index, moveFocus = true) {
    step = index;
    for (const [position, section] of steps.entries()) section.hidden = position !== step;
    $("diary-progress").textContent = `第 ${step + 1} / ${steps.length} 步 · ${stepNames[step]}`;
    $("diary-back").hidden = step === 0;
    $("diary-next").hidden = step === steps.length - 1;
    $("diary-send").hidden = step !== steps.length - 1;
    $("diary-compose-status").textContent = "";
    $("diary-compose-scroll").scrollTop = 0;
    updateSelections();
    renderPreview();
    if (moveFocus) steps[step].querySelector("h3").focus({ preventScroll: true });
  }

  function updateCount() {
    $("diary-count").textContent = `${countFormat.format(Array.from(bodyInput.value).length)} / 10,000`;
  }

  function openComposer(entry) {
    if (!userId || composer.open) return;
    draft = entry ? { ...entry, originalVisibility: entry.visibility } : {
      id: crypto.randomUUID(), ...defaultStyles, title: "", body: ""
    };
    draft.initial = editable.map((field) => draft[field]);
    titleInput.value = draft.title;
    bodyInput.value = draft.body;
    $("diary-compose-title").textContent = entry ? "编辑日记" : "写日记";
    $("diary-send").textContent = entry ? "保存修改" : "寄出";
    updateCount();
    showStep(0, false);
    composer.showModal();
    steps[0].querySelector("h3").focus({ preventScroll: true });
  }

  function syncText() {
    draft.title = titleInput.value;
    draft.body = bodyInput.value;
  }

  function draftChanged() {
    if (!draft) return false;
    syncText();
    return editable.some((field, index) => draft[field] !== draft.initial[index]);
  }

  function closeComposer(force = false) {
    if (!force && (saving || (draftChanged() && !confirm("放弃这次写下的内容和样式？")))) return;
    draft = null;
    titleInput.value = "";
    bodyInput.value = "";
    preview.replaceChildren();
    $("diary-compose-status").textContent = "";
    if (composer.open) composer.close();
  }

  function validateWriting() {
    syncText();
    const error = !draft.body.trim() ? "请写一点日记正文。"
      : Array.from(draft.body).length > 10000 ? "正文最多 10,000 字，请删减后继续。"
      : Array.from(draft.title.trim()).length > 60 ? "标题最多 60 字，请删减后继续。" : "";
    if (!error) return true;
    if (step !== 2) showStep(2);
    $("diary-compose-status").textContent = error;
    (error.startsWith("标题") ? titleInput : bodyInput).focus();
    return false;
  }

  async function storeDiary(entry, payload) {
    const change = entry.version == null
      ? supabase.from(table).insert({ id: entry.id, ...payload })
      : supabase.from(table).update(payload).eq("id", entry.id).eq("version", entry.version);
    const { data, error } = await change.select("id").maybeSingle();
    if (!error && data) return;

    // A request can reach the database even if its response never reaches the browser.
    const existing = await loadEntry(entry.id);
    if (!existing.error && existing.data && editable.every((field) => existing.data[field] === payload[field])) return;
    if (!error || error.code === "23505") {
      throw new Error("diary_conflict");
    }
    throw error;
  }

  async function sendDiary(event) {
    event.preventDefault();
    if (!draft || saving || step !== steps.length - 1 || !validateWriting()) return;
    const entry = draft;
    const editing = entry.version != null;
    if (editing && entry.originalVisibility === "private" && entry.visibility === "shared" &&
        !confirm("将这篇私密日记设为公开？另一位住客也能看到正文。")) return;

    const payload = Object.fromEntries(editable.map((field) => [field, entry[field]]));
    payload.title = payload.title.trim();
    saving = true;
    const buttons = [$("diary-send"), $("diary-back"), $("diary-cancel"), $("diary-review-visibility")];
    buttons.forEach((button) => { button.disabled = true; });
    $("diary-compose-status").textContent = editing ? "正在保存…" : "正在寄出…";
    try {
      await storeDiary(entry, payload);
      if (draft !== entry) return;
      updateStorageNotice();
      closeComposer(true);
      page = 0;
      refresh();
      status(editing ? "日记修改已保存。" : "日记已寄出。");
    } catch (error) {
      if (draft !== entry) return;
      updateStorageNotice(error);
      $("diary-compose-status").textContent = error.message === "diary_conflict"
        ? "日记已在其他窗口修改或删除。你可以复制当前内容，再重新打开最新的日记。"
        : storageMissing(error)
          ? "日记存储尚未启用，草稿已保留。存储启用后可以重试。"
          : "暂时没有保存成功，输入已保留，可以重试。";
    } finally {
      saving = false;
      buttons.forEach((button) => { button.disabled = false; });
    }
  }

  async function deleteEntry() {
    const entry = readerEntry;
    if (!entry || entry.author_id !== userId || deleting || !confirm("删除这篇日记？删除后无法恢复。")) return;
    deleting = true;
    const actions = [$("diary-delete"), $("diary-edit"), $("diary-close-reader")];
    actions.forEach((button) => { button.disabled = true; });
    try {
      const { error } = await supabase.from(table).delete().eq("id", entry.id).select("id").maybeSingle();
      if (error) throw error;
      if (readerId !== entry.id) return;
      closeReader();
      refresh();
      status("这篇日记已移除。");
    } catch (error) {
      if (readerId === entry.id) $("diary-reader-status").textContent = messageFor(error, "暂时无法删除日记，请重试。");
    } finally {
      deleting = false;
      actions.forEach((button) => { button.disabled = false; });
    }
  }

  $("diary-write").addEventListener("click", () => openComposer());
  $("diary-retry").addEventListener("click", () => refresh());
  for (const button of filterButtons) {
    button.addEventListener("click", () => {
      filter = button.dataset.diaryFilter;
      page = 0;
      for (const option of filterButtons) option.setAttribute("aria-pressed", String(option === button));
      void refreshList(true);
    });
  }
  $("diary-previous-page").addEventListener("click", () => { page -= 1; void refreshList(true); });
  $("diary-next-page").addEventListener("click", () => { page += 1; void refreshList(true); });
  for (const input of audienceInputs) {
    input.addEventListener("change", () => { draft.visibility = input.value; });
  }
  bodyInput.addEventListener("input", updateCount);
  $("diary-back").addEventListener("click", () => { syncText(); showStep(step - 1); });
  $("diary-next").addEventListener("click", () => {
    if (step !== 2 || validateWriting()) showStep(step + 1);
  });
  $("diary-review-visibility").addEventListener("click", () => showStep(0));
  $("diary-compose-form").addEventListener("submit", sendDiary);
  $("diary-cancel").addEventListener("click", () => closeComposer());
  composer.addEventListener("cancel", (event) => { event.preventDefault(); closeComposer(); });
  $("diary-close-reader").addEventListener("click", closeReader);
  reader.addEventListener("cancel", (event) => { event.preventDefault(); if (!deleting) closeReader(); });
  $("diary-edit").addEventListener("click", () => {
    const entry = readerEntry;
    if (entry?.author_id !== userId) return;
    closeReader();
    openComposer(entry);
  });
  $("diary-delete").addEventListener("click", deleteEntry);
  window.addEventListener("focus", () => {
    if (!userId) return;
    refresh();
    if (readerId) void readCurrent(false);
  });
  window.addEventListener("beforeunload", (event) => {
    if (draftChanged()) {
      event.preventDefault();
      event.returnValue = true;
    }
  });

  return {
    connect(id) { userId = id; refresh(); },
    refreshList,
    disconnect() {
      userId = null;
      ++homeRequest;
      ++listRequest;
      updateStorageNotice();
      closeComposer(true);
      closeReader();
      latest.replaceChildren();
      list.replaceChildren();
    }
  };
}
