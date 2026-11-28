const envelopeLead = 420;
const fullyRevealedAt = 4050;
const bouquetHold = 1450;
const fadeOut = 650;
const duration = fullyRevealedAt + bouquetHold + fadeOut;
const openingTimeScale = 1.35;
const imagePath = "./flowers/flower-diary-bouquet.webp";
const colors = {
  rose: ["#c75861", "#f7898c", "#ffb2b6", "#ffe8df"],
  violet: ["#aa79ab", "#d896d6", "#edbbef", "#fae4ff"],
  cream: ["#b58a69", "#e8c0a0", "#ffe1bc", "#fff5df"],
  foliage: ["#756043", "#a18361", "#c79874", "#edc69b"]
};
const backdropStops = [
  [0, [117, 61, 50], [240, 192, 176]],
  [.53, [74, 38, 34], [197, 139, 125]],
  [1, [43, 22, 23], [133, 78, 70]]
];
const flashes = [
  [1880, .38, .60], [2130, .66, .48], [2380, .28, .49], [2630, .67, .23],
  [2880, .32, .28], [3130, .59, .41], [3380, .76, .57]
];

function randomSource(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function loadBouquet() {
  const image = new Image();
  image.src = imagePath;
  return image.decode().then(() => {
    const aspect = image.naturalWidth / image.naturalHeight;
    const sample = document.createElement("canvas");
    sample.width = 240;
    sample.height = Math.round(sample.width / aspect);
    const context = sample.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, sample.width, sample.height);
    const { data } = context.getImageData(0, 0, sample.width, sample.height);
    const random = randomSource(1807);
    const dots = [];
    for (let y = 0; y < sample.height; y += 2) {
      for (let x = 0; x < sample.width; x += 2) {
        const index = (y * sample.width + x) * 4;
        if (data[index + 3] < 188) continue;
        const red = data[index], green = data[index + 1], blue = data[index + 2];
        let palette = colors.foliage;
        if (red > green + 16 && red > blue + 13) palette = colors.rose;
        else if (blue > green + 9 && red > green + 7) palette = colors.violet;
        else if (red > 150 && green > 135 && blue > 105) palette = colors.cream;
        if (random() > (palette === colors.foliage ? .5 : .75)) continue;
        const depth = random();
        const across = x / sample.width;
        const rise = 1 - y / sample.height;
        // Curve each layer and light its center before its edges.
        const arch = .10 * Math.sin(Math.PI * across);
        const layer = Math.min(3, Math.floor(4 * (rise + arch)));
        dots.push({
          x: (x + random() * 2) / sample.width,
          y: (y + random() * 2) / sample.height,
          delay: 630 + layer * 510 + Math.abs(across - .5) * 220 + random() * 195,
          color: palette[Math.floor(depth * palette.length)],
          depth,
          phase: random() * 2 * Math.PI
        });
      }
    }
    return { image, dots, aspect };
  }).catch(() => null);
}

const clamp = (value) => Math.min(1, Math.max(0, value));

export function createDiaryBouquet(canvas, canAnimate) {
  const context = canvas.getContext("2d");
  const random = randomSource(1128);
  const motes = Array.from({ length: 72 }, () => ({
    x: random(), y: random(), size: .35 + random() * 1.7, phase: random() * Math.PI * 2
  }));
  const wrapDots = Array.from({ length: 365 }, () => ({
    x: random() * 2 - 1, height: random(), shimmer: random() * Math.PI * 2
  }));
  let loading, frame, finish, generation = 0;

  function preload() {
    if (context && canAnimate()) loading ??= loadBouquet();
    return loading;
  }

  function stop() {
    ++generation;
    cancelAnimationFrame(frame);
    frame = null;
    canvas.style.opacity = "0";
    finish?.();
    finish = null;
  }

  function draw({ image, dots, aspect }, time, width, height) {
    const center = width / 2;
    const artWidth = Math.min(width * .92, height * .87 * aspect);
    const artHeight = artWidth / aspect;
    const left = center - artWidth / 2;
    const top = (height - artHeight) / 2;
    const knotX = left + artWidth * .465;
    const knotY = top + artHeight * .737;
    const unit = Math.min(1.5, Math.max(.85, artWidth / 540));
    const bouquetReveal = clamp((time - 3020) / (fullyRevealedAt - 3020));
    const particleOpacity = 1 - bouquetReveal;

    context.globalAlpha = 1;
    const backdrop = context.createRadialGradient(center, height * .38, 0, center, height * .43, Math.max(width * .56, height * .63));
    for (const [offset, start, end] of backdropStops) {
      const rgb = start.map((channel, index) => Math.round(channel + (end[index] - channel) * bouquetReveal));
      backdrop.addColorStop(offset, `rgb(${rgb.join(",")})`);
    }
    context.fillStyle = backdrop;
    context.fillRect(0, 0, width, height);

    context.fillStyle = "#ffc5a6";
    for (const mote of motes) {
      context.globalAlpha = (.12 + .10 * Math.sin(time / 350 + mote.phase)) * clamp((time - 350) / 800) * particleOpacity;
      const y = ((mote.y - time * .000045 + 1) % 1) * height;
      const x = mote.x * width + Math.sin(time / 800 + mote.phase) * 7;
      context.fillRect(x, y, mote.size * unit, mote.size * unit);
    }

    const wrapHeight = artHeight * .48;
    const wrapping = clamp(time / 620);
    context.fillStyle = "#efb2a3";
    for (const dot of wrapDots) {
      if (dot.height > wrapping) continue;
      const spread = dot.height ** .76 * artWidth * .47;
      const opacity = .12 + .1 * Math.sin(time / 270 + dot.shimmer);
      context.globalAlpha = opacity * (.6 + dot.height * .4) * particleOpacity;
      context.fillRect(knotX + dot.x * spread, knotY - dot.height * wrapHeight, unit, unit);
    }

    context.globalAlpha = .14 * clamp((time - 2140) / 820) + .86 * bouquetReveal;
    context.drawImage(image, left, top, artWidth, artHeight);
    for (const dot of dots) {
      const progress = clamp((time - dot.delay) / 465);
      if (!progress) continue;
      const arrival = 1 - (1 - progress) ** 3;
      const x = left + dot.x * artWidth;
      const y = top + dot.y * artHeight;
      const sparkle = .53 + .47 * Math.sin(time / (dot.depth > .82 ? 110 : 210) + dot.phase);
      const size = (.56 + dot.depth * 1.38) * unit;
      context.globalAlpha = arrival * (.28 + .72 * sparkle) * particleOpacity;
      context.fillStyle = dot.color;
      context.fillRect(x + (knotX - x) * .31 * (1 - arrival), y + (knotY - y) * .38 * (1 - arrival), size, size);
    }

    for (const side of [-1, 1]) {
      for (let i = 0; i <= 115 * wrapping; i++) {
        const t = i / 115;
        const x = knotX + side * (t ** .76 * artWidth * .47 + Math.sin(i * 1.7) * 1.8);
        const y = knotY - t * wrapHeight;
        const highlight = i % 6 === 0;
        context.globalAlpha = (.31 + .29 * Math.sin(i * 3.1 + time / 200)) * particleOpacity;
        context.fillStyle = highlight ? "#ffdbca" : "#e49887";
        context.fillRect(x, y, (highlight ? 1.65 : .95) * unit, unit);
      }
    }

    context.globalAlpha = .91 * clamp((time - 80) / 355) * particleOpacity;
    context.strokeStyle = "#ffd9bb";
    context.lineWidth = unit * 1.35;
    context.beginPath();
    for (const side of [-1, 1]) {
      context.moveTo(knotX, knotY);
      context.bezierCurveTo(knotX + side * 12 * unit, knotY - 16 * unit, knotX + side * 31 * unit, knotY - 3 * unit, knotX, knotY);
      context.quadraticCurveTo(knotX + side * 13 * unit, knotY + 15 * unit, knotX + side * 10 * unit, knotY + 28 * unit);
    }
    context.stroke();

    for (const [start, x, y] of flashes) {
      const progress = (time - start) / 660;
      if (progress <= 0 || progress >= 1) continue;
      const sparkX = left + x * artWidth, sparkY = top + y * artHeight;
      const size = (4 + progress * 32) * unit;
      context.globalAlpha = Math.sin(progress * Math.PI) * .8;
      const glow = context.createRadialGradient(sparkX, sparkY, 0, sparkX, sparkY, size);
      glow.addColorStop(0, "#fff9ed");
      glow.addColorStop(.16, "#ffcedc");
      glow.addColorStop(1, "#ff97b800");
      context.fillStyle = glow;
      context.fillRect(sparkX - size, sparkY - size, size * 2, size * 2);
      context.fillStyle = "#fff3ed";
      context.fillRect(sparkX - unit, sparkY - unit, unit * 2, unit * 2);
    }
    context.globalAlpha = 1;
  }

  async function play() {
    stop();
    const launch = generation;
    const art = await preload();
    if (!art || launch !== generation || !canAnimate()) return;
    const started = performance.now();
    return new Promise((resolve) => {
      finish = resolve;
      let paintedTime;
      function tick(now) {
        const elapsed = (now - started) / openingTimeScale - envelopeLead;
        if (elapsed >= duration || !canAnimate()) {
          stop();
          return;
        }
        frame = requestAnimationFrame(tick);
        if (elapsed < 0) return;
        const width = canvas.clientWidth, height = canvas.clientHeight;
        const density = Math.min(window.devicePixelRatio || 1, 1.5);
        const pixelsWide = Math.round(width * density), pixelsHigh = Math.round(height * density);
        if (canvas.width !== pixelsWide || canvas.height !== pixelsHigh) {
          canvas.width = pixelsWide;
          canvas.height = pixelsHigh;
          context.setTransform(density, 0, 0, density, 0, 0);
          paintedTime = undefined;
        }
        const sceneTime = Math.min(elapsed, fullyRevealedAt);
        if (paintedTime !== sceneTime) {
          draw(art, sceneTime, width, height);
          paintedTime = sceneTime;
        }
        canvas.style.opacity = String(clamp(elapsed / 310) * clamp((duration - elapsed) / fadeOut));
      }
      frame = requestAnimationFrame(tick);
    });
  }

  return { preload, play, stop };
}
