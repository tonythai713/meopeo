// Grand Tino au-dessus du calendrier : une animation en boucle dans un disque « lune » (classe .bt-moon).
// L'animation est soit une planche d'images (sprite : grille cols × rows, n images, fps), soit une image (GIF, WebP animé…).
// Une vidéo n'est jamais jouée telle quelle (sur iPhone en mode économie d'énergie, une vidéo ne démarre pas toute seule) :
// videoToSprite() la transforme en planche JPEG. La planche par défaut (art/big-tino.jpg) a été faite ainsi,
// depuis la petite vidéo de Tino « HƠI CHÁN! » dessinée pour l'app (10 images, 9 par seconde).
// Le décor (disque lune, halo, flottement) n'est que du CSS : facile à changer si on le veut plus simple.

// fit : recadrage dans le disque (le dessin d'origine est en bas de l'image : on le remonte et on l'agrandit un peu)
export const DEFAULT_ANIM = { kind: "sprite", url: "art/big-tino.jpg", n: 10, cols: 4, rows: 3, fps: 9, fit: "scale(1.16) translate(3%, -10%)" };

const STYLE = `
.bt-stage { display: grid; grid-template-columns: minmax(260px, 2fr) minmax(0, 3fr); gap: 16px; margin: -6px 0 6px; pointer-events: none; }
@media (max-width: 760px) { .bt-stage { grid-template-columns: 1fr; margin: -2px 0 8px; } }
.bt-slot { grid-column: -2; display: flex; justify-content: center; }
.bt-moon { position: relative; width: 136px; height: 136px; min-height: 0; padding: 0; border: 0; border-radius: 50%; overflow: hidden;
  background: #fffdf6; pointer-events: auto; cursor: pointer; -webkit-tap-highlight-color: transparent;
  box-shadow: 0 0 0 3px rgba(255, 248, 220, 0.55), 0 0 26px 6px rgba(255, 232, 163, 0.42), 0 0 70px 18px rgba(255, 232, 163, 0.16);
  animation: bt-float 5.5s ease-in-out infinite; }
.bt-moon:hover { background: #fffdf6; }
@media (max-width: 760px) { .bt-moon { width: 112px; height: 112px; } }
.bt-frame, .bt-moon img { position: absolute; inset: 0; width: 100%; height: 100%; display: block; background-repeat: no-repeat; object-fit: cover; }
.bt-moon.bt-boing { animation: bt-boing 0.5s ease-out, bt-float 5.5s ease-in-out infinite; }
@keyframes bt-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
@keyframes bt-boing { 0% { transform: scale(1); } 30% { transform: scale(1.08, 0.92); } 60% { transform: scale(0.96, 1.05); } 100% { transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { .bt-moon, .bt-moon.bt-boing { animation: none; } }
`;

function injectStyle() {
  if (document.getElementById("bt-style")) return;
  const s = document.createElement("style");
  s.id = "bt-style";
  s.textContent = STYLE;
  document.head.append(s);
}

// La scène : à remettre dans la page après chaque réaffichage (elle garde son animation, son image, son minuteur)
export function createBigTino({ onTap = () => {} } = {}) {
  injectStyle();
  const el = document.createElement("div");
  el.className = "bt-stage";
  el.innerHTML = `<div class="bt-slot"><button type="button" class="bt-moon" title="Tino" aria-label="Tino"><div class="bt-frame"></div></button></div>`;
  const moon = el.querySelector(".bt-moon"), frame = el.querySelector(".bt-frame");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  let anim = null, timer = 0, t0 = performance.now(), last = -1;

  // Image affichée = fonction du temps (pas d'animation CSS : rien ne repart à zéro quand la page se réaffiche)
  function tick() {
    clearTimeout(timer);
    timer = 0;
    if (anim?.kind !== "sprite") return;
    const still = reduce.matches || document.hidden;
    const i = still ? 0 : Math.floor(((performance.now() - t0) / 1000) * anim.fps) % anim.n;
    if (i !== last) {
      last = i;
      const c = i % anim.cols, r = Math.floor(i / anim.cols);
      frame.style.backgroundPosition = `${anim.cols > 1 ? (c / (anim.cols - 1)) * 100 : 0}% ${anim.rows > 1 ? (r / (anim.rows - 1)) * 100 : 0}%`;
    }
    if (!still && el.isConnected) timer = setTimeout(tick, 1000 / anim.fps);
  }
  const wake = () => { if (!document.hidden) tick(); };
  document.addEventListener("visibilitychange", wake);
  reduce.addEventListener?.("change", tick);

  moon.addEventListener("click", () => {
    moon.classList.remove("bt-boing");
    void moon.offsetWidth;
    moon.classList.add("bt-boing");
    onTap();
  });

  return {
    el,
    // { kind: "sprite", url, n, cols, rows, fps } ou { kind: "image", url }
    set(a) {
      anim = a;
      last = -1;
      t0 = performance.now();
      moon.querySelector("img")?.remove();
      frame.hidden = a?.kind !== "sprite";
      if (a?.kind === "sprite") {
        frame.style.backgroundImage = `url("${a.url}")`;
        frame.style.backgroundSize = `${a.cols * 100}% ${a.rows * 100}%`;
        frame.style.transform = a.fit ?? "";
      } else if (a?.kind === "image") {
        const img = document.createElement("img");
        img.alt = "";
        img.src = a.url;
        moon.append(img);
      }
      tick();
    },
    // À appeler après l'avoir remise dans la page
    resume() { tick(); },
  };
}

// ---------- Vidéo → planche d'images (fait sur l'appareil, rien n'est envoyé avant la fin) ----------
// La vidéo est jouée une fois, sans le son ; les images sont copiées au fil de la lecture (carré central, `size` px),
// pas plus souvent que maxFrames / durée par seconde (10 s → 9 images par seconde ; vidéo courte → jusqu'à 30).
// Au plus maxSeconds secondes (la suite est ignorée). Résultat : JPEG (≤ ~9,5 Mo) + description.
export async function videoToSprite(src, { size = 240, maxFrames = 90, maxSeconds = 10, onProgress = () => {} } = {}) {
  const url = typeof src === "string" ? src : URL.createObjectURL(src);
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto";
  v.setAttribute("muted", ""); v.setAttribute("playsinline", "");
  // Dans la page mais invisible : sur iPhone, une vidéo hors de la page ne charge pas toujours ses images
  v.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-1";
  document.body.append(v);
  v.src = url;
  try {
    // Seulement la description (l'iPhone ne charge les images qu'à la lecture) ; jamais d'attente sans fin
    await new Promise((ok, ko) => {
      const t = setTimeout(() => ko(new Error("this video took too long to open — try a shorter one, or a GIF")), 15000);
      v.addEventListener("loadedmetadata", () => { clearTimeout(t); ok(); }, { once: true });
      v.addEventListener("error", () => { clearTimeout(t); ko(new Error("this video can't be read on this device — try another file (MP4 or MOV), or a GIF")); }, { once: true });
    });
    const vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh) throw new Error("this video has no picture");
    const end = Math.min(Number.isFinite(v.duration) ? v.duration : maxSeconds, maxSeconds);
    const m = Math.min(vw, vh), sx = (vw - m) / 2, sy = (vh - m) / 2;
    const shots = [];
    const grab = (t) => {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      c.getContext("2d").drawImage(v, sx, sy, m, m, 0, 0, size, size);
      shots.push({ t, c });
      onProgress(Math.min(1, t / end));
    };
    // Lecture : une copie par nouvelle image (requestVideoFrameCallback), sinon à chaque changement de position,
    // espacées d'au moins `step` secondes (le rythme de la vidéo est gardé, même avec des pauses)
    const step = 1 / Math.min(30, maxFrames / Math.max(end, 0.1)) - 0.004;
    await new Promise((ok, ko) => {
      let done = false, lastT = -Infinity;
      const finish = () => { if (done) return; done = true; v.pause(); clearTimeout(guard); ok(); };
      const guard = setTimeout(finish, end * 1000 + 8000); // une vidéo qui cale ne bloque pas tout
      v.addEventListener("ended", finish, { once: true });
      const onFrame = (t) => {
        if (done) return;
        if (t - lastT >= step && t <= end + 1e-3) { lastT = t; grab(t); }
        if (t >= end - 1e-3) finish();
      };
      if ("requestVideoFrameCallback" in v) {
        const cb = (_now, meta) => { onFrame(meta.mediaTime); if (!done) v.requestVideoFrameCallback(cb); };
        v.requestVideoFrameCallback(cb);
      } else {
        const loop = () => { onFrame(v.currentTime); if (!done) requestAnimationFrame(loop); };
        requestAnimationFrame(loop);
      }
      v.currentTime = 0;
      v.play().catch(() => { done = true; clearTimeout(guard); ko(new Error("the phone stopped the video (Low Power Mode, or MeoPeo went to the background) — try again with Low Power Mode off, or use a GIF")); });
    });
    let frames = shots;
    if (!frames.length) throw new Error("couldn't read any image from this video");
    const span = frames.length > 1 ? frames[frames.length - 1].t - frames[0].t : 1;
    let fps = frames.length > 1 ? (frames.length - 1) / span : 1;
    if (frames.length > maxFrames) {
      const k = frames.length / maxFrames;
      frames = Array.from({ length: maxFrames }, (_, i) => frames[Math.floor(i * k)]);
      fps /= k;
    }
    fps = Math.max(1, Math.min(30, Math.round(fps * 10) / 10));
    // Planche en grille (≤ 4096 px de côté), en JPEG (Safari ne sait pas écrire de WebP)
    const n = frames.length, cols = Math.min(Math.ceil(Math.sqrt(n)), Math.floor(4096 / size)), rows = Math.ceil(n / cols);
    const sheet = document.createElement("canvas");
    sheet.width = cols * size; sheet.height = rows * size;
    const g = sheet.getContext("2d");
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, sheet.width, sheet.height);
    frames.forEach((f, i) => g.drawImage(f.c, (i % cols) * size, Math.floor(i / cols) * size));
    // Qualité baissée si le fichier dépasse ~9,5 Mo (le stockage accepte 10 Mo au plus, voir 09_tino_10mo.sql)
    let blob = null;
    for (const quality of [0.86, 0.72, 0.58]) {
      blob = await new Promise((ok) => sheet.toBlob(ok, "image/jpeg", quality));
      if (!blob || blob.type !== "image/jpeg") throw new Error("this browser couldn't save the animation");
      if (blob.size <= 9.5 * 1024 * 1024) break;
    }
    return { blob, meta: { kind: "sprite", n, cols, rows, fps } };
  } finally {
    v.removeAttribute("src");
    v.load();
    v.remove();
    if (typeof src !== "string") URL.revokeObjectURL(url);
  }
}
