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
  const { frames, fps } = await videoFrames(src, { size, maxFrames, maxSeconds, onProgress });
  // Planche en grille (≤ 4096 px de côté), en JPEG (Safari ne sait pas écrire de WebP)
  const n = frames.length, cols = Math.min(Math.ceil(Math.sqrt(n)), Math.floor(4096 / size)), rows = Math.ceil(n / cols);
  const sheet = document.createElement("canvas");
  sheet.width = cols * size; sheet.height = rows * size;
  const g = sheet.getContext("2d");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, sheet.width, sheet.height);
  frames.forEach((c, i) => g.drawImage(c, (i % cols) * size, Math.floor(i / cols) * size));
  frames.forEach(release);
  // Qualité baissée si le fichier dépasse ~9,5 Mo (le stockage accepte 10 Mo au plus, voir 09_tino_10mo.sql)
  let blob = null;
  for (const quality of [0.86, 0.72, 0.58]) {
    blob = await new Promise((ok) => sheet.toBlob(ok, "image/jpeg", quality));
    if (!blob || blob.type !== "image/jpeg") throw new Error("this browser couldn't save the animation");
    if (blob.size <= 9.5 * 1024 * 1024) break;
  }
  release(sheet);
  return { blob, meta: { kind: "sprite", n, cols, rows, fps } };
}
// Un canevas dont on n'a plus besoin : sa mémoire est rendue tout de suite (l'iPhone en a peu pour les canevas)
const release = (c) => { c.width = c.height = 0; };

// Les images d'une vidéo (carré central, size × size), copiées pendant une lecture : { frames: [canevas], fps }.
// square : la vidéo doit être carrée (à 1 % près, comme le modèle des tenues), sinon erreur avant la lecture.
export async function videoFrames(src, { size = 240, maxFrames = 90, maxSeconds = 10, square = false, onProgress = () => {} } = {}) {
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
    if (square && Math.abs(vw - vh) > Math.max(2, vw * 0.01)) throw new Error(`the video must be square, like the template (this one is ${vw} × ${vh})`);
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
      // Deux sources ensemble : requestVideoFrameCallback (chaque image présentée à l'écran) et, une fois la lecture partie,
      // une copie toutes les 25 ms (si les images ne sont pas présentées — page pas vraiment affichée —, ou plus après
      // quelques-unes) ; l'écart minimal `step` évite les doublons
      if ("requestVideoFrameCallback" in v) {
        const cb = (_now, meta) => { onFrame(meta.mediaTime); if (!done) v.requestVideoFrameCallback(cb); };
        v.requestVideoFrameCallback(cb);
      }
      v.currentTime = 0;
      v.play().then(() => {
        const id = setInterval(() => { if (done) clearInterval(id); else if (v.readyState >= 2) onFrame(v.currentTime); }, 25);
      }).catch(() => { done = true; clearTimeout(guard); ko(new Error("the phone stopped the video (Low Power Mode, or MeoPeo went to the background) — try again with Low Power Mode off, or use a GIF")); });
    });
    let frames = shots;
    if (!frames.length) throw new Error("couldn't read any image from this video");
    const span = frames.length > 1 ? frames[frames.length - 1].t - frames[0].t : 1;
    let fps = frames.length > 1 ? (frames.length - 1) / span : 1;
    if (frames.length > maxFrames) {
      const k = frames.length / maxFrames;
      const kept = new Set(Array.from({ length: maxFrames }, (_, i) => Math.floor(i * k)));
      frames.forEach((f, i) => { if (!kept.has(i)) release(f.c); });
      frames = [...kept].map((i) => frames[i]);
      fps /= k;
    }
    fps = Math.max(1, Math.min(30, Math.round(fps * 10) / 10));
    return { frames: frames.map((f) => f.c), fps };
  } finally {
    v.removeAttribute("src");
    v.load();
    v.remove();
    if (typeof src !== "string") URL.revokeObjectURL(url);
  }
}

// ---------- Tenues animées du petit Tino : GIF ou vidéo → planche PNG transparente (fait sur l'appareil) ----------
// Une tenue animée = une planche d'images carrées (size px, avec une marge de 2 px autour de chacune : cell = size + 4),
// lue en boucle à fps images par seconde (mascot.js : wear). Un GIF est décodé ici (décodeur ci-dessous), une vidéo est
// lue une fois (videoFrames). Ce qui n'est pas transparent (une vidéo n'a pas de transparence) : le fond uni qui touche
// les bords est retiré (keyBackground).

// PNG animé (APNG) ou WebP animé : un canevas n'en garderait que la première image → on les refuse (GIF ou vidéo à la place)
export async function isAnimatedImage(file) {
  const b = new Uint8Array(await file.slice(0, 1 << 20).arrayBuffer());
  const tag = (p) => String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);
  if (b[0] === 0x89 && tag(1).startsWith("PNG")) {
    for (let p = 8; p + 8 <= b.length;) {
      const len = ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0, type = tag(p + 4);
      if (type === "acTL") return true;
      if (type === "IDAT") return false;
      p += 12 + len;
    }
    return false;
  }
  return tag(0) === "RIFF" && tag(8) === "WEBP" && tag(12) === "VP8X" && !!(b[20] & 0x02);
}

// Décodeur GIF : lit la structure (palettes, délais, transparence, élimination, entrelacement) ; les images restent
// compressées jusqu'à gifComposite (un GIF de 1500 × 1500 × 90 images ne tiendrait pas en mémoire décompressé).
export function decodeGif(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let p = 0;
  const u16 = () => { const v = b[p] | (b[p + 1] << 8); p += 2; return v; };
  const sig = String.fromCharCode(...b.subarray(0, 6));
  if (sig !== "GIF89a" && sig !== "GIF87a") throw new Error("this file isn't a GIF");
  p = 6;
  const W = u16(), H = u16(), flags = b[p++];
  p += 2; // couleur de fond, proportions
  let gct = null;
  if (flags & 0x80) { const n = 2 << (flags & 7); gct = b.subarray(p, p + 3 * n); p += 3 * n; }
  const subBlocks = () => { // données en blocs de 255 octets au plus, terminées par un bloc vide
    const parts = []; let len = 0, total = 0;
    while (p < b.length && (len = b[p++])) { parts.push(b.subarray(p, p + len)); total += len; p += len; }
    const out = new Uint8Array(total); let o = 0;
    for (const x of parts) { out.set(x, o); o += x.length; }
    return out;
  };
  const frames = [];
  let gce = null;
  while (p < b.length) {
    const t = b[p++];
    if (t === 0x3b) break; // fin du fichier
    if (t === 0x21) { // extension
      const label = b[p++];
      if (label === 0xf9) { const pf = b[p + 1]; gce = { delay: b[p + 2] | (b[p + 3] << 8), disposal: (pf >> 2) & 7, trans: pf & 1 ? b[p + 4] : -1 }; }
      subBlocks();
      continue;
    }
    if (t !== 0x2c) { if (frames.length) break; throw new Error("this GIF is damaged"); } // (des octets en trop après la dernière image : ignorés)
    const x = u16(), y = u16(), w = u16(), h = u16(), lf = b[p++];
    let ct = gct;
    if (lf & 0x80) { const n = 2 << (lf & 7); ct = b.subarray(p, p + 3 * n); p += 3 * n; }
    const minCode = b[p++];
    if (!ct || minCode < 2 || minCode > 11) throw new Error("this GIF is damaged");
    frames.push({ x, y, w, h, ct, minCode, data: subBlocks(), interlaced: !!(lf & 0x40), delay: gce?.delay ?? 0, disposal: gce?.disposal ?? 0, trans: gce?.trans ?? -1 });
    gce = null;
  }
  if (!W || !H || !frames.length) throw new Error("this GIF has no picture");
  return { W, H, frames };
}

// Rend la main au navigateur un instant (par un message : pas ralenti comme setTimeout quand on l'enchaîne)
const breathe = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => { ch.port1.close(); r(); }; ch.port2.postMessage(0); });

// Décompression LZW d'une image GIF → npix indices de couleur
function lzw(data, minCode, npix) {
  const out = new Uint8Array(npix), clear = 1 << minCode, eoi = clear + 1;
  const pre = new Int16Array(4096), suf = new Uint8Array(4096), stack = new Uint8Array(4097);
  for (let i = 0; i < clear; i++) suf[i] = i;
  let size = minCode + 1, mask = (1 << size) - 1, next = eoi + 1, old = -1, first = 0, acc = 0, bits = 0, ip = 0, op = 0;
  while (op < npix) {
    while (bits < size) { if (ip >= data.length) return out; acc |= data[ip++] << bits; bits += 8; }
    const code = acc & mask;
    acc >>>= size; bits -= size;
    if (code === clear) { size = minCode + 1; mask = (1 << size) - 1; next = eoi + 1; old = -1; continue; }
    if (code === eoi) break;
    if (old === -1) { if (code >= clear) return out; out[op++] = code; old = first = code; continue; }
    let c = code, sp = 0;
    if (code >= next) { stack[sp++] = first; c = old; } // code pas encore connu : « ancien + sa première couleur »
    while (c > eoi) { stack[sp++] = suf[c]; c = pre[c]; }
    if (c >= clear) return out; // (fichier abîmé)
    stack[sp++] = c;
    first = c;
    while (sp && op < npix) out[op++] = stack[--sp];
    if (next < 4096) { pre[next] = old; suf[next] = first; next++; if (next === mask + 1 && size < 12) { size++; mask = (1 << size) - 1; } }
    old = code;
  }
  return out;
}

// Images successives du GIF, composées comme dans un navigateur (transparence, élimination 2 = effacer, 3 = revenir à
// l'image d'avant) : appelle onFrame(rgba, i) — rgba (W × H × 4) est réutilisé, à copier tout de suite si besoin.
// Rend la main au navigateur entre les images (l'écran et le message d'avancement se mettent à jour) ; count : les
// count premières images seulement
export async function gifComposite(gif, onFrame, count = gif.frames.length) {
  const { W, H } = gif, frames = gif.frames.slice(0, count), buf = new Uint8ClampedArray(W * H * 4);
  let saved = null, i = -1, last = performance.now();
  for (const f of frames) {
    i++;
    if (performance.now() - last > 40) { await breathe(); last = performance.now(); }
    if (f.disposal === 3) saved = buf.slice();
    const idx = lzw(f.data, f.minCode, f.w * f.h), ct = f.ct, ncol = ct.length / 3;
    const rows = f.interlaced ? [[0, 8], [4, 8], [2, 4], [1, 2]].flatMap(([s, d]) => { const r = []; for (let y = s; y < f.h; y += d) r.push(y); return r; }) : null;
    for (let k = 0; k < f.h; k++) {
      const y = f.y + (rows ? rows[k] : k);
      if (y >= H) continue;
      for (let j = 0; j < f.w; j++) {
        const x = f.x + j, c = idx[k * f.w + j];
        if (x >= W || c === f.trans || c >= ncol) continue;
        const o = (y * W + x) * 4;
        buf[o] = ct[c * 3]; buf[o + 1] = ct[c * 3 + 1]; buf[o + 2] = ct[c * 3 + 2]; buf[o + 3] = 255;
      }
    }
    onFrame(buf, i);
    if (f.disposal === 2) for (let y = f.y; y < Math.min(H, f.y + f.h); y++) buf.fill(0, (y * W + f.x) * 4, (y * W + Math.min(W, f.x + f.w)) * 4);
    else if (f.disposal === 3 && saved) buf.set(saved);
  }
}

// Les images d'un GIF ramenées à size × size, au rythme du GIF (délai ≤ 1/100 s compté 1/10 s, comme les navigateurs),
// au plus maxSeconds secondes et maxFrames images : { frames: [canevas], fps } (les images d'après ne sont pas décodées)
export async function gifFrames(bytes, { size = 192, maxFrames = 90, maxSeconds = 10, maxPixels = 2048 * 2048, onProgress = () => {} } = {}) {
  const gif = decodeGif(bytes), { W, H } = gif;
  checkSize("GIF", W, H, maxPixels);
  const S = sampler(gif.frames.map((f) => (f.delay <= 1 ? 10 : f.delay) / 100), { size, maxFrames, maxSeconds });
  const work = document.createElement("canvas");
  work.width = W; work.height = H;
  const wg = work.getContext("2d"), img = new ImageData(W, H);
  try {
    await gifComposite(gif, (rgba, i) => {
      onProgress(S.take(i, work, () => { img.data.set(rgba); wg.putImageData(img, 0, 0); }));
    }, S.count);
  } finally { release(work); }
  return { frames: S.out, fps: S.fps };
}
// Animation carrée (à 1 % près, comme le modèle des tenues) et pas trop grande
function checkSize(what, W, H, maxPixels) {
  if (Math.abs(W - H) > Math.max(2, W * 0.01)) throw new Error(`the ${what} must be square, like the template (this one is ${W} × ${H})`);
  if (W * H > maxPixels) throw new Error(`this ${what} is too big (${W} × ${H}) — export it at 1500 × 1500 or smaller`);
}
// Échantillonnage commun (GIF, PNG animé) : delays = durée de chaque image du fichier (s). Rythme = celui du fichier (au
// plus 30 images / s et maxFrames images), maxSeconds secondes au plus : count = les images du fichier qui commencent
// avant (les suivantes ne sont pas décodées). take(i, work, prepare) : l'image i du fichier est sur `work` (prepare l'y
// dessine si une image du résultat tombe pendant elle) → copies size × size dans out ; renvoie l'avancement (0 à 1).
function sampler(delays, { size, maxFrames, maxSeconds }) {
  const starts = [];
  let t = 0;
  for (const d of delays) { starts.push(t); t += d; }
  const end = Math.min(t, maxSeconds), count = starts.filter((s) => s < end - 1e-6).length;
  const fps = Math.min(30, maxFrames / end, 1 / Math.min(...delays.slice(0, count))), n = Math.max(1, Math.min(maxFrames, Math.round(end * fps)));
  const out = [];
  return {
    count, out, fps: Math.round(fps * 100) / 100,
    take(i, work, prepare) {
      const t0 = starts[i], t1 = t0 + delays[i];
      let drawn = false;
      for (let s = out.length; s < n && s / fps < t1 - 1e-6; s++) { // les images du résultat qui tombent pendant celle-ci
        if (s / fps < t0 - 1e-6) continue;
        if (!drawn) { prepare?.(); drawn = true; }
        const c = document.createElement("canvas");
        c.width = c.height = size;
        const g = c.getContext("2d");
        g.imageSmoothingQuality = "high";
        g.drawImage(work, 0, 0, size, size);
        out.push(c);
      }
      return Math.min(1, t1 / end);
    },
  };
}

// PNG animé (APNG, export de Procreate…) → images, comme gifFrames. Chaque image du fichier (fcTL + ses données IDAT /
// fdAT) est remise dans un petit PNG à part (IHDR à sa taille, mêmes PLTE / tRNS… que le fichier, CRC recalculés),
// décodée par le navigateur, puis posée sur l'image de travail selon fcTL : position, mélange 0 = remplace la zone /
// 1 = par-dessus ; après l'image : 0 = rien, 1 = effacer la zone, 2 = revenir à avant (sur la 1re image : effacer).
// Une image IDAT sans fcTL avant elle est l'image fixe de secours : pas dans l'animation.
export async function apngFrames(bytes, { size = 192, maxFrames = 90, maxSeconds = 10, maxPixels = 2048 * 2048, onProgress = () => {} } = {}) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const u32 = (a, p) => ((a[p] << 24) | (a[p + 1] << 16) | (a[p + 2] << 8) | a[p + 3]) >>> 0, u16 = (a, p) => (a[p] << 8) | a[p + 1];
  if (!(b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)) throw new Error("this file isn't a PNG");
  let ihdr = null, cur = null, seenData = false;
  const head = [], all = [];
  for (let p = 8; p + 12 <= b.length;) {
    const len = u32(b, p), type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]), d = b.subarray(p + 8, p + 8 + len);
    p += 12 + len;
    if (type === "IHDR") ihdr = d;
    else if (type === "fcTL" && len >= 26) { cur = { w: u32(d, 4), h: u32(d, 8), x: u32(d, 12), y: u32(d, 16), num: u16(d, 20), den: u16(d, 22), dispose: d[24], blend: d[25], data: [] }; all.push(cur); }
    else if (type === "IDAT") { seenData = true; cur?.data.push(d); }
    else if (type === "fdAT") cur?.data.push(d.subarray(4));
    else if (type === "IEND") break;
    else if (!seenData && type !== "acTL") head.push([type, d]); // PLTE, tRNS, gAMA, sRGB, iCCP… (avant les données)
  }
  if (!ihdr) throw new Error("this PNG is damaged");
  const W = u32(ihdr, 0), H = u32(ihdr, 4), frames = all.filter((f) => f.data.length && f.w && f.h && f.x + f.w <= W && f.y + f.h <= H);
  if (!frames.length) throw new Error("this PNG isn't animated");
  checkSize("animated PNG", W, H, maxPixels);
  const S = sampler(frames.map((f) => { const s = f.num / (f.den || 100); return s <= 0.01 ? 0.1 : s; }), { size, maxFrames, maxSeconds });
  const work = document.createElement("canvas");
  work.width = W; work.height = H;
  const g = work.getContext("2d", { willReadFrequently: true });
  try {
    for (let i = 0; i < S.count; i++) {
      const f = frames[i], ih = ihdr.slice();
      new DataView(ih.buffer).setUint32(0, f.w); new DataView(ih.buffer).setUint32(4, f.h);
      const png = new Blob([PNG_SIG, pngChunk("IHDR", ih), ...head.map(([t, d]) => pngChunk(t, d)), pngChunk("IDAT", concat(f.data)), pngChunk("IEND", new Uint8Array(0))], { type: "image/png" });
      let bmp;
      try { bmp = await createImageBitmap(png); } catch { throw new Error("this animated PNG is damaged"); }
      const before = f.dispose === 2 && i > 0 ? g.getImageData(f.x, f.y, f.w, f.h) : null;
      if (f.blend === 0) g.clearRect(f.x, f.y, f.w, f.h);
      g.drawImage(bmp, f.x, f.y);
      bmp.close();
      onProgress(S.take(i, work));
      if (f.dispose === 1 || (f.dispose === 2 && i === 0)) g.clearRect(f.x, f.y, f.w, f.h);
      else if (before) g.putImageData(before, f.x, f.y);
    }
  } finally { release(work); }
  return { frames: S.out, fps: S.fps };
}
const PNG_SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const concat = (parts) => { const out = new Uint8Array(parts.reduce((n, a) => n + a.length, 0)); let o = 0; for (const a of parts) { out.set(a, o); o += a.length; } return out; };
let CRC = null;
function pngChunk(type, data) { // longueur, type, données, CRC-32 (type + données)
  CRC ??= Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const out = new Uint8Array(12 + data.length), v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  let c = 0xffffffff;
  for (let i = 4; i < 8 + data.length; i++) c = CRC[(c ^ out[i]) & 255] ^ (c >>> 8);
  v.setUint32(8 + data.length, (c ^ 0xffffffff) >>> 0);
  return out;
}

// Fond uni retiré quand les images ne sont pas transparentes (une vidéo, ou un GIF exporté avec son fond) : la couleur la
// plus présente sur le bord est enlevée partout où elle touche le bord (remplissage depuis les bords, tolérance tol),
// sur toutes les images. Renvoie true si un fond a été retiré ; erreur si le fond n'est pas uni ou s'il ne reste rien.
const clearShare = (d) => { let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] < 128) n++; return n / (d.length / 4); };
export function keyBackground(frames, tol = 60) {
  const S = frames[0].width, ctx = (c) => c.getContext("2d", { willReadFrequently: true });
  const d0 = ctx(frames[0]).getImageData(0, 0, S, S).data;
  if (clearShare(d0) >= 0.2) return false; // déjà transparent
  const border = [];
  for (let i = 0; i < S; i++) border.push(i, (S - 1) * S + i, i * S, i * S + S - 1);
  const bin = (d, o) => ((d[o] >> 4) << 8) | ((d[o + 1] >> 4) << 4) | (d[o + 2] >> 4), bins = new Map();
  for (const q of border) { const k = bin(d0, q * 4); bins.set(k, (bins.get(k) ?? 0) + 1); }
  const top = [...bins].sort((a, b) => b[1] - a[1])[0][0], key = [0, 0, 0];
  let m = 0;
  for (const q of border) { const o = q * 4; if (bin(d0, o) === top) { key[0] += d0[o]; key[1] += d0[o + 1]; key[2] += d0[o + 2]; m++; } }
  key.forEach((v, i) => { key[i] = v / m; });
  const near = (d, o) => { const r = d[o] - key[0], g = d[o + 1] - key[1], bl = d[o + 2] - key[2]; return r * r + g * g + bl * bl <= tol * tol; };
  if (border.filter((q) => near(d0, q * 4)).length < border.length * 0.6)
    throw new Error("the background isn't transparent or plain — export with a transparent background (GIF), or on a plain background color you don't use in the drawing");
  const seen = new Uint8Array(S * S), stack = new Int32Array(S * S);
  for (const c of frames) {
    const g = ctx(c), im = g.getImageData(0, 0, S, S), d = im.data;
    seen.fill(0);
    let sp = 0;
    for (const q of border) if (!seen[q] && near(d, q * 4)) { seen[q] = 1; stack[sp++] = q; }
    while (sp) {
      const q = stack[--sp], x = q % S;
      d[q * 4 + 3] = 0;
      for (const r of [x > 0 ? q - 1 : -1, x < S - 1 ? q + 1 : -1, q - S, q + S]) if (r >= 0 && r < S * S && !seen[r] && near(d, r * 4)) { seen[r] = 1; stack[sp++] = r; }
    }
    g.putImageData(im, 0, 0);
  }
  if (clearShare(ctx(frames[0]).getImageData(0, 0, S, S).data) < 0.2) throw new Error("couldn't separate the drawing from its background — export with a transparent background");
  return true;
}

// Planche PNG transparente : { blob, anim: { n, cols, rows, fps, cell, size } }
export async function outfitSheet(frames, fps) {
  const size = frames[0].width, cell = size + 4, n = frames.length;
  const cols = Math.min(Math.ceil(Math.sqrt(n)), Math.floor(4096 / cell)), rows = Math.ceil(n / cols);
  const sheet = document.createElement("canvas");
  sheet.width = cols * cell; sheet.height = rows * cell;
  const g = sheet.getContext("2d");
  frames.forEach((c, i) => g.drawImage(c, (i % cols) * cell + 2, Math.floor(i / cols) * cell + 2));
  const blob = await new Promise((ok) => sheet.toBlob(ok, "image/png"));
  release(sheet);
  if (!blob || blob.type !== "image/png") throw new Error("this browser couldn't save the animation");
  return { blob, anim: { n, cols, rows, fps, cell, size } };
}
// Les mêmes images en plus petit (si la planche dépasse la taille permise)
export function shrinkFrames(frames, size) {
  return frames.map((c) => { const s = document.createElement("canvas"); s.width = s.height = size; s.getContext("2d").drawImage(c, 0, 0, size, size); return s; });
}
export { release as releaseCanvas };
