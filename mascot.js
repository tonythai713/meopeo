// Petits personnages qui se promènent sur le calendrier : les bords des semaines leur servent de plateformes.
// Indépendant du reste de l'app : app.js fournit un calque (position absolue au-dessus du calendrier) et la liste
// des plateformes ; ce fichier dessine, anime et fait « réfléchir » chaque personnage.
// Chaque personnage = une entrée de KINDS (nom + dessin + taille) ; chaque mouvement = une entrée de ACTIONS.

const STYLE = `
.ms-layer { position: absolute; inset: 0; pointer-events: none; overflow: visible; z-index: 2; }
.ms { position: absolute; left: 0; top: 0; pointer-events: auto; cursor: pointer; will-change: transform;
  -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; touch-action: manipulation; }
.ms[hidden], .ms-bubble[hidden] { display: none; }
.ms-in { width: 100%; height: 100%; transform-origin: 50% 100%; }
.ms svg { width: 100%; height: 100%; overflow: visible; display: block; }
.ms-in svg { filter: drop-shadow(0 1px 2px rgba(0, 0, 20, 0.45)); }
.ms-fx { position: absolute; inset: 0; pointer-events: none; }
.ms-head { transform-origin: 50px 62px; }
.ms-face { transform-origin: 50px 45px; }
.ms-arm-l { transform-origin: 25px 59px; }
.ms-arm-r { transform-origin: 75px 59px; }
.ms-foot-l { transform-origin: 38px 90px; }
.ms-foot-r { transform-origin: 62px 90px; }
.ms-zzz, .ms-heart { opacity: 0; }
.ms-sleep .ms-zzz { animation: ms-zzz 2.6s ease-in-out infinite; }
.ms-love .ms-heart { animation: ms-heart 1.1s ease-out; }
@keyframes ms-zzz { 0% { opacity: 0; transform: translate(0, 4px); } 30%, 70% { opacity: 1; } 100% { opacity: 0; transform: translate(6px, -8px); } }
@keyframes ms-heart { 0% { opacity: 0; transform: translate(0, 6px) scale(0.6); } 25% { opacity: 1; transform: translate(0, -4px) scale(1.1); } 100% { opacity: 0; transform: translate(0, -18px) scale(1); } }
.ms-bubble { position: absolute; left: 0; top: 0; max-width: 210px; padding: 6px 10px; border-radius: 12px; pointer-events: auto; cursor: pointer;
  background: #fffdf6; color: #1b1f45; font: 500 13px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif; white-space: pre-wrap; overflow-wrap: anywhere;
  box-shadow: 0 4px 14px rgba(0, 0, 20, 0.45); transition: opacity 0.2s; animation: ms-pop 0.25s ease-out; }
.ms-bubble::after { content: ""; position: absolute; top: 100%; left: var(--tail, 50%); margin-left: -7px; border: 7px solid transparent; border-top-color: #fffdf6; }
.ms-bubble b { font-weight: 700; }
.ms-bubble.ms-out { opacity: 0; }
@keyframes ms-pop { from { opacity: 0; } to { opacity: 1; } }
`;

// Petite étoile à 5 branches (le coussin de Tino en est couvert)
function star(cx, cy, r, fill) {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
    d += (i ? "L" : "M") + (cx + rr * Math.cos(a)).toFixed(1) + " " + (cy + rr * Math.sin(a)).toFixed(1);
  }
  return `<path d="${d}Z" fill="${fill}"/>`;
}

// Tino, le phoque en peluche : grosse tête blanche, yeux fermés, nez gris en deux boules, fleur jaune sur le côté,
// coussin crème à étoiles de couleur. Repère 100 × 100, pieds posés sur y = 98.
function sealSvg() {
  const fur = "#ffffff", line = "#c9d0e2";
  const stars = [[24, 66, "#ef7d93"], [77, 67, "#78a6e6"], [35, 79, "#f2cf57"], [52, 72, "#a98be6"], [65, 81, "#79c48c"],
    [43, 89, "#f4a259"], [70, 91, "#ef7d93"], [28, 89, "#78a6e6"], [57, 92, "#f2cf57"]].map(([x, y, c]) => star(x, y, 3.1, c)).join("");
  const petals = [0, 1, 2, 3, 4].map((k) => {
    const a = -Math.PI / 2 + k * 2 * Math.PI / 5;
    return `<circle cx="${(22 + 4.6 * Math.cos(a)).toFixed(1)}" cy="${(19 + 4.6 * Math.sin(a)).toFixed(1)}" r="4.3"/>`;
  }).join("");
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
  <g class="ms-foot-l"><ellipse cx="38" cy="95" rx="8.5" ry="4.5" fill="${fur}" stroke="${line}" stroke-width="1.3"/></g>
  <g class="ms-foot-r"><ellipse cx="62" cy="95" rx="8.5" ry="4.5" fill="${fur}" stroke="${line}" stroke-width="1.3"/></g>
  <path d="M34 58C26 52 13 55 14 65C15 73 22 75 27 74C24 80 22 90 30 95C37 99 45 96 50 92C55 96 63 99 70 95C78 90 76 80 73 74C78 75 85 73 86 65C87 55 74 52 66 58Z" fill="#f7f0de" stroke="#dacfb4" stroke-width="1.3"/>
  ${stars}
  <g class="ms-arm-l"><ellipse cx="17" cy="62" rx="7.5" ry="9.5" transform="rotate(35 17 62)" fill="${fur}" stroke="${line}" stroke-width="1.3"/></g>
  <g class="ms-arm-r"><ellipse cx="83" cy="62" rx="7.5" ry="9.5" transform="rotate(-35 83 62)" fill="${fur}" stroke="${line}" stroke-width="1.3"/></g>
  <g class="ms-head">
    <ellipse cx="50" cy="36" rx="32" ry="28.5" fill="${fur}" stroke="${line}" stroke-width="1.4"/>
    <path d="M30 13Q33 9 36 12M46 8Q50 5 54 8M64 12Q67 9 70 13" fill="none" stroke="#e3e7f1" stroke-width="1.2" stroke-linecap="round"/>
    <g class="ms-face">
      <ellipse cx="27" cy="48" rx="5" ry="2.8" fill="#ffb8ca" opacity="0.45"/>
      <ellipse cx="73" cy="48" rx="5" ry="2.8" fill="#ffb8ca" opacity="0.45"/>
      <path d="M29 41Q33.5 44 38 41M62 41Q66.5 44 71 41" fill="none" stroke="#2f3038" stroke-width="2.4" stroke-linecap="round"/>
      <ellipse cx="45" cy="48" rx="6.3" ry="5.3" fill="#5b5d68"/>
      <ellipse cx="55" cy="48" rx="6.3" ry="5.3" fill="#5b5d68"/>
      <ellipse cx="43.5" cy="46" rx="1.7" ry="1.1" fill="#8e919d"/>
      <ellipse cx="53.5" cy="46" rx="1.7" ry="1.1" fill="#8e919d"/>
      <g fill="#7d8291"><circle cx="35" cy="49" r="0.9"/><circle cx="37.5" cy="52.5" r="0.9"/><circle cx="65" cy="49" r="0.9"/><circle cx="62.5" cy="52.5" r="0.9"/></g>
    </g>
    <g class="ms-flower">
      <rect x="16.5" y="24" width="3" height="6.5" rx="1" fill="#4f8fe0" transform="rotate(18 18 27)"/>
      <rect x="20.5" y="25" width="3" height="5.5" rx="1" fill="#e45b5b" transform="rotate(-8 22 27)"/>
      <g fill="#f7c948" stroke="#e0a52c" stroke-width="0.8">${petals}</g>
      <circle cx="22" cy="19" r="3" fill="#eeac25"/>
    </g>
  </g>
</svg>`;
}

// « z » et cœur : à part du corps, pour rester droits pendant une roulade ou couché sur le côté
const FX = `<svg class="ms-fx" viewBox="0 0 100 100" aria-hidden="true">
  <g class="ms-zzz-at"><g class="ms-zzz" fill="#d6e2ff" font-family="system-ui, sans-serif" font-weight="700"><text x="78" y="14" font-size="13">z</text><text x="88" y="3" font-size="10">z</text></g></g>
  <g class="ms-heart-at"><path class="ms-heart" d="M50 -2C47 -7 40 -5 41 0C42 4 50 9 50 9C50 9 58 4 59 0C60 -5 53 -7 50 -2Z" fill="#ff8fb3"/></g>
</svg>`;

// body.cy : centre du corps (pivot des roulades) ; body.support : distance du centre au point le plus bas quand il
// est tourné de 0°, 15°, 30°… (mesurée sur le dessin) — pour qu'il reste posé sur la ligne en roulant ou couché ;
// head : centre de la tête (pour placer les « z », le cœur et la bulle)
export const KINDS = {
  tino: {
    name: "Tino", svg: sealSvg, size: 40, head: [50, 36],
    body: { cy: 52.75, support: [47.3, 49.5, 49, 46, 43.3, 43.8, 42, 38, 40.3, 43, 45.8, 45.8, 47, 49, 52, 52.5, 50.5, 45.3, 42, 43.8, 43.3, 46, 49, 49.5] },
  },
};

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, s) => a + (b - a) * s;
const smooth = (s) => s * s * (3 - 2 * s);
const isNight = () => { const h = new Date().getHours(); return h >= 22 || h < 7; };
// Tirage pondéré : [[poids, valeur], …]
const weighted = (list) => { let r = Math.random() * list.reduce((s, [w]) => s + w, 0); return list.find(([w]) => (r -= w) < 0)?.[1] ?? list[0][1]; };

const CROUCH = 0.14, LAND = 0.16;                    // saut : accroupi, réception (s)
const airTime = (dy) => 0.42 + Math.abs(dy) / 500;  // saut : temps en l'air selon la hauteur
const ROLL = 0.75, ROLL_IN = 0.12, ROLL_OUT = 0.4;   // une roulade (s), élan, petit vertige après
const TAKEOFF = 0.2;                                 // envol : il prend son élan
const LOOK = 8;   // décalage du visage quand il regarde de côté (repère 100)
const SINK = 12;  // assis : il descend sur la ligne, les pieds pendent en dessous (repère 100)
const LIE = 85;   // couché sur le côté (degrés)
const HOLD = 550; // appui long (ms) : il s'assoit et reste assis / il se relève

// ---------- Les actions ----------
// Une action = une entrée de ACTIONS ; en ajouter une = ajouter une entrée. Champs (tous facultatifs) :
//   weight(m, ctx)    chance d'être tirée au sort (absent ou 0 = seulement quand on la demande : toucher, message…)
//   make(m, me, ctx)  étapes à enchaîner [{ type, …paramètres }] (par défaut une seule étape de ce type)
//   start(m, a)       au début ; step(m, a, dt, me) à chaque image, renvoie true quand c'est fini (par défaut : a.dur écoulé)
//   pose(m, a, p)     posture : p.sx, p.sy (écrasement), p.rot, p.bob, p.spin (tout le corps), p.head, p.armL, p.armR, p.footL, p.footR
//   look(m, a)        où il regarde (− gauche, + droite) ; sit / lie / zzz : assis sur la ligne, couché sur le côté, « z »
//   busy              ne s'interrompt pas : un toucher attend la fin
const timed = (m, a) => a.t >= a.dur;
const untilMorning = (m, a) => a.t >= a.dur || (a.dur === Infinity && !m.eng.night());
const facing = (m) => m.dir * LOOK;

// Saut : accroupi, en l'air, réception (aussi pour le petit saut quand on le touche)
function jumpPose(p, t, crouch, air) {
  if (t < crouch) { const k = t / crouch; p.sy = 1 - 0.18 * k; p.sx = 1 + 0.12 * k; p.armL = p.armR = -10; }
  else if (t < crouch + air) { const s = (t - crouch) / air; p.sy = 1.1 - 0.1 * s; p.sx = 0.93 + 0.07 * s; p.armL = 50; p.armR = -50; }
  else { const k = 1 - Math.min(1, (t - crouch - air) / LAND); p.sy = 1 - 0.16 * k; p.sx = 1 + 0.12 * k; }
}

const ACTIONS = {
  // Il se repose et regarde parfois à gauche ou à droite
  idle: {
    weight: () => 5,
    make: () => [{ type: "idle", dur: rand(3, 6) }],
    start(m) { m.gaze = pick([-LOOK * 0.7, 0, 0, LOOK * 0.7]); },
    look: (m) => m.gaze,
  },
  // Il marche le long de la ligne en se dandinant
  walk: {
    weight: () => 30,
    make: (m, me) => [{ type: "walk", x: clamp(m.x + rand(30, 120) * pick([-1, 1]), me.x0, me.x1) }],
    step(m, a, dt, me) {
      const d = clamp(a.x, me.x0, me.x1) - m.x, s = 26 * (m.size / 40) * dt;
      if (d) m.dir = d < 0 ? -1 : 1;
      if (Math.abs(d) <= s) { m.x += d; return true; }
      m.x += Math.sign(d) * s;
    },
    look: facing,
    pose(m, a, p) {
      const ph = m.clock * 11;
      p.rot = 5 * Math.sin(ph); p.bob = -Math.abs(Math.sin(ph)) * m.size * 0.06; p.armL = p.armR = 16 * Math.sin(ph); p.sx = p.sy = 1;
      p.footL = -Math.max(0, Math.sin(ph)) * 3; p.footR = -Math.max(0, -Math.sin(ph)) * 3; // un pied puis l'autre
    },
  },
  // Il saute sur la ligne de la semaine du dessus ou du dessous
  hop: {
    weight: (m, ctx) => (ctx.plats.length > 1 ? 18 : 0),
    make(m) {
      const P = m.eng.plats, up = m.p > 0 && (m.p === P.length - 1 || Math.random() < 0.5), p1 = m.p + (up ? -1 : 1);
      return [{ type: "hop", p1, x1: clamp(m.x + rand(-50, 50), P[p1].x0, P[p1].x1) }];
    },
    start(m, a) { a.p0 = m.p; a.x0 = m.x; if (a.x1 !== a.x0) m.dir = a.x1 < a.x0 ? -1 : 1; },
    step(m, a) {
      const p0 = m.plat(a.p0), p1 = m.plat(a.p1);
      if (!p0 || !p1) return true;
      const air = airTime(p1.y - p0.y);
      if (a.t < CROUCH) { m.y = p0.y; return false; }
      const s = Math.min(1, (a.t - CROUCH) / air);
      m.x = lerp(a.x0, a.x1, s);
      m.y = lerp(p0.y, p1.y, s) - 4 * (22 + Math.abs(p1.y - p0.y) * 0.35) * s * (1 - s);
      if (s >= 1) { m.p = a.p1; m.y = p1.y; }
      return a.t >= CROUCH + air + LAND;
    },
    look: facing,
    pose(m, a, p) { const p0 = m.plat(a.p0), p1 = m.plat(a.p1); jumpPose(p, a.t, CROUCH, airTime(p0 && p1 ? p1.y - p0.y : 0)); },
    busy: true,
  },
  // Roulade : en boule, il roule sans glisser (1 ou 2 tours) vers le côté où il y a la place, puis a le vertige
  roll: {
    weight: () => 10,
    make(m, me) {
      const D = m.rollDist(), room = { 1: me.x1 - m.x, "-1": m.x - me.x0 };
      const dir = room[m.dir] >= D ? m.dir : room[-m.dir] >= D ? -m.dir : 0;
      if (!dir) return ACTIONS.walk.make(m, me);
      return [{ type: "roll", dir, n: room[dir] >= 2 * D && Math.random() < 0.4 ? 2 : 1 }];
    },
    start(m, a) { a.x0 = m.x; m.dir = a.dir; },
    step(m, a, dt, me) {
      const T = a.n * ROLL, e = smooth(clamp((a.t - ROLL_IN) / T, 0, 1));
      m.x = clamp(a.x0 + a.dir * a.n * m.rollDist() * e, me.x0, me.x1);
      a.spin = a.dir * 360 * a.n * e;
      return a.t >= ROLL_IN + T + ROLL_OUT;
    },
    look: facing,
    pose(m, a, p) {
      const T = a.n * ROLL;
      p.spin = a.spin ?? 0;
      if (a.t < ROLL_IN) { const k = a.t / ROLL_IN; p.sy = 1 - 0.15 * k; p.sx = 1 + 0.08 * k; } // élan
      else if (a.t < ROLL_IN + T) { p.sy = 0.9; p.sx = 0.95; p.armL = 25; p.armR = -25; p.footL = p.footR = -4; } // en boule
      else { const k = 1 - (a.t - ROLL_IN - T) / ROLL_OUT; p.rot = 7 * Math.sin(a.t * 22) * k; p.head = 10 * Math.sin(a.t * 14) * k; } // ça tourne…
    },
    busy: true,
  },
  // Il va s'asseoir dans la case d'aujourd'hui
  today: {
    weight: (m, ctx) => (ctx.today ? 10 : 0),
    make: (m, me, ctx) => [...m.pathTo(ctx.today), { type: "sit", dur: rand(5, 9) }],
  },
  // Assis sur la ligne, les pieds qui pendent
  sit: {
    weight: () => 9,
    make: () => [{ type: "sit", dur: rand(4, 8) }],
    sit: true,
    pose(m, a, p) { p.sy = 0.97 + 0.012 * Math.sin(m.clock * 2.4); p.sx = 1.02; p.armL = -24; p.armR = 24; p.head = 5 * Math.sin(m.clock * 0.7); },
  },
  // Il lève la patte du côté où il regarde et salue
  wave: {
    weight: () => 8,
    make: () => [{ type: "wave", dur: rand(1.6, 2.4) }],
    pose(m, a, p) {
      const k = smooth(clamp(Math.min(a.t, a.dur - a.t) / 0.25, 0, 1)), w = -98 * k + 22 * k * Math.sin(m.clock * 12);
      if (m.look >= 0) { p.armR = w; p.armL = -8 * k; } else { p.armL = -w; p.armR = 8 * k; }
      p.rot = 3 * Math.sin(m.clock * 6) * k; p.head = 6 * Math.sin(m.clock * 6) * k;
    },
  },
  // Sieste couché sur le côté (et toute la nuit)
  nap: {
    weight: () => 6,
    make: () => [{ type: "nap", dur: rand(6, 11) }],
    start(m) { m.side = pick([-1, 1]); },
    step: untilMorning,
    lie: true, zzz: true,
  },
  // Petit somme assis
  sleep: {
    weight: () => 4,
    make: () => [{ type: "sleep", dur: rand(5, 8) }],
    step: untilMorning,
    sit: true, zzz: true,
    pose(m, a, p) { p.sy = 0.95 + 0.025 * Math.sin(m.clock * 1.6); p.sx = 1.03; p.armL = -28; p.armR = 28; p.head = 12; },
  },
  // Touché : petit saut de joie (avec un cœur)
  react: {
    step(m, a, dt, me) { const s = clamp((a.t - 0.08) / 0.4, 0, 1); m.y = me.y - 48 * s * (1 - s); return a.t >= 0.6; },
    pose(m, a, p) { jumpPose(p, a.t, 0.08, 0.4); },
  },
  // Il s'envole ailleurs en battant des nageoires (quand on touche sa case, ou pour porter un message)
  fly: {
    start(m, a) {
      const p0 = m.plat(), p1 = m.plat(a.p1) ?? p0, d = Math.hypot(a.x1 - m.x, p1.y - p0.y);
      a.p0 = m.p; a.x0 = m.x; a.F = 0.9 + d / 500; a.h = 90 + d * 0.3;
      if (a.x1 !== a.x0) m.dir = a.x1 < a.x0 ? -1 : 1;
    },
    step(m, a) {
      const p0 = m.plat(a.p0), p1 = m.plat(a.p1);
      if (!p0 || !p1) return true;
      if (a.t < TAKEOFF) { m.y = p0.y; return false; }
      const s = smooth(Math.min(1, (a.t - TAKEOFF) / a.F)), cx = (a.x0 + a.x1) / 2, cy = Math.min(p0.y, p1.y) - a.h;
      m.x = (1 - s) * (1 - s) * a.x0 + 2 * (1 - s) * s * cx + s * s * a.x1;
      m.y = (1 - s) * (1 - s) * p0.y + 2 * (1 - s) * s * cy + s * s * p1.y;
      if (s >= 1) { m.p = a.p1; m.y = p1.y; }
      return a.t >= TAKEOFF + a.F + LAND;
    },
    look: facing,
    pose(m, a, p) {
      if (a.t < TAKEOFF) { const k = a.t / TAKEOFF; p.sy = 1 - 0.2 * k; p.sx = 1 + 0.1 * k; p.armL = 40 * k; p.armR = -40 * k; return; }
      if (a.t < TAKEOFF + a.F) {
        const s = (a.t - TAKEOFF) / a.F, flap = Math.sin(m.clock * 24);
        p.armL = 70 + 45 * flap; p.armR = -p.armL; p.rot = m.dir * 12 * Math.sin(Math.PI * s); p.sy = 1.06; p.sx = 0.95; p.footL = p.footR = 2.5;
        return;
      }
      const k = 1 - Math.min(1, (a.t - TAKEOFF - a.F) / LAND); p.sy = 1 - 0.2 * k; p.sx = 1 + 0.14 * k;
    },
    busy: true,
  },
};
const CALM = ["idle", "sit", "wave"]; // quand il a un message à dire, il reste là pour qu'on puisse le lire

class Mascot {
  constructor(eng, def) {
    this.eng = eng;
    this.def = def;
    this.size = def.size;
    this.el = document.createElement("div");
    this.el.className = "ms";
    this.el.style.width = this.el.style.height = def.size + "px";
    this.el.title = `${def.name} · tap to pet, hold to make ${def.name} sit or stand`;
    this.el.setAttribute("aria-label", def.name);
    this.el.innerHTML = `<div class="ms-in">${def.svg()}</div>${FX}`;
    this.inner = this.el.firstChild;
    for (const k of ["head", "face", "flower", "arm-l", "arm-r", "foot-l", "foot-r", "zzz-at", "heart-at"]) this[k.replace("-", "_")] = this.el.querySelector(".ms-" + k);
    this.p = 0; this.x = 0; this.y = 0; this.dir = 1; this.side = 1; this.clock = rand(0, 10);
    this.look = 0; this.gaze = 0; this.sink = 0; this.lie = 0; this.stay = false; this.bubble = null;
    this.act = null; this.plan = [];
    this.el.addEventListener("click", (ev) => this.tap(ev));
    // appui long → assis / debout (sans menu « copier l'image » du téléphone)
    this.el.addEventListener("contextmenu", (ev) => ev.preventDefault());
    this.el.addEventListener("pointerdown", () => {
      clearTimeout(this.hold);
      this.held = false;
      this.hold = setTimeout(() => { this.hold = 0; this.held = true; this.toggleStay(); }, HOLD);
    });
    for (const t of ["pointerup", "pointerleave", "pointercancel"]) this.el.addEventListener(t, () => clearTimeout(this.hold));
  }

  plat(i = this.p) { return this.eng.plats[i]; }
  rollDist() { return Math.PI * 0.72 * this.size; } // distance d'un tour complet (il roule sans glisser)
  busy() { return !!ACTIONS[this.act?.type]?.busy; }
  // Fait faire une action tout de suite (ou juste après celle en cours si elle ne s'interrompt pas)
  now(steps) { if (this.busy()) this.plan = steps; else { this.plan = steps.slice(1); this.act = steps[0]; } }

  // Touché : il saute de joie (et ferme son message)… et le toucher passe quand même au calendrier en dessous
  tap(ev) {
    ev.stopPropagation();
    if (this.held) { this.held = false; return; } // c'était un appui long
    if (this.bubble?.sticky) this.hush();
    this.now([{ type: "react" }]);
    this.love();
    this.el.style.pointerEvents = "none";
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    this.el.style.pointerEvents = "";
    this.eng.tapping = this; // ce toucher-là ne le fait pas s'envoler
    try { if (under && this.eng.tapThrough(under)) under.click(); } finally { this.eng.tapping = null; }
  }

  love() {
    this.el.classList.remove("ms-love");
    void this.el.offsetWidth;
    this.el.classList.add("ms-love");
  }

  toggleStay() {
    this.stay = !this.stay;
    this.now([this.stay ? { type: "sit", dur: Infinity } : { type: "react" }]);
    this.love();
  }

  // Bonjour ! (à l'arrivée et au retour sur l'app)
  greet() {
    if (this.stay || this.eng.night() || this.busy()) return;
    this.now([{ type: "wave", dur: rand(1.6, 2.2) }]);
  }

  // S'envole vers un autre endroit, plutôt loin et sur une autre semaine
  flyAway() {
    const P = this.eng.plats;
    if (!P.length || this.act?.type === "fly") return;
    let best = null;
    for (let i = 0; i < 8; i++) {
      const p1 = Math.floor(Math.random() * P.length), x1 = rand(P[p1].x0, P[p1].x1), d = Math.hypot(x1 - this.x, P[p1].y - this.y);
      if (!best || d > best.d) best = { p1, x1, d };
      if (d > 120 && p1 !== this.p) break;
    }
    this.now([{ type: "fly", p1: best.p1, x1: best.x1 }]);
  }

  // Bulle de parole au-dessus de lui. sticky : reste jusqu'à ce qu'on la touche (ou qu'on touche Tino) → onClose()
  say(text, { sticky = false, ms = 3500, who = "", color = "", onClose = null } = {}) {
    this.hush(true);
    const el = document.createElement("div");
    el.className = "ms-bubble";
    if (who) { const b = document.createElement("b"); b.textContent = who; if (color) b.style.color = color; el.append(b, " "); }
    el.append(text);
    el.addEventListener("click", (ev) => { ev.stopPropagation(); this.hush(); this.love(); });
    this.eng.layer.append(el);
    this.bubble = { el, sticky, onClose, until: sticky ? Infinity : this.clock + ms / 1000, w: 0, h: 0 };
    if (sticky && !this.stay) this.now([{ type: "wave", dur: 1.8 }]);
    this.render();
  }

  // Ferme la bulle (silent : sans prévenir, par exemple quand le message a été lu sur un autre appareil)
  hush(silent = false) {
    const b = this.bubble;
    if (!b) return;
    this.bubble = null;
    b.el.classList.add("ms-out");
    setTimeout(() => b.el.remove(), 250);
    if (!silent) b.onClose?.();
  }

  // Choix de la prochaine action
  think() {
    const me = this.plat(), ctx = { plats: this.eng.plats, today: this.eng.today };
    if (!me) return { type: "idle", dur: 1 };
    if (this.stay) return this.eng.night() && !this.bubble ? { type: "sleep", dur: Infinity } : { type: "sit", dur: Infinity };
    let name;
    if (this.bubble?.sticky) name = pick(CALM);
    else if (this.eng.night()) { // la nuit : il va dans la case d'aujourd'hui et dort couché sur le côté
      const t = ctx.today;
      if (t && (t.p !== this.p || Math.abs(t.x - this.x) > 4)) { this.plan = this.pathTo(t); return this.plan.shift(); }
      return { type: "nap", dur: Infinity };
    } else name = weighted(Object.keys(ACTIONS).map((n) => [ACTIONS[n].weight?.(this, ctx) ?? 0, n]));
    const steps = (ACTIONS[name].make ?? (() => [{ type: name }]))(this, me, ctx);
    this.plan = [...steps.slice(1), { type: "idle", dur: rand(0.6, 2.4) }];
    return steps[0];
  }

  // Trajet jusqu'à un point : un saut par semaine, puis la marche
  pathTo(target) {
    const steps = [];
    let p = this.p, x = this.x;
    while (p !== target.p) {
      const np = p + Math.sign(target.p - p), t = this.eng.plats[np];
      x = clamp(x + clamp(target.x - x, -60, 60), t.x0, t.x1);
      steps.push({ type: "hop", p1: np, x1: x }, { type: "idle", dur: 0.25 });
      p = np;
    }
    steps.push({ type: "walk", x: target.x });
    return steps;
  }

  update(dt) {
    this.clock += dt;
    if (this.bubble && this.clock >= this.bubble.until) this.hush(true);
    if (!this.act) this.act = this.plan.shift() ?? this.think();
    const a = this.act, A = ACTIONS[a.type] ?? ACTIONS.idle;
    if (a.t === undefined) { a.t = 0; A.start?.(this, a); }
    a.t += dt;
    const me = this.plat();
    if (me) {
      this.y = me.y; // (les sauts et l'envol le placent eux-mêmes)
      if ((A.step ?? timed)(this, a, dt, me)) this.act = null;
    }
    this.ease(dt);
  }

  // Le visage tourne doucement vers où il va ; assis, il descend sur la ligne ; il se couche et se relève en douceur
  ease(dt) {
    const a = this.act, A = a && ACTIONS[a.type];
    this.look += ((A?.look ? A.look(this, a) : 0) - this.look) * Math.min(1, dt * 7);
    this.sink += ((A?.sit ? 1 : 0) - this.sink) * Math.min(1, dt * 6);
    this.lie += ((A?.lie ? 1 : 0) - this.lie) * Math.min(1, dt * (A?.lie ? 3 : 6));
  }

  render() {
    const W = this.size, a = this.act ?? { type: "idle", t: 0 }, A = ACTIONS[a.type] ?? ACTIONS.idle, c = this.clock, u = W / 100, B = this.def.body;
    const breathe = Math.sin(c * 2.4);
    const p = { sx: 1 - 0.015 * breathe, sy: 1 + 0.025 * breathe, rot: 0, bob: 0, spin: 0, head: 2 * Math.sin(c * 0.9), armL: 0, armR: 0, footL: 0, footR: 0 };
    if (a.t !== undefined) A.pose?.(this, a, p);
    // Couché sur le côté : tout le corps pivote, il respire lentement, les pattes se relâchent
    if (this.lie > 0.01) {
      p.spin += this.side * LIE * this.lie;
      p.sy = lerp(p.sy, 1 + 0.03 * Math.sin(c * 1.4), this.lie); p.sx = lerp(p.sx, 1, this.lie);
      p.armL = lerp(p.armL, -12, this.lie); p.armR = lerp(p.armR, 12, this.lie); p.head = lerp(p.head, 0, this.lie);
      p.footL = lerp(p.footL, 1.5 * Math.sin(c * 1.4), this.lie); p.footR = lerp(p.footR, 1.5 * Math.sin(c * 1.4 + 1), this.lie);
    }
    // Assis : les pieds pendent sous la ligne et se balancent (doucement s'il dort)
    if (this.sink > 0.01) {
      const swing = A.zzz ? 0.6 : 3;
      p.footL = lerp(p.footL, 4 + swing * Math.sin(c * 3.2), this.sink);
      p.footR = lerp(p.footR, 4 + swing * Math.sin(c * 3.2 + Math.PI), this.sink);
    }
    // En tournant (roulade, couché) le corps pivote autour de son centre et reste posé sur la ligne
    const th = p.spin * Math.PI / 180, sup = B.support, k = (((p.spin % 360) + 360) % 360) / 15, i = Math.floor(k);
    const lift = (sup[0] - lerp(sup[i % 24], sup[(i + 1) % 24], k - i)) * u, pivot = (B.cy - 100) * u, down = p.bob + this.sink * SINK * u + lift;
    const look = this.look;
    this.el.classList.toggle("ms-sleep", !!A.zzz);
    this.el.style.transform = `translate3d(${(this.x - W / 2).toFixed(1)}px, ${(this.y - W * 0.98).toFixed(1)}px, 0)`;
    this.inner.style.transform = `translateY(${down.toFixed(2)}px)` + (p.spin ? ` translateY(${pivot.toFixed(2)}px) rotate(${p.spin.toFixed(1)}deg) translateY(${(-pivot).toFixed(2)}px)` : "")
      + ` rotate(${p.rot.toFixed(2)}deg) scale(${p.sx.toFixed(3)}, ${p.sy.toFixed(3)})`;
    this.head.style.transform = `rotate(${(p.head + look * 0.4).toFixed(2)}deg)`;
    this.face.style.transform = `translateX(${look.toFixed(2)}px) scaleX(${(1 - Math.abs(look) / 90).toFixed(3)})`;
    this.flower.style.transform = `translate(${(-look * 0.5).toFixed(2)}px, ${(Math.abs(look) * 0.15).toFixed(2)}px)`;
    this.arm_l.style.transform = `translateX(${(look * 0.2).toFixed(2)}px) rotate(${p.armL.toFixed(1)}deg)`;
    this.arm_r.style.transform = `translateX(${(look * 0.2).toFixed(2)}px) rotate(${p.armR.toFixed(1)}deg)`;
    this.foot_l.style.transform = `translate(${(look * 0.35).toFixed(2)}px, ${p.footL.toFixed(2)}px)`;
    this.foot_r.style.transform = `translate(${(look * 0.35).toFixed(2)}px, ${p.footR.toFixed(2)}px)`;
    // « z », cœur et bulle suivent la tête (même couché), sans tourner
    const [hx, hy] = this.def.head, rx = hx - 50, ry = hy - B.cy;
    const nx = 50 + rx * Math.cos(th) - ry * Math.sin(th), ny = B.cy + rx * Math.sin(th) + ry * Math.cos(th) + down / u;
    const zx = nx + lerp(28, 12, this.lie) - 78, zy = ny + lerp(-22, -40, this.lie) - 14;
    this.zzz_at.style.transform = `translate(${zx.toFixed(1)}px, ${zy.toFixed(1)}px)`;
    this.heart_at.style.transform = `translate(${(nx - hx).toFixed(1)}px, ${(ny - hy).toFixed(1)}px)`;
    this.placeBubble((nx - 50) * u, (ny - 30) * u);
  }

  // La bulle se place au-dessus de la tête, sans sortir du calendrier ; sa pointe vise Tino
  placeBubble(dx, headTop) {
    const b = this.bubble;
    if (!b) return;
    if (!b.w) { b.w = b.el.offsetWidth; b.h = b.el.offsetHeight; }
    const P = this.plat(), W = this.size, cx = this.x + dx;
    const l = P ? P.x0 - 14 : cx - 105, r = P ? P.x1 + 14 : cx + 105;
    const left = clamp(cx - b.w / 2, l, Math.max(l, r - b.w)), top = this.y - W * 0.98 + headTop - b.h - 8;
    b.el.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0)`;
    b.el.style.setProperty("--tail", clamp(cx - left, 12, b.w - 12).toFixed(1) + "px");
  }
}

function injectStyle() {
  if (document.getElementById("ms-style")) return;
  const s = document.createElement("style");
  s.id = "ms-style";
  s.textContent = STYLE;
  document.head.append(s);
}

// layer : calque positionné au-dessus du calendrier (les coordonnées sont relatives à lui)
// platforms() : [{ y, x0, x1 }] triées de haut en bas ; today() : { p, x } (où s'asseoir) ou null
// tapThrough(el) : l'appui sur un personnage est-il aussi transmis à cet élément en dessous ?
export function mountMascots({ layer, kinds = ["tino"], platforms, today = () => null, night = isNight, tapThrough = () => true }) {
  injectStyle();
  layer.classList.add("ms-layer");
  const eng = { plats: [], today: null, night, tapThrough, layer, tapping: null };
  const list = kinds.map((k) => new Mascot(eng, KINDS[k] ?? KINDS.tino));
  list.forEach((m) => layer.append(m.el));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  let raf = 0, last = 0;

  // Plateformes relues après chaque dessin du calendrier (et toutes les 0,5 s : bandeau, police, rotation…) ;
  // le personnage reste sur « sa » semaine
  function measure() {
    eng.plats = platforms() ?? [];
    eng.today = today();
    list.forEach((m, i) => {
      m.el.hidden = !eng.plats.length;
      if (m.bubble) m.bubble.el.hidden = !eng.plats.length;
      if (!eng.plats.length) return;
      if (!m.placed || m.p >= eng.plats.length) {
        const start = eng.today ?? { p: 0, x: rand(eng.plats[0].x0, eng.plats[0].x1) };
        m.p = start.p; m.x = start.x + i * 30; m.act = null; m.plan = []; m.placed = true;
        m.greet();
      }
      const P = m.plat();
      m.x = clamp(m.x, P.x0, P.x1);
      if (!m.busy()) m.y = P.y;
    });
  }

  function refresh() {
    measure();
    list.forEach((m) => {
      if (!eng.plats.length) return;
      if (reduce.matches) { m.act = { type: "sit", t: 0, dur: Infinity }; m.sink = 1; m.lie = 0; }
      m.render();
    });
  }

  let since = 0;
  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if ((since += dt) > 0.5) {
      since = 0;
      measure();
      if (!eng.plats.length) { raf = 0; return; }
    }
    list.forEach((m) => { m.update(dt); m.render(); });
    raf = requestAnimationFrame(frame);
  }

  // Animation coupée quand l'app est en arrière-plan ou si le téléphone demande moins d'animations
  function run() {
    cancelAnimationFrame(raf);
    raf = 0;
    if (document.hidden || reduce.matches || !eng.plats.length) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  const onVisible = () => { if (!document.hidden) list.forEach((m) => m.greet()); run(); };
  document.addEventListener("visibilitychange", onVisible);
  reduce.addEventListener?.("change", () => { refresh(); run(); });
  refresh();
  run();
  const tino = list[0];
  return {
    refresh() { refresh(); run(); },
    // On a touché cette case (un jour du calendrier) : le personnage qui s'y trouve s'envole ailleurs
    poke(el) {
      if (reduce.matches) return;
      const r = el.getBoundingClientRect(), L = layer.getBoundingClientRect();
      list.forEach((m) => {
        if (eng.tapping === m || m.el.hidden) return;
        const x = m.x + L.left, y = m.y - m.size * 0.45 + L.top;
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) m.flyAway();
      });
    },
    say(text, opts) { tino?.say(text, opts); },
    hush() { tino?.hush(true); },
    flyAway() { if (!reduce.matches) tino?.flyAway(); },
    destroy() { cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", onVisible); list.forEach((m) => { m.hush(true); m.el.remove(); }); },
  };
}

// Aperçu d'une seule pose qui tourne en boucle sur place (page de test) ; dir = -1 : tourné vers la gauche
export function demoPose(box, kind, type, size, dir = 1) {
  injectStyle();
  const eng = { plats: [{ y: size, x0: size / 2, x1: size / 2 }], today: null, night: () => type === "sleep" || type === "nap", tapThrough: () => false, layer: box };
  const m = new Mascot(eng, { ...KINDS[kind], size });
  box.style.position = "relative";
  box.style.width = box.style.height = size + "px";
  box.append(m.el);
  m.x = size / 2; m.y = size; m.dir = dir;
  if (type === "walk") m.update = function (dt) { this.clock += dt; this.act ??= { type: "walk", t: 0, x: this.x }; this.dir = dir; this.ease(dt); }; // marche sur place
  m.think = () => ({
    hop: { type: "hop", p1: 0, x1: m.x + dir * 0.01 },
    roll: { type: "roll", dir, n: 1 },
    fly: { type: "fly", p1: 0, x1: m.x + dir * 0.01 },
  }[type] ?? { type, dur: type === "wave" ? 2.2 : type === "nap" ? Infinity : 1 });
  let last = performance.now();
  const loop = (t) => { m.update(Math.min(0.05, (t - last) / 1000)); last = t; m.render(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  return m;
}
