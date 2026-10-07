// Petits personnages qui se promènent sur la page : les bords des semaines du calendrier, le haut des cartes et des tâches
// leur servent de plateformes. Indépendant du reste de l'app : app.js fournit un calque (posé sur la page), la liste des
// plateformes (chacune avec une clé stable) et la partie visible de l'écran ; ce fichier dessine, anime et fait « réfléchir »
// chaque personnage. Il ne va que sur des plateformes visibles, et si la page défile sans lui, il revient (action « drop »).
// Chaque personnage = une entrée de KINDS (nom + dessin + taille) ; chaque mouvement = une entrée de ACTIONS.
// Gestes : appui = petit saut + cœur ; 5 appuis = il s'énerve ; appui long = assis / debout ; frotter (glisser le doigt
// ou la souris bouton enfoncé sur lui) = sa tête s'aplatit, puis rebondit quand on le lâche.

const STYLE = `
.ms-layer { position: absolute; inset: 0; pointer-events: none; overflow: visible; z-index: 2; }
.ms { position: absolute; left: 0; top: 0; pointer-events: auto; cursor: pointer; will-change: transform;
  -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; touch-action: none; }
.ms[hidden], .ms-bubble[hidden], .ms-bed[hidden], .ms-blanket[hidden] { display: none; }
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
.ms-zzz, .ms-heart, .ms-anger, .ms-brows { opacity: 0; }
.ms-mad .ms-brows { opacity: 1; }
.ms-mad .ms-anger { animation: ms-anger 0.45s ease-in-out infinite alternate; }
@keyframes ms-anger { from { opacity: 0.75; transform: scale(0.85); } to { opacity: 1; transform: scale(1.15); } }
.ms-sleep .ms-zzz { animation: ms-zzz 2.6s ease-in-out infinite; }
.ms-love .ms-heart { animation: ms-heart 1.1s ease-out; }
@keyframes ms-zzz { 0% { opacity: 0; transform: translate(0, 4px); } 30%, 70% { opacity: 1; } 100% { opacity: 0; transform: translate(6px, -8px); } }
.ms-bub circle { opacity: 0; }
.ms-swim .ms-bub circle { animation: ms-bub 1.7s ease-in infinite; }
.ms-swim .ms-bub circle:nth-child(2) { animation-delay: 0.6s; }
.ms-swim .ms-bub circle:nth-child(3) { animation-delay: 1.1s; }
@keyframes ms-bub { 0% { opacity: 0; transform: translate(0, 0); } 15% { opacity: 0.95; } 60% { transform: translate(3px, -16px); } 100% { opacity: 0; transform: translate(-1px, -28px); } }
@keyframes ms-heart { 0% { opacity: 0; transform: translate(0, 6px) scale(0.6); } 25% { opacity: 1; transform: translate(0, -4px) scale(1.1); } 100% { opacity: 0; transform: translate(0, -18px) scale(1); } }
.ms-bubble { position: absolute; left: 0; top: 0; max-width: 210px; padding: 6px 10px; border-radius: 12px; pointer-events: auto; cursor: pointer;
  background: #fffdf6; color: #1b1f45; font: 500 13px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif; white-space: pre-wrap; overflow-wrap: anywhere;
  box-shadow: 0 4px 14px rgba(0, 0, 20, 0.45); transition: opacity 0.2s; animation: ms-pop 0.25s ease-out; }
.ms-bubble::after { content: ""; position: absolute; top: 100%; left: var(--tail, 50%); margin-left: -7px; border: 7px solid transparent; border-top-color: #fffdf6; }
.ms-bubble b { font-weight: 700; }
.ms-bubble.ms-out { opacity: 0; }
@keyframes ms-pop { from { opacity: 0; } to { opacity: 1; } }
.ms-bed, .ms-blanket { position: absolute; left: 0; top: 0; pointer-events: none; opacity: 0; transform-origin: 50% 50%; will-change: transform, opacity; }
.ms-bed svg, .ms-blanket svg { width: 100%; height: 100%; display: block; overflow: visible; }
.ms-bed svg { filter: drop-shadow(0 1px 2px rgba(0, 0, 20, 0.45)); }
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
  <g class="ms-wear-body"></g>
  <g class="ms-arm-l"><ellipse cx="17" cy="62" rx="7.5" ry="9.5" transform="rotate(35 17 62)" fill="${fur}" stroke="${line}" stroke-width="1.3"/></g>
  <g class="ms-arm-r"><ellipse cx="83" cy="62" rx="7.5" ry="9.5" transform="rotate(-35 83 62)" fill="${fur}" stroke="${line}" stroke-width="1.3"/></g>
  <g class="ms-head">
    <ellipse cx="50" cy="36" rx="32" ry="28.5" fill="${fur}" stroke="${line}" stroke-width="1.4"/>
    <path d="M30 13Q33 9 36 12M46 8Q50 5 54 8M64 12Q67 9 70 13" fill="none" stroke="#e3e7f1" stroke-width="1.2" stroke-linecap="round"/>
    <g class="ms-face">
      <g class="ms-cheeks" opacity="0.45"><ellipse cx="27" cy="48" rx="5" ry="2.8" fill="#ffb8ca"/><ellipse cx="73" cy="48" rx="5" ry="2.8" fill="#ffb8ca"/></g>
      <path d="M29 41Q33.5 44 38 41M62 41Q66.5 44 71 41" fill="none" stroke="#2f3038" stroke-width="2.4" stroke-linecap="round"/>
      <path class="ms-brows" d="M28 33.5L38 37M72 33.5L62 37" fill="none" stroke="#2f3038" stroke-width="2.3" stroke-linecap="round"/>
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
    <g class="ms-wear-head"></g>
  </g>
</svg>`;
}

// ---------- Tenues dessinées (garde-robe) ----------
// Un dessin = une image carrée posée dans le repère du MODÈLE : Tino au centre, 25 unités de marge tout autour
// (repère -25…125, soit 150 × 150 ; le modèle fait 1500 × 1500 px = 10 px par unité). Calque « head » : suit la tête
// (dans .ms-head) ; calque « body » : suit le corps, sous les bras.
const WEAR = { x: -25, y: -25, size: 150 };
// Modèle à dessiner par-dessus (PNG transparent, Tino dans sa pose de repos) — toujours identique au dessin du code
export async function outfitTemplate(kind = "tino", px = 1500) {
  const svg = KINDS[kind].svg().replace(/<svg viewBox="0 0 100 100"[^>]*>/,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${WEAR.x} ${WEAR.y} ${WEAR.size} ${WEAR.size}" width="${px}" height="${px}">`);
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  const c = document.createElement("canvas");
  c.width = c.height = px;
  c.getContext("2d").drawImage(img, 0, 0, px, px);
  return new Promise((ok) => c.toBlob(ok, "image/png"));
}

// Le lit de la nuit (derrière Tino) : repère 120 × 40, posé sur y = 40, tête de lit à droite (retourné si Tino dort
// la tête à gauche). Le haut du matelas est à y = 20 : c'est là que Tino se couche.
const BED_W = 120, BED_H = 40, MATTRESS = 20;
const BED = `<svg viewBox="0 0 ${BED_W} ${BED_H}" aria-hidden="true">
  <rect x="7" y="33" width="5" height="7" rx="1.5" fill="#6b5446"/><rect x="108" y="33" width="5" height="7" rx="1.5" fill="#6b5446"/>
  <rect x="3" y="27" width="114" height="8" rx="3" fill="#8b6d5c"/>
  <rect x="1" y="15" width="10" height="20" rx="4" fill="#a3826d"/>
  <path d="M105 35V9Q105 1 112 1Q119 1 119 9V35Z" fill="#a3826d"/>
  <path d="M114.5 7a4.2 4.2 0 1 0 0 7.6a3.3 3.3 0 1 1 0-7.6Z" fill="#ffe8a3"/>
  <rect x="9" y="${MATTRESS}" width="98" height="9" rx="4" fill="#f3f0ff" stroke="#d3d0ee" stroke-width="1"/>
  <ellipse cx="93" cy="${MATTRESS - 2}" rx="13" ry="5.5" fill="#ffffff" stroke="#d8dcf0" stroke-width="1"/>
</svg>`;
// La couverture (devant Tino) : repère 100 × 110, posée sur le matelas, couvre son corps de ses pieds jusqu'au cou
// (pieds à gauche) ; sa tête reste dehors
const BLANKET = `<svg viewBox="0 0 100 110" aria-hidden="true">
  <path d="M0 110V62Q0 36 18 28Q36 12 58 12Q84 12 90 36L94 110Z" fill="#8fa0ee" stroke="#6f7fd0" stroke-width="2"/>
  <path d="M77 15Q89 21 90.5 38L94 110H83L80.5 40Q79 25 68 15Z" fill="#f6f4ff" stroke="#d3d0ee" stroke-width="1.5"/>
  ${[[20, 52], [42, 30], [60, 46], [32, 78], [56, 72], [68, 98], [14, 96], [42, 102]].map(([x, y]) => star(x, y, 4.6, "#ffe8a3")).join("")}
</svg>`;

// « z », cœur, « 💢 » et bulles d'eau : à part du corps, pour rester droits pendant une roulade, couché ou en nageant
const FX = `<svg class="ms-fx" viewBox="0 0 100 100" aria-hidden="true">
  <g class="ms-bub-at"><g class="ms-bub" fill="rgba(200, 232, 255, 0.35)" stroke="#e6f5ff" stroke-width="1.1"><circle r="2.8"/><circle cx="4" cy="-1" r="1.9"/><circle cx="-2.5" cy="-2" r="1.5"/></g></g>
  <g class="ms-zzz-at"><g class="ms-zzz" fill="#d6e2ff" font-family="system-ui, sans-serif" font-weight="700"><text x="78" y="14" font-size="13">z</text><text x="88" y="3" font-size="10">z</text></g></g>
  <g class="ms-heart-at"><path class="ms-heart" d="M50 -2C47 -7 40 -5 41 0C42 4 50 9 50 9C50 9 58 4 59 0C60 -5 53 -7 50 -2Z" fill="#ff8fb3"/></g>
  <g class="ms-anger-at"><g class="ms-anger" style="transform-box: fill-box; transform-origin: center"><path d="M-7 -2Q-2 -2 -2 -7M2 -7Q2 -2 7 -2M7 2Q2 2 2 7M-2 7Q-2 2 -7 2" fill="none" stroke="#ff4d5e" stroke-width="2.6" stroke-linecap="round"/></g></g>
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
const TEASE_TAPS = 5, TEASE_MS = 3000; // 5 appuis en 3 s : il s'énerve
const RUB_MIN = 10;     // frotter : le doigt s'est éloigné d'au moins 10 px de son point de départ (sinon c'est un appui :
                        // un doigt immobile « tremble » de 1 ou 2 px, on ne compte donc pas le chemin parcouru)
const RUB_FULL = 3;     // … et de 3 fois sa taille (4 ou 5 petits allers-retours) pour que la tête soit toute plate
const SWIM_IN = 0.75, SWIM_OUT = 0.7, SWIM_TILT = 75; // nage : plongeon, sortie (s) ; corps presque à l'horizontale (degrés)
const REACH = 200;      // saut : au plus 200 px plus haut ou plus bas, sur une plateforme qui est au-dessus / au-dessous de lui
const FOLLOW_MS = 200;  // la page a défilé et il n'est plus à l'écran : il revient 0,2 s après la fin du défilement
const GRAVITY = 2600;   // il tombe du haut de l'écran (px/s²)

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
  // Il saute sur une plateforme proche, au-dessus ou au-dessous (ligne du calendrier, haut d'une carte ou d'une tâche)
  hop: {
    weight: (m) => (m.reach().length ? 18 : 0),
    make(m) {
      const near = m.reach().sort((a, b) => Math.abs(a.y - m.y) - Math.abs(b.y - m.y)).slice(0, 3), P1 = pick(near);
      return [{ type: "hop", p1: P1.key, x1: clamp(m.x + rand(-50, 50), P1.x0, P1.x1) }];
    },
    start(m, a) { a.p0 = m.k; a.x0 = m.x; if (a.x1 !== a.x0) m.dir = a.x1 < a.x0 ? -1 : 1; },
    step(m, a) {
      const p0 = m.plat(a.p0), p1 = m.plat(a.p1);
      if (!p0 || !p1) return true;
      const air = airTime(p1.y - p0.y);
      if (a.t < CROUCH) { m.y = p0.y; return false; }
      const s = Math.min(1, (a.t - CROUCH) / air);
      m.x = lerp(a.x0, a.x1, s);
      m.y = lerp(p0.y, p1.y, s) - 4 * (22 + Math.abs(p1.y - p0.y) * 0.35) * s * (1 - s);
      if (s >= 1) { m.k = a.p1; m.y = p1.y; }
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
  // Il nage dans une rangée du calendrier (tout le calendrier est « sous la mer » du décor) : petit plongeon, le corps presque
  // à l'horizontale, il ondule en battant des nageoires (parfois une culbute), des bulles montent ; puis il se pose sur la ligne
  // d'en dessous ou remonte sur celle du dessus. Rangée = celle juste au-dessus de sa ligne, ou celle d'en dessous tout en haut.
  // Seulement sur les lignes du calendrier (champ `cal` des plateformes), et si la rangée est à l'écran.
  // m.y = le point le plus bas de son corps (comme partout : render() le garde posé sur m.y quand il est tourné).
  swim: {
    weight: (m) => (!m.eng.night() && m.swimRow() ? 9 : 0),
    make(m, me) {
      const { top, bot } = m.swimRow(), dist = rand(70, 170) * (m.size / 40);
      const room = { 1: me.x1 - m.x, "-1": m.x - me.x0 };
      const dir = room[m.dir] >= dist * 0.6 || room[m.dir] >= room[-m.dir] ? m.dir : -m.dir;
      return [{ type: "swim", top: top.key, bot: bot.key, dir, x1: clamp(m.x + dir * dist, me.x0, me.x1), land: Math.random() < 0.35 ? top.key : bot.key, flip: Math.random() < 0.3 }];
    },
    start(m, a) { a.p0 = m.k; a.x0 = m.x; m.dir = a.dir; a.T = Math.max(1.4, Math.abs(a.x1 - a.x0) / (38 * m.size / 40)); a.out = SWIM_IN + a.T; },
    step(m, a) {
      const P0 = m.plat(a.p0), Pt = m.plat(a.top), Pb = m.plat(a.bot), PL = m.plat(a.land), W = m.size;
      if (!P0 || !Pt || !Pb || !PL) { a.wet = false; return true; }
      const hi = Pt.y + 0.9 * W, lo = Pb.y - 2, mid = (hi + lo) / 2, amp = clamp((lo - hi) / 2, 0, 0.12 * W); // reste dans la rangée
      const xs = clamp(a.x0 + a.dir * 0.3 * W, P0.x0, P0.x1);
      if (a.leave && a.t < a.out) a.out = Math.max(a.t, SWIM_IN); // on l'appelle (message, appui long, sa case touchée…) : il sort
      if (a.t < a.out) {
        if (a.t < CROUCH) { m.y = P0.y; a.spin = 0; }
        else if (a.t < SWIM_IN) { // plongeon : petit bond, il se met à l'horizontale
          const s = (a.t - CROUCH) / (SWIM_IN - CROUCH), e = smooth(s);
          m.x = lerp(a.x0, xs, e);
          m.y = lerp(P0.y, mid, e) - 4 * (P0 === Pb ? 0.15 : 0.35) * W * s * (1 - s);
          a.spin = a.dir * SWIM_TILT * e; a.wet = s > 0.5;
        } else { // il nage en ondulant
          const u = clamp((a.t - SWIM_IN) / a.T, 0, 1), w = a.t - SWIM_IN;
          m.x = lerp(xs, a.x1, u * 0.85 + smooth(u) * 0.15);
          m.y = mid + amp * Math.sin(w * 4.2) * Math.min(1, w / 0.5);
          a.spin = a.dir * (SWIM_TILT + 8 * Math.sin(w * 4.2 + 1)) + (a.flip ? a.dir * 360 * smooth(clamp((u - 0.4) / 0.25, 0, 1)) : 0);
          a.wet = true;
        }
        a.xo = m.x; a.yo = m.y; a.so = a.spin; // point de départ de la sortie
        return false;
      }
      // Sortie : il se redresse et se pose sur la ligne d'en dessous, ou saute sur celle du dessus
      const k = clamp((a.t - a.out) / SWIM_OUT, 0, 1), e = smooth(k), so = ((a.so % 360) + 540) % 360 - 180;
      a.spin = lerp(so, 0, e);
      m.x = clamp(a.xo + a.dir * 0.25 * W * e, PL.x0, PL.x1);
      m.y = lerp(a.yo, PL.y, e) - (PL.y < a.yo ? 0.8 * W * Math.sin(Math.PI * k) : 0);
      a.wet = k < 0.5;
      if (k >= 1) { m.k = a.land; m.y = PL.y; }
      return a.t >= a.out + SWIM_OUT + LAND;
    },
    look: (m, a) => (a.t < CROUCH || a.t > a.out + SWIM_OUT ? m.dir * LOOK : 0),
    pose(m, a, p) {
      p.spin = a.spin ?? 0;
      if (a.t < CROUCH) { const k = a.t / CROUCH; p.sy = 1 - 0.16 * k; p.sx = 1 + 0.1 * k; p.armL = p.armR = -10; return; }
      if (a.t < a.out + SWIM_OUT) { // brasse : une nageoire monte quand l'autre descend, les pieds battent
        const c = m.clock, k = a.t < SWIM_IN ? smooth((a.t - CROUCH) / (SWIM_IN - CROUCH)) : a.t > a.out ? 1 - smooth((a.t - a.out) / SWIM_OUT) : 1;
        p.armL = p.armR = 38 * Math.sin(c * 7) * k;
        p.footL = 2.5 * Math.sin(c * 9) * k; p.footR = -p.footL;
        p.head = 5 * Math.sin(c * 3.5) * k;
        p.sy = 1 + 0.035 * Math.sin(c * 7) * k; p.sx = 1 - 0.02 * Math.sin(c * 7) * k;
        return;
      }
      const k = 1 - Math.min(1, (a.t - a.out - SWIM_OUT) / LAND); p.sy = 1 - 0.16 * k; p.sx = 1 + 0.12 * k; // réception
    },
    busy: true,
  },
  // On lui frotte la tête : il s'arrête, savoure, les nageoires un peu levées (la tête aplatie est dans render())
  pet: {
    step: (m) => !m.rubbing() && m.clock - m.rubT > 0.8,
    pose(m, a, p) { const c = m.clock; p.armL = 22 + 8 * Math.sin(c * 5); p.armR = -(22 + 8 * Math.sin(c * 5 + 1)); p.rot = 3 * Math.sin(c * 2.5); },
  },
  // Il va s'asseoir dans la case d'aujourd'hui (si elle est à l'écran)
  today: {
    weight: (m, ctx) => (ctx.today && m.eng.visible(m.plat(ctx.today.k)) ? 10 : 0),
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
  // Il dit une des petites phrases (⚙ → Tino), jamais par-dessus une bulle déjà ouverte (un message à lire…)
  chat: {
    weight: (m, ctx) => (ctx.lines.length && !m.bubble ? 7 : 0),
    make: () => [{ type: "chat", dur: rand(3.8, 5.2) }],
    start(m, a) {
      const lines = m.eng.lines();
      if (m.bubble || !lines.length) { a.dur = 0; return; }
      const pool = lines.length > 1 ? lines.filter((l) => l !== m.lastLine) : lines;
      m.lastLine = pick(pool);
      m.gaze = pick([-LOOK * 0.5, LOOK * 0.5]);
      m.say(m.lastLine, { ms: a.dur * 1000 + 600 });
    },
    look: (m) => m.gaze,
    pose(m, a, p) {
      const k = smooth(clamp(Math.min(a.t, a.dur - a.t) / 0.3, 0, 1)), c = m.clock;
      p.head = 6 * Math.sin(c * 7) * k; p.sy += 0.025 * Math.abs(Math.sin(c * 9)) * k;
      p.armL = (-22 - 16 * Math.sin(c * 5)) * k; p.armR = (22 + 16 * Math.sin(c * 5 + 1.3)) * k;
    },
  },
  // Sieste couché sur le côté (et toute la nuit, dans son lit)
  nap: {
    weight: () => 6,
    make: () => [{ type: "nap", dur: rand(6, 11) }],
    start(m, a) { m.side = a.side ?? pick([-1, 1]); if (a.bed) m.bedAt = { k: m.k, x: m.x }; },
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
  // Embêté (touché 5 fois de suite) : sourcils froncés, « 💢 », il trépigne et agite les nageoires
  angry: {
    look: () => 0,
    pose(m, a, p) {
      const c = m.clock, k = smooth(clamp(Math.min(a.t, a.dur - a.t) / 0.15, 0, 1));
      p.sy = 1 - 0.07 * Math.abs(Math.sin(c * 14)) * k; p.sx = 1 + 0.05 * Math.abs(Math.sin(c * 14)) * k;
      p.rot = 4 * Math.sin(c * 26) * k; p.head = 7 * Math.sin(c * 21) * k;
      p.armL = (70 + 18 * Math.sin(c * 19)) * k; p.armR = -(70 + 18 * Math.sin(c * 19 + 1)) * k;
      p.footL = -3.5 * Math.max(0, Math.sin(c * 14)) * k; p.footR = -3.5 * Math.max(0, -Math.sin(c * 14)) * k;
    },
    busy: true,
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
      a.p0 = m.k; a.x0 = m.x; a.F = 0.9 + d / 500; a.h = 90 + d * 0.3;
      if (a.x1 !== a.x0) m.dir = a.x1 < a.x0 ? -1 : 1;
    },
    step(m, a) {
      const p0 = m.plat(a.p0), p1 = m.plat(a.p1);
      if (!p0 || !p1) return true;
      if (a.t < TAKEOFF) { m.y = p0.y; return false; }
      const low = Math.min(p0.y, p1.y), cy = Math.min(low - 20, Math.max(low - a.h, m.eng.v.top + m.size * 1.6)); // sans sortir de l'écran par le haut
      const s = smooth(Math.min(1, (a.t - TAKEOFF) / a.F)), cx = (a.x0 + a.x1) / 2;
      m.x = (1 - s) * (1 - s) * a.x0 + 2 * (1 - s) * s * cx + s * s * a.x1;
      m.y = (1 - s) * (1 - s) * p0.y + 2 * (1 - s) * s * cy + s * s * p1.y;
      if (s >= 1) { m.k = a.p1; m.y = p1.y; }
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
  // De temps en temps, il s'envole vers un autre endroit de l'écran (sur ordinateur : l'autre colonne, sinon inatteignable)
  travel: {
    weight: (m) => (m.eng.plats.filter((q) => q.key !== m.k && m.eng.visible(q)).length ? 6 : 0),
    make: (m) => [{ type: "fly", ...m.flyTarget() }],
  },
  // La page a défilé et il n'était plus à l'écran : il revient — il tombe du haut de l'écran (on est descendu dans la page)
  // ou saute depuis le bas (on est remonté), sur une plateforme visible. dropIn() le lance (il était invisible : on coupe tout).
  drop: {
    start(m, a) {
      const P = m.plat(a.p1), v = m.eng.v;
      if (!P) { a.T = 0; return; }
      m.k = a.p1; m.x = a.x1;
      a.y0 = a.from === "top" ? Math.min(v.top - 2, P.y - m.size) : Math.max(v.bottom + m.size * 1.1, P.y + m.size);
      a.T = a.from === "top" ? Math.sqrt((2 * (P.y - a.y0)) / GRAVITY) : 0.55 + (a.y0 - P.y) / 1800;
      a.h = m.size * 0.7; // en sautant depuis le bas : il monte un peu plus haut que la plateforme, puis s'y pose
    },
    step(m, a) {
      const P = m.plat(a.p1);
      if (!P) return true;
      const s = a.T ? clamp(a.t / a.T, 0, 1) : 1;
      if (a.from === "top") m.y = lerp(a.y0, P.y, s * s); // chute qui accélère
      else if (s < 0.72) { const u = s / 0.72; m.y = lerp(a.y0, P.y - a.h, 1 - (1 - u) * (1 - u)); }
      else { const u = (s - 0.72) / 0.28; m.y = lerp(P.y - a.h, P.y, u * u); }
      return a.t >= a.T + LAND;
    },
    look: () => 0,
    pose(m, a, p) {
      if (a.t < a.T) { // en l'air : nageoires en haut qui battent, pieds qui pendent
        const c = m.clock;
        p.armL = 75 + 25 * Math.sin(c * 22); p.armR = -(75 + 25 * Math.sin(c * 22 + 0.6)); p.footL = p.footR = 2.5; p.sy = 1.06; p.sx = 0.95;
        return;
      }
      const k = 1 - Math.min(1, (a.t - a.T) / LAND); p.sy = 1 - 0.22 * k; p.sx = 1 + 0.15 * k; // réception
    },
    busy: true,
  },
};
const CALM =["idle", "sit", "wave"]; // quand il a un message à dire, il reste là pour qu'on puisse le lire

class Mascot {
  constructor(eng, def) {
    this.eng = eng;
    this.def = def;
    this.size = def.size;
    this.el = document.createElement("div");
    this.el.className = "ms";
    this.el.style.width = this.el.style.height = def.size + "px";
    this.el.title = `${def.name} · tap to pet, rub to squish his head, hold to make ${def.name} sit or stand`;
    this.el.setAttribute("aria-label", def.name);
    this.el.mascot = this; // (pour les essais depuis la console : document.querySelector(".ms").mascot)
    this.el.innerHTML = `<div class="ms-in">${def.svg()}</div>${FX}`;
    this.inner = this.el.firstChild;
    for (const k of ["head", "face", "cheeks", "flower", "arm-l", "arm-r", "foot-l", "foot-r", "zzz-at", "heart-at", "anger-at", "bub-at", "wear-head", "wear-body"]) this[k.replace("-", "_")] = this.el.querySelector(".ms-" + k);
    this.taps = [];
    if (eng.outfit) this.wear(eng.outfit);
    // Lit (derrière lui) et couverture (devant lui) : seulement la nuit, quand il dort dans la case d'aujourd'hui
    this.bedEl = document.createElement("div");
    this.bedEl.className = "ms-bed";
    this.bedEl.innerHTML = BED;
    this.blanketEl = document.createElement("div");
    this.blanketEl.className = "ms-blanket";
    this.blanketEl.innerHTML = BLANKET;
    // k : la clé de la plateforme où il est (voir mountMascots)
    this.k = null; this.x = 0; this.y = 0; this.dir = 1; this.side = 1; this.clock = rand(0, 10);
    this.look = 0; this.gaze = 0; this.sink = 0; this.lie = 0; this.stay = false; this.bubble = null; this.bedK = 0; this.bedAt = null;
    this.act = null; this.plan = [];
    // tête aplatie : flat (0 = normale, 1 = toute plate, < 0 = étirée en rebondissant), press = ce que le frottement demande
    this.flat = 0; this.flatV = 0; this.press = 0; this.rubT = -9; this.rubbed = false; this.down = null; this.petT = 0; this.cheekK = -1;
    this.el.addEventListener("click", (ev) => this.tap(ev));
    // appui long → assis / debout (sans menu « copier l'image » du téléphone)
    this.el.addEventListener("contextmenu", (ev) => ev.preventDefault());
    this.el.addEventListener("pointerdown", (ev) => {
      clearTimeout(this.hold);
      this.held = false;
      this.rubbed = false;
      this.down = { id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY };
      try { this.el.setPointerCapture(ev.pointerId); } catch {} // le frottement continue même si le doigt sort de lui
      this.hold = setTimeout(() => { this.hold = 0; this.held = true; this.toggleStay(); }, HOLD);
    });
    this.el.addEventListener("pointermove", (ev) => this.rub(ev));
    for (const t of ["pointerup", "pointerleave", "pointercancel", "lostpointercapture"]) this.el.addEventListener(t, () => { clearTimeout(this.hold); this.down = null; });
  }

  plat(k = this.k) { return this.eng.byKey.get(k); }
  // Plateformes où il peut sauter d'ici : à l'écran, au-dessus ou au-dessous de lui (elles se chevauchent en largeur), pas trop loin
  reach(k = this.k) {
    const a = this.plat(k);
    if (!a) return [];
    return this.eng.plats.filter((b) => b !== a && this.eng.visible(b) && Math.abs(b.y - a.y) > 8 && Math.abs(b.y - a.y) <= REACH && b.x0 <= a.x1 + 30 && b.x1 >= a.x0 - 30);
  }
  // Nage : la rangée du calendrier entre deux lignes (celle au-dessus de sa ligne, ou en dessous tout en haut), à l'écran
  swimRow() {
    const P = this.plat();
    if (P?.cal == null) return null;
    const c = P.cal > 0 ? P.cal - 1 : 0, line = (n) => this.eng.plats.find((q) => q.cal === n), top = line(c), bot = line(c + 1);
    return top && bot && top.y >= this.eng.v.top && this.eng.visible(bot) ? { top, bot } : null;
  }
  // Où s'envoler : une plateforme à l'écran, plutôt loin d'ici
  flyTarget() {
    const V = this.eng.plats.filter((q) => this.eng.visible(q));
    if (!V.length) return { p1: this.k, x1: this.x };
    let best = null;
    for (let i = 0; i < 8; i++) {
      const P = pick(V), x1 = rand(P.x0, P.x1), d = Math.hypot(x1 - this.x, P.y - this.y);
      if (!best || d > best.d) best = { p1: P.key, x1, d };
      if (d > 120 && P.key !== this.k) break;
    }
    return { p1: best.p1, x1: best.x1 };
  }
  // Il n'est plus à l'écran (la page a défilé) : il revient sur la plateforme visible la plus proche du bord d'où il arrive
  dropIn(from) {
    const V = this.eng.plats.filter((q) => this.eng.visible(q));
    if (!V.length) return false;
    const P = from === "top" ? V[0] : V[V.length - 1];
    this.act = { type: "drop", p1: P.key, x1: clamp(this.x, P.x0, P.x1), from };
    this.plan = []; this.bedAt = null; this.sink = this.lie = 0;
    return true;
  }
  // Première apparition (ou autre onglet) : dans la case d'aujourd'hui si elle est à l'écran, sinon il tombe du haut de l'écran
  place(i = 0) {
    const eng = this.eng, t = eng.today, T = t && this.plat(t.k);
    this.act = null; this.plan = []; this.placed = true; this.bedAt = null;
    if (T && eng.visible(T)) { this.k = t.k; this.x = clamp(t.x + i * 30, T.x0, T.x1); this.y = T.y; this.greet(); return; }
    const P = eng.plats[0];
    this.k = P.key; this.x = rand(P.x0, P.x1); this.y = P.y;
    if (this.dropIn("top")) this.x = this.act.x1;
  }
  rollDist() { return Math.PI * 0.72 * this.size; } // distance d'un tour complet (il roule sans glisser)
  busy() { return !!ACTIONS[this.act?.type]?.busy; }
  // Fait faire une action tout de suite (ou juste après celle en cours si elle ne s'interrompt pas ; s'il nage, il sort de l'eau)
  now(steps) {
    if (!this.busy()) { this.plan = steps.slice(1); this.act = steps[0]; return; }
    this.plan = steps;
    if (this.act.type === "swim") this.act.leave = true;
  }

  // Touché : il saute de joie (et ferme son message)… et le toucher passe quand même au calendrier en dessous
  tap(ev) {
    ev.stopPropagation();
    if (this.held) { this.held = false; return; } // c'était un appui long
    if (this.rubbed) { this.rubbed = false; return; } // on l'a frotté (la souris envoie quand même un « clic »)
    if (this.bubble?.sticky) this.hush();
    const t = performance.now();
    this.taps = [...this.taps.filter((x) => t - x < TEASE_MS), t];
    if (this.taps.length >= TEASE_TAPS) { this.taps = []; this.grumble(); } // trop c'est trop
    else { if (this.act?.type !== "swim") this.now([{ type: "react" }]); this.love(); } // dans l'eau : juste un cœur, il continue
    this.el.style.pointerEvents = "none";
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    this.el.style.pointerEvents = "";
    this.eng.tapping = this; // ce toucher-là ne le fait pas s'envoler
    try { if (under && this.eng.tapThrough(under)) under.click(); } finally { this.eng.tapping = null; }
  }

  // Tenue dessinée : { head: url | null, body: url | null, hideFlower } (images dans le repère du modèle)
  wear(o = {}) {
    const img = (url) => (url ? `<image href="${String(url).replace(/"/g, "%22")}" x="${WEAR.x}" y="${WEAR.y}" width="${WEAR.size}" height="${WEAR.size}" preserveAspectRatio="none"/>` : "");
    this.wear_head.innerHTML = img(o.head);
    this.wear_body.innerHTML = img(o.body);
    this.flower.style.display = o.head && o.hideFlower ? "none" : ""; // un chapeau peut remplacer la fleur
  }

  // Le doigt (ou la souris, bouton enfoncé) glisse sur lui : on lui frotte la tête, elle s'aplatit petit à petit
  rub(ev) {
    const d = this.down;
    if (!d || d.id !== ev.pointerId) return;
    const step = Math.hypot(ev.clientX - d.x, ev.clientY - d.y);
    d.x = ev.clientX; d.y = ev.clientY;
    if (!this.rubbed && Math.hypot(d.x - d.x0, d.y - d.y0) < RUB_MIN) return; // le doigt qui tremble pendant un appui
    if (!this.rubbed) {
      this.rubbed = true;
      clearTimeout(this.hold); // pas d'appui long pendant qu'on le frotte
      this.press = Math.max(0, this.flat);
      this.petT = 0.7; // premier cœur bientôt
      // il s'arrête pour en profiter (pas s'il saute, roule, vole ou nage : seule sa tête s'aplatit ; assis ou endormi, il le reste)
      if (!this.busy() && !this.stay && !["sit", "sleep", "nap", "pet"].includes(this.act?.type)) this.now([{ type: "pet" }]);
    }
    this.press = Math.min(1, this.press + step / (this.size * RUB_FULL));
    this.rubT = this.clock;
  }
  rubbing() { return this.rubbed && !!this.down; }

  love() {
    this.el.classList.remove("ms-love");
    void this.el.offsetWidth;
    this.el.classList.add("ms-love");
  }

  // Touché trop de fois : il s'énerve et lance une de ses phrases râleuses (⚙ → Tino), pas deux fois de suite la même
  grumble() {
    const lines = this.eng.grumbles();
    if (lines.length) {
      const pool = lines.length > 1 ? lines.filter((l) => l !== this.lastGrumble) : lines;
      this.lastGrumble = pick(pool);
      this.say(this.lastGrumble, { ms: 3800 });
    }
    const after = this.stay ? [{ type: "sit", dur: Infinity }] : [];
    if (this.act?.type === "swim") { this.act.leave = true; this.plan = [{ type: "angry", dur: 2.6 }, ...after]; return; } // il sort de l'eau, puis râle
    this.act = { type: "angry", dur: 2.6 }; // tout de suite, même s'il était occupé
    this.plan = after;
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

  // S'envole vers un autre endroit de l'écran, plutôt loin
  flyAway() {
    if (!this.eng.plats.length || this.act?.type === "fly") return;
    this.now([{ type: "fly", ...this.flyTarget() }]);
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
    const me = this.plat(), ctx = { plats: this.eng.plats, today: this.eng.today, lines: this.eng.lines() };
    if (!me) return { type: "idle", dur: 1 };
    if (this.stay) return this.eng.night() && !this.bubble ? { type: "sleep", dur: Infinity } : { type: "sit", dur: Infinity };
    let name;
    if (this.bubble?.sticky) name = pick(CALM);
    else if (this.eng.night()) { // la nuit : dans la case d'aujourd'hui si elle est à l'écran, sinon là où il est ; couché, dans son lit
      const t = ctx.today, T = t && this.plat(t.k);
      if (T && this.eng.visible(T) && (t.k !== this.k || Math.abs(t.x - this.x) > 4)) { this.plan = this.pathTo(t); return this.plan.shift(); }
      return { type: "nap", dur: Infinity, bed: true };
    } else name = weighted(Object.keys(ACTIONS).map((n) => [ACTIONS[n].weight?.(this, ctx) ?? 0, n]));
    const steps = (ACTIONS[name].make ?? (() => [{ type: name }]))(this, me, ctx);
    this.plan = [...steps.slice(1), { type: "idle", dur: rand(0.6, 2.4) }];
    return steps[0];
  }

  // Trajet jusqu'à un point { k, x } : le moins de sauts possible d'une plateforme visible à l'autre, puis la marche ;
  // s'il n'y a pas de chemin (autre colonne…), il y va en volant
  pathTo(target) {
    const prev = new Map([[this.k, null]]), queue = [this.k];
    while (queue.length && !prev.has(target.k)) {
      const k = queue.shift();
      for (const b of this.reach(k)) if (!prev.has(b.key)) { prev.set(b.key, k); queue.push(b.key); }
    }
    if (!prev.has(target.k)) return [{ type: "fly", p1: target.k, x1: target.x }];
    const chain = [];
    for (let k = target.k; k !== this.k; k = prev.get(k)) chain.unshift(k);
    const steps = [];
    let x = this.x;
    for (const k of chain) {
      const t = this.plat(k);
      x = clamp(x + clamp(target.x - x, -60, 60), t.x0, t.x1);
      steps.push({ type: "hop", p1: k, x1: x }, { type: "idle", dur: 0.25 });
    }
    steps.push({ type: "walk", x: target.x });
    return steps;
  }

  update(dt) {
    this.clock += dt;
    if (this.bubble && this.clock >= this.bubble.until) this.hush(true);
    if (this.rubbing() && (this.petT += dt) > 1.1) { this.petT = 0; this.love(); } // un cœur de temps en temps quand on le frotte
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
    // Tête aplatie : suit le frottement ; quand on le lâche, elle revient comme un ressort (s'étire un peu : « boing »)
    if (this.rubbing()) { this.flat += (this.press - this.flat) * Math.min(1, dt * 14); this.flatV = 0; }
    else {
      this.press = 0;
      this.flatV += (-180 * this.flat - 9 * this.flatV) * dt;
      this.flat = Math.max(-0.5, this.flat + this.flatV * dt);
      if (Math.abs(this.flat) < 0.002 && Math.abs(this.flatV) < 0.02) this.flat = this.flatV = 0;
    }
    // Le lit reste tant qu'il est dessus la nuit (un petit saut quand on le touche ne le fait pas disparaître)
    const moving = a && ["walk", "hop", "fly", "roll", "swim", "drop"].includes(a.type);
    const onBed = this.eng.night() && !!this.bedAt && this.bedAt.k === this.k && Math.abs(this.bedAt.x - this.x) < 4 && !moving;
    this.bedK += ((onBed ? 1 : 0) - this.bedK) * Math.min(1, dt * 3);
    if (!onBed && this.bedK < 0.01) { this.bedK = 0; if (!this.eng.night()) this.bedAt = null; }
  }

  // Largeur du lit : un peu plus long que Tino, sans dépasser de la case du jour
  bedWidth() { const P = this.plat(this.bedAt?.k); return Math.min(this.size * 1.3, (P?.cell ?? Infinity) - 4); }

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
    // Tête aplatie (on la frotte) : elle s'écrase sur son cou (la tenue et la fleur avec), le corps se tasse un peu
    const f = this.flat;
    p.sx *= 1 + 0.04 * f; p.sy *= 1 - 0.07 * f;
    // En tournant (roulade, couché) le corps pivote autour de son centre et reste posé sur la ligne
    const th = p.spin * Math.PI / 180, sup = B.support, k = (((p.spin % 360) + 360) % 360) / 15, i = Math.floor(k);
    const bw = this.bedK > 0.001 ? this.bedWidth() : 0, onMattress = this.bedK * bw * (BED_H - MATTRESS) / BED_W; // dans son lit : posé sur le matelas
    const lift = (sup[0] - lerp(sup[i % 24], sup[(i + 1) % 24], k - i)) * u, pivot = (B.cy - 100) * u, down = p.bob + this.sink * SINK * u + lift - onMattress;
    const look = this.look;
    this.el.classList.toggle("ms-sleep", !!A.zzz);
    this.el.classList.toggle("ms-mad", a.type === "angry");
    this.el.classList.toggle("ms-swim", a.type === "swim" && !!a.wet);
    this.el.style.transform = `translate3d(${(this.x - W / 2).toFixed(1)}px, ${(this.y - W * 0.98).toFixed(1)}px, 0)`;
    this.inner.style.transform = `translateY(${down.toFixed(2)}px)` + (p.spin ? ` translateY(${pivot.toFixed(2)}px) rotate(${p.spin.toFixed(1)}deg) translateY(${(-pivot).toFixed(2)}px)` : "")
      + ` rotate(${p.rot.toFixed(2)}deg) scale(${p.sx.toFixed(3)}, ${p.sy.toFixed(3)})`;
    this.head.style.transform = `rotate(${(p.head + look * 0.4).toFixed(2)}deg)` + (f ? ` scale(${(1 + 0.24 * f).toFixed(3)}, ${(1 - 0.42 * f).toFixed(3)})` : "");
    const ck = Math.round(clamp(f, 0, 1) * 20); // il rougit quand on le frotte
    if (ck !== this.cheekK) { this.cheekK = ck; this.cheeks.setAttribute("opacity", (0.45 + 0.02 * ck).toFixed(2)); }
    this.face.style.transform = `translateX(${look.toFixed(2)}px) scaleX(${(1 - Math.abs(look) / 90).toFixed(3)})`;
    this.flower.style.transform = `translate(${(-look * 0.5).toFixed(2)}px, ${(Math.abs(look) * 0.15).toFixed(2)}px)`;
    this.arm_l.style.transform = `translateX(${(look * 0.2).toFixed(2)}px) rotate(${p.armL.toFixed(1)}deg)`;
    this.arm_r.style.transform = `translateX(${(look * 0.2).toFixed(2)}px) rotate(${p.armR.toFixed(1)}deg)`;
    this.foot_l.style.transform = `translate(${(look * 0.35).toFixed(2)}px, ${p.footL.toFixed(2)}px)`;
    this.foot_r.style.transform = `translate(${(look * 0.35).toFixed(2)}px, ${p.footR.toFixed(2)}px)`;
    // « z », cœur et bulle suivent la tête (même couché, même aplatie), sans tourner
    const [hx, hy] = this.def.head, rx = hx - 50, ry = hy - B.cy, drop = 23 * f; // tête aplatie : son sommet descend
    const nx = 50 + rx * Math.cos(th) - (ry + drop) * Math.sin(th), ny = B.cy + rx * Math.sin(th) + (ry + drop) * Math.cos(th) + down / u;
    this.bub_at.style.transform = `translate(${(nx + 8 * this.dir).toFixed(1)}px, ${(ny - 18).toFixed(1)}px)`; // bulles d'eau
    const zx = nx + lerp(28, 12, this.lie) - 78, zy = ny + lerp(-22, -40, this.lie) - 14;
    this.zzz_at.style.transform = `translate(${zx.toFixed(1)}px, ${zy.toFixed(1)}px)`;
    this.heart_at.style.transform = `translate(${(nx - hx).toFixed(1)}px, ${(ny - hy).toFixed(1)}px)`;
    this.anger_at.style.transform = `translate(${(nx + 24).toFixed(1)}px, ${(ny - 23).toFixed(1)}px)`; // « 💢 » en haut de la tête
    this.placeBubble((nx - 50) * u, (ny - 30) * u);
    this.placeBed(bw);
  }

  // Lit centré sur sa place de la nuit, tête de lit du côté de sa tête ; couverture de ses pieds jusqu'au cou
  placeBed(bw) {
    const P = this.bedAt && this.plat(this.bedAt.k), show = this.bedK > 0.01 && !!P;
    this.bedEl.style.visibility = this.blanketEl.style.visibility = show ? "visible" : "hidden";
    if (!show) return;
    const bh = bw * BED_H / BED_W, x = this.bedAt.x, s = this.side, W = this.size;
    // l'oreiller (x = 93 sur 120) sous sa tête (≈ 0,15 × sa taille du côté de la tête), sans sortir de la case
    const shift = clamp(W * 0.15 - bw * (93 - BED_W / 2) / BED_W, -((P.cell ?? Infinity) - bw) / 2, ((P.cell ?? Infinity) - bw) / 2);
    const bx = x + s * shift;
    this.bedEl.style.width = bw.toFixed(1) + "px";
    this.bedEl.style.height = bh.toFixed(1) + "px";
    this.bedEl.style.opacity = this.bedK.toFixed(3);
    this.bedEl.style.transform = `translate3d(${(bx - bw / 2).toFixed(1)}px, ${(P.y - bh).toFixed(1)}px, 0) scaleX(${s})`;
    const kw = W * 0.58, kh = kw * 1.3, top = P.y - bw * (BED_H - MATTRESS) / BED_W + W * 0.08 - kh;
    this.blanketEl.style.width = kw.toFixed(1) + "px";
    this.blanketEl.style.height = kh.toFixed(1) + "px";
    this.blanketEl.style.opacity = (this.bedK * this.lie).toFixed(3); // il se lève (on l'a touché) : la couverture s'efface
    this.blanketEl.style.transform = `translate3d(${(x - s * W * 0.3 - kw / 2).toFixed(1)}px, ${top.toFixed(1)}px, 0) scaleX(${s})`;
  }

  // La bulle se place au-dessus de la tête, sans sortir de l'écran sur les côtés ; sa pointe vise Tino
  placeBubble(dx, headTop) {
    const b = this.bubble;
    if (!b) return;
    if (!b.w) { b.w = b.el.offsetWidth; b.h = b.el.offsetHeight; }
    const v = this.eng.v, W = this.size, cx = this.x + dx;
    const l = Math.max(v.left, cx - 140), r = Math.min(v.right, cx + 140);
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

// La plateforme la plus proche d'une hauteur (de préférence au-dessus / au-dessous de x) : quand la sienne a disparu
function nearestPlat(list, y, x) {
  let best = null, bd = Infinity;
  for (const q of list) { const d = Math.abs(q.y - y) + (x >= q.x0 - 30 && x <= q.x1 + 30 ? 0 : 400); if (d < bd) { bd = d; best = q; } }
  return best;
}
const pageView = () => ({ top: scrollY, bottom: scrollY + innerHeight, left: scrollX, right: scrollX + innerWidth });

// layer : calque posé sur la page (coordonnées de page : il défile avec elle, Tino reste sur sa plateforme)
// platforms() : [{ key, y, x0, x1, cell?, cal? }] — key : la même d'un affichage à l'autre (« cal:2 », une carte, une tâche),
//   c'est elle que Tino retient (pas la position dans la liste, qui change quand on ajoute une tâche) ; cal : numéro de la ligne
//   du calendrier (la nage n'a lieu qu'entre deux lignes du calendrier) ; cell : largeur d'une case (le lit n'en dépasse pas).
//   La liste peut porter .section (l'onglet) : si elle change, Tino réapparaît (case d'aujourd'hui, ou il tombe du haut).
// today() : { key, x } (où s'asseoir / dormir) ou null
// view() : { top, bottom, left, right } = la partie visible de la page (sous la barre d'état, au-dessus de la barre d'onglets) :
//   Tino ne va que sur des plateformes visibles, et si la page défile sans lui, il revient (action « drop »)
// tapThrough(el) : l'appui sur un personnage est-il aussi transmis à cet élément en dessous ?
// lines() : les petites phrases que Tino dit de temps en temps (⚙ → Tino), [] s'il n'y en a pas ;
// grumbles() : ses phrases râleuses quand on le touche 5 fois de suite
export function mountMascots({ layer, kinds = ["tino"], platforms, today = () => null, view = pageView, night = isNight, tapThrough = () => true, lines = () => [], grumbles = () => [] }) {
  injectStyle();
  layer.classList.add("ms-layer");
  const eng = { plats: [], byKey: new Map(), today: null, section: undefined, v: view(), scrollT: 0, night, tapThrough, layer, tapping: null, lines, grumbles };
  const list = kinds.map((k) => new Mascot(eng, KINDS[k] ?? KINDS.tino));
  const room = Math.max(...list.map((m) => m.size)) * 1.05; // place au-dessus d'une plateforme pour qu'il y tienne
  eng.visible = (P) => !!P && P.y - room >= eng.v.top && P.y <= eng.v.bottom;
  list.forEach((m) => layer.append(m.bedEl, m.el, m.blanketEl));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  let raf = 0, last = 0;
  const inView = (m) => m.y <= eng.v.bottom + 2 && m.y - m.size * 1.05 >= eng.v.top - 2;

  // Plateformes relues après chaque affichage (et toutes les 0,5 s : bandeau, police, rotation…) ; Tino reste sur « sa »
  // plateforme (même clé), ou va sur la plus proche si elle a disparu
  function measure() {
    const got = platforms() ?? [], prev = eng.byKey, section = got.section ?? null, moved = section !== eng.section;
    eng.v = view();
    eng.section = section;
    eng.plats = [...got].sort((a, b) => a.y - b.y);
    eng.byKey = new Map(eng.plats.map((q) => [q.key, q]));
    const t = today();
    eng.today = t && eng.byKey.has(t.key) ? { k: t.key, x: t.x } : null;
    list.forEach((m, i) => {
      m.el.hidden = m.bedEl.hidden = m.blanketEl.hidden = !eng.plats.length;
      if (m.bubble) m.bubble.el.hidden = !eng.plats.length;
      if (!eng.plats.length) return;
      if (!m.placed || moved) { m.place(i); return; }
      if (!eng.byKey.has(m.k)) m.k = nearestPlat(eng.plats, prev.get(m.k)?.y ?? m.y, m.x).key;
      const P = m.plat();
      m.x = clamp(m.x, P.x0, P.x1);
      if (!m.busy()) m.y = P.y;
    });
  }

  function refresh() {
    measure();
    list.forEach((m) => {
      if (!eng.plats.length) return;
      if (reduce.matches) {
        if (m.act?.type === "drop") { m.k = m.act.p1; m.x = m.act.x1; m.y = m.plat()?.y ?? m.y; } // sans animation : il est déjà là
        m.act = { type: "sit", t: 0, dur: Infinity }; m.sink = 1; m.lie = 0;
      }
      m.render();
    });
  }

  // Il n'est plus à l'écran (la page a défilé) et le défilement est fini : il revient (pas au milieu d'un saut ou d'un vol)
  function follow(m) {
    if (m.el.hidden || ["drop", "fly", "hop"].includes(m.act?.type) || performance.now() - eng.scrollT < FOLLOW_MS || inView(m)) return;
    m.dropIn(m.y > eng.v.bottom ? "bottom" : "top");
  }

  let since = 0;
  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if ((since += dt) > 0.5) {
      since = 0;
      measure();
      if (!eng.plats.length) { raf = 0; return; }
    } else eng.v = view();
    list.forEach((m) => { follow(m); m.update(dt); m.render(); });
    raf = requestAnimationFrame(frame);
  }

  // Défilement : on note quand il a eu lieu (follow attend qu'il soit fini) ; sans animations, Tino est reposé tout de suite
  let scrollEnd = 0;
  const onScroll = () => {
    eng.scrollT = performance.now();
    clearTimeout(scrollEnd);
    scrollEnd = setTimeout(() => {
      eng.v = view();
      if (!reduce.matches || !eng.plats.length) return;
      list.forEach((m) => {
        if (inView(m)) return;
        const V = eng.plats.filter((q) => eng.visible(q)), P = m.y > eng.v.bottom ? V[V.length - 1] : V[0];
        if (!P) return;
        m.k = P.key; m.x = clamp(m.x, P.x0, P.x1); m.y = P.y; m.bedAt = null;
        m.render();
      });
    }, FOLLOW_MS + 20);
  };
  addEventListener("scroll", onScroll, { passive: true });

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
    wear(o) { eng.outfit = o; list.forEach((m) => m.wear(o)); },
    hush() { tino?.hush(true); },
    flyAway() { if (!reduce.matches) tino?.flyAway(); },
    destroy() { cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", onVisible); removeEventListener("scroll", onScroll); list.forEach((m) => { m.hush(true); m.el.remove(); m.bedEl.remove(); m.blanketEl.remove(); }); },
  };
}

// Aperçu d'une seule pose qui tourne en boucle sur place (page de test) ; dir = -1 : tourné vers la gauche
// type "bed" : la sieste de la nuit, dans son lit ; type "chat" : il dit une phrase ; cell : largeur d'une case du calendrier
export function demoPose(box, kind, type, size, dir = 1, cell = Infinity) {
  injectStyle();
  const lines = ["Drink some water 💧", "You've got this!"];
  const plat = { key: "demo", y: size, x0: size / 2, x1: size / 2, cell };
  const eng = { plats: [plat], byKey: new Map([["demo", plat]]), v: { top: -Infinity, bottom: Infinity, left: -Infinity, right: Infinity }, visible: () => true, today: null, night: () => ["sleep", "nap", "bed"].includes(type), tapThrough: () => false, layer: box, lines: () => (type === "chat" ? lines : []), grumbles: () => ["Stop poking me! 😤"] };
  const m = new Mascot(eng, { ...KINDS[kind], size });
  box.style.position = "relative";
  box.style.width = box.style.height = size + "px";
  box.append(m.bedEl, m.el, m.blanketEl);
  m.k = "demo"; m.x = size / 2; m.y = size; m.dir = dir;
  if (type === "walk") m.update = function (dt) { this.clock += dt; this.act ??= { type: "walk", t: 0, x: this.x }; this.dir = dir; this.ease(dt); }; // marche sur place
  if (type === "swim") m.update = function (dt) { // nage sur place, en ondulant
    this.clock += dt;
    const w = this.clock;
    this.act = { type: "swim", t: SWIM_IN + 1, out: Infinity, wet: true, spin: dir * (SWIM_TILT + 8 * Math.sin(w * 4.2 + 1)) };
    this.dir = dir; this.y = size * (0.8 + 0.05 * Math.sin(w * 4.2)); this.ease(dt);
  };
  if (type === "pet") { // on le frotte 1,4 s, on le lâche (boing), et ainsi de suite
    m.rubbing = function () { return this.clock % 2.6 < 1.4; };
    m.update = function (dt) { if (this.rubbing()) { this.press = 1; this.rubT = this.clock; } Mascot.prototype.update.call(this, dt); };
  }
  m.think = () => ({
    hop: { type: "hop", p1: "demo", x1: m.x + dir * 0.01 },
    roll: { type: "roll", dir, n: 1 },
    fly: { type: "fly", p1: "demo", x1: m.x + dir * 0.01 },
    bed: { type: "nap", dur: Infinity, bed: true, side: dir },
    chat: { type: "chat", dur: 4 },
    angry: { type: "angry", dur: 2.6 },
    pet: { type: "pet" },
  }[type] ??{ type, dur: type === "wave" ? 2.2 : type === "nap" ? Infinity : 1 });
  let last = performance.now();
  const loop = (t) => { m.update(Math.min(0.05, (t - last) / 1000)); last = t; m.render(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  return m;
}
