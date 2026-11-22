const plates = [
  {
    file: "./flowers/flower-stock.webp", columns: 1, aspect: "1",
    entries: [
      ["stock", "紫罗兰", "Stock", "#bda1d6", "紫色小花沿直立的花茎成串开放，花瓣略带波纹，有淡淡香气。"]
    ]
  },
  {
    file: "./flowers/flower-plate.webp", columns: 2, aspect: "3 / 2",
    entries: [
      ["rose", "玫瑰", "Rose", "#e7afba", "层叠的花瓣从花心向外舒展，有些品种带有淡香。"],
      ["tulip", "郁金香", "Tulip", "#f2af8f", "杯形花朵立在直挺的花茎上，常在春天开放。"],
      ["hydrangea", "绣球", "Hydrangea", "#bdaddf", "许多小花聚成饱满的花球，常见粉、蓝和白色。"],
      ["sunflower", "向日葵", "Sunflower", "#f4c479", "金黄的舌状花围着花盘，中央是密集的小花。"]
    ]
  },
  {
    file: "./flowers/flower-spring.webp", columns: 3, aspect: "1",
    entries: [
      ["peony", "牡丹", "Peony", "#e6a3b8", "宽阔的花瓣一层层展开，盛开的花朵饱满而柔软。"],
      ["lily", "百合", "Lily", "#e4dbb9", "舒展的白色花被向外翻卷，露出细长的花蕊。"],
      ["iris", "鸢尾", "Iris", "#c7a7e1", "花被片有的向上直立，有的垂下，轮廓错落。"],
      ["cherry", "樱花", "Cherry blossom", "#edb4c6", "淡粉色的小花沿细枝成簇开放，是春天常见的花景。"],
      ["daffodil", "洋水仙", "Daffodil", "#ebc66f", "黄色花瓣中央伸出小喇叭状的副花冠。"],
      ["lavender", "薰衣草", "Lavender", "#bbabd7", "紫色小花沿茎顶排成细长的花穗，带有草本香气。"]
    ]
  },
  {
    file: "./flowers/flower-garden.webp", columns: 3, aspect: "1",
    entries: [
      ["dahlia", "大丽花", "Dahlia", "#edac94", "花瓣从中心一圈圈排开，有些品种像紧实的绒球。"],
      ["camellia", "山茶花", "Camellia", "#df9a9d", "浓红或柔粉的花朵衬着有光泽的深色叶片。"],
      ["orchid", "蝴蝶兰", "Moth orchid", "#cba6db", "一朵朵花沿弯曲的花梗开放，轮廓像展翅的蝴蝶。"],
      ["calla", "马蹄莲", "Calla lily", "#e6d9b6", "乳白色苞片卷成漏斗，里面立着淡黄色花序。"],
      ["poppy", "虞美人", "Corn poppy", "#eba795", "薄薄的花瓣围成杯形，微风吹过时会轻轻颤动。"],
      ["cosmos", "波斯菊", "Cosmos", "#e7afc5", "白色或粉色的花瓣绕着金黄花心，细叶像羽毛。"]
    ]
  },
  {
    file: "./flowers/flower-meadow.webp", columns: 3, aspect: "1",
    entries: [
      ["daisy", "雏菊", "Daisy", "#e6d6a3", "白色小花瓣围成一圈，中间是一团明亮的黄色。"],
      ["mimosa", "银荆", "Silver wattle", "#eec779", "细碎的羽状叶之间，缀着成簇的金黄色小绒球。"],
      ["carnation", "康乃馨", "Carnation", "#ecadba", "花瓣边缘像剪碎的蕾丝，叠在一起形成柔软的花朵。"],
      ["clematis", "铁线莲", "Clematis", "#b7a0d3", "宽大的紫色花被片向四周张开，衬出浅色花蕊。"],
      ["wisteria", "紫藤", "Wisteria", "#c5ace1", "淡紫小花沿长长的花序垂下，像一串串花铃。"],
      ["calendula", "金盏花", "Calendula", "#edb780", "金橙色花瓣朝外舒展，开成一个明亮的圆盘。"]
    ]
  }
];
const flowers = plates.flatMap(({ file, columns, aspect, entries }) => {
  const rows = Math.ceil(entries.length / columns);
  return entries.map(([key, name, english, tint, description], tile) => ({
    key, name, english, tint, description, file, aspect,
    size: `${columns * 100}% ${rows * 100}%`,
    position: `${(tile % columns) * 100 / Math.max(1, columns - 1)}% ${Math.floor(tile / columns) * 100 / Math.max(1, rows - 1)}%`
  }));
});

const preferenceKey = "little-sheep-house-effects";
const rotationDelay = 10000;

export function createHouseEffects(house, reducedMotion) {
  const frameTemplate = house.querySelector("#flower-frame-template");
  const cards = Array.from(house.querySelectorAll(".flower-card"), (card) => {
    const art = card.querySelector(".flower-art");
    art.append(frameTemplate.content.cloneNode(true), frameTemplate.content.cloneNode(true));
    return {
      frames: Array.from(art.children),
      copy: card.querySelector(".flower-copy"),
      name: card.querySelector("h2"),
      english: card.querySelector("[lang=en]"),
      description: card.querySelector(".flower-copy p")
    };
  });
  const toggle = house.querySelector("#effects-toggle");
  const announcement = house.querySelector("#flower-announcement");
  let paused = false;
  try {
    paused = localStorage.getItem(preferenceKey) === "paused";
  } catch {
    // Motion still works when the browser blocks preference storage.
  }
  let visible = false;
  let timer;
  let current = 0;
  let frameIndex = 0;
  let platesRequested = false;

  function renderFlowers() {
    cards.forEach((card, side) => {
      const offset = side * Math.floor(flowers.length / 2);
      const flower = flowers[(current + offset) % flowers.length];
      const frame = card.frames[frameIndex];
      frame.dataset.flower = flower.key;
      frame.style.setProperty("--flower-sheet", `url("${flower.file}")`);
      frame.style.setProperty("--flower-size", flower.size);
      frame.style.setProperty("--flower-position", flower.position);
      frame.style.setProperty("--flower-aspect", flower.aspect);
      frame.style.setProperty("--flower-tint", flower.tint);
      card.frames[1 - frameIndex].classList.remove("is-current");
      frame.classList.add("is-current");
      card.name.textContent = flower.name;
      card.english.textContent = flower.english;
      card.description.textContent = flower.description;
    });
  }

  function advance(step) {
    current = (current + step + flowers.length) % flowers.length;
    frameIndex = 1 - frameIndex;
    renderFlowers();
    if (house.classList.contains("effects-running")) {
      for (const { copy } of cards) {
        copy.getAnimations?.().forEach((animation) => animation.cancel());
        copy.animate?.([
          { opacity: .55, transform: "translateY(5px)" },
          { opacity: 1, transform: "translateY(0)" }
        ], { duration: 600, easing: "ease-out" });
      }
    }
  }

  function syncMotion() {
    const running = visible && !document.hidden && !paused && !reducedMotion.matches;
    house.classList.toggle("effects-running", running);
    toggle.hidden = reducedMotion.matches;
    toggle.textContent = paused ? "开启动效" : "暂停动效";
    clearInterval(timer);
    if (running) timer = setInterval(() => advance(1), rotationDelay);
  }

  toggle.addEventListener("click", () => {
    paused = !paused;
    try {
      localStorage.setItem(preferenceKey, paused ? "paused" : "playing");
    } catch {
      // The setting will still apply until this page closes.
    }
    syncMotion();
  });

  for (const button of house.querySelectorAll("[data-flower-step]")) {
    button.addEventListener("click", () => {
      advance(Number(button.dataset.flowerStep));
      const card = button.closest(".flower-card");
      announcement.textContent = `${card.querySelector("h2").textContent}。 ${card.querySelector(".flower-copy p").textContent}`;
      syncMotion();
    });
  }

  reducedMotion.addEventListener("change", syncMotion);
  document.addEventListener("visibilitychange", syncMotion);
  renderFlowers();
  return {
    setVisible(value) {
      visible = value;
      if (visible && !platesRequested) {
        platesRequested = true;
        for (const { file } of plates) {
          const image = new Image();
          image.src = file;
        }
      }
      syncMotion();
    }
  };
}
