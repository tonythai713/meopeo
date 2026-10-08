// MEOPEO_TINO_WIDGET — widget « Tino » de MeoPeo pour l'app Scriptable (iPhone).
// Ce fichier est téléchargé par le petit script collé dans Scriptable (⚙ Settings → Home-screen widget → Tino widget),
// qui fournit HOURS = heures de sommeil réglées sur le téléphone au moment de l'ajout ({ night: [de, à], nap: [de, à] })
// et KEY = clé de widget (pour l'image de Tino avec sa tenue ; les premiers widgets Tino n'en avaient pas).
// Montre Tino en train de faire une de ses activités, choisie au hasard selon l'heure (comme dans l'app : il dort la nuit
// et pendant la sieste, cuisine surtout aux repas, boit une bière le soir…) ; iOS rafraîchit le widget quand il veut
// (~15 min à 1 h) → une autre activité. Image : celle de Tino habillé (dessinée par l'app, widget_tino de
// 18_widget_scenes.sql), sinon l'image de base (widget/tino/*.png). Hors connexion : les dernières images reçues restent.

const BASE = "https://tonythai713.github.io/meopeo/";
const SUPABASE_URL = "https://llwbzhlbaygolzuwlbkf.supabase.co";
const SUPABASE_KEY = "sb_publishable_rMCGFrjzDmhsZ6eJ163B6g_MTA4dQSd"; // clé publique de l'app
const WKEY = typeof KEY === "string" ? KEY : "";
const H = typeof HOURS === "object" && HOURS?.night && HOURS?.nap ? HOURS : { night: ["22:00", "07:00"], nap: ["12:30", "13:00"] };
// activité → [image, texte, ciel] (ciel : couleurs du fond, haut → bas)
const SCENES = {
  sleep: ["sleep", "Tino is fast asleep 😴", "night"], nap: ["sleep", "Nap time 😴", "day"],
  cook: ["cook", "Cooking a crêpe 🍳", "day"], bbq: ["bbq", "Barbecue time 🍖", "day"], rice: ["rice", "The rice is cooking 🍚", "day"],
  pho: ["pho", "Slurping pho 🍜", "day"], matcha: ["matcha", "Matcha break 🍵", "day"], beer: ["beer", "Cheers! 🍺", "evening"],
  game: ["game", "Gaming 🎮", "day"], shop: ["shop", "Grocery run 🛒", "day"], scooter: ["scooter", "Scooter ride 🛵", "day"],
  wave: ["wave", "Hi! 👋", "day"], sit: ["sit", "Just chilling ☁️", "day"],
};
const SKIES = { day: ["#bfe0ff", "#fdf3df"], evening: ["#3b2f6b", "#e58b6b"], night: ["#0e1230", "#232a63"] };

const mins = (s) => { const [h, m] = String(s).split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const inSpan = (t, a, b) => a !== b && (a < b ? t >= a && t < b : t >= a || t < b);
const pick = (weights) => { let r = Math.random() * Object.values(weights).reduce((a, b) => a + b, 0); for (const [k, w] of Object.entries(weights)) if ((r -= w) < 0) return k; return Object.keys(weights)[0]; };
function pickScene(now) {
  const t = now.getHours() * 60 + now.getMinutes(), nap = mins(H.nap[0]);
  if (inSpan(t, mins(H.night[0]), mins(H.night[1]))) return "sleep";
  if (inSpan(t, nap, mins(H.nap[1]))) return "nap";
  if (inSpan(t, (nap + 1380) % 1440, nap) || inSpan(t, 18 * 60 + 30, 19 * 60 + 30)) return pick({ cook: 3, bbq: 2, rice: 2, pho: 3, sit: 1, wave: 1 }); // repas
  if (t >= 18 * 60) return pick({ beer: 3, game: 3, scooter: 2, shop: 1, sit: 1 }); // soir
  return pick({ game: 3, matcha: 3, shop: 2, scooter: 2, wave: 2, sit: 1, cook: 1 });
}

const fm = FileManager.local();
async function picture(id) {
  const file = fm.joinPath(fm.documentsDirectory(), `meopeo-tino-${id}.png`);
  try {
    const req = new Request(`${BASE}widget/tino/${id}.png`);
    req.timeoutInterval = 15;
    const img = await req.loadImage();
    fm.writeImage(file, img);
    return img;
  } catch (e) {
    return fm.fileExists(file) ? fm.readImage(file) : null;
  }
}

// Image de Tino habillé pour cette scène (null : pas de tenue portée, pas de clé, ou base sans 18 → image de base)
async function dressed(id) {
  if (!WKEY) return null;
  const file = fm.joinPath(fm.documentsDirectory(), `meopeo-tino-dressed-${id}.png`);
  try {
    const req = new Request(`${SUPABASE_URL}/rest/v1/rpc/widget_tino`);
    req.method = "POST";
    req.headers = { apikey: SUPABASE_KEY, "Content-Type": "application/json" };
    req.body = JSON.stringify({ p_token: WKEY, p_scene: id });
    req.timeoutInterval = 15;
    const r = await req.loadJSON();
    if (r && r.png) { const img = Image.fromData(Data.fromBase64String(r.png)); fm.writeImage(file, img); return img; }
    if (r === null && fm.fileExists(file)) fm.remove(file); // plus de tenue : l'ancienne image habillée n'a plus lieu d'être
    return null;
  } catch (e) {
    return fm.fileExists(file) ? fm.readImage(file) : null; // hors connexion : la dernière image habillée
  }
}

const now = new Date(), scene = pickScene(now), [imgId, caption, sky] = SCENES[scene];
const img = (await dressed(imgId)) ?? (await picture(imgId));
const family = config.widgetFamily ?? "medium";
const dark = sky !== "day", text = new Color(dark ? "#eceeff" : "#1c2046"), gold = new Color(dark ? "#ffe8a3" : "#8a5a00");
const w = new ListWidget();
const g = new LinearGradient();
g.colors = SKIES[sky].map((c) => new Color(c));
g.locations = [0, 1];
w.backgroundGradient = g;
w.url = BASE;
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
const label = (stack, s, size, color, bold = false) => { const x = stack.addText(s); x.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size); x.textColor = color; x.lineLimit = 2; x.minimumScaleFactor = 0.7; return x; };
const pic = (stack, side) => {
  if (!img) { label(stack, "🦭", side * 0.6, text); return; }
  const i = stack.addImage(img);
  i.imageSize = new Size(side, side);
};

if (family.startsWith("accessory")) { // écran verrouillé : juste le texte
  label(w, `🦭 ${caption}`, 12, Color.white(), true);
} else if (family === "small") {
  w.setPadding(4, 4, 8, 4);
  const top = w.addStack(); top.addSpacer(); pic(top, 118); top.addSpacer();
  const bot = w.addStack(); bot.addSpacer(); label(bot, caption, 11, text, true).centerAlignText(); bot.addSpacer();
} else if (family === "medium") {
  w.setPadding(6, 10, 6, 14);
  const row = w.addStack();
  row.centerAlignContent();
  pic(row, 140);
  row.addSpacer(10);
  const col = row.addStack();
  col.layoutVertically();
  label(col, "Tino", 12, gold, true);
  col.addSpacer(2);
  label(col, caption, 17, text, true);
  col.addSpacer(4);
  label(col, `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} · MeoPeo`, 11, gold);
  row.addSpacer();
} else {
  w.setPadding(10, 10, 14, 10);
  label(w, "Tino", 14, gold, true);
  const mid = w.addStack(); mid.addSpacer(); pic(mid, 270); mid.addSpacer();
  w.addSpacer(4);
  const bot = w.addStack(); bot.addSpacer(); label(bot, caption, 20, text, true).centerAlignText(); bot.addSpacer();
}
if (config.runsInWidget) Script.setWidget(w);
else await w.presentMedium(); // lancé dans Scriptable : aperçu du widget moyen
Script.complete();
