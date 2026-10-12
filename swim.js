// Tino nage — le mini-jeu de l'onglet Play (comme Flappy Bird, sous l'eau). Toucher (ou Espace) : Tino donne un coup de nageoires
// vers le haut ; sinon il coule doucement. Passer entre deux rochers : +1 ; attraper un poisson : +1 ; toucher un rocher ou le
// fond : fini. Le décor est dessiné dans un canevas ; Tino est le vrai (mascot.js, pose « swim », avec sa tenue et sa couleur),
// posé par-dessus (il ne reçoit aucun toucher : tout va au jeu). Rien ici ne parle à la base : à la fin, onEnd(score) rend la
// ligne à afficher (record, coquillages…). Page cachée en pleine partie : pause (un toucher pour reprendre).
//
// Tout est en part de la hauteur H du jeu (sauf les vitesses horizontales : part de la largeur W).
const G = 1.25, FLAP = -0.5, FALL_MAX = 0.75, RISE_MAX = -0.7; // gravité, coup de nageoires, vitesses verticales (H / s)
const GAP0 = 0.36, GAP_MIN = 0.27, SPEED0 = 0.36, SPEED_MAX = 0.56, SPACING = 0.62, PILLAR = 0.17; // trou, vitesse, écart (W), largeur (W)
const TINO_X = 0.3, TINO_SIZE = 0.17, HIT = 0.25; // Tino : position (W), taille (H), rayon de la zone qui touche (× sa taille)
const SAND = 0.065, SURFACE = 0.035; // le fond (H), la surface

export function startSwim(host, { mountTino, onEnd, spooky = false, night = false }) {
  const W = Math.max(240, Math.round(host.clientWidth)), H = Math.round(Math.min(W * 1.25, Math.max(300, innerHeight - 190)));
  host.style.height = `${H}px`;
  host.innerHTML = `<canvas class="sw-canvas"></canvas><div class="sw-tino"></div><div class="sw-score" aria-live="polite"></div><div class="sw-msg"></div>`;
  const cv = host.querySelector("canvas"), ctx = cv.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = `${W}px`; cv.style.height = `${H}px`;
  ctx.scale(dpr, dpr);
  const holder = host.querySelector(".sw-tino"), scoreEl = host.querySelector(".sw-score"), msg = host.querySelector(".sw-msg");
  const size = Math.round(TINO_SIZE * H), box = document.createElement("div");
  holder.append(box);
  const m = mountTino(box, size);
  let center = [size * 0.5, size * 0.62]; // (le milieu de Tino dans sa boîte ; mesuré une fois qu'il est dessiné)
  setTimeout(() => {
    const b = box.getBoundingClientRect(), t = m?.el?.querySelector("svg")?.getBoundingClientRect?.();
    if (t && t.width) center = [t.left + t.width / 2 - b.left, t.top + t.height / 2 - b.top];
  }, 400);

  const sky = spooky ? ["#3b1f5e", "#140a26"] : night ? ["#1f4382", "#081a3a"] : ["#5cbcef", "#0f4f8c"];
  const rock = spooky ? ["#4a3b5c", "#2b2236"] : ["#9a8ba6", "#6f6180"];
  let state = "ready", y = H * 0.45, vy = 0, score = 0, t = 0, dist = 0, last = 0, raf = 0, stopped = false, overAt = 0, spin = 0, hiddenPause = false;
  let pillars = [], fishes = [], bubbles = [], pops = [];
  const seaY = H * (1 - SAND), r = HIT * size, x = TINO_X * W;
  for (let i = 0; i < 18; i++) bubbles.push({ x: Math.random() * W, y: Math.random() * H, r: 1.5 + Math.random() * 3, v: 0.05 + Math.random() * 0.08 });
  const deco = Array.from({ length: 9 }, (_, i) => ({ x: (i / 9) * W * 1.6 + Math.random() * 30, k: Math.floor(Math.random() * 3) }));

  function say(html) { msg.innerHTML = html; msg.hidden = !html; }
  function reset() {
    state = "ready"; y = H * 0.45; vy = 0; score = 0; dist = 0; spin = 0; pillars = []; fishes = []; pops = [];
    scoreEl.textContent = "";
    say(`<b>🌊 Tino swims</b><span>Tap to swim up — slip between the rocks, catch the fish 🐟</span>`);
  }
  const speed = () => Math.min(SPEED_MAX, SPEED0 + score * 0.006) * W;
  const gap = () => Math.max(GAP_MIN, GAP0 - score * 0.004) * H;
  function addPillar(px) {
    const prev = pillars[pillars.length - 1]?.c ?? H * 0.47, g = gap();
    const lo = SURFACE * H + g / 2 + 10, hi = seaY - g / 2 - 10;
    const c = Math.min(hi, Math.max(lo, prev + (Math.random() - 0.5) * 0.55 * H));
    pillars.push({ x: px, c, g, done: false });
    if (Math.random() < 0.55) fishes.push({ x: px + (SPACING * W) / 2 + PILLAR * W / 2, y: Math.min(seaY - 20, Math.max(SURFACE * H + 20, c + (Math.random() - 0.5) * g * 0.5)), got: false, w: Math.random() * 6 });
  }
  function flap() {
    if (hiddenPause) { hiddenPause = false; state = "play"; say(""); last = performance.now(); }
    if (state === "ready") { state = "play"; say(""); scoreEl.textContent = "0"; addPillar(W * 1.05); }
    else if (state === "over") { if (performance.now() - overAt > 800) reset(); return; }
    if (state === "play") vy = FLAP * H;
  }
  // un cercle (Tino) contre un rectangle (rocher)
  const hits = (cx, cy, rx, ry, rw, rh) => { const dx = cx - Math.max(rx, Math.min(cx, rx + rw)), dy = cy - Math.max(ry, Math.min(cy, ry + rh)); return dx * dx + dy * dy < r * r; };
  async function over() {
    state = "over"; overAt = performance.now(); vy = Math.min(vy, 0) - 0.15 * H;
    say(`<b>${score} point${score === 1 ? "" : "s"}</b><span class="sw-result">Saving…</span><span class="sw-again">Tap to play again</span>`);
    let line = "";
    try { line = (await onEnd?.(score)) ?? ""; } catch (err) { line = `⚠️ ${err.message}`; }
    if (state === "over" && !stopped) { const el = msg.querySelector(".sw-result"); if (el) el.innerHTML = line; }
  }

  function step(dt) {
    t += dt;
    for (const b of bubbles) { b.y -= b.v * H * dt; b.x += Math.sin(t * 2 + b.r) * 0.2; if (b.y < -10) { b.y = H + 10; b.x = Math.random() * W; } }
    if (state === "ready") { y = H * 0.45 + Math.sin(t * 2.4) * H * 0.02; return; }
    if (state === "over") { // il coule en tournant jusqu'au fond
      vy = Math.min(FALL_MAX * H, vy + G * H * dt); y = Math.min(seaY - r * 0.6, y + vy * dt); spin += dt * 260;
      return;
    }
    if (state !== "play") return;
    vy = Math.max(RISE_MAX * H, Math.min(FALL_MAX * H, vy + G * H * dt));
    y += vy * dt;
    if (y - r < SURFACE * H) { y = SURFACE * H + r; vy = Math.max(0, vy); }
    const v = speed(), pw = PILLAR * W;
    dist += v * dt;
    for (const p of pillars) p.x -= v * dt;
    for (const f of fishes) f.x -= v * dt;
    for (const d of deco) { d.x -= v * dt; if (d.x < -40) d.x += W * 1.6; }
    if (pillars.length && pillars[pillars.length - 1].x < W - SPACING * W) addPillar(W + 10);
    pillars = pillars.filter((p) => p.x > -pw - 10);
    fishes = fishes.filter((f) => f.x > -30 && !f.gone);
    for (const p of pillars) {
      if (!p.done && p.x + pw < x - r) { p.done = true; score++; scoreEl.textContent = String(score); }
      if (hits(x, y, p.x, -50, pw, p.c - p.g / 2 + 50) || hits(x, y, p.x, p.c + p.g / 2, pw, H)) { over(); return; }
    }
    for (const f of fishes) if (!f.got && Math.hypot(f.x - x, f.y - y) < r + 12) {
      f.got = true; f.gone = true; score++; scoreEl.textContent = String(score);
      pops.push({ x: f.x, y: f.y, t: 0 });
    }
    pops = pops.filter((p) => (p.t += dt) < 0.8);
    if (y + r > seaY) { y = seaY - r; over(); }
  }

  function draw() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sky[0]); g.addColorStop(1, sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // rayons de lumière
    ctx.save(); ctx.globalAlpha = spooky ? 0.05 : 0.08; ctx.fillStyle = spooky ? "#ffa94d" : "#fff";
    for (let i = 0; i < 4; i++) { const bx = ((i * 0.3 + 0.1) * W + Math.sin(t * 0.3 + i) * 20); ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx + 40, 0); ctx.lineTo(bx + 110, H); ctx.lineTo(bx + 30, H); ctx.fill(); }
    ctx.restore();
    // au loin : algues (ou, à Halloween, de petits fantômes)
    ctx.save(); ctx.globalAlpha = 0.35;
    for (const d of deco) {
      const bx = d.x * 0.5 % (W * 1.2);
      if (spooky && d.k === 0) { ghost(bx, H * 0.3 + Math.sin(t + d.x) * 10, 14); continue; }
      ctx.strokeStyle = spooky ? "#2f9e44" : "#1b6e4a"; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.beginPath();
      for (let k = 0; k <= 6; k++) { const yy = seaY - k * 14 - d.k * 6, xx = bx + Math.sin(t * 1.5 + k * 0.8 + d.x) * 5; k ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
      ctx.stroke();
    }
    ctx.restore();
    // bulles
    ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 1;
    for (const b of bubbles) { ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke(); }
    // rochers
    const pw = PILLAR * W;
    for (const p of pillars) {
      pillar(p.x, -20, pw, p.c - p.g / 2 + 20, true);
      pillar(p.x, p.c + p.g / 2, pw, seaY - (p.c + p.g / 2) + 30, false);
    }
    // poissons à attraper
    for (const f of fishes) if (!f.got) fish(f.x, f.y + Math.sin(t * 3 + f.w) * 4);
    for (const p of pops) { ctx.globalAlpha = 1 - p.t / 0.8; ctx.fillStyle = "#ffe066"; ctx.font = "bold 16px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("+1 🐟", p.x, p.y - p.t * 40); ctx.globalAlpha = 1; }
    // le fond de sable, coquillages (citrouilles à Halloween)
    const sg = ctx.createLinearGradient(0, seaY, 0, H); sg.addColorStop(0, spooky ? "#7a5a3a" : "#f2d49b"); sg.addColorStop(1, spooky ? "#4a3523" : "#d9a95f");
    ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(0, H);
    for (let xx = 0; xx <= W; xx += 12) ctx.lineTo(xx, seaY + Math.sin((xx + dist) / 26) * 3);
    ctx.lineTo(W, H); ctx.fill();
    for (const d of deco) {
      const bx = d.x % (W * 1.6), by = seaY + 9;
      if (bx < -20 || bx > W + 20) continue;
      if (spooky) pumpkin(bx, by, 9); else if (d.k === 1) { ctx.fillStyle = "#ff8787"; star5(bx, by, 6); } else { ctx.fillStyle = "#fff4e6"; ctx.beginPath(); ctx.ellipse(bx, by, 5, 4, 0, Math.PI, 0); ctx.fill(); }
    }
    // Tino (le vrai, par-dessus le canevas)
    const tilt = state === "over" ? spin : Math.max(-25, Math.min(35, (vy / (0.6 * H)) * 30));
    holder.style.transform = `translate(${(x - center[0]).toFixed(1)}px, ${(y - center[1]).toFixed(1)}px) rotate(${tilt.toFixed(1)}deg)`;
    holder.style.transformOrigin = `${center[0].toFixed(1)}px ${center[1].toFixed(1)}px`;
  }
  function pillar(px, py, w, h, top) {
    if (h <= 0) return;
    const gr = ctx.createLinearGradient(px, 0, px + w, 0); gr.addColorStop(0, rock[0]); gr.addColorStop(1, rock[1]);
    ctx.fillStyle = gr; ctx.strokeStyle = "#3e3149"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(px, py, w, h, 12) : ctx.rect(px, py, w, h); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(px + w * (0.3 + i * 0.2), py + (top ? h - 18 - i * 22 : 16 + i * 22), 5, 3.5, 0, 0, Math.PI * 2); ctx.fill(); }
    // algues sur le bord du rocher (en bas : vers le haut ; en haut : qui pendent)
    ctx.strokeStyle = spooky ? "#40c057" : "#2f9e44"; ctx.lineWidth = 3; ctx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      const bx = px + w * (0.25 + i * 0.25), by = top ? py + h : py;
      ctx.beginPath(); ctx.moveTo(bx, by);
      for (let k = 1; k <= 4; k++) ctx.lineTo(bx + Math.sin(t * 2.5 + k + i) * 3, by + (top ? 1 : -1) * k * 5);
      ctx.stroke();
    }
    if (spooky && !top) pumpkin(px + w / 2, py + 2, 10);
  }
  function fish(fx, fy) {
    ctx.fillStyle = "rgba(255,224,102,0.25)"; ctx.beginPath(); ctx.arc(fx, fy, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ff922b"; ctx.strokeStyle = "#5a4766"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(fx + 7, fy); ctx.lineTo(fx + 14, fy - 6); ctx.lineTo(fx + 14, fy + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(fx, fy, 10, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#2b2233"; ctx.beginPath(); ctx.arc(fx - 4, fy - 1, 1.4, 0, Math.PI * 2); ctx.fill();
  }
  function pumpkin(px, py, s) {
    ctx.fillStyle = "#ff922b"; ctx.strokeStyle = "#a33b0b"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(px, py - s * 0.6, s, s * 0.75, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#2f9e44"; ctx.fillRect(px - 1.5, py - s * 1.45, 3, s * 0.4);
    ctx.fillStyle = "#ffe066"; ctx.beginPath(); ctx.moveTo(px - s * 0.45, py - s * 0.75); ctx.lineTo(px - s * 0.2, py - s * 0.95); ctx.lineTo(px - s * 0.1, py - s * 0.7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(px + s * 0.45, py - s * 0.75); ctx.lineTo(px + s * 0.2, py - s * 0.95); ctx.lineTo(px + s * 0.1, py - s * 0.7); ctx.fill();
  }
  function ghost(gx, gy, s) {
    ctx.fillStyle = "#f8f0ff"; ctx.beginPath(); ctx.arc(gx, gy, s, Math.PI, 0); ctx.lineTo(gx + s, gy + s * 1.2);
    for (let i = 0; i < 4; i++) ctx.lineTo(gx + s - (i + 0.5) * (s / 2), gy + s * (i % 2 ? 1.2 : 0.9));
    ctx.lineTo(gx - s, gy + s * 1.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#2b2233"; ctx.beginPath(); ctx.arc(gx - s * 0.35, gy - s * 0.1, 1.8, 0, Math.PI * 2); ctx.arc(gx + s * 0.35, gy - s * 0.1, 1.8, 0, Math.PI * 2); ctx.fill();
  }
  function star5(sx, sy, s) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? s * 0.45 : s; ctx.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
  }

  function frame(now) {
    if (stopped) return;
    if (!host.isConnected) { stop(); return; }
    const dt = Math.min(0.05, Math.max(0, (now - (last || now)) / 1000));
    last = now;
    if (state !== "paused") step(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }
  const onDown = (e) => { if (e.button > 0) return; e.preventDefault(); flap(); };
  const onHide = () => { if (document.hidden && state === "play") { hiddenPause = true; state = "paused"; say(`<b>⏸ Paused</b><span>Tap to keep swimming</span>`); } }; // (l’animation s’arrête d’elle-même, page cachée)
  const onKey = (e) => { if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); flap(); } };
  host.addEventListener("pointerdown", onDown);
  host.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", onHide);
  function stop() {
    stopped = true;
    cancelAnimationFrame(raf);
    host.removeEventListener("pointerdown", onDown);
    host.removeEventListener("keydown", onKey);
    document.removeEventListener("visibilitychange", onHide);
  }
  host._swim = { state: () => state, score: () => score, y: () => y / H, next: () => { const p = pillars.find((q) => q.x + PILLAR * W > x - r); return p ? p.c / H : null; } }; // (lecture seule : pour les essais)
  reset();
  raf = requestAnimationFrame(frame);
  return { stop, state: () => state, score: () => score, tino: m };
}
