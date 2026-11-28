import { createDiaryBouquet } from "./house-diary-bouquet.js";

const table = "house_diary_entries";
const summaries = "id,author_id,visibility,title,envelope,seal,created_at,delivery_on";
const details = `${summaries},body,paper,font,version`;
const pageSize = 20;
const editable = ["visibility", "title", "body", "envelope", "paper", "font", "seal"];
const deliveryRefreshMs = 60000;
const musicBucket = "house-diary-music";
const musicLimit = 10 * 1024 * 1024;
const musicTypes = new Map([["mp3", "audio/mpeg"], ["m4a", "audio/mp4"], ["wav", "audio/wav"]]);

const envelopes = { rose: "粉玫瑰", stock: "紫罗兰", post: "奶油邮局", night: "月夜星光" };
const papers = { ruled: "暖白横线", kraft: "素面牛皮", grid: "淡紫格纹", cloud: "浅蓝云纹", botanical: "玫瑰与紫罗兰" };
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
const beijingClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
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

function beijingInputValue(date) {
  const parts = Object.fromEntries(beijingClock.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year.padStart(4, "0")}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

function deliveryInstant(entry) {
  if (entry?.delivery_at) return new Date(entry.delivery_at).toISOString();
  return entry?.delivery_on ? new Date(`${entry.delivery_on}T00:00:00+08:00`).toISOString() : null;
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

function addWatermarks(paper) {
  const layer = element("span", null, "diary-paper-watermarks");
  layer.setAttribute("aria-hidden", "true");
  layer.append(element("span", null, "diary-paper-flowers"));
  paper.append(layer);
}

function letterPaper(entry) {
  const paper = element("article", null, "diary-paper diary-letter");
  const font = useFont(entry.font);
  paper.dataset.paper = entry.paper;
  paper.dataset.font = entry.font;
  paper.style.setProperty("--diary-family", `"${font.family}"`);
  if (entry.paper === "botanical") addWatermarks(paper);
  paper.append(
    element("h3", titleOf(entry)),
    element("p", entry.body, "diary-letter-body")
  );
  return paper;
}

export function createHouseDiary({ supabase, nameOf, status, today }) {
  const $ = (id) => document.getElementById(id);
  const composer = $("diary-compose");
  const reader = $("diary-reader");
  const houseContent = $("house-content");
  const titleInput = $("diary-title");
  const bodyInput = $("diary-body");
  const deliveryInput = $("diary-delivery-date");
  const deliverySeconds = $("diary-delivery-seconds");
  const musicInput = $("diary-music-file");
  const musicToggle = $("diary-music-toggle");
  const musicStatus = $("diary-music-status");
  const envelopeStage = $("diary-envelope-stage");
  const bouquet = createDiaryBouquet($("diary-opening-bouquet"), () => $("house").classList.contains("effects-running"));
  const openEnvelope = $("diary-open-envelope");
  const envelopeArtwork = $("diary-envelope-art");
  const readerScroll = $("diary-reader-scroll");
  const readerContents = $("diary-reader-content");
  const preview = $("diary-compose-preview");
  const list = $("diary-list");
  const latest = $("diary-latest");
  const steps = Array.from(composer.querySelectorAll("[data-diary-step]"));
  const audienceInputs = Array.from(composer.querySelectorAll('input[name="visibility"]'));
  const deliveryModes = Array.from(composer.querySelectorAll('input[name="delivery"]'));
  const filterButtons = Array.from(document.querySelectorAll("[data-diary-filter]"));
  const choices = [];
  const paperObserver = new ResizeObserver((entries) => {
    for (const { target } of entries) {
      const layer = target.querySelector(".diary-paper-watermarks");
      const rowHeight = parseFloat(getComputedStyle(layer).gridAutoRows);
      const count = Math.max(1, Math.ceil(layer.clientHeight / rowHeight));
      while (layer.childElementCount > count) layer.lastElementChild.remove();
      while (layer.childElementCount < count) layer.append(element("span", null, "diary-paper-flowers"));
    }
  });
  let userId, draft, readerEntry, readerId;
  let readerTrack;
  let readerOpener, readerScrollTop;
  let readerSession = 0;
  let step = 0;
  let page = 0;
  let filter = "all";
  let homeRequest = 0;
  let listRequest = 0;
  let readerRequest = 0;
  let deliveryRequest = 0;
  let deliveryTimer, incomingId, markedReaderId;
  let deliverySchema, supportsDeliveryTime = false;
  let saving = false;
  let deleting = false;

  function updateStorageNotice(error) {
    if (!error || storageMissing(error)) $("diary-storage-notice").hidden = !error;
  }

  function diaryQuery(columns = summaries) {
    return supabase.from(table).select(supportsDeliveryTime ? `${columns},delivery_at` : columns);
  }

  function byNewest(query) {
    return query.order("created_at", { ascending: false }).order("id", { ascending: false });
  }

  async function loadEntry(id) {
    await deliverySchema;
    const result = await diaryQuery(`${details},music_path`).eq("id", id).maybeSingle();
    if (result.error?.code !== "42703") return result;
    return diaryQuery(details).eq("id", id).maybeSingle();
  }

  function replacePaper(container, ...nodes) {
    const selector = '.diary-letter[data-paper="botanical"]';
    const previous = container.querySelector(selector);
    if (previous) paperObserver.unobserve(previous);
    container.replaceChildren(...nodes);
    const paper = container.querySelector(selector);
    if (paper) paperObserver.observe(paper);
  }

  function isPending(entry) {
    return Date.parse(deliveryInstant(entry)) > Date.now();
  }

  function deliveryLabel(instant) {
    const date = new Date(instant);
    const day = calendarDate.format(date);
    return supportsDeliveryTime ? `${day} ${beijingInputValue(date).slice(11)}（北京时间）` : day;
  }

  function entryMetadata(entry) {
    const author = entry.author_id === userId ? "我" : nameOf(entry.author_id);
    const date = calendarDate.format(new Date(entry.created_at));
    const instant = deliveryInstant(entry);
    const delivery = instant
      ? ` · ${isPending(entry) ? "待投递" : "已投递"} ${deliveryLabel(instant)}`
      : "";
    return `${visibilityLabel(entry.visibility)} · ${author} · ${date}${delivery}`;
  }

  function entryButton(entry, compact = false) {
    const button = element("button", null, compact ? "diary-compact-entry" : "diary-entry");
    button.type = "button";
    button.dataset.diaryId = entry.id;
    const copy = element("span", null, "diary-entry-copy");
    copy.append(element("strong", titleOf(entry)));
    if (!compact) copy.append(element("small", entryMetadata(entry)));
    button.append(envelopeArt(entry.envelope, entry.seal), copy);
    button.addEventListener("click", () => void openEntry(entry.id, button));
    return button;
  }

  async function refreshHome() {
    if (!userId) return;
    const request = ++homeRequest;
    try {
      await deliverySchema;
      if (request !== homeRequest) return;
      const [shared, own] = await Promise.all([
        byNewest(diaryQuery().eq("visibility", "shared")).limit(1).maybeSingle(),
        byNewest(diaryQuery().eq("visibility", "private").eq("author_id", userId)).limit(1).maybeSingle()
      ]);
      if (request !== homeRequest) return;
      if (shared.error || own.error) throw shared.error ?? own.error;
      const sharedLabel = shared.data && isPending(shared.data) ? "待投递" : "最新公开";
      const rows = [[shared.data, sharedLabel], [own.data, "我的私密"]].map(([entry, label]) => {
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
      await deliverySchema;
      if (request !== listRequest) return;
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

  function renderIncoming(delivery) {
    incomingId = delivery?.id;
    const count = delivery?.unread_count ?? 0;
    const badge = $("diary-unread");
    badge.textContent = count || "";
    badge.hidden = !count;
    $("diary-incoming").hidden = !count;
    $("diary-incoming-status").textContent = count ? `你有 ${count} 封新信` : "";
    const link = $("diary-link");
    if (count) link.setAttribute("aria-label", `时光信箱，${count} 封新信`);
    else link.removeAttribute("aria-label");
  }

  async function refreshDeliveries({ refreshEntries = false } = {}) {
    if (!userId) return;
    const request = ++deliveryRequest;
    const { data, error } = await supabase.rpc("house_diary_unread_deliveries").maybeSingle();
    if (request !== deliveryRequest || error) return;
    const changed = data?.id !== incomingId ||
      String(data?.unread_count ?? "") !== $("diary-unread").textContent;
    if (!changed) return;
    renderIncoming(data);
    if (refreshEntries) {
      void refreshHome();
      void refreshList();
    }
  }

  async function markDeliveryRead(entry, request) {
    const recipient = userId;
    const { error } = await supabase.rpc("house_diary_mark_delivery_read", { p_id: entry.id });
    if (error || userId !== recipient) return;
    if (request === readerRequest) markedReaderId = entry.id;
    void refreshDeliveries();
  }

  function refresh() {
    void refreshHome();
    void refreshList();
    void refreshDeliveries();
  }

  function syncReaderMusic() {
    const active = Boolean(readerTrack?.requested);
    const label = active ? "停止背景音乐" : "播放背景音乐";
    musicToggle.hidden = !readerTrack || reader.dataset.phase !== "letter";
    musicToggle.setAttribute("aria-pressed", String(active));
    musicToggle.setAttribute("aria-label", label);
    musicToggle.title = label;
  }

  function stopReaderMusic(track) {
    track.requested = false;
    ++track.request;
    if (track.source) {
      track.source.onended = null;
      track.source.stop();
      track.source.disconnect();
      track.source = null;
    }
    syncReaderMusic();
  }

  function downloadTrack(track) {
    track.file ??= supabase.storage.from(musicBucket).download(track.path)
      .then(({ data }) => data, () => null);
    return track.file;
  }

  function setReaderTrack(path) {
    if (path === readerTrack?.path) return;
    if (readerTrack) {
      stopReaderMusic(readerTrack);
      void readerTrack.context?.close().catch(() => {});
    }
    readerTrack = path ? { path, requested: false, request: 0 } : null;
    if (readerTrack) void downloadTrack(readerTrack);
    musicStatus.textContent = "";
    syncReaderMusic();
  }

  async function wakeTrack(track) {
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContext) throw new Error("audio_unavailable");
    track.context ??= new AudioContext();
    await track.context.resume();
    return track.context;
  }

  function decodeTrack(track, context) {
    track.buffer ??= downloadTrack(track).then(async (file) => {
      if (!file) throw new Error("audio_download_failed");
      return context.decodeAudioData(await file.arrayBuffer());
    });
    return track.buffer;
  }

  async function playReaderMusic() {
    const track = readerTrack;
    if (!track || track.requested || reader.dataset.phase !== "letter") return;
    track.requested = true;
    const request = ++track.request;
    musicStatus.textContent = "";
    syncReaderMusic();
    try {
      const context = await wakeTrack(track);
      if (track !== readerTrack || request !== track.request) return;
      const buffer = await decodeTrack(track, context);
      if (track !== readerTrack || request !== track.request) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = () => {
        source.disconnect();
        track.source = null;
        track.requested = false;
        if (track === readerTrack) syncReaderMusic();
      };
      source.start();
      track.source = source;
    } catch {
      if (track !== readerTrack || request !== track.request) return;
      track.requested = false;
      track.buffer = null;
      track.file = null;
      musicStatus.textContent = "背景音乐暂时无法播放，请点音符重试。";
      syncReaderMusic();
    }
  }

  function setReaderPhase(phase) {
    reader.dataset.phase = phase;
    const opened = phase === "letter";
    envelopeStage.hidden = opened;
    readerScroll.hidden = !opened;
    syncReaderMusic();
  }

  function renderLetter(entry) {
    replacePaper(readerContents, letterPaper(entry));
    $("diary-edit").hidden = entry.author_id !== userId;
    $("diary-delete").hidden = entry.author_id !== userId;
  }

  function renderReader(entry) {
    const firstLoad = !readerEntry;
    readerEntry = entry;
    $("diary-reader-status").textContent = "";
    setReaderTrack(entry.music_path || undefined);
    if (reader.dataset.phase === "letter") {
      renderLetter(entry);
    } else if (reader.dataset.phase === "sealed") {
      const cover = envelopeArt(entry.envelope, entry.seal);
      const sheet = element("span", null, "diary-paper diary-opening-sheet");
      sheet.dataset.paper = entry.paper;
      cover.append(sheet, element("span", null, "diary-opening-fold"));
      envelopeArtwork.replaceChildren(cover);
      openEnvelope.hidden = false;
      if (firstLoad && document.activeElement === $("diary-close-reader")) openEnvelope.focus();
    }
  }

  function clearReader(message = "", phase = "sealed") {
    bouquet.stop();
    readerEntry = null;
    $("diary-reader-status").textContent = message;
    setReaderPhase(phase);
    openEnvelope.hidden = true;
    openEnvelope.disabled = false;
    envelopeArtwork.replaceChildren();
    replacePaper(readerContents);
    setReaderTrack(undefined);
    $("diary-edit").hidden = true;
    $("diary-delete").hidden = true;
  }

  function showReaderError(message) {
    clearReader(message, reader.dataset.phase === "letter" ? "letter" : "sealed");
  }

  function markOpenedDiary(entry, request) {
    if (reader.dataset.phase === "letter" && deliveryInstant(entry) && entry.author_id !== userId && markedReaderId !== entry.id) {
      void markDeliveryRead(entry, request);
    }
  }

  async function readCurrent() {
    const request = ++readerRequest;
    try {
      const { data, error } = await loadEntry(readerId);
      if (request !== readerRequest) return;
      if (error) throw error;
      if (!data) {
        showReaderError("这封日记已删除或目前不可见。");
        return;
      }
      if (data.version !== readerEntry?.version) renderReader(data);
      markOpenedDiary(data, request);
    } catch (error) {
      if (request === readerRequest) showReaderError(messageFor(error, "这封日记暂时打不开，请关闭后重试。"));
    }
  }

  function openEntry(id, opener) {
    if (!userId || reader.open) return;
    ++readerSession;
    readerId = id;
    readerOpener = opener;
    readerScrollTop = houseContent.scrollTop;
    clearReader("正在取信…");
    void bouquet.preload();
    reader.show();
    houseContent.scrollTop = 0;
    return readCurrent();
  }

  async function revealLetter() {
    if (!readerEntry || reader.dataset.phase !== "sealed") return;
    const session = readerSession;
    const track = readerTrack;
    // Prepare sound inside the tap so playback can begin as soon as the paper appears.
    if (track) {
      void wakeTrack(track).then((context) => {
        if (track === readerTrack) return decodeTrack(track, context);
      }).catch(() => {});
    }
    setReaderPhase("opening");
    openEnvelope.disabled = true;
    $("diary-close-reader").focus({ preventScroll: true });
    const sheet = envelopeArtwork.querySelector(".diary-opening-sheet");
    const animations = sheet?.getAnimations?.() ?? [];
    await Promise.allSettled([...animations.map((animation) => animation.finished), bouquet.play()]);
    if (session !== readerSession || !readerEntry || reader.dataset.phase !== "opening") return;
    renderLetter(readerEntry);
    setReaderPhase("letter");
    houseContent.scrollTop = 0;
    const heading = readerContents.querySelector("h3");
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    markOpenedDiary(readerEntry, readerRequest);
    void playReaderMusic();
  }

  function closeReader(restoreFocus = true) {
    if (!reader.open) return false;
    ++readerSession;
    ++readerRequest;
    readerId = null;
    markedReaderId = null;
    reader.close();
    clearReader();
    if (restoreFocus) {
      const target = readerOpener?.getClientRects().length ? readerOpener : houseContent;
      target.focus({ preventScroll: true });
      houseContent.scrollTop = readerScrollTop;
    }
    readerOpener = null;
    return true;
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
    if (key === "botanical") addWatermarks(sample);
    return sample;
  });
  addChoices("diary-seal-choices", "seal", Object.fromEntries(Object.entries(seals).map(([key, seal]) => [key, seal.name])), wax);
  for (const [key, font] of Object.entries(fonts)) {
    addChoices(font.art ? "diary-font-art" : "diary-font-standard", "font", { [key]: font.name });
  }

  function updateSelections() {
    for (const { button, field, key } of choices) button.setAttribute("aria-pressed", String(draft[field] === key));
    for (const input of audienceInputs) input.checked = input.value === draft.visibility;
    updateDeliveryOptions();
  }

  function firstDeliveryDate() {
    const day = new Date(`${today()}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + 1);
    return day.toISOString().slice(0, 10);
  }

  function readDeliveryInput() {
    if (!deliveryInput.value) return null;
    if (!supportsDeliveryTime) return deliveryInstant({ delivery_on: deliveryInput.value });
    if (!deliverySeconds.validity.valid) return null;
    const seconds = String(deliverySeconds.valueAsNumber).padStart(2, "0");
    const instant = Date.parse(`${deliveryInput.value.slice(0, 16)}:${seconds}+08:00`);
    return Number.isFinite(instant) ? new Date(instant).toISOString() : null;
  }

  function updateDeliveryOptions() {
    const shared = draft.visibility === "shared";
    const showOptions = shared && draft.deliveryEditable;
    const scheduled = showOptions && draft.deliveryMode === "scheduled";
    $("diary-cancel-delivery").hidden = !shared || !(Date.parse(draft.originalDeliveryAt) > Date.now());
    $("diary-delivery-options").hidden = !showOptions;
    $("diary-delivery-date-field").hidden = !scheduled;
    deliveryInput.min = supportsDeliveryTime ? beijingInputValue(new Date()).slice(0, 16) : firstDeliveryDate();
    for (const input of deliveryModes) input.checked = input.value === draft.deliveryMode;

    let summary = "私密日记 · 只有你自己能看见。";
    if (shared) {
      if (scheduled) {
        summary = draft.deliveryAt
          ? `将在 ${deliveryLabel(draft.deliveryAt)}投递给另一位住客。`
          : "选好投递时间后，信件会在预约时间送达。";
      } else if (!showOptions && draft.deliveryAt) {
        summary = `已于 ${deliveryLabel(draft.deliveryAt)}投递。`;
      } else {
        summary = "公开日记 · 小屋里的两位住客都能看见。";
      }
    }
    $("diary-audience-summary").textContent = summary;
    $("diary-send").textContent = draft.version != null ? "保存修改" : scheduled ? "定时寄出" : "寄出";
  }

  function renderPreview() {
    preview.hidden = step < 3;
    const nodes = [];
    if (step >= 4) nodes.push(envelopeArt(draft.envelope, draft.seal));
    if (step >= 3 && step !== 4) nodes.push(letterPaper(draft));
    replacePaper(preview, ...nodes);
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

  async function openComposer(entry) {
    await deliverySchema;
    if (!userId || composer.open) return;
    draft = entry ? { ...entry, originalVisibility: entry.visibility } : {
      id: crypto.randomUUID(), ...defaultStyles, title: "", body: ""
    };
    draft.deliveryAt = deliveryInstant(entry);
    draft.originalDeliveryAt = draft.deliveryAt;
    draft.music_path = draft.music_path ?? null;
    draft.originalMusicPath = draft.music_path;
    draft.deliveryMode = draft.deliveryAt ? "scheduled" : "now";
    draft.deliveryEditable = entry?.visibility !== "shared" || isPending(entry);
    draft.initial = editable.map((field) => draft[field]);
    titleInput.value = draft.title;
    bodyInput.value = draft.body;
    const localDelivery = draft.deliveryAt ? beijingInputValue(new Date(draft.deliveryAt)) : "";
    deliveryInput.value = localDelivery.slice(0, supportsDeliveryTime ? 16 : 10);
    deliverySeconds.value = localDelivery.slice(17) || "0";
    musicInput.value = "";
    updateMusicSelection();
    $("diary-compose-title").textContent = entry ? "编辑日记" : "写日记";
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
    return draft.deliveryMode !== (draft.originalDeliveryAt ? "scheduled" : "now") ||
      draft.deliveryAt !== draft.originalDeliveryAt ||
      draft.music_path !== draft.originalMusicPath ||
      editable.some((field, index) => draft[field] !== draft.initial[index]);
  }

  function closeComposer(force = false, saved = false) {
    if (!force && (saving || (draftChanged() && !confirm("放弃这次修改？")))) return;
    if (!saved && draft?.musicUpload?.attempted) void removeMusic(draft.music_path);
    draft = null;
    titleInput.value = "";
    bodyInput.value = "";
    musicInput.value = "";
    replacePaper(preview);
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

  function updateMusicSelection(message) {
    $("diary-music-selection").textContent = message ??
      (draft.musicUpload?.file.name ?? (draft.music_path ? "已有配乐。选择新文件可替换。" : ""));
    $("diary-remove-music").hidden = !draft.music_path;
  }

  async function removeMusic(path) {
    if (!path) return;
    const { error } = await supabase.storage.from(musicBucket).remove([path]);
    if (error) console.warn("Diary music cleanup failed", error.code ?? error.name);
  }

  function clearDraftUpload() {
    if (draft.musicUpload?.attempted) void removeMusic(draft.music_path);
    draft.musicUpload = null;
  }

  async function ensureMusicUploaded(entry) {
    const upload = entry.musicUpload;
    if (!upload) return;
    const bucket = supabase.storage.from(musicBucket);
    upload.attempted = true;
    const data = upload.file.slice(0, upload.file.size, upload.type);
    const result = await bucket.upload(entry.music_path, data, { cacheControl: "0" });
    if (result.error && !(await bucket.exists(entry.music_path)).data) {
      throw new Error("diary_music_upload");
    }
  }

  async function storeDiary(entry, payload) {
    const change = entry.version == null
      ? supabase.from(table).insert({ id: entry.id, ...payload })
      : supabase.from(table).update(payload).eq("id", entry.id).eq("version", entry.version);
    const { data, error } = await change.select("id").maybeSingle();
    if (!error && data) return;

    // A request can reach the database even if its response never reaches the browser.
    const existing = await loadEntry(entry.id);
    if (!existing.error && existing.data && Object.entries(payload).every(([field, value]) => (
      (field === "delivery_at" ? deliveryInstant(existing.data) : existing.data[field]) === value
    ))) return;
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
    const scheduled = entry.visibility === "shared" && entry.deliveryMode === "scheduled";
    const deliveryAt = scheduled ? entry.deliveryAt : null;
    if (scheduled && supportsDeliveryTime && !deliverySeconds.validity.valid) {
      $("diary-compose-status").textContent = "秒数请输入 0 到 59 之间的整数。";
      deliverySeconds.focus();
      return;
    }
    if (scheduled && (!deliveryAt || (deliveryAt !== entry.originalDeliveryAt &&
        (Date.parse(deliveryAt) <= Date.now() || !deliveryInput.validity.valid)))) {
      $("diary-compose-status").textContent = supportsDeliveryTime
        ? "请选择晚于当前时间的北京时间。"
        : "请选择北京时间明天或之后的日期。";
      deliveryInput.focus();
      return;
    }
    if (editing && entry.originalVisibility === "private" && entry.visibility === "shared" &&
        !confirm(deliveryAt
          ? `将这篇私密日记设为公开，并于 ${deliveryLabel(deliveryAt)}投递？`
          : "将这篇私密日记设为公开？另一位住客也能看到正文。")) return;

    const payload = Object.fromEntries(editable.map((field) => [field, entry[field]]));
    payload.title = payload.title.trim();
    if (supportsDeliveryTime) payload.delivery_at = deliveryAt;
    else payload.delivery_on = deliveryAt ? deliveryInput.value : null;
    if (entry.music_path !== entry.originalMusicPath) payload.music_path = entry.music_path;
    saving = true;
    const buttons = ["diary-send", "diary-back", "diary-cancel", "diary-review-visibility", "diary-cancel-delivery"].map($);
    buttons.forEach((button) => { button.disabled = true; });
    $("diary-delivery-options").disabled = true;
    $("diary-music-options").disabled = true;
    deliveryInput.disabled = true;
    deliverySeconds.disabled = true;
    $("diary-compose-status").textContent = editing ? "正在保存…" : "正在寄出…";
    try {
      if (entry.musicUpload) {
        $("diary-compose-status").textContent = "正在上传背景音乐…";
        await ensureMusicUploaded(entry);
        if (draft !== entry) {
          void removeMusic(entry.music_path);
          return;
        }
        $("diary-compose-status").textContent = editing ? "正在保存…" : "正在寄出…";
      }
      await storeDiary(entry, payload);
      if (entry.originalMusicPath !== entry.music_path) void removeMusic(entry.originalMusicPath);
      if (draft !== entry) return;
      updateStorageNotice();
      closeComposer(true, true);
      page = 0;
      refresh();
      status(Date.parse(deliveryAt) > Date.now()
        ? `已预约于 ${deliveryLabel(deliveryAt)}投递。`
        : editing ? "日记修改已保存。" : "日记已寄出。");
    } catch (error) {
      if (draft !== entry) return;
      updateStorageNotice(error);
      const saveErrors = {
        diary_conflict: "日记已在其他窗口修改或删除。你可以复制当前内容，再重新打开最新的日记。",
        diary_delivery_date_invalid: "所选投递时间已到，请重新选择。",
        diary_already_delivered: "这封信已经投递，请重新打开日记后修改。",
        diary_music_upload: "背景音乐上传失败。文件和草稿已保留，可以重试。",
        diary_music_missing: "配乐暂时无法关联，请重新选择文件后重试。"
      };
      $("diary-compose-status").textContent = saveErrors[error.message] ??
        (storageMissing(error) ? "日记存储尚未启用，草稿已保留。存储启用后可以重试。"
          : "暂时没有保存成功，输入已保留，可以重试。");
    } finally {
      saving = false;
      buttons.forEach((button) => { button.disabled = false; });
      $("diary-delivery-options").disabled = false;
      $("diary-music-options").disabled = false;
      deliveryInput.disabled = false;
      deliverySeconds.disabled = false;
    }
  }

  async function deleteEntry() {
    const entry = readerEntry;
    if (!entry || entry.author_id !== userId || deleting || !confirm("删除这篇日记？删除后无法恢复。")) return;
    deleting = true;
    const actions = [$("diary-delete"), $("diary-edit"), $("diary-close-reader")];
    actions.forEach((button) => { button.disabled = true; });
    try {
      const columns = Object.hasOwn(entry, "music_path") ? "id,music_path" : "id";
      const { data, error } = await supabase.from(table).delete().eq("id", entry.id).select(columns).maybeSingle();
      if (error) throw error;
      void removeMusic(data?.music_path);
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

  $("diary-write").addEventListener("click", () => void openComposer());
  $("diary-retry").addEventListener("click", () => refresh());
  $("diary-open-incoming").addEventListener("click", (event) => {
    if (incomingId) void openEntry(incomingId, event.currentTarget);
  });
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
  for (const input of deliveryModes) {
    input.addEventListener("change", () => {
      draft.deliveryMode = input.value;
      $("diary-compose-status").textContent = "";
      updateDeliveryOptions();
    });
  }
  for (const input of [deliveryInput, deliverySeconds]) {
    input.addEventListener("input", () => {
      draft.deliveryAt = readDeliveryInput();
      $("diary-compose-status").textContent = "";
      updateDeliveryOptions();
    });
  }
  musicInput.addEventListener("change", () => {
    const file = musicInput.files[0];
    if (!file) return;
    const type = musicTypes.get(file.name.split(".").pop().toLowerCase());
    if (!type || file.size === 0 || file.size > musicLimit) {
      musicInput.value = "";
      const retained = draft.music_path ? "原配乐已保留。" : "";
      updateMusicSelection(`请选择不超过 10 MB 的 MP3、M4A 或 WAV 文件。${retained}`);
      return;
    }
    clearDraftUpload();
    draft.musicUpload = { file, type };
    draft.music_path = `${userId}/${draft.id}/${crypto.randomUUID()}`;
    updateMusicSelection();
  });
  $("diary-remove-music").addEventListener("click", () => {
    clearDraftUpload();
    draft.music_path = null;
    musicInput.value = "";
    updateMusicSelection("已移除配乐。");
    musicInput.focus();
  });
  musicToggle.addEventListener("click", () => {
    if (readerTrack?.requested) stopReaderMusic(readerTrack);
    else void playReaderMusic();
  });
  bodyInput.addEventListener("input", updateCount);
  $("diary-back").addEventListener("click", () => { syncText(); showStep(step - 1); });
  $("diary-next").addEventListener("click", () => {
    if (step !== 2 || validateWriting()) showStep(step + 1);
  });
  $("diary-review-visibility").addEventListener("click", () => showStep(0));
  $("diary-cancel-delivery").addEventListener("click", () => {
    draft.visibility = "private";
    updateSelections();
    $("diary-compose-status").textContent = "保存修改后，这封信将仅自己可见。";
    $("diary-send").focus();
  });
  $("diary-compose-form").addEventListener("submit", sendDiary);
  $("diary-cancel").addEventListener("click", () => closeComposer());
  composer.addEventListener("cancel", (event) => { event.preventDefault(); closeComposer(); });
  $("diary-close-reader").addEventListener("click", () => closeReader());
  openEnvelope.addEventListener("click", () => void revealLetter());
  reader.addEventListener("cancel", (event) => { event.preventDefault(); if (!deleting) closeReader(); });
  reader.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !deleting) {
      event.preventDefault();
      closeReader();
    }
  });
  $("diary-edit").addEventListener("click", () => {
    const entry = readerEntry;
    if (entry?.author_id !== userId) return;
    closeReader();
    void openComposer(entry);
  });
  $("diary-delete").addEventListener("click", deleteEntry);
  window.addEventListener("focus", () => {
    if (!userId) return;
    refresh();
    if (readerId) void readCurrent();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && userId) refresh();
  });
  window.addEventListener("beforeunload", (event) => {
    if (draftChanged()) {
      event.preventDefault();
      event.returnValue = true;
    }
  });

  return {
    connect(id) {
      userId = id;
      deliverySchema ??= supabase.from(table).select("delivery_at").limit(0).then(({ error }) => {
        supportsDeliveryTime = !error;
        if (supportsDeliveryTime) return;
        $("diary-scheduled-label").textContent = "选择日期";
        $("diary-delivery-label").textContent = "投递日期（北京时间 00:00）";
        $("diary-delivery-seconds-field").hidden = true;
        deliveryInput.type = "date";
        deliveryInput.max = "9999-12-31";
      });
      refresh();
      clearInterval(deliveryTimer);
      deliveryTimer = setInterval(() => {
        if (!document.hidden) void refreshDeliveries({ refreshEntries: true });
      }, deliveryRefreshMs);
    },
    leaveReader() { return closeReader(false); },
    refreshList,
    refreshMailbox() {
      void refreshList();
      void refreshDeliveries();
    },
    disconnect() {
      userId = null;
      ++homeRequest;
      ++listRequest;
      ++deliveryRequest;
      clearInterval(deliveryTimer);
      renderIncoming(null);
      updateStorageNotice();
      closeComposer(true);
      closeReader(false);
      latest.replaceChildren();
      list.replaceChildren();
    }
  };
}
