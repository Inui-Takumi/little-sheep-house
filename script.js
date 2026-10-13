"use strict";

const personalContent = {
  memories: [
    { title: "送你回家的路", text: "高中放学后，我送你回家。走在你身边时，总觉得那段路可以再长一点。到了该道别的地方，话明明已经说完，心里却还想多陪你走几步。后来想起那段路，最先浮现的，还是身边有你的感觉。" },
    { title: "在走廊寻找你的身影", text: "高一的课间，我常走到教室走廊，朝教学楼的方向望去。像是在随意看风景，其实心里只想在人群里找到你的身影。等到真的望见你，普通的课间也会悄悄亮起来。" }
  ],
  careLine: "希望你工作顺利，身体健康。"
};

const scenes = [...document.querySelectorAll(".scene")];
const counter = document.getElementById("step-counter");
const backButton = document.getElementById("back-button");
const envelope = document.getElementById("envelope");
const overlay = document.getElementById("meter-overlay");
const teaseButton = document.getElementById("tease-button");
const quizFootnote = document.getElementById("quiz-footnote");
const backgroundMusic = document.getElementById("background-music");
const musicToggle = document.getElementById("music-toggle");
const coverMusicHint = document.getElementById("cover-music-hint");
const coverOpenLabel = document.getElementById("cover-open-label");
const albumPhoto = document.getElementById("album-photo");
const albumFrame = document.getElementById("album-frame");
const albumPage = document.getElementById("album-page");
const albumTitle = document.getElementById("album-caption-title");
const albumText = document.getElementById("album-caption-text");
const albumThumbnails = document.getElementById("album-thumbnails");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const lambVideos = [...document.querySelectorAll("[data-lamb-video]")];
const albumPhotos = [
  { file: "sky-01.jpg", alt: "夜色中的两位角色与闪烁的光点", title: "夜里的光", caption: "光点把夜色点亮，也把这一刻留在心里。" },
  { file: "sky-02.jpg", alt: "夜色里相对而立的两位角色", title: "刚好的距离", caption: "靠近一点，世界仿佛就安静了一点。" },
  { file: "sky-03.jpg", alt: "蓝色星空下的一位角色", title: "蓝色的停顿", caption: "在很蓝很蓝的天空下，替你收藏一点宁静。" },
  { file: "sky-04.jpg", alt: "粉橘色晚霞前的一位角色", title: "黄昏寄来", caption: "云被晚霞染红，像一封慢慢展开的情书。" },
  { file: "sky-05.jpg", alt: "蓝色星空下仰望的一位角色", title: "抬头的时候", caption: "星星还没说话，想念已经先到。" },
  { file: "sky-06.jpg", alt: "晚霞与夕阳前并肩的两位角色", title: "最后一束光", caption: "日落之前，想把并肩的画面好好收起来。" }
];
let currentStep = 0;
let albumIndex = 0;
let coverOpening = false;
let prankRunning = false;
let teaseCount = 0;
let musicPausedByVisitor = false;
let musicRequest = 0;

personalContent.memories.forEach((memory, index) => {
  document.getElementById(`memory-title-${index + 1}`).textContent = memory.title;
  document.getElementById(`memory-text-${index + 1}`).textContent = memory.text;
});
document.getElementById("personal-care-line").textContent = personalContent.careLine;

backgroundMusic.volume = 0.38;
const hasMusicSource = () => Boolean(backgroundMusic.getAttribute("src"));
function updateMusicControl() {
  const playing = !backgroundMusic.paused;
  musicToggle.classList.toggle("is-playing", playing);
  musicToggle.setAttribute("aria-pressed", String(playing));
  musicToggle.setAttribute("aria-label", playing ? "暂停背景音乐" : "播放背景音乐");
  musicToggle.title = playing ? "暂停背景音乐" : "播放背景音乐";
  if (playing) {
    musicToggle.classList.remove("is-awaiting");
    coverMusicHint.classList.remove("is-music-awaiting");
    coverOpenLabel.textContent = "拆开这封信";
    coverMusicHint.textContent = "往后每一页，都等你亲手打开";
  }
}

async function tryPlayMusic() {
  if (musicPausedByVisitor || !hasMusicSource()) return;
  const request = ++musicRequest;
  try {
    await backgroundMusic.play();
    if (request === musicRequest) updateMusicControl();
  } catch (error) {
    if (request !== musicRequest || musicPausedByVisitor) return;
    musicToggle.classList.add("is-awaiting");
    coverMusicHint.classList.add("is-music-awaiting");
    coverMusicHint.textContent = error.name === "NotAllowedError"
      ? "如果音乐没有响起，点右上角音符 ♫"
      : "音乐暂时没响，点右上角音符再试试";
    updateMusicControl();
  }
}

backgroundMusic.addEventListener("play", updateMusicControl);
backgroundMusic.addEventListener("pause", updateMusicControl);
if (hasMusicSource()) {
  musicToggle.hidden = false;
  void tryPlayMusic();
  window.addEventListener("pageshow", () => { if (backgroundMusic.paused) void tryPlayMusic(); });
  if (/MicroMessenger/i.test(navigator.userAgent)) {
    document.addEventListener("WeixinJSBridgeReady", () => { void tryPlayMusic(); }, { once: true });
    if (window.WeixinJSBridge) void tryPlayMusic();
  }
}
document.addEventListener("click", (event) => {
  if (event.target.closest("#music-toggle")) return;
  if (backgroundMusic.paused && !musicPausedByVisitor) void tryPlayMusic();
}, { capture: true });
musicToggle.addEventListener("click", () => {
  if (!backgroundMusic.paused) {
    musicPausedByVisitor = true;
    musicRequest++;
    backgroundMusic.pause();
    musicToggle.classList.remove("is-awaiting");
    coverMusicHint.classList.remove("is-music-awaiting");
    coverOpenLabel.textContent = "拆开这封信";
    coverMusicHint.textContent = "往后每一页，都等你亲手打开";
    return;
  }
  musicPausedByVisitor = false;
  void tryPlayMusic();
});

function syncSceneVideos() {
  lambVideos.forEach((video) => {
    const active = !video.closest(".scene").hidden && !document.hidden && !reduceMotion.matches;
    if (active) void video.play().catch(() => {});
    else video.pause();
  });
}
reduceMotion.addEventListener?.("change", syncSceneVideos);
document.addEventListener("visibilitychange", syncSceneVideos);
function showAlbumPhoto(index) {
  albumIndex = (index + albumPhotos.length) % albumPhotos.length;
  const photo = albumPhotos[albumIndex];
  albumPhoto.src = `./photos/${photo.file}`;
  albumPhoto.alt = photo.alt;
  albumPage.textContent = `${String(albumIndex + 1).padStart(2, "0")} / ${String(albumPhotos.length).padStart(2, "0")}`;
  albumTitle.textContent = photo.title;
  albumText.textContent = photo.caption;
  albumFrame.classList.remove("is-turning");
  void albumFrame.offsetWidth;
  albumFrame.classList.add("is-turning");
  [...albumThumbnails.children].forEach((button, buttonIndex) => {
    button.setAttribute("aria-pressed", String(buttonIndex === albumIndex));
  });
}

albumPhotos.forEach((photo, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "album-thumb";
  button.setAttribute("aria-label", `查看第 ${index + 1} 张照片：${photo.title}`);
  button.setAttribute("aria-pressed", String(index === 0));
  const image = document.createElement("img");
  image.src = `./photos/${photo.file}`;
  image.alt = "";
  image.loading = "lazy";
  button.append(image);
  button.addEventListener("click", () => showAlbumPhoto(index));
  albumThumbnails.append(button);
});
document.getElementById("album-prev").addEventListener("click", () => showAlbumPhoto(albumIndex - 1));
document.getElementById("album-next").addEventListener("click", () => showAlbumPhoto(albumIndex + 1));
albumPhoto.addEventListener("click", () => showAlbumPhoto(albumIndex + 1));
document.getElementById("album-secret").addEventListener("click", (event) => {
  const button = event.currentTarget;
  const expanded = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!expanded));
  document.getElementById("album-secret-note").hidden = expanded;
  button.innerHTML = expanded
    ? '这里好像还藏了一张照片 <span aria-hidden="true">♡</span>'
    : '哎呀，被你发现啦 <span aria-hidden="true">♡</span>';
});

function showStep(step, updateHistory = true) {
  if (step < 0 || step >= scenes.length) return;
  scenes.forEach((scene, index) => {
    scene.hidden = index !== step;
    scene.classList.toggle("is-active", index === step);
  });
  syncSceneVideos();
  currentStep = step;
  counter.textContent = `${String(step + 1).padStart(2, "0")} / ${String(scenes.length).padStart(2, "0")}`;
  counter.setAttribute("aria-label", `第 ${step + 1} 页，共 ${scenes.length} 页`);
  backButton.hidden = step === 0;
  if (updateHistory) history.pushState({ step }, "", location.href);
  window.scrollTo({ top: 0, behavior: "auto" });
  const title = scenes[step].querySelector("h1, h2");
  if (title) {
    title.setAttribute("tabindex", "-1");
    title.focus({ preventScroll: true });
  }
  if (step === 0) {
    coverOpening = false;
    envelope.classList.remove("is-opening");
  }
}

history.replaceState({ step: 0 }, "", location.href);
syncSceneVideos();
window.addEventListener("popstate", (event) => {
  const step = Number.isInteger(event.state?.step) ? event.state.step : 0;
  showStep(step, false);
});

document.querySelectorAll("[data-next]").forEach((button) => {
  button.addEventListener("click", () => {
    if (currentStep === 0) {
      if (coverOpening) return;
      coverOpening = true;
      envelope.classList.add("is-opening");
      window.setTimeout(() => showStep(1), reduceMotion.matches ? 30 : 500);
      return;
    }
    showStep(currentStep + 1);
  });
});

backButton.addEventListener("click", () => history.back());
document.getElementById("replay-button").addEventListener("click", () => showStep(0));

document.querySelectorAll(".memory-toggle").forEach((button) => {
  button.addEventListener("click", () => {
    const expanded = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!expanded));
    document.getElementById(button.getAttribute("aria-controls")).hidden = expanded;
  });
});

document.querySelectorAll(".care-card").forEach((button) => {
  button.addEventListener("click", () => {
    button.setAttribute("aria-expanded", String(button.getAttribute("aria-expanded") !== "true"));
  });
});

function revealFinale() {
  if (prankRunning) return;
  prankRunning = true;
  overlay.hidden = false;
  window.setTimeout(() => {
    overlay.hidden = true;
    prankRunning = false;
    showStep(6);
  }, reduceMotion.matches ? 800 : 1700);
}

document.querySelector("[data-reveal]").addEventListener("click", revealFinale);
teaseButton.addEventListener("click", () => {
  if (teaseCount === 0) {
    teaseCount = 1;
    teaseButton.classList.add("is-dodging");
    teaseButton.innerHTML = '哎呀，没抓到 <span aria-hidden="true">♡</span>';
    quizFootnote.textContent = "逗你玩的，再点一下就好。";
    window.setTimeout(() => teaseButton.classList.remove("is-dodging"), 550);
    return;
  }
  revealFinale();
});
