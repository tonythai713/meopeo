// MEOPEO_WIDGET — widget iPhone de MeoPeo pour l'app Scriptable.
// Ce fichier est téléchargé par le petit script collé dans Scriptable (il fournit la variable KEY = clé de widget).
// Grand widget : calendrier du mois ; moyen : la semaine ; petit : aujourd'hui. Tâches pas faites seulement ;
// les tâches 🔒 apparaissent sans leur texte. Hors connexion : le dernier calendrier reçu reste affiché.

const SUPABASE_URL = "https://llwbzhlbaygolzuwlbkf.supabase.co";
const SUPABASE_KEY = "sb_publishable_rMCGFrjzDmhsZ6eJ163B6g_MTA4dQSd"; // clé publique de l'app
const APP_URL = "https://tonythai713.github.io/meopeo/";
const C = { bg1: "#0e1230", bg2: "#232a63", gold: "#ffe8a3", text: "#eceeff", muted: "#aab1da", dim: "#5f6699", late: "#ff8fa3" };
const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const fm = FileManager.local();
const CACHE = fm.joinPath(fm.documentsDirectory(), "meopeo-widget-feed.json");
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const fromIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const dowIdx = (d) => (d.getDay() + 6) % 7; // 0 = lundi
const onDay = (t, k) => t.date === k || (!!t.end && t.date <= k && k <= t.end);
const col = (hex, a = 1) => new Color(hex, a);

const now = new Date();
const today = iso(now);
const first = new Date(now.getFullYear(), now.getMonth(), 1);
const gridStart = addDays(first, -dowIdx(first));
const weeks = Math.ceil((dowIdx(first) + new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()) / 7);
const gridEnd = addDays(gridStart, weeks * 7 - 1);
const rangeEnd = gridEnd > addDays(now, 7) ? gridEnd : addDays(now, 7); // la semaine qui vient aussi

// Calendrier : depuis Supabase, sinon le dernier reçu
async function loadFeed() {
  try {
    const req = new Request(`${SUPABASE_URL}/rest/v1/rpc/widget_feed`);
    req.method = "POST";
    req.headers = { apikey: SUPABASE_KEY, "Content-Type": "application/json" };
    req.body = JSON.stringify({ p_token: KEY, p_from: iso(gridStart), p_to: iso(rangeEnd), p_today: today });
    req.timeoutInterval = 15;
    const json = await req.loadJSON();
    if (!json || !Array.isArray(json.tasks)) throw new Error((json && json.message) || "no data");
    fm.writeString(CACHE, JSON.stringify({ at: Date.now(), feed: json }));
    return { feed: json };
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/unknown widget key/.test(msg)) return { error: "This widget key isn't valid any more — create a new one in MeoPeo (⚙ → Home-screen widget)." };
    if (fm.fileExists(CACHE)) { const c = JSON.parse(fm.readString(CACHE)); return { feed: c.feed, staleAt: c.at }; }
    return { error: "No connection — the calendar will appear once the phone is online." };
  }
}

const markOf = (feed, t) => (t.who === "me" ? feed.me : feed.partner)?.mark ?? "•";
const line = (feed, t) => `${markOf(feed, t)} ${t.time ? t.time + " " : ""}${t.label}`;
const footerNote = (r) => (r.staleAt ? `offline · ${pad(new Date(r.staleAt).getHours())}:${pad(new Date(r.staleAt).getMinutes())}` : "");

function baseWidget() {
  const w = new ListWidget();
  const g = new LinearGradient();
  g.colors = [col(C.bg1), col(C.bg2)];
  g.locations = [0, 1];
  w.backgroundGradient = g;
  w.url = APP_URL;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  return w;
}
function addLine(stack, text, size, color, bold = false) {
  const t = stack.addText(text);
  t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = col(color);
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.7;
  return t;
}

// Grand : le mois, dessiné en une image (grille exacte)
function monthImage(feed, r) {
  const W = 364, H = 382, P = 12;
  const ctx = new DrawContext();
  ctx.size = new Size(W, H);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const text = (s, x, y, w, h, size, color, bold = false, center = false) => {
    ctx.setFont(bold ? Font.boldSystemFont(size) : Font.systemFont(size));
    ctx.setTextColor(col(color));
    if (center) ctx.setTextAlignedCenter(); else ctx.setTextAlignedLeft();
    ctx.drawTextInRect(s, new Rect(x, y, w, h));
  };
  text(`${MONTHS[now.getMonth()]} ${now.getFullYear()}`, P, 8, 220, 22, 16, C.gold, true);
  const legend = `${feed.me?.mark ?? ""} ${feed.me?.label ?? ""}  ${feed.partner ? `${feed.partner.mark} ${feed.partner.label}` : ""}`;
  ctx.setTextAlignedRight();
  ctx.setFont(Font.systemFont(10)); ctx.setTextColor(col(C.muted));
  ctx.drawTextInRect(legend, new Rect(W - 170 - P, 12, 170, 16));
  const cw = (W - 2 * P) / 7, top = 50, footer = 30, ch = (H - top - footer) / weeks;
  DAYS.forEach((d, i) => text(d.slice(0, 2), P + i * cw, 33, cw, 14, 9, C.muted, true, true));
  for (let i = 0; i < weeks * 7; i++) {
    const day = addDays(gridStart, i), k = iso(day);
    const x = P + (i % 7) * cw, y = top + Math.floor(i / 7) * ch;
    const inMonth = day.getMonth() === now.getMonth();
    if (k === today) {
      const p = new Path(); p.addRoundedRect(new Rect(x + 1, y + 1, cw - 2, ch - 2), 6, 6);
      ctx.addPath(p); ctx.setStrokeColor(col(C.gold, 0.9)); ctx.setLineWidth(1.5); ctx.strokePath();
    }
    text(String(day.getDate()), x + 3, y + 2, cw - 6, 13, 10, k === today ? C.gold : inMonth ? C.text : C.dim, k === today, false);
    const list = feed.tasks.filter((t) => onDay(t, k));
    const room = Math.max(0, Math.floor((ch - 17) / 11));
    list.slice(0, room).forEach((t, j) => {
      const cy = y + 16 + j * 11;
      const chip = new Path(); chip.addRoundedRect(new Rect(x + 2, cy, cw - 4, 10), 3, 3);
      ctx.addPath(chip); ctx.setFillColor(col(t.color || C.muted, inMonth ? 0.55 : 0.25)); ctx.fillPath();
      text(`${t.time && t.date === k ? t.time + " " : ""}${t.label}`, x + 4, cy - 0.5, cw - 7, 11, 7.5, C.text);
    });
    if (list.length > room && room > 0) text(`+${list.length - room}`, x + cw - 16, y + 2, 14, 12, 8, C.gold, true);
  }
  // Pied : prochaine tâche, retard, hors connexion
  const hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`; // « Next » : pas une tâche d'aujourd'hui dont l'heure est passée
  const next = feed.tasks.filter((t) => (t.end ?? t.date) >= today && !(t.date === today && !t.end && t.time && t.time < hm))
    .sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")))[0];
  const nd = next ? fromIso(next.date < today ? today : next.date) : null;
  const foot = [next ? `Next: ${DAYS[dowIdx(nd)].slice(0, 3)} ${nd.getDate()} · ${line(feed, next)}` : "Nothing planned 🎉", feed.late ? `⚠️ ${feed.late} late` : "", footerNote(r)].filter(Boolean).join("   ");
  text(foot, P, H - footer + 8, W - 2 * P, 16, 10, C.text);
  return ctx.getImage();
}

function largeWidget(feed, r) {
  const w = baseWidget();
  w.setPadding(0, 0, 0, 0);
  const img = w.addImage(monthImage(feed, r));
  img.centerAlignImage();
  return w;
}

// Moyen : les 7 prochains jours, une ligne par jour qui a quelque chose
function mediumWidget(feed, r) {
  const w = baseWidget();
  w.setPadding(10, 12, 10, 12);
  const head = w.addStack(); head.centerAlignContent();
  addLine(head, "This week", 13, C.gold, true);
  head.addSpacer();
  addLine(head, [feed.late ? `⚠️ ${feed.late} late` : "", footerNote(r)].filter(Boolean).join(" · "), 10, feed.late ? C.late : C.muted);
  w.addSpacer(4);
  let rows = 0;
  for (let i = 0; i < 7 && rows < 6; i++) {
    const d = addDays(now, i), k = iso(d);
    const list = feed.tasks.filter((t) => onDay(t, k));
    if (!list.length && i > 0) continue;
    const row = w.addStack(); row.centerAlignContent();
    const day = row.addStack(); day.size = new Size(46, 0);
    addLine(day, `${DAYS[dowIdx(d)]} ${d.getDate()}`, 10, i === 0 ? C.gold : C.muted, true);
    addLine(row, list.length ? list.map((t) => line(feed, t)).join(" · ") : "nothing today", 11, list.length ? C.text : C.muted);
    rows++;
  }
  if (rows <= 1 && !feed.tasks.some((t) => onDay(t, today))) { w.addSpacer(2); addLine(w, "Nothing planned this week 🎉", 11, C.muted); }
  w.addSpacer();
  return w;
}

// Petit : aujourd'hui (et la première chose de demain)
function smallWidget(feed, r) {
  const w = baseWidget();
  w.setPadding(10, 10, 10, 10);
  addLine(w, `${DAYS[dowIdx(now)]} ${now.getDate()}`, 13, C.gold, true);
  const list = feed.tasks.filter((t) => onDay(t, today));
  w.addSpacer(3);
  if (!list.length) addLine(w, "Nothing today 🎉", 11, C.muted);
  list.slice(0, 4).forEach((t) => addLine(w, line(feed, t), 11, C.text));
  if (list.length > 4) addLine(w, `+${list.length - 4} more`, 10, C.muted);
  const tomorrow = iso(addDays(now, 1));
  const next = feed.tasks.find((t) => onDay(t, tomorrow));
  if (next && list.length < 4) { w.addSpacer(3); addLine(w, `Tomorrow · ${line(feed, next)}`, 10, C.muted); }
  if (feed.late) addLine(w, `⚠️ ${feed.late} late`, 10, C.late);
  w.addSpacer();
  if (r.staleAt) addLine(w, footerNote(r), 8, C.dim);
  return w;
}

// Écran verrouillé (widgets « accessory ») : la prochaine chose d'aujourd'hui, en texte seul
function lockWidget(feed, family) {
  const w = new ListWidget();
  w.url = APP_URL;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  const list = feed.tasks.filter((t) => onDay(t, today));
  if (family === "accessoryInline") { w.addText(list.length ? line(feed, list[0]) : "MeoPeo · nothing today"); return w; }
  const head = w.addText(`${DAYS[dowIdx(now)]} ${now.getDate()}${list.length > 2 ? ` · +${list.length - 2}` : ""}`);
  head.font = Font.boldSystemFont(12);
  if (!list.length) w.addText("Nothing today").font = Font.systemFont(12);
  list.slice(0, 2).forEach((t) => { const x = w.addText(line(feed, t)); x.font = Font.systemFont(12); x.lineLimit = 1; });
  return w;
}

function errorWidget(message) {
  const w = baseWidget();
  w.setPadding(12, 12, 12, 12);
  addLine(w, "MeoPeo", 13, C.gold, true);
  w.addSpacer(4);
  const t = w.addText(message);
  t.font = Font.systemFont(11); t.textColor = col(C.text);
  return w;
}

const r = await loadFeed();
const family = config.widgetFamily ?? "large";
const widget = r.error ? errorWidget(r.error)
  : family.startsWith("accessory") ? lockWidget(r.feed, family)
  : family === "small" ? smallWidget(r.feed, r)
  : family === "medium" ? mediumWidget(r.feed, r)
  : largeWidget(r.feed, r);
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentLarge(); // lancé dans Scriptable : aperçu du grand widget
Script.complete();
