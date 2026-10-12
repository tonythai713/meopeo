// La maison de Tino (onglet Tino, supabase/32_shells_house.sql) : la pièce où vit le grand Tino, les meubles dessinés ici (ceux
// de la boutique ; leurs dessins à eux sont des PNG du stockage) et le mode « ranger » (glisser un meuble, le retourner, le
// remettre dans le carton). Rien ici ne parle à la base : app.js donne les meubles et enregistre les déplacements.
//
// Repère : x, y = le bas-milieu du meuble, en part de la largeur / hauteur de la pièce (la pièce a toujours la même forme, 4 × 3 :
// un meuble est au même endroit sur tous les écrans) ; sa largeur = size × la largeur de la pièce. Profondeur : plus un meuble
// est bas, plus il est devant ; les tapis (flat) toujours par terre, derrière tout ; Tino a ses pieds en TINO_Y.

export const TINO_Y = 0.93, WALL_Y = 0.62; // (le bas du mur, où commence le plancher)
const L = `stroke="#5a4766" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"`;
const star = (x, y, r, fill = "#fff3c4") => `<path d="M${x} ${y - r}L${x + r * 0.3} ${y - r * 0.3}L${x + r} ${y}L${x + r * 0.3} ${y + r * 0.3}L${x} ${y + r}L${x - r * 0.3} ${y + r * 0.3}L${x - r} ${y}L${x - r * 0.3} ${y - r * 0.3}Z" fill="${fill}"/>`;
const book = (x, w, h, base, fill) => `<rect x="${x}" y="${base - h}" width="${w}" height="${h}" rx="1.2" fill="${fill}" stroke="#5a4766" stroke-width="1.4"/><path d="M${x + 1.5} ${base - h + 4}H${x + w - 1.5}" stroke="#fff" stroke-opacity="0.6" stroke-width="1.2"/>`;
const bulb = (x, y, c) => `<circle cx="${x}" cy="${y + 7}" r="8" fill="${c}" opacity="0.28"/><path d="M${x} ${y}V${y + 2}" stroke="#3d5a3d" stroke-width="2"/><ellipse cx="${x}" cy="${y + 7}" rx="3.6" ry="5.2" fill="${c}" stroke="#5a4766" stroke-width="1.2"/>`;
const fishy = (x, y, c, d = 1) => `<g transform="translate(${x} ${y}) scale(${d} 1)"><path d="M8 0L15 -5V5Z" fill="${c}" stroke="#5a4766" stroke-width="1.2" stroke-linejoin="round"/><ellipse cx="0" cy="0" rx="9" ry="5.5" fill="${c}" stroke="#5a4766" stroke-width="1.2"/><circle cx="-4" cy="-1" r="1.2" fill="#2b2233"/></g>`;

// Les meubles dessinés ici : vb = taille du dessin (sa forme ; la taille dans la pièce vient de la base) ; flat = posé à plat
export const FURNITURE = {
  rug: { vb: [200, 56], flat: true, svg: `<ellipse cx="100" cy="28" rx="97" ry="25" fill="#7d6fd8" ${L}/>
    <ellipse cx="100" cy="28" rx="84" ry="19" fill="none" stroke="#b9b0ff" stroke-width="2" stroke-dasharray="5 4"/>
    <path d="M104 19A11 8.5 0 1 0 104 37A8.5 6.6 0 1 1 104 19Z" fill="#ffd96a"/>${star(58, 24, 4)}${star(142, 31, 4)}${star(124, 17, 3)}${star(76, 38, 3)}${star(150, 20, 2.5)}` },
  plant: { vb: [60, 110], svg: `<path d="M30 72C10 62 4 42 12 26C24 34 32 52 30 72Z" fill="#69b86b" ${L}/><path d="M30 72C50 62 56 42 48 26C36 34 28 52 30 72Z" fill="#69b86b" ${L}/>
    <path d="M30 72C22 50 24 22 32 6C40 22 38 50 30 72Z" fill="#82c785" ${L}/><path d="M30 70C18 66 8 60 4 48C16 48 26 56 30 70Z" fill="#5aa65c" ${L}/>
    <path d="M30 70C42 66 52 60 56 48C44 48 34 56 30 70Z" fill="#5aa65c" ${L}/><path d="M31 66C30 46 31 28 32 14M18 36C24 46 28 56 30 66M42 36C36 46 32 56 30 66" stroke="#2f7a3c" stroke-width="1.2" fill="none"/>
    <path d="M15 72H45L41 106H19Z" fill="#e07a5f" ${L}/><rect x="11" y="66" width="38" height="10" rx="3" fill="#ec9479" ${L}/>` },
  lamp: { vb: [50, 140], svg: `<circle cx="25" cy="32" r="24" fill="#fff3b0" opacity="0.35"/><ellipse cx="25" cy="131" rx="15" ry="5.5" fill="#6b5b7b" ${L}/>
    <rect x="23.2" y="40" width="3.6" height="90" rx="1.5" fill="#8a7a9a"/><path d="M8 42H42L34 12H16Z" fill="#ffe3a3" ${L}/><path d="M12 34H38" stroke="#f5c76b" stroke-width="2"/>` },
  window: { vb: [120, 130], svg: `<defs><linearGradient id="hs-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e2a6b"/><stop offset="1" stop-color="#4b5bb0"/></linearGradient></defs>
    <path d="M16 118V52A44 44 0 0 1 104 52V118Z" fill="#f8f4ff" ${L}/><path d="M23 112V53A37 37 0 0 1 97 53V112Z" fill="url(#hs-sky)" stroke="#5a4766" stroke-width="1.5"/>
    <path d="M78 34A10 10 0 1 0 84 52A8 8 0 1 1 78 34Z" fill="#ffe28a"/>${star(40, 46, 3)}${star(50, 70, 2.5)}${star(86, 80, 3)}${star(36, 92, 2)}${star(66, 98, 2.5)}
    <path d="M60 16V112M23 74H97" stroke="#f8f4ff" stroke-width="4"/><rect x="8" y="114" width="104" height="9" rx="3" fill="#e9e0f5" ${L}/>
    <rect x="1" y="3" width="118" height="5" rx="2.5" fill="#c98e5c" ${L}/>
    <path d="M3 8C20 40 8 92 19 126H3Z" fill="#ff9ec7" ${L}/><path d="M117 8C100 40 112 92 101 126H117Z" fill="#ff9ec7" ${L}/>
    <path d="M9 30C13 60 8 92 12 120M111 30C107 60 112 92 108 120" stroke="#e86fa2" stroke-width="1.3" fill="none"/>` },
  frame: { vb: [70, 80], svg: `<path d="M35 3L13 19M35 3L57 19" stroke="#5a4766" stroke-width="1.6" fill="none"/><circle cx="35" cy="3" r="2" fill="#5a4766"/>
    <rect x="5" y="17" width="60" height="60" rx="5" fill="#c98e5c" ${L}/><rect x="12" y="24" width="46" height="46" rx="2" fill="#ffe4ef" stroke="#5a4766" stroke-width="1.5"/>
    <path d="M35 60C17 48 21 33 29 35C32 36 35 39 35 41C35 39 38 36 41 35C49 33 53 48 35 60Z" fill="#ff6b9a" stroke="#c2185b" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="29.5" cy="40" r="2.2" fill="#fff" opacity="0.7"/>` },
  clock: { vb: [60, 60], svg: `<circle cx="30" cy="30" r="27" fill="#ffb3c8" ${L}/><circle cx="30" cy="30" r="21" fill="#fff7e6" stroke="#5a4766" stroke-width="1.5"/>
    ${[...Array(12)].map((_, i) => { const a = (i * Math.PI) / 6, r1 = i % 3 ? 18 : 16; return `<path d="M${(30 + Math.sin(a) * r1).toFixed(1)} ${(30 - Math.cos(a) * r1).toFixed(1)}L${(30 + Math.sin(a) * 19.5).toFixed(1)} ${(30 - Math.cos(a) * 19.5).toFixed(1)}" stroke="#5a4766" stroke-width="${i % 3 ? 1.2 : 2}" stroke-linecap="round"/>`; }).join("")}
    <path d="M30 30L22.5 25.5" stroke="#5a4766" stroke-width="2.6" stroke-linecap="round"/><path d="M30 30L38 17" stroke="#5a4766" stroke-width="1.8" stroke-linecap="round"/><circle cx="30" cy="30" r="2.2" fill="#e8590c"/>` },
  lights: { vb: [240, 46], svg: `<path d="M2 6Q60 34 120 10Q180 34 238 6" stroke="#3d5a3d" stroke-width="2" fill="none"/>
    ${[[25.3, 15.1], [54.6, 20.7], [84.2, 19.7], [110.4, 13.5], [129.6, 13.5], [155.8, 19.7], [185.4, 20.7], [214.7, 15.1]].map(([x, y], i) => bulb(x, y, ["#ff6b6b", "#ffd43b", "#69db7c", "#4dabf7", "#da77f2"][i % 5])).join("")}` },
  shelf: { vb: [90, 130], svg: `<rect x="4" y="4" width="82" height="122" rx="4" fill="#c98e5c" ${L}/><rect x="10" y="10" width="70" height="110" rx="2" fill="#a8714a"/>
    <rect x="9" y="44" width="72" height="5" fill="#dca97e" stroke="#5a4766" stroke-width="1.2"/><rect x="9" y="82" width="72" height="5" fill="#dca97e" stroke="#5a4766" stroke-width="1.2"/>
    ${book(13, 8, 28, 44, "#ff8787")}${book(21, 7, 24, 44, "#74c0fc")}${book(28, 9, 30, 44, "#ffd43b")}${book(37, 7, 22, 44, "#b197fc")}
    <path d="M58 44H76V36Q67 26 58 36Z" fill="#69b86b" stroke="#5a4766" stroke-width="1.2"/><rect x="60" y="36" width="14" height="8" rx="2" fill="#e07a5f" stroke="#5a4766" stroke-width="1.2"/>
    ${book(13, 9, 26, 82, "#63e6be")}${book(22, 7, 30, 82, "#ff922b")}<g transform="rotate(14 36 82)">${book(31, 8, 26, 82, "#f783ac")}</g>
    <circle cx="64" cy="73" r="8" fill="#d0ebff" stroke="#5a4766" stroke-width="1.2"/><path d="M60 74l4-2.5v5z" fill="#ff922b"/>
    ${book(13, 8, 24, 120, "#b197fc")}${book(21, 9, 28, 120, "#ff8787")}${book(30, 7, 22, 120, "#74c0fc")}<rect x="50" y="104" width="26" height="16" rx="2" fill="#ffd8a8" stroke="#5a4766" stroke-width="1.2"/><path d="M50 110H76" stroke="#5a4766" stroke-width="1"/>` },
  table: { vb: [110, 72], svg: `<rect x="18" y="40" width="6" height="30" rx="2" fill="#a8714a" ${L}/><rect x="86" y="40" width="6" height="30" rx="2" fill="#a8714a" ${L}/>
    <path d="M5 38V43A50 11 0 0 0 105 43V38Z" fill="#b07a4f" ${L}/><ellipse cx="55" cy="38" rx="50" ry="11" fill="#dca97e" ${L}/>
    <path d="M58 26Q66 24 68 18" stroke="#5a4766" stroke-width="2" fill="none"/><path d="M32 26Q24 26 25 18Q26 14 31 18" stroke="#5a4766" stroke-width="2" fill="none"/>
    <ellipse cx="45" cy="28" rx="14" ry="11" fill="#8fd3c7" ${L}/><path d="M38 18Q45 13 52 18" fill="#8fd3c7" ${L}/><circle cx="45" cy="14.5" r="2.2" fill="#ffd43b" stroke="#5a4766" stroke-width="1.2"/>
    <path d="M76 26H86L84.5 36H77.5Z" fill="#fff" stroke="#5a4766" stroke-width="1.6" stroke-linejoin="round"/><path d="M86 28.5Q90 30 85.5 33.5" stroke="#5a4766" stroke-width="1.6" fill="none"/>
    <path d="M79 22Q77 18 80 15M83 22Q81 18 84 15" stroke="#adb5bd" stroke-width="1.3" fill="none" stroke-linecap="round"/>` },
  beanbag: { vb: [100, 80], svg: `<ellipse cx="50" cy="74" rx="44" ry="5" fill="#000" opacity="0.12"/>
    <path d="M10 72C2 52 12 24 38 17C56 12 70 20 79 31C93 45 99 61 91 72Z" fill="#ff9ec7" ${L}/>
    <path d="M22 66C20 52 28 36 42 30" stroke="#ffd0e3" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M40 70C46 56 60 48 76 50" stroke="#e86fa2" stroke-width="1.5" fill="none"/>` },
  bed: { vb: [200, 110], svg: `<rect x="10" y="98" width="8" height="10" rx="2" fill="#6b5b7b"/><rect x="182" y="98" width="8" height="10" rx="2" fill="#6b5b7b"/>
    <rect x="4" y="18" width="32" height="84" rx="12" fill="#b197fc" ${L}/><circle cx="20" cy="36" r="5" fill="#ffe28a" stroke="#5a4766" stroke-width="1.4"/>
    <rect x="26" y="78" width="150" height="16" rx="5" fill="#9b87e8" ${L}/><rect x="30" y="58" width="150" height="22" rx="7" fill="#fff" ${L}/>
    <rect x="36" y="44" width="40" height="20" rx="9" fill="#fff8e8" ${L}/>
    <path d="M72 56Q124 46 182 56V84H72Z" fill="#7d6fd8" ${L}/><path d="M72 62Q124 54 182 62" stroke="#b9b0ff" stroke-width="2" fill="none" stroke-dasharray="5 4"/>
    ${star(98, 70, 3.5)}${star(130, 66, 3)}${star(158, 74, 3.5)}${star(114, 78, 2.5)}
    <rect x="172" y="48" width="22" height="56" rx="8" fill="#b197fc" ${L}/>` },
  aquarium: { vb: [110, 110], svg: `<rect x="12" y="70" width="86" height="36" rx="4" fill="#8a6a9e" ${L}/><path d="M55 74V102M48 88H50M60 88H62" stroke="#5a4766" stroke-width="1.6"/>
    <rect x="6" y="8" width="98" height="62" rx="4" fill="#d0ebff" ${L}/><rect x="9" y="17" width="92" height="50" fill="#74c0fc" opacity="0.8"/>
    <path d="M9 60Q30 54 55 60T101 58V67H9Z" fill="#ffe8a3"/><path d="M22 62Q16 50 22 40Q28 30 22 22M30 62Q36 52 31 44" stroke="#2f9e44" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M86 60Q92 50 86 42" stroke="#37b24d" stroke-width="3" fill="none" stroke-linecap="round"/>${fishy(50, 34, "#ff922b")}${fishy(74, 48, "#ffd43b", -1)}
    <circle cx="62" cy="26" r="2" fill="#fff" opacity="0.8"/><circle cx="66" cy="20" r="1.5" fill="#fff" opacity="0.8"/><rect x="4" y="4" width="102" height="7" rx="2" fill="#5a4766"/>` },
  tv: { vb: [120, 110], svg: `<rect x="8" y="72" width="104" height="34" rx="4" fill="#c98e5c" ${L}/><path d="M60 76V102M52 89H54M66 89H68" stroke="#5a4766" stroke-width="1.6"/>
    <rect x="76" y="64" width="28" height="9" rx="2.5" fill="#f1f3f5" ${L}/><circle cx="98" cy="68.5" r="1.6" fill="#40c057"/>
    <rect x="54" y="66" width="12" height="7" fill="#495057"/><rect x="14" y="6" width="92" height="62" rx="7" fill="#343a40" ${L}/>
    <rect x="20" y="12" width="80" height="48" rx="3" fill="#a5d8ff"/><rect x="20" y="48" width="80" height="12" fill="#69db7c"/><path d="M20 48H100" stroke="#2f9e44" stroke-width="1.5"/>
    <rect x="34" y="38" width="9" height="10" rx="2" fill="#ff6b6b"/><circle cx="37" cy="41.5" r="1" fill="#fff"/><circle cx="40" cy="41.5" r="1" fill="#fff"/>
    <rect x="62" y="40" width="8" height="8" fill="#e8590c"/><circle cx="82" cy="28" r="3.5" fill="#ffd43b" stroke="#e67700" stroke-width="1"/>
    <path d="M70 18Q75 14 80 18" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>` },
};
const URLS = new Map();
// Un meuble dessiné ici → adresse d'image (data:), ou null si cette version de l'app ne le connaît pas
export function furnitureUrl(key) {
  const f = FURNITURE[key];
  if (!f) return null;
  if (!URLS.has(key)) {
    const [w, h] = f.vb;
    URLS.set(key, "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${w + 4} ${h + 4}" width="${w + 4}" height="${h + 4}">${f.svg}</svg>`));
  }
  return URLS.get(key);
}

// La pièce, posée derrière le grand Tino (stage = .mp-show-stage). opts.onMove(id, { x, y } | { flip } | { x: null, y: null })
// enregistre ; opts.onSelect(id | null) : le meuble choisi en mode « ranger ». set(list) : [{ id, x, y, flip, url, size, flat }]
// (seulement ceux qui sont dans la pièce). Pendant qu'on fait glisser un meuble, set() ne touche pas à celui-là.
export function mountRoom(stage, { onMove, onSelect }) {
  const room = document.createElement("div");
  room.className = "hs-room";
  room.innerHTML = `<div class="hs-wall"></div><div class="hs-floor"></div><div class="hs-items"></div>`;
  stage.prepend(room);
  stage.classList.add("mp-house");
  const layer = room.querySelector(".hs-items"), els = new Map();
  let arranging = false, sel = null, drag = null;
  const depth = (it) => (it.flat ? 1 : 2 + Math.round(it.y * 1000));
  const put = (el, it) => {
    el.style.left = `${(it.x * 100).toFixed(2)}%`;
    el.style.top = `${(it.y * 100).toFixed(2)}%`;
    el.style.width = `${(it.size * 100).toFixed(2)}%`;
    el.style.zIndex = depth(it);
    el.classList.toggle("hs-flip", !!it.flip);
  };
  const select = (id) => {
    sel = id;
    for (const [k, el] of els) el.classList.toggle("hs-sel", k === id);
    onSelect?.(id);
  };
  function down(e) {
    if (!arranging || e.button > 0) return;
    const el = e.currentTarget, r = room.getBoundingClientRect(), it = el._it;
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch {}
    drag = { el, it, id: it.id, pid: e.pointerId, dx: e.clientX - (r.left + it.x * r.width), dy: e.clientY - (r.top + it.y * r.height), sx: e.clientX, sy: e.clientY, moved: false };
    select(it.id);
  }
  function move(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
    drag.moved = true;
    const r = room.getBoundingClientRect();
    drag.it.x = Math.min(1, Math.max(0, (e.clientX - drag.dx - r.left) / r.width));
    drag.it.y = Math.min(1, Math.max(0.06, (e.clientY - drag.dy - r.top) / r.height));
    put(drag.el, drag.it);
  }
  function up(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    const d = drag;
    drag = null;
    if (d.moved) onMove?.(d.id, { x: +d.it.x.toFixed(4), y: +d.it.y.toFixed(4) });
  }
  room.addEventListener("pointerdown", (e) => { if (arranging && !e.target.closest?.(".hs-item")) select(null); }); // (toucher à côté : plus rien de choisi)
  return {
    el: room,
    set(list) {
      const keep = new Set();
      for (const it of list) {
        keep.add(it.id);
        if (drag?.id === it.id) continue;
        let el = els.get(it.id);
        if (!el) {
          el = document.createElement("img");
          el.className = "hs-item";
          el.alt = "";
          el.draggable = false;
          el.addEventListener("pointerdown", down);
          el.addEventListener("pointermove", move);
          el.addEventListener("pointerup", up);
          el.addEventListener("pointercancel", up);
          layer.append(el);
          els.set(it.id, el);
        }
        if (el.getAttribute("src") !== it.url) el.src = it.url;
        el._it = { ...it };
        put(el, it);
        el.classList.toggle("hs-sel", it.id === sel);
      }
      for (const [k, el] of els) if (!keep.has(k)) { el.remove(); els.delete(k); }
      if (sel && !keep.has(sel)) select(null);
    },
    arrange(on) {
      arranging = !!on;
      stage.classList.toggle("hs-arranging", arranging);
      if (!arranging) { drag = null; select(null); }
    },
    selected: () => sel,
    busy: () => !!drag,
    destroy() { room.remove(); stage.classList.remove("mp-house", "hs-arranging"); },
  };
}
