// MEOPEO_DOODLE_WIDGET — widget « Doodle » de MeoPeo pour l'app Scriptable (iPhone).
// Ce fichier est téléchargé par le petit script collé dans Scriptable (⚙ Settings → Home-screen widget → Doodle widget),
// qui fournit KEY = clé de widget. Montre le DERNIER dessin envoyé par l'autre (📝 Notes → ✏️ Doodles), lu avec la clé
// (widget_doodle de 19_doodles.sql : { label, mark, png, at }, png null s'il n'a encore rien envoyé). iOS rafraîchit le
// widget quand il veut (~15 min à 1 h). Hors connexion : le dernier dessin reçu reste (gardé sur le téléphone).

const BASE = "https://tonythai713.github.io/meopeo/";
const SUPABASE_URL = "https://llwbzhlbaygolzuwlbkf.supabase.co";
const SUPABASE_KEY = "sb_publishable_rMCGFrjzDmhsZ6eJ163B6g_MTA4dQSd"; // clé publique de l'app
const WKEY = typeof KEY === "string" ? KEY : "";
const fm = FileManager.local();
const IMG = fm.joinPath(fm.documentsDirectory(), "meopeo-doodle.png");
const INFO = fm.joinPath(fm.documentsDirectory(), "meopeo-doodle.json");

const pad = (n) => String(n).padStart(2, "0");
function ago(at) {
  const d = new Date(at), now = new Date(), min = Math.round((now - d) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 86400000), hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return days === 0 ? `today ${hm}` : days === 1 ? `yesterday ${hm}` : `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${hm}`;
}
const cached = () => {
  try { return fm.fileExists(INFO) ? { ...JSON.parse(fm.readString(INFO)), offline: true } : null; } catch (e) { return null; }
};

// info = { label, mark, at } ; img = le dessin ; note = message à la place
let info = null, img = null, note = "";
try {
  const req = new Request(`${SUPABASE_URL}/rest/v1/rpc/widget_doodle`);
  req.method = "POST";
  req.headers = { apikey: SUPABASE_KEY, "Content-Type": "application/json" };
  req.body = JSON.stringify({ p_token: WKEY });
  req.timeoutInterval = 15;
  const r = await req.loadJSON();
  if (r && typeof r.label === "string") {
    info = { label: r.label, mark: r.mark ?? "", at: r.at ?? null };
    if (r.png) { img = Image.fromData(Data.fromBase64String(r.png)); fm.writeImage(IMG, img); }
    else if (fm.fileExists(IMG)) fm.remove(IMG); // l'autre a retiré ses dessins
    fm.writeString(INFO, JSON.stringify(info));
  } else {
    const msg = String(r?.message ?? "");
    if (/unknown widget key/.test(msg)) note = "This widget's key was removed — make a new Doodle widget in MeoPeo (Settings → Home-screen widget).";
    else if (/widget_doodle/.test(msg)) note = "Doodles aren't set up yet in MeoPeo.";
    else { info = cached(); img = info && fm.fileExists(IMG) ? fm.readImage(IMG) : null; if (!info) note = "MeoPeo didn't answer — try again later."; }
  }
} catch (e) {
  info = cached(); // hors connexion : le dernier dessin gardé
  img = info && fm.fileExists(IMG) ? fm.readImage(IMG) : null;
  if (!info) note = "No connection — the doodle shows up once the phone is online.";
}

const family = config.widgetFamily ?? "medium";
const text = new Color("#1c2046"), muted = new Color("#565e8c"), gold = new Color("#8a5a00");
const w = new ListWidget();
const g = new LinearGradient();
g.colors = [new Color("#fff6e5"), new Color("#ffe3ec")];
g.locations = [0, 1];
w.backgroundGradient = g;
w.url = BASE + "#notes";
w.refreshAfterDate = new Date(Date.now() + 10 * 60 * 1000);
const label = (stack, s, size, color, bold = false) => { const x = stack.addText(s); x.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size); x.textColor = color; x.lineLimit = 3; x.minimumScaleFactor = 0.7; return x; };
const who = info ? `${info.mark ? info.mark + " " : ""}${info.label}` : "";
const when = info?.at ? ago(info.at) + (info.offline ? " · offline" : "") : "";
const empty = note || (info ? `No doodle from ${who} yet — they can draw one in MeoPeo → Notes ✏️` : "");
const pic = (stack, side) => { const i = stack.addImage(img); i.imageSize = new Size(side, side); i.cornerRadius = Math.round(side / 10); return i; };

if (family.startsWith("accessory")) { // écran verrouillé : juste le texte
  label(w, img ? `✏️ ${who} · ${when}` : `✏️ ${empty}`, 12, Color.white(), true);
} else if (!img) {
  w.setPadding(12, 12, 12, 12);
  label(w, "✏️ Doodle", 13, gold, true);
  w.addSpacer(6);
  label(w, empty, family === "small" ? 13 : 15, text, true);
  w.addSpacer();
} else if (family === "small") { // juste le dessin
  w.setPadding(6, 6, 6, 6);
  const row = w.addStack(); row.addSpacer(); pic(row, 146); row.addSpacer();
} else if (family === "medium") {
  w.setPadding(8, 10, 8, 14);
  const row = w.addStack();
  row.centerAlignContent();
  pic(row, 140);
  row.addSpacer(12);
  const col = row.addStack();
  col.layoutVertically();
  label(col, "✏️ Doodle from", 12, gold, true);
  col.addSpacer(2);
  label(col, who, 18, text, true);
  col.addSpacer(4);
  label(col, when, 12, muted);
  row.addSpacer();
} else {
  w.setPadding(10, 10, 12, 10);
  const top = w.addStack(); label(top, `✏️ From ${who}`, 14, gold, true); top.addSpacer(); label(top, when, 12, muted);
  w.addSpacer(6);
  const mid = w.addStack(); mid.addSpacer(); pic(mid, 290); mid.addSpacer();
}
if (config.runsInWidget) Script.setWidget(w);
else await w.presentMedium(); // lancé dans Scriptable : aperçu du widget moyen
Script.complete();
