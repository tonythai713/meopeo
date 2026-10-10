// MeoPeo — l'interface (même mise en page que les planners Obsidian MeoMeo / PeoPeo).
// Ne parle jamais directement à Supabase : tout passe par `db` (data.js ; data-mock.js dans test.html).
import { mountMascots, outfitTemplate, scenePng, WIDGET_SCENES, SCENES_V, tinoHeadSvg, peoHeadSvg, demoPose } from "./mascot.js";
import { createBigTino, DEFAULT_ANIM, videoToSprite, videoFrames, gifFrames, apngFrames, keyBackground, outfitSheet, shrinkFrames, isAnimatedImage, releaseCanvas } from "./bigtino.js";

// ---------- Dates ----------
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const diffDays = (a, b) => Math.round((fromIso(b) - fromIso(a)) / 86400000);
const dow = (d) => ((d.getDay() + 6) % 7) + 1;
const mondayOf = (d) => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -(dow(d) - 1));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dayTitle = (d) => `${DAYS[dow(d) - 1]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
const dm = (k) => `${k.slice(8)}.${k.slice(5, 7)}`;
let now, today, tomorrow;
const tick = () => { now = new Date(); today = iso(now); tomorrow = iso(addDays(now, 1)); }; // l'app peut rester ouverte plusieurs jours

// ---------- Règles d'affichage (reprises du planner) ----------
const UPCOMING_COUNT = 10;
const CAL_PER_DAY = 5;
const CAL_MIN_HEIGHT = 520;
const EXAM_RE = /\b(TE\s?\d|test|exam|examen|évaluation\s+(intermédiaire|finale))/i;
const LAB_RE = /\blabo?s?\b|\blabo?\s?\d|laboratoire|\bprojets?\b|\bprojects?\b/i;
const glows = (e) => !e.done && (e.moon === "full" || (EXAM_RE.test(e.label) && !/évaluation notée/i.test(e.label))); // halo doré
const isLab = (e) => !e.done && !glows(e) && (e.moon === "crescent" || LAB_RE.test(e.label));                        // halo argenté
const glowClass = (e) => (glows(e) ? " glow" : isLab(e) ? " glow-lab" : "");
const endOf = (start, end) => (end && end > start ? end : null);
const lastDay = (e) => e.end ?? e.date;
const ongoing = (e) => !!e.end && e.date <= today && today <= e.end;
const onDay = (e, k) => e.date === k || (!!e.end && e.date <= k && k <= e.end);
const rangeInfo = (e) => {
  if (!e.end) return "";
  const n = diffDays(e.date, e.end) + 1;
  return ` <span class="pl-range">${ongoing(e) && !e.done ? `day ${diffDays(e.date, today) + 1}/${n} · until ${dm(e.end)}` : `${dm(e.date)} → ${dm(e.end)} · ${n} days`}</span>`;
};
function urgency(e) {
  if (e.done) return "done";
  if (ongoing(e)) return "u1";
  if (diffDays(today, lastDay(e)) < 0) return e.series ? "past" : "late"; // tâche récurrente : jamais « en retard »
  const d = diffDays(today, e.date);
  return d <= 1 ? "u1" : d <= 3 ? "u3" : d <= 7 ? "u7" : d <= 14 ? "u14" : "far";
}
const relDay = (k) => { const d = diffDays(today, k); return d === 0 ? "today" : d === 1 ? "tomorrow" : d === -1 ? "yesterday" : d > 0 ? `in ${d} d` : `${-d} d ago`; };
const hourPill = (e) => (e.time ? `<span class="pl-hour">${e.time}</span> ` : "");
// Rappel sur le téléphone : « AAAA-MM-JJ HH:MM » (heure locale) ; le jour est toujours écrit en clair (« today », « tomorrow », « Tue 06.10 »)
const BELL = "🔔";
const remindLabel = (r) => { const d = r.slice(0, 10); return `${d === today ? "today" : d === tomorrow ? "tomorrow" : `${DAYS[dow(fromIso(d)) - 1].slice(0, 3)} ${dm(d)}`} ${r.slice(11)}`; };
const bellPill = (e) => (e.remind && !e.done ? ` <span class="pl-bell" title="Notification on your phone">${BELL} ${remindLabel(e.remind)}</span>` : "");
const bellMark = (e) => (e.remind && !e.done ? " " + BELL : "");
const remindInputs = (e) => `<span class="pl-remind" title="Notification on your phone at this time — leave the time empty for no reminder">${BELL} <input type="date" name="rdate" title="Reminder day (empty = the task's day)" value="${e?.remind?.slice(0, 10) ?? ""}"><input type="time" name="rtime" title="Reminder time" value="${e?.remind?.slice(11) ?? ""}"></span>`;
const remindOf = (f) => (f.get("rtime") ? `${f.get("rdate") || f.get("date")} ${f.get("rtime")}` : null);
const moonRadios = (pre = "") => `<span class="pl-moon">${[["", "No glow"], ["full", "🌕 Full moon"], ["crescent", "🌙 Crescent"]]
  .map(([v, l]) => `<label><input type="radio" name="moon" value="${v}" ${v === (pre ?? "") ? "checked" : ""}> ${l}</label>`).join("")}</span>`;
const SRC = { devoir: "PC", excel: "Excel", echeance: "deadline", phone: "📱 planner" }; // tâches venues du tableau de bord Obsidian
const byDate = (a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? ""));
// Liste : les tâches en retard, puis les prochaines — pour une tâche récurrente, seulement sa prochaine occurrence
const upcomingOf = (list) => {
  const seen = new Set();
  return [
    ...list.filter((e) => urgency(e) === "late"),
    ...list.filter((e) => !e.done && lastDay(e) >= today && (!e.series || (!seen.has(e.series) && seen.add(e.series)))).slice(0, UPCOMING_COUNT),
  ];
};
// Répétition : choix du formulaire → règle { freq, every, until } ; texte « every week · until 20.12 »
const REPEATS = [["", "Doesn't repeat"], ["daily", "Every day"], ["weekly", "Every week"], ["weekly2", "Every 2 weeks"], ["monthly", "Every month"], ["yearly", "Every year"]];
const ruleOf = (f) => { const v = f.get("repeat"); return v ? { freq: v === "weekly2" ? "weekly" : v, every: v === "weekly2" ? 2 : 1, until: f.get("rend") || null } : null; };
const ruleText = (r) => (r ? `every ${r.freq === "daily" ? "day" : r.freq === "weekly" ? (r.every === 2 ? "2 weeks" : "week") : r.freq === "monthly" ? "month" : "year"}${r.until ? " · until " + dm(r.until) : ""}` : "repeats");
const seriesOf = (e) => S.series.find((x) => x.id === e.series);
const repeatPill = (e) => (e.series ? ` <span class="pl-bell mp-rep" title="Repeats ${esc(ruleText(seriesOf(e)))}">🔁</span>` : "");
const repeatInputs = () => `<span class="mp-repeat"${S.seriesOk === false ? " hidden" : ""} title="Repeat this task">🔁 <select name="repeat">${REPEATS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
  <label class="mp-rend" hidden>ends <input type="date" name="rend" title="Last possible day (optional)"></label></span>`;
const bindRepeat = (form) => { const sel = form.querySelector("[name=repeat]"); sel?.addEventListener("change", () => { form.querySelector(".mp-rend").hidden = !sel.value; }); };

// ---------- État ----------
let db, root, toastBox, unsubscribe = null, reloadTimer = null;
const S = { user: null, me: null, partner: null, cats: [], mine: [], theirs: [], tino: [], tinoOk: null, lines: [], big: null, extrasOk: null, outfits: [], worn: { head: null, body: null }, outfitsOk: null, grumbles: [], grumblesOk: null, notes: [], notesOk: null, doodles: [], doodlesOk: null, series: [], seriesOk: null, decor: [], decorOk: null, decorNow: null, catches: [], color: null, fishingOk: null, feeding: null, hungerLines: [], feedingOk: null, bath: null, bathOk: null, online: new Set() };
const store = {
  get(k, d) { try { const v = localStorage.getItem("meopeo." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("meopeo." + k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
  del(k) { try { localStorage.removeItem("meopeo." + k); } catch { /* stockage indisponible */ } },
};
// Hors connexion : les dernières données reçues sont gardées sur l'appareil (par compte) et affichées en lecture seule
const offlineKey = () => "cache." + S.user.id;
async function logout() { if (S.user) store.del(offlineKey()); await db.signOut(); showLogin(); }
const UI = { offset: 0, day: null, showPartner: true, addOpen: false, addCat: "", focusAdd: false, manageOpen: false };
const myCats = () => S.cats.filter((c) => c.owner === S.user.id);
const catColor = (owner, name) => S.cats.find((c) => c.owner === owner && c.name === name)?.color;
const findTask = (id) => S.mine.find((x) => x.id === id) ?? S.theirs.find((x) => x.id === id);

export async function start(backend) {
  db = backend;
  applyTheme(); // thème clair / sombre de cet appareil, avant tout affichage
  tick();
  root = document.getElementById("app");
  toastBox = document.getElementById("toasts");
  setupTabs();
  UI.day = today;
  UI.showPartner = store.get("showPartner", true);
  db.onAuthChange((u) => { if ((u?.id ?? null) !== (S.user?.id ?? null)) (u ? boot(u) : showLogin()); });
  const u = await db.user();
  if (u && u.id !== S.user?.id) await boot(u); // (le signal de connexion a pu arriver avant)
  else if (!u && !S.user) showLogin();
  // Retour sur l'app : sur téléphone, la connexion temps réel a pu être coupée → on relit tout et on se réabonne
  document.addEventListener("visibilitychange", () => { if (document.hidden) presenceCh?.set(false); presenceChanged(); }); // (en arrière-plan : il n'est plus « là »)
  const wake = () => { if (!S.user || document.hidden) return; tick(); reload(); loadTino(); loadExtras(); loadOutfits(); loadCatches(); loadFeeding(); loadBath(); loadGrumbles(); loadNotes(); loadDoodles(); loadSeries(); loadDecor(); resubscribe(); };
  document.addEventListener("visibilitychange", wake);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { applyTheme(); runClocks(); } }); // (minuteries endormies en arrière-plan)
  runClocks();
  window.addEventListener("focus", wake);
  window.addEventListener("online", wake);
  window.addEventListener("resize", () => align());
  portrait.addEventListener?.("change", () => applyDecor()); // téléphone tourné / fenêtre élargie : l'autre format du décor
}

// ---------- Notifications (Web Push) ----------
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const keyBytes = (b64) => Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
const sameKey = (a, b) => { const x = new Uint8Array(a); return x.length === b.length && x.every((v, i) => v === b[i]); };
async function pushState() {
  if (isIOS && !standalone()) return "install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const sub = await reg.pushManager.getSubscription();
  return Notification.permission === "granted" && sub ? "on" : "off";
}
// Abonne cet appareil (ou renouvelle l'abonnement) et l'enregistre pour la personne connectée
async function subscribePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) throw new Error("not available here");
  const key = keyBytes(db.vapidPublicKey);
  let sub = await reg.pushManager.getSubscription();
  if (sub && sub.options?.applicationServerKey && !sameKey(sub.options.applicationServerKey, key)) { await sub.unsubscribe(); sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await db.savePushSubscription(sub);
}
// À chaque ouverture : si les notifications sont autorisées, l'abonnement de cet appareil est remis à jour
async function ensurePush() {
  try { if ("Notification" in window && Notification.permission === "granted" && (await navigator.serviceWorker?.getRegistration())) await subscribePush(); }
  catch (err) { console.warn("Notifications", err); }
}
function remindNotice(r) {
  if (!r) return;
  if (new Date(r.replace(" ", "T")) < new Date()) { toast(`⚠️ ${BELL} ${remindLabel(r)} is already past — no notification will be sent`); return; }
  pushState().then((st) => toast(`${BELL} Reminder set: ${remindLabel(r)}${st === "on" ? "" : " — turn on notifications in Settings to receive it"}`));
}

async function boot(user) {
  S.user = user;
  toastBox.innerHTML = ""; // pas de message du compte précédent
  root.innerHTML = `<div class="mp-loading">🌙 Loading…</div>`;
  await load();
  loadTino();
  loadExtras();
  loadOutfits();
  loadCatches();
  loadFeeding();
  loadBath();
  loadGrumbles();
  loadNotes();
  loadDoodles();
  loadSeries();
  loadDecor();
  resubscribe();
  ensurePush();
}
function resubscribe() {
  presenceCh?.stop(); presenceCh = S.user ? db.presence(S.user.id, (set) => { S.online = set; presenceChanged(); }) : null; // (marmite, PeoPeo)
  unsubscribe?.(); unsubscribe = S.user ? db.subscribe(() => reload()) : null;
  unsubTino?.(); unsubTino = S.user ? db.subscribeTino(() => loadTino()) : null;
  unsubExtras?.(); unsubExtras = S.user ? db.subscribeTinoExtras(() => loadExtras()) : null;
  unsubOutfits?.(); unsubOutfits = S.user ? db.subscribeOutfits(() => loadOutfits()) : null; // canal à part (sans 12, rien d'autre ne casse)
  unsubCatches?.(); unsubCatches = S.user ? db.subscribeCatches(() => loadCatches()) : null; // pêche (20) : canal à part
  unsubFeeding?.(); unsubFeeding = S.user ? db.subscribeFeeding(() => loadFeeding()) : null; // nourrir Tino (21) : idem
  unsubBath?.(); unsubBath = S.user ? db.subscribeBath(() => loadBath()) : null; // laver Tino (23) : idem
  unsubGrumbles?.(); unsubGrumbles = S.user ? db.subscribeGrumbles(() => loadGrumbles()) : null; // idem (13)
  unsubNotes?.(); unsubNotes = S.user ? db.subscribeNotes(() => loadNotes()) : null; // idem (14)
  unsubDoodles?.(); unsubDoodles = S.user ? db.subscribeDoodles(() => loadDoodles()) : null; // idem (19)
  unsubSeries?.(); unsubSeries = S.user ? db.subscribeSeries(() => loadSeries()) : null; // idem (15)
  unsubDecor?.(); unsubDecor = S.user ? db.subscribeDecor(() => loadDecor()) : null; // idem (16)
}
function reload() { clearTimeout(reloadTimer); reloadTimer = setTimeout(load, 250); } // plusieurs événements d'affilée = un seul rechargement

async function load() {
  if (!S.user) return;
  let data;
  try {
    data = await db.loadAll(iso(addDays(now, -90)));
    S.offline = null;
    store.set(offlineKey(), { at: new Date().toISOString(), data });
  } catch (err) {
    const saved = store.get(offlineKey(), null);
    if (!saved) {
      toast(`⚠️ Couldn't load the tasks (${err.message})`);
      if (!S.me) {
        root.innerHTML = `<div class="pl-card mp-msg"><h4>Connection problem</h4><p>${esc(err.message)}</p><button data-act="retry">Try again</button> <button data-act="logout">Log out</button></div>`;
        bindMsg();
      }
      return;
    }
    S.offline = saved.at; // on affiche les données gardées, avec le bandeau « Offline »
    data = saved.data;
  }
  {
    S.me = data.profiles.find((p) => p.id === S.user.id) ?? null;
    S.partner = data.profiles.find((p) => p.id !== S.user.id) ?? null;
    if (!S.me) { renderNoProfile(); return; }
    S.cats = data.categories;
    const paint = (e) => {
      const mine = e.owner === S.user.id;
      const person = mine ? S.me : S.partner;
      const fromPC = e.source !== "app"; // tâche de cours envoyée par le tableau de bord Obsidian de Tony
      return { ...e, who: mine ? "me" : "partner", tickable: mine, editable: mine && !fromPC, fromPC, color: catColor(e.owner, e.course) ?? person?.color ?? "#999" };
    };
    S.mine = data.tasks.filter((e) => e.owner === S.user.id).map(paint).sort(byDate);
    S.theirs = data.tasks.filter((e) => e.owner !== S.user.id).map(paint).sort(byDate);
    render();
  }
}

// Appel à la base avec message en cas d'erreur ; renvoie true si tout s'est bien passé.
// `run` est une fonction (pour ne rien envoyer du tout quand on est hors connexion).
async function guard(run, what = "Couldn't save") {
  if (!navigator.onLine) { toast("📴 You're offline — this change can't be saved yet."); return false; }
  try { await run(); return true; } catch (err) { toast(`⚠️ ${what} (${err.message})`); if (/fetch|network/i.test(err.message)) reload(); return false; }
}

// ---------- Messages en bas de l'écran (avec bouton d'annulation) ----------
function toast(msg, { action, onAction, ms = 6000 } = {}) {
  const t = document.createElement("div");
  t.className = "mp-toast";
  t.append(msg);
  if (action) {
    const b = document.createElement("button");
    b.textContent = action;
    b.addEventListener("click", () => { t.remove(); onAction(); });
    t.append(b);
  }
  toastBox.append(t);
  setTimeout(() => t.remove(), ms);
}

// ---------- Connexion ----------
function showLogin() {
  S.user = null; S.me = null;
  unsubscribe?.(); unsubscribe = null;
  unsubTino?.(); unsubTino = null;
  unsubExtras?.(); unsubExtras = null; S.lines = []; S.extrasOk = null;
  unsubOutfits?.(); unsubOutfits = null; S.outfits = []; S.worn = { head: null, body: null }; S.outfitsOk = null; applyOutfit();
  unsubCatches?.(); unsubCatches = null; S.catches = []; S.color = null; S.fishingOk = null; lastCatch = null; applyColor(); clearTimeout(fishTimer);
  unsubFeeding?.(); unsubFeeding = null; S.feeding = null; S.hungerLines = []; S.feedingOk = null; feedSeen = null; clearTimeout(tummyTimer);
  unsubBath?.(); unsubBath = null; S.bath = null; S.bathOk = null; bathSeen = null; applyDirt();
  presenceCh?.stop(); presenceCh = null; S.online = new Set();
  unsubGrumbles?.(); unsubGrumbles = null; S.grumbles = []; S.grumblesOk = null;
  unsubNotes?.(); unsubNotes = null; S.notes = []; S.notesOk = null;
  unsubDoodles?.(); unsubDoodles = null; S.doodles = []; S.doodlesOk = null; doodleUi?.el.remove(); doodleUi = null; doodlePng.clear(); doodleSeen = null;
  unsubSeries?.(); unsubSeries = null; S.series = []; S.seriesOk = null; toppedUp = 0;
  unsubDecor?.(); unsubDecor = null; S.decor = []; S.decorOk = null; applyDecor(); // fond d'origine sur l'écran de connexion
  showTab(); // plus de barre d'onglets sur l'écran de connexion
  root.innerHTML = `<div class="mp-login pl-card"><h1>MeoPeo</h1><p class="mp-sub">💗 MeoMeo · 💜 PeoPeo</p>
    <form><input type="email" name="email" placeholder="E-mail" autocomplete="username" required>
      <input type="password" name="password" placeholder="Password" autocomplete="current-password" required>
      <button type="submit" class="mp-cta">Sign in</button><div class="mp-err" hidden></div></form></div>`;
  mascots?.refresh(); // plus de calendrier : les personnages disparaissent
  mascots?.hush(); tinoShown = null; S.tino = []; S.tinoOk = null; renderTino();
  const form = root.querySelector("form");
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const err = form.querySelector(".mp-err");
    const btn = form.querySelector("button");
    btn.disabled = true; err.hidden = true;
    try {
      await db.signIn(form.email.value.trim(), form.password.value);
      const u = await db.user();
      if (u && u.id !== S.user?.id) await boot(u);
    } catch (e) {
      err.textContent = /invalid login/i.test(e.message) ? "Wrong e-mail or password." : e.message;
      err.hidden = false; btn.disabled = false;
    }
  });
}
function renderNoProfile() {
  root.innerHTML = `<div class="pl-card mp-msg"><h4>Almost there</h4><p>You are signed in as <b>${esc(S.user.email)}</b>, but this account isn't linked to a profile yet.
    Tony needs to run <code>supabase/02_profiles.sql</code> with this e-mail address.</p><button data-act="retry">Try again</button> <button data-act="logout">Log out</button></div>`;
  bindMsg();
}
function bindMsg() {
  root.querySelector("[data-act=retry]")?.addEventListener("click", () => load());
  root.querySelector("[data-act=logout]")?.addEventListener("click", () => logout());
}

// ---------- Page principale ----------
// Heures à côté de la date, les mêmes sur tous les appareils : [repère, nom, fuseau IANA] ; jour de la semaine ajouté
// quand ce n'est pas le même jour qu'ici
const CLOCKS = [["🇨🇭", "Switzerland", "Europe/Zurich"], ["🇻🇳", "Vietnam", "Asia/Ho_Chi_Minh"]];
function clocksHtml(d = new Date()) {
  return CLOCKS.map(([mark, name, timeZone]) => {
    try {
      const day = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
      const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
      const wd = day === iso(d) ? "" : new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short" }).format(d) + " ";
      return `<span title="${name}">${mark} ${wd}${time}</span>`;
    } catch { return ""; } // (fuseau inconnu du navigateur)
  }).filter(Boolean).join(" · ");
}
let clockTimer = 0;
function runClocks() { // à chaque nouvelle minute (et au retour sur l'app : minuteries endormies en arrière-plan)
  clearTimeout(clockTimer);
  const html = clocksHtml();
  document.querySelectorAll(".mp-clocks").forEach((el) => { if (el.innerHTML !== html) el.innerHTML = html; });
  clockTimer = setTimeout(runClocks, 60000 - (Date.now() % 60000) + 50);
}
function render() {
  if (root.offsetHeight) root.style.minHeight = root.offsetHeight + "px"; // pas de saut de page pendant le réaffichage
  const P = S.partner;
  const off = S.offline ? new Date(S.offline) : null;
  root.innerHTML = `${off ? `<div class="mp-offline">📴 Offline — showing your tasks as of ${off.getDate()}.${pad(off.getMonth() + 1)} at ${pad(off.getHours())}:${pad(off.getMinutes())}. Changes can't be saved until you're back online.</div>` : ""}<header class="pl-hello"><span class="mp-date">${dayTitle(now)}, ${now.getFullYear()} <span class="mp-clocks">${clocksHtml()}</span></span>
      <span class="mp-who">${esc(S.me.mark)} ${esc(S.me.label)}</span>
      <button class="pl-refresh" data-act="refresh" title="Reload">⟳</button></header>
    <div class="pl-split"><div class="pl-left"></div><div class="pl-right"></div></div>
    <div class="pl-bottom"><div class="mp-partner"></div></div>`;
  renderMine(root.querySelector(".pl-left"));
  renderCalendar(root.querySelector(".pl-right"));
  renderPartner(root.querySelector(".mp-partner"), P);
  root.querySelector("[data-act=refresh]").addEventListener("click", () => { tick(); load(); loadTino(); loadExtras(); loadOutfits(); loadCatches(); loadFeeding(); loadBath(); loadGrumbles(); loadNotes(); loadDoodles(); loadSeries(); loadDecor(); resubscribe(); });
  root.style.minHeight = "";
  placeBigTino();
  renderTino();
  align();
  if (!document.body.classList.contains("mp-logged")) showTab(); // première page après la connexion : barre d'onglets
}

function itemHtml(e) {
  const box = e.tickable ? `<input type="checkbox" data-tick="${e.id}" ${e.done ? "checked" : ""} aria-label="Done">`
    : `<span class="pl-lock" title="${esc(S.partner?.label ?? "")}'s task — read-only">●</span>`;
  const tag = e.course ? `<b>${esc(e.course)}</b> ` : "";
  const when = ongoing(e) && !e.done;
  return `<div class="pl-item ${urgency(e)}${glowClass(e)}" data-id="${e.id}" style="--c:${e.color}">${box}
    <span class="pl-when">${when ? "now" : relDay(e.date)}<small>${dm(when ? today : e.date)}</small></span>
    <span class="pl-what"${e.tickable ? ` data-edit="${e.id}"` : ""}>${tag}${hourPill(e)}${esc(e.label)}${SRC[e.source] ? ` <span class="mp-src" title="From Tony's Obsidian dashboard">${SRC[e.source]}</span>` : ""}${e.private ? ` <span class="mp-priv" title="Private: only you can see it">🔒</span>` : ""}${rangeInfo(e)}${repeatPill(e)}${bellPill(e)}</span>${e.editable ? `<button class="pl-edit" data-edit="${e.id}" title="Edit this task">✏️</button>` : ""}</div>`;
}
function bindItems(el) {
  el.querySelectorAll("[data-tick]").forEach((cb) => cb.addEventListener("change", () => toggleDone(findTask(cb.dataset.tick), cb.checked)));
  el.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", (ev) => { ev.stopPropagation(); openEditor(findTask(b.dataset.edit)); }));
}

// Coche : la tâche quitte la liste tout de suite, « ↶ Undo » pendant 8 s
async function toggleDone(e, done) {
  if (!e) return;
  e.done = done;
  render();
  if (!(await guard(() => db.updateTask(e.id, { done })))) { e.done = !done; render(); return; }
  if (done) toast(`✓ Done: ${e.label}`, { action: "↶ Undo", ms: 8000, onAction: async () => { if (await guard(() => db.updateTask(e.id, { done: false }))) { toast(`Unticked: ${e.label}`); load(); } } });
}

// Colonne gauche : mes prochaines tâches + ajout
function renderMine(el) {
  const up = upcomingOf(S.mine);
  const cats = myCats();
  el.innerHTML = `<div class="pl-card pl-todo"><h4>To do — my next ${UPCOMING_COUNT} tasks</h4>
    ${up.length ? up.map(itemHtml).join("") : `<div class="pl-empty">Nothing to do 🎉</div>`}
    <details class="pl-add"${UI.addOpen ? " open" : ""}><summary>➕ Add a task</summary><form>
      <input type="date" name="date" value="${today}" required>
      <label class="pl-until" title="Last day — only for something that lasts several days">→ until <input type="date" name="end"></label>
      <input type="time" name="time" title="Time (optional)">
      <select name="course"><option value="">— no category —</option>${cats.map((c) => `<option ${c.name === UI.addCat ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>
      <button type="button" class="pl-newcat-btn">＋ New category</button>
      <span class="pl-newcat" hidden><input type="text" name="catname" placeholder="Category name" maxlength="30"><input type="color" name="catcolor" value="#4dabf7" title="Colour"><button type="button" class="pl-newcat-save">Create</button></span>
      <button type="button" class="pl-managecat-btn">⚙ Manage categories</button>
      <div class="pl-managecat"${UI.manageOpen ? "" : " hidden"}></div>
      <input type="text" name="text" placeholder="What needs doing" maxlength="300" required>
      ${moonRadios()}
      <label class="mp-check" title="Private: ${esc(S.partner?.label ?? "the other")} won't see it"><input type="checkbox" name="private"> 🔒 Private</label>
      ${remindInputs()}
      ${repeatInputs()}
      <button type="submit" class="mp-cta">Add</button></form></details></div>`;
  bindItems(el);
  const form = el.querySelector("form");
  const details = el.querySelector(".pl-add");
  details.addEventListener("toggle", () => { UI.addOpen = details.open; });
  if (UI.focusAdd) { UI.focusAdd = false; form.text.focus({ preventScroll: true }); }
  bindRepeat(form);
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = new FormData(form);
    const label = String(f.get("text")).trim();
    if (!label) return;
    const end = endOf(f.get("date"), f.get("end"));
    if (f.get("end") && !end) toast("“until” must be after the start date — saved as a one-day task");
    form.querySelector("button[type=submit]").disabled = true;
    const task = { date: f.get("date"), end, time: f.get("time") || null, course: f.get("course") || null,
      label, moon: f.get("moon") || null, private: f.get("private") === "on", remind: remindOf(f) };
    const rule = ruleOf(f);
    const ok = await guard(() => (rule ? db.createSeries(task, rule, today) : db.insertTask(task)), "Couldn't add the task");
    UI.addCat = f.get("course") || ""; UI.focusAdd = ok;
    if (ok) { toast(`Added: ${label}${rule ? " — 🔁 " + ruleText(rule) : ""}`); remindNotice(remindOf(f)); }
    if (rule) loadSeries();
    await load(); // la tâche apparaît tout de suite (l'autre la reçoit en temps réel)
  });
  // Nouvelle catégorie
  form.querySelector(".pl-newcat-btn").addEventListener("click", () => { const b = form.querySelector(".pl-newcat"); b.hidden = !b.hidden; });
  form.querySelector(".pl-newcat-save").addEventListener("click", async () => {
    const name = String(form.catname.value).trim();
    if (!name) return;
    if (cats.some((c) => c.name === name)) { toast(`“${name}” already exists`); return; }
    if (await guard(() => db.insertCategory({ name, color: form.catcolor.value }), "Couldn't create the category")) {
      UI.addCat = name; UI.addOpen = true;
      toast(`Category “${name}” created`);
      await load();
    }
  });
  // Gestion des catégories : couleur, renommer (met à jour mes tâches), supprimer (garde les tâches)
  const box = form.querySelector(".pl-managecat");
  const fillManage = () => {
    box.innerHTML = (cats.length ? cats.map((c) => `<div class="pl-catrow" data-id="${c.id}"><input type="color" value="${esc(c.color)}" data-a="color" title="Colour"><input type="text" value="${esc(c.name)}" maxlength="30" data-a="name"><button type="button" data-a="rename">Rename</button><button type="button" data-a="del" title="Delete this category">🗑</button></div>`).join("")
      : `<div class="pl-empty">No category yet — create one with “＋ New category”.</div>`)
      + `<div class="pl-legend">Renaming updates your tasks that use it; deleting a category keeps its tasks.</div>`;
    box.querySelectorAll(".pl-catrow").forEach((row) => {
      const c = cats.find((x) => x.id === row.dataset.id);
      row.querySelector("[data-a=color]").addEventListener("change", async (ev) => { if (await guard(() => db.updateCategory(c.id, { color: ev.target.value }))) load(); });
      row.querySelector("[data-a=rename]").addEventListener("click", async () => {
        const next = String(row.querySelector("[data-a=name]").value).trim();
        if (!next || next === c.name) return;
        if (cats.some((x) => x.name === next)) { toast(`“${next}” already exists`); return; }
        if (await guard(() => db.renameCategory(c.id, c.name, next), "Couldn't rename")) { if (UI.addCat === c.name) UI.addCat = next; toast(`Category renamed: ${c.name} → ${next}`); load(); }
      });
      const del = row.querySelector("[data-a=del]");
      del.addEventListener("click", async () => {
        if (!del.dataset.armed) { del.dataset.armed = "1"; del.textContent = "Sure? 🗑"; return; } // 2e appui pour confirmer
        if (await guard(() => db.deleteCategory(c.id), "Couldn't delete")) { toast(`Category “${c.name}” deleted (its tasks are kept)`); load(); }
      });
    });
  };
  if (UI.manageOpen) fillManage();
  form.querySelector(".pl-managecat-btn").addEventListener("click", () => { UI.manageOpen = box.hidden; box.hidden = !box.hidden; if (!box.hidden) fillManage(); });
}

// Colonne droite : calendrier du mois, barres pour les périodes, détail du jour touché
function renderCalendar(el) {
  const all = (UI.showPartner ? [...S.mine, ...S.theirs] : S.mine).slice()
    .sort((a, b) => (a.who === "me" ? 0 : 1) - (b.who === "me" ? 0 : 1) || (a.time ?? "").localeCompare(b.time ?? ""));
  const byDay = {};
  const spans = all.filter((e) => e.end);
  all.forEach((e) => { if (!e.end) (byDay[e.date] ??= []).push(e); });
  const first = new Date(now.getFullYear(), now.getMonth() + UI.offset, 1);
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const start = mondayOf(first);
  const weeks = Math.ceil((diffDays(iso(start), iso(first)) + days) / 7);
  const chipTitle = (e) => `${e.who === "partner" ? esc(S.partner?.label) + " — " : ""}${e.course ? esc(e.course) + " — " : ""}${esc(e.label)}`;
  let html = `<div class="pl-nav"><button data-m="-1" aria-label="Previous month">‹</button><button data-m="0">Today</button><button data-m="1" aria-label="Next month">›</button>
      <span class="pl-month">${MONTHS[first.getMonth()]} ${first.getFullYear()}</span>
      ${S.partner ? potButton() : ""}</div>
    <div class="pl-cal">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, c) => `<div class="pl-dow" style="grid-row:1;grid-column:${c + 1}">${d}</div>`).join("")}`;
  let lanes = { segs: [], n: 0 };
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i), k = iso(d), list = byDay[k] ?? [];
    const w = Math.floor(i / 7), c = i % 7;
    if (c === 0) lanes = weekLanes(spans, k);
    const cls = [d.getMonth() !== first.getMonth() && "out", k === today && "today", k === UI.day && "sel", dow(d) >= 6 && "we"].filter(Boolean).join(" ");
    html += `<div class="pl-day ${cls}" data-day="${k}" style="grid-row:${w + 2};grid-column:${c + 1}"><div class="pl-num">${d.getDate()}</div>${lanes.n ? `<div class="pl-lanes" style="--n:${lanes.n}"></div>` : ""}`;
    html += list.slice(0, CAL_PER_DAY).map((e) => `<div class="pl-chip ${urgency(e)}${glowClass(e)}"${e.tickable ? ` data-edit="${e.id}"` : ""} style="--c:${e.color}" title="${chipTitle(e)}${e.time ? " (" + e.time + ")" : ""}">${e.course ? `<b>${esc(e.course)}</b> ` : ""}${hourPill(e)}${esc(e.label)}${e.series ? " 🔁" : ""}${bellMark(e)}</div>`).join("");
    if (list.length > CAL_PER_DAY) html += `<div class="pl-more">+${list.length - CAL_PER_DAY}</div>`;
    html += `</div>`;
    if (c === 6) html += lanes.segs.map((g) => {
      const e = g.e;
      return `<div class="pl-chip pl-span ${urgency(e)}${glowClass(e)}${g.head ? " head" : ""}${g.tail ? " tail" : ""}"${e.tickable ? ` data-edit="${e.id}"` : ` data-goto="${g.first}"`}
        style="--c:${e.color};--lane:${g.lane};grid-row:${w + 2};grid-column:${g.c0 + 1} / ${g.c1 + 2}" title="${chipTitle(e)} (${dm(e.date)} → ${dm(e.end)})">${e.course ? `<b>${esc(e.course)}</b> ` : ""}${g.head ? hourPill(e) : "↪ "}${esc(e.label)}${e.series ? " 🔁" : ""}${bellMark(e)}</div>`;
    }).join("");
  }
  html += `</div><div class="pl-legend"><span class="pl-dot" style="--c:${S.me.color}"></span> ${esc(S.me.label)}${S.partner ? ` · <span class="pl-dot" style="--c:${S.partner.color}"></span> ${esc(S.partner.label)}` : ""} · categories in their own colours · tap a day for details · struck through = done</div>
    <div class="pl-card pl-detail"></div>`;
  el.innerHTML = html;
  const detail = el.querySelector(".pl-detail");
  const showDay = (k) => {
    const list = all.filter((e) => onDay(e, k));
    detail.innerHTML = `<h4>${k === today ? "Today — " : ""}${dayTitle(fromIso(k))}</h4>` + (list.length ? list.map(itemHtml).join("") : `<div class="pl-empty">Nothing that day.</div>`)
      + `<button type="button" class="mp-addday">＋ Add a task on ${DAYS[dow(fromIso(k)) - 1].slice(0, 3)} ${dm(k)}</button>`;
    bindItems(detail);
    detail.querySelector(".mp-addday").addEventListener("click", () => openNewTask(k));
  };
  showDay(UI.day);
  el.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => { UI.offset = +b.dataset.m === 0 ? 0 : UI.offset + +b.dataset.m; renderCalendar(el); align(); }));
  el.querySelector(".mp-pot")?.addEventListener("click", () => { UI.showPartner = !UI.showPartner; store.set("showPartner", UI.showPartner); renderCalendar(el); align(); });
  el.querySelectorAll("[data-day]").forEach((c) => c.addEventListener("click", () => {
    UI.day = c.dataset.day;
    el.querySelectorAll(".pl-day.sel").forEach((x) => x.classList.remove("sel"));
    c.classList.add("sel");
    showDay(UI.day);
    mascots?.poke(c); // Tino était dans cette case ? il s'envole ailleurs
    // sur téléphone, le détail est juste sous le calendrier : on le fait apparaître
    if (matchMedia("(max-width: 760px)").matches) detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }));
  el.querySelectorAll(".pl-cal [data-edit]").forEach((ch) => ch.addEventListener("click", (ev) => { ev.stopPropagation(); openEditor(findTask(ch.dataset.edit)); }));
  el.querySelectorAll(".pl-span[data-goto]").forEach((b) => b.addEventListener("click", () => el.querySelector(`.pl-day[data-day="${b.dataset.goto}"]`)?.click()));
}

// Barres de plusieurs jours dans la semaine qui commence le lundi `monday` : colonnes c0..c1 et ligne (lane) de chacune
function weekLanes(spans, monday) {
  const sunday = iso(addDays(fromIso(monday), 6));
  const segs = spans.filter((e) => e.date <= sunday && e.end >= monday).map((e) => {
    const first = e.date > monday ? e.date : monday;
    return { e, first, c0: diffDays(monday, first), c1: diffDays(monday, e.end < sunday ? e.end : sunday), head: e.date >= monday, tail: e.end <= sunday };
  }).sort((a, b) => a.c0 - b.c0 || b.c1 - a.c1);
  const ends = [];
  for (const g of segs) { let l = ends.findIndex((x) => x < g.c0); if (l < 0) l = ends.length; ends[l] = g.c1; g.lane = l; }
  return { segs, n: ends.length };
}

// Le calendrier s'aligne sur la carte « To do » (même haut, même bas) quand les deux colonnes sont côte à côte
function align() {
  requestAnimationFrame(() => { alignColumns(); refreshMascots(); });
}
function alignColumns() {
  const split = root.querySelector(".pl-split"), left = root.querySelector(".pl-left"), right = root.querySelector(".pl-right");
  const cal = right?.querySelector(".pl-cal"), todo = left?.querySelector(".pl-todo");
  if (!cal || !todo) return;
  right.style.paddingTop = left.style.paddingTop = cal.style.minHeight = "";
  cal.classList.remove("pl-fit");
  if (getComputedStyle(split).gridTemplateColumns.split(" ").length < 2) return; // colonnes empilées (téléphone)
  const nav = right.querySelector(".pl-nav");
  const navH = nav ? nav.getBoundingClientRect().height + parseFloat(getComputedStyle(nav).marginBottom) : 0;
  const offset = todo.getBoundingClientRect().top - right.getBoundingClientRect().top - navH;
  if (offset >= 0) right.style.paddingTop = offset + "px"; else left.style.paddingTop = -offset + "px";
  cal.style.minHeight = Math.max(CAL_MIN_HEIGHT, todo.getBoundingClientRect().height) + "px";
  cal.classList.add("pl-fit");
}

// Personnages qui se promènent sur la page (mascot.js : Tino, le phoque). Calque posé sur la page, hors de l'app : il survit
// aux réaffichages. Plateformes (coordonnées de page), avec une clé qui ne change pas d'un affichage à l'autre :
// - onglet Calendar : haut du calendrier, haut de chaque semaine, bas du calendrier (« cal:N »), haut de chaque carte (tâches,
//   jour choisi, messages via Tino) et haut de chaque tâche (seulement au-dessus du texte : jamais sur une case à cocher ni ✏️) ;
// - onglet Notes : haut et fond de la carte, haut de chaque note ; onglets Tino et Settings : aucune (Tino n'y est pas).
let mascots = null;
function calDays() { return [...(root?.querySelectorAll(".pl-cal .pl-day") ?? [])]; }
function mascotPlatforms() {
  const tab = currentTab(), out = [], seen = new Set();
  out.section = tab;
  if (!document.body.classList.contains("mp-logged")) return out;
  const add = (el, key, l, r, floor = false) => { // floor : le bord du BAS (il se tient dans la carte, sur son fond)
    const b = el.getBoundingClientRect();
    if (!b.width || !el.getClientRects().length || seen.has(key) || b.right - r - (b.left + l) < 16) return;
    seen.add(key);
    out.push({ key, y: (floor ? b.bottom - 6 : b.top) + scrollY, x0: b.left + scrollX + l, x1: b.right + scrollX - r });
  };
  const cards = (scope, sel, items, itemKey, floor = false) => scope?.querySelectorAll(sel).forEach((card, i) => {
    const ck = "card:" + (card.querySelector("h4")?.textContent.trim() || i);
    add(card, ck, 22, 22);
    if (floor) add(card, ck + "|floor", 22, 22, true);
    card.querySelectorAll(items).forEach((it, j) => add(it, `${ck}|${itemKey(it) ?? j}`, 64, 60)); // (une tâche peut être dans deux cartes)
  });
  if (tab === "calendar") {
    const cal = root?.querySelector(".pl-cal"), days = calDays();
    if (cal && days.length && cal.getClientRects().length) {
      const c = cal.getBoundingClientRect(), ys = [c.top];
      for (let i = 7; i < days.length; i += 7) ys.push(days[i].getBoundingClientRect().top);
      ys.push(c.bottom);
      ys.forEach((y, n) => out.push({ key: "cal:" + n, cal: n, y: y + scrollY, x0: c.left + scrollX + 18, x1: c.right + scrollX - 18, cell: c.width / 7 }));
    }
    cards(root, ".pl-card", ".pl-item", (it) => it.dataset.id);
    cards(tinoHost, ".pl-card", ".pl-item", () => null);
  } else if (tab === "notes") {
    cards(panes.notes, ".mp-notes-card", ".mp-note", (it) => it.dataset.note, true); // (+ le fond de la carte : le haut est collé au haut de l'écran)
    const dc = panes.notes?.querySelector(".mp-doodle");
    if (dc) add(dc, "card:doodle", 22, 22); // (dessins : seulement le haut de la carte, jamais sur la toile)
  }
  return out;
}
function mascotToday() {
  const days = calDays(), i = days.findIndex((d) => d.classList.contains("today"));
  if (i < 0) return null;
  const r = days[i].getBoundingClientRect();
  return { key: "cal:" + (Math.floor(i / 7) + 1), x: r.left + scrollX + r.width / 2 };
}
// Partie visible de la page : sous la barre d'état de l'iPhone (l'app s'affiche dessous) et au-dessus de la barre d'onglets
let safeTop = null;
function mascotView() {
  if (safeTop === null) {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;top:0;height:env(safe-area-inset-top);visibility:hidden;pointer-events:none";
    document.body.append(probe);
    safeTop = probe.getBoundingClientRect().height || 0;
    probe.remove();
  }
  const navTop = nav && getComputedStyle(nav).display !== "none" ? nav.getBoundingClientRect().top : innerHeight;
  return { top: scrollY + safeTop + 4, bottom: scrollY + navTop - 4, left: scrollX + 6, right: scrollX + document.documentElement.clientWidth - 6 };
}
// Un appui sur Tino passe aussi au jour du calendrier qu'il cache (ça ne fait que le choisir) — pas ailleurs : une tâche
// ou une note s'ouvrirait par-dessus lui à chaque caresse (et les 5 appuis n'arriveraient plus jusqu'à lui) ; on touche à côté
const mascotTapThrough = (el) => !el.closest("input, select, textarea, label, .pl-nav, .pl-hello, .mp-nav") && !!el.closest(".pl-cal");
// Heures de sommeil du petit Tino (cet appareil ; 🎣 Tino → 🦭 Tino) : la nuit de « from » à « to » (peut passer minuit) et
// la sieste de « napFrom » à « napTo », dans son lit. Lu à chaque image par mascot.js : gardé en mémoire, relu quand on le change.
// Repas (il cuisine ou fait un barbecue, et ne joue pas) : l'heure avant la sieste, et de 18:30 à 19:30.
let tinoSleepCache = null;
const tinoSleep = () => (tinoSleepCache ??= { from: store.get("tinoSleepFrom", "22:00"), to: store.get("tinoSleepTo", "07:00"),
  napFrom: store.get("tinoNapFrom", "12:30"), napTo: store.get("tinoNapTo", "13:00") });
const nowMinutes = (now) => now.getHours() * 60 + now.getMinutes();
const inSpan = (t, a, b) => a !== b && (a < b ? t >= a && t < b : t >= a || t < b); // (de a à b, en minutes ; peut passer minuit)
const DINNER = [18 * 60 + 30, 19 * 60 + 30];
function tinoNight(now = new Date()) { const s = tinoSleep(); return inSpan(nowMinutes(now), minutesOf(s.from), minutesOf(s.to)); }
function tinoNap(now = new Date()) { const s = tinoSleep(); return inSpan(nowMinutes(now), minutesOf(s.napFrom), minutesOf(s.napTo)); }
function tinoMeal(now = new Date()) {
  const n = minutesOf(tinoSleep().napFrom), t = nowMinutes(now);
  return inSpan(t, (n + 1380) % 1440, n) || inSpan(t, ...DINNER);
}
const hmOf = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const mealText = () => { const n = minutesOf(tinoSleep().napFrom);
  return `He cooks or has a barbecue 🍳 mostly from ${hmOf((n + 1380) % 1440)} to ${hmOf(n)} and from ${hmOf(DINNER[0])} to ${hmOf(DINNER[1])} (now and then otherwise), and plays video games 🎮 more the rest of the day.`; };
function refreshMascots() {
  if (mascots) { presenceChanged(); return mascots.refresh(); }
  const layer = document.createElement("div");
  document.body.append(layer);
  mascots = mountMascots({ layer, kinds: ["tino", "peo"], platforms: mascotPlatforms, today: mascotToday, view: mascotView, night: tinoNight, siesta: tinoNap, meal: tinoMeal, tapThrough: mascotTapThrough, lines: () => S.lines.map((l) => l.body), grumbles: grumbleLines, belly: bellyInfo,
    home: (kind) => (kind === "peo" ? potSpot() : null), onHome: () => presenceChanged(), together: bothHere, potFx });
  syncTinoBubble();
  applyOutfit();
}

// ---------- Messages via Tino (supabase/07_tino_messages.sql) ----------
// L'un écrit un petit mot en bas de la page ; chez l'autre, Tino le dit dans une bulle (+ notification) jusqu'à ce qu'on
// le touche. La carte vit hors de #app : les réaffichages (temps réel) n'effacent pas un message en cours d'écriture.
let tinoHost = null, tinoShown = null, unsubTino = null;
const tinoWhen = (at) => { const d = new Date(at); return `${relDay(iso(d))} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

function tinoBox() {
  if (tinoHost) return tinoHost;
  tinoHost = document.createElement("section");
  tinoHost.className = "mp-tino-host";
  tinoHost.hidden = true;
  tinoHost.innerHTML = `<div class="pl-card mp-tino"><h4>🦭 Message via Tino</h4>
    <form class="mp-tino-form"><input type="text" name="tinomsg" maxlength="200" autocomplete="off" enterkeyhint="send" required>
      <button type="submit" class="mp-cta">Send 💌</button></form>
    <div class="mp-tino-list"></div><div class="pl-legend mp-tino-legend"></div></div>`;
  root.after(tinoHost);
  const form = tinoHost.querySelector("form");
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const P = S.partner, text = form.tinomsg.value.trim();
    if (!P || !text) return;
    form.querySelector("button").disabled = true;
    const ok = await guard(() => db.sendTinoMessage(P.id, text), "Couldn't send the message");
    form.querySelector("button").disabled = false;
    if (!ok) return;
    form.tinomsg.value = "";
    if (!tinoShown) mascots?.say(`Okay! I'll tell ${P.label} 💌`, { ms: 3000 }); // (sans cacher un message pas encore lu)
    mascots?.flyAway(); // il part porter le message
    loadTino();
  });
  return tinoHost;
}

async function loadTino() {
  if (!S.user) return;
  try { S.tino = await db.listTinoMessages(); S.tinoOk = true; }
  catch (err) { if (/does not exist|schema cache|tino_messages/i.test(err.message)) S.tinoOk = false; } // sinon (hors ligne) : on garde la dernière liste
  renderTino();
  syncTinoBubble();
}

function renderTino() {
  const box = tinoBox(), P = S.partner, show = !!(S.user && S.me && P);
  box.hidden = !show;
  document.body.classList.toggle("mp-has-tino", show);
  if (!show) return;
  const form = box.querySelector("form"), list = box.querySelector(".mp-tino-list"), legend = box.querySelector(".mp-tino-legend");
  form.tinomsg.placeholder = `Tino will tell ${P.label}…`;
  form.tinomsg.disabled = form.querySelector("button").disabled = S.tinoOk === false;
  if (S.tinoOk === false) {
    list.innerHTML = "";
    legend.textContent = "Messages via Tino aren't available yet."; // (supabase/07_tino_messages.sql pas encore exécuté)
    return;
  }
  list.innerHTML = S.tino.slice(0, 5).map((m) => {
    const mine = m.from === S.user.id, who = mine ? `${S.me.mark} You` : `${P.mark} ${P.label}`;
    const state = mine ? (m.seen ? " · seen ✓" : " · not seen yet") : (m.seen ? "" : " · new");
    return `<div class="mp-tino-row${mine ? " mine" : ""}"><span class="mp-tino-meta">${esc(who)} · ${tinoWhen(m.at)}${state}</span><span class="mp-tino-text">${esc(m.body)}</span></div>`;
  }).join("");
  legend.textContent = `Tino says it on ${P.label}'s calendar and sends a notification. A message for you: tap Tino or the bubble once it's read.`;
}

// Le plus ancien message reçu pas encore lu → Tino le dit (un à la fois) ; lu ailleurs → la bulle disparaît
function syncTinoBubble() {
  if (!mascots || !S.user) return;
  const P = S.partner, next = S.tino.filter((m) => m.to === S.user.id && !m.seen).sort((a, b) => a.id - b.id)[0];
  if (!next || !P) { if (tinoShown) { mascots.hush(); tinoShown = null; } return; }
  if (tinoShown === next.id) return;
  tinoShown = next.id;
  mascots.say(next.body, {
    sticky: true, who: `${P.mark} ${P.label}:`, color: P.color,
    onClose: async () => { tinoShown = null; if (await guard(() => db.markTinoSeen(next.id))) loadTino(); },
  });
}

// ---------- Grand Tino au-dessus du calendrier + petites phrases de Tino (supabase/08_tino_extras.sql) ----------
// La scène (bigtino.js) est créée une fois et remise dans la page après chaque réaffichage : son animation ne repart pas
// à zéro. Animation commune aux deux (réglage « big_tino ») ; montrer / cacher : sur cet appareil seulement.
// Le fichier d'une animation choisie est gardé sur l'appareil (cache « mpmedia », pas « meopeo-… » que sw.js efface).
let stage = null, unsubExtras = null, bigShown = null, bigUrl = null;
const MEDIA = "mpmedia-v1";
const showBig = () => store.get("bigTino", true);
const missingTable = (msg) => /does not exist|schema cache|tino_lines|shared_settings/i.test(msg);

function placeBigTino() {
  if (!showBig() || !S.me) { stage?.el.remove(); return; }
  if (!stage) { stage = createBigTino(); applyBig(); }
  root.querySelector(".pl-split")?.before(stage.el);
  stage.resume();
}

async function loadExtras() {
  if (!S.user) return;
  try {
    const [lines, big] = await Promise.all([db.listTinoLines(), db.getBigTino()]);
    S.lines = lines; S.big = big; S.extrasOk = true;
    store.set("big." + S.user.id, big); // hors connexion : la dernière animation connue
  } catch (err) {
    if (missingTable(err.message)) { S.extrasOk = false; S.lines = []; S.big = null; }
    else S.big = store.get("big." + S.user.id, null); // hors ligne : on garde ce qu'on a
  }
  applyBig();
  const box = document.querySelector(".mp-tinoset");
  if (box) fillTinoSettings(box);
}

// Montre l'animation du réglage commun (ou celle d'origine) ; le fichier vient du cache de l'appareil, sinon de Supabase
async function applyBig() {
  if (!stage) return;
  const big = S.big, key = big?.path ?? "";
  if (key === bigShown) return;
  bigShown = key;
  if (!big) { stage.set(DEFAULT_ANIM); dropUrl(); return; }
  try {
    const url = URL.createObjectURL(await mediaBlob(big.path));
    if (bigShown !== key) { URL.revokeObjectURL(url); return; } // une autre animation a été choisie entre-temps
    stage.set(big.kind === "sprite" ? { ...big, url } : { kind: "image", url });
    dropUrl(); bigUrl = url;
  } catch (err) {
    console.warn("Big Tino", err);
    bigShown = null; // on réessaiera au prochain chargement
    stage.set(DEFAULT_ANIM); // fichier introuvable / hors ligne sans copie : l'original en attendant
  }
}
function dropUrl() { if (bigUrl) URL.revokeObjectURL(bigUrl); bigUrl = null; }
async function mediaBlob(path) {
  const key = new URL(`__media/${path}`, location.href).href;
  const cache = "caches" in window ? await caches.open(MEDIA).catch(() => null) : null;
  const hit = await cache?.match(key);
  if (hit) return hit.blob();
  const blob = await db.tinoFile(path);
  if (cache) {
    if (path.startsWith("big/")) for (const r of await cache.keys()) if (r.url.includes("/__media/big/") && r.url !== key) await cache.delete(r); // une seule animation gardée
    await cache.put(key, new Response(blob, { headers: { "Content-Type": blob.type } })).catch(() => {});
  }
  return blob;
}

// Nouvelle animation choisie dans ⚙ : une vidéo devient une planche d'images sur l'appareil, un GIF part tel quel
async function chooseAnimation(file, status) {
  let blob, meta;
  if (file.type.startsWith("video/")) {
    status("Turning the video into an animation…");
    ({ blob, meta } = await videoToSprite(file, { onProgress: (p) => status(`Turning the video into an animation… ${Math.round(p * 100)}%`) }));
  } else if (["image/gif", "image/webp", "image/png", "image/jpeg"].includes(file.type)) {
    blob = file; meta = { kind: "image" };
  } else throw new Error("use a GIF, WebP, PNG or a short video");
  if (blob.size > 10 * 1024 * 1024) throw new Error(`too big (${(blob.size / 1048576).toFixed(1)} MB, 10 MB max) — use a shorter video or a smaller GIF`);
  status("Sending…");
  await db.setBigTino(blob, meta);
}

const lineWho = (l) => (l.by === S.user?.id ? S.me : S.partner);
function fillTinoSettings(box) {
  const ok = S.extrasOk !== false, P = S.partner;
  const big = S.big, who = big && (big.by === S.user.id ? "you" : esc(P?.label ?? "the other"));
  const sl = tinoSleep();
  box.innerHTML = `<label class="mp-check"><input type="checkbox" name="bigtino" ${showBig() ? "checked" : ""}> Big Tino above the calendar <span class="pl-legend">(this device)</span></label>
    <div class="pl-sub">😴 Sleep <span class="pl-legend">— this device only</span></div>
    <span class="mp-row mp-dayhours"><span class="mp-sleepwhen">🌙 Night</span><label>from <input type="time" name="sleepfrom" value="${sl.from}"></label><label>to <input type="time" name="sleepto" value="${sl.to}"></label></span>
    <span class="mp-row mp-dayhours"><span class="mp-sleepwhen">☀️ Nap</span><label>from <input type="time" name="napfrom" value="${sl.napFrom}"></label><label>to <input type="time" name="napto" value="${sl.napTo}"></label></span>
    <div class="pl-legend">Tino sleeps in his bed, in today's square (or wherever he is, if it's off screen). <span class="mp-mealtxt">${mealText()}</span></div>
    ${ok ? `<div class="mp-row mp-anim"><span>Animation: <b>${big ? `new one, from ${who} (${shortDate(big.at)})` : "the original"}</b></span></div>
    <span class="mp-row"><label class="mp-filebtn"><input type="file" accept="image/gif,image/webp,image/png,image/jpeg,video/*" hidden> Change… (GIF or video)</label>${big ? `<button type="button" data-act="bigreset">Back to the original</button>` : ""}</span>
    <div class="pl-legend mp-animstatus">Shared: ${esc(P?.label ?? "the other")} sees the same animation. A video becomes a looping animation (10 s max); files up to 10 MB.</div>
    <div class="pl-sub">Tino's lines <span class="pl-legend">— Tino says them now and then, on both screens</span></div>
    <div class="mp-lines">${S.lines.length ? S.lines.map((l) => `<div class="mp-line"><span class="mp-line-who" title="${esc(lineWho(l)?.label ?? "")}">${esc(lineWho(l)?.mark ?? "•")}</span><span class="mp-line-text">${esc(l.body)}</span><button type="button" data-line="${l.id}" title="Remove this line">✕</button></div>`).join("") : `<div class="pl-empty">No lines yet.</div>`}</div>
    <div class="mp-row mp-lineadd"><input type="text" name="newline" maxlength="120" placeholder="Something Tino should say…" enterkeyhint="done"><button type="button" data-act="lineadd">Add</button></div>`
    : `<div class="pl-legend">Tino's lines and changing the animation aren't available yet — Tony needs to run <code>supabase/08_tino_extras.sql</code>.</div>`}`;
  box.querySelector("[name=bigtino]").addEventListener("change", (ev) => { store.set("bigTino", ev.target.checked); placeBigTino(); align(); });
  for (const [fromName, toName, fromKey, toKey, what] of [["sleepfrom", "sleepto", "tinoSleepFrom", "tinoSleepTo", "sleeps"], ["napfrom", "napto", "tinoNapFrom", "tinoNapTo", "naps"]])
    for (const name of [fromName, toName]) box.querySelector(`[name=${name}]`).addEventListener("change", () => {
      const from = box.querySelector(`[name=${fromName}]`).value, to = box.querySelector(`[name=${toName}]`).value;
      if (!/^\d\d:\d\d$/.test(from) || !/^\d\d:\d\d$/.test(to)) return;
      if (from === to) { toast("😴 Pick two different times"); fillTinoSettings(box); return; }
      store.set(fromKey, from); store.set(toKey, to); tinoSleepCache = null;
      mascots?.refresh();
      box.querySelector(".mp-mealtxt").textContent = mealText(); // (le repas de midi suit la sieste)
      toast(`😴 Tino ${what} from ${from} to ${to}`);
    });
  if (!ok) return;
  const status = (t) => { box.querySelector(".mp-animstatus").textContent = t; };
  const input = box.querySelector("input[type=file]");
  input.addEventListener("change", async () => {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    if (!navigator.onLine) { toast("📴 You're offline — try again once you're back online."); return; }
    box.querySelectorAll("button, .mp-filebtn").forEach((b) => b.classList.add("mp-busy"));
    try { await chooseAnimation(file, status); toast("🦭 New animation for Tino!"); await loadExtras(); }
    catch (err) {
      const why = /bucket not found/i.test(err.message) ? "the file storage isn't set up yet — Tony needs to run supabase/08_tino_extras.sql"
        : /exceeded the maximum allowed size|payload too large/i.test(err.message) ? "the file storage still takes 5 MB max — Tony needs to run supabase/09_tino_10mo.sql"
        : err.message;
      toast(`⚠️ Couldn't change the animation (${why})`);
      fillTinoSettings(box);
    }
  });
  box.querySelector("[data-act=bigreset]")?.addEventListener("click", async () => {
    if (await guard(() => db.resetBigTino(), "Couldn't change the animation")) { toast("🦭 Tino is back to the original"); loadExtras(); }
  });
  box.querySelectorAll("[data-line]").forEach((b) => b.addEventListener("click", async () => {
    if (await guard(() => db.deleteTinoLine(+b.dataset.line), "Couldn't remove the line")) loadExtras();
  }));
  const add = async () => {
    const field = box.querySelector("[name=newline]"), text = field.value.trim();
    if (!text) return;
    if (await guard(() => db.addTinoLine(text), "Couldn't add the line")) { field.value = ""; await loadExtras(); box.querySelector("[name=newline]")?.focus(); }
  };
  box.querySelector("[data-act=lineadd]").addEventListener("click", add);
  box.querySelector("[name=newline]").addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); add(); } });
}

// ---------- Phrases râleuses : 5 appuis rapides sur Tino (supabase/13_tino_grumbles.sql) ----------
// Liste commune aux deux ; vide (ou base sans 13) : quelques phrases par défaut.
let unsubGrumbles = null;
const DEFAULT_GRUMBLES = (P) => ["Stop poking me! 😤", "Hey!! Go do your tasks instead 🙄", "-_-", "What do you even want? 😑", "Leave me alone, I'm busy! 💢", `I'm telling ${P?.label ?? "on you"}! 😤`];
const grumbleLines = () => (S.grumbles.length ? S.grumbles.map((g) => g.body) : DEFAULT_GRUMBLES(S.partner));
async function loadGrumbles() {
  if (!S.user) return;
  try { S.grumbles = await db.listGrumbles(); S.grumblesOk = true; store.set("grumbles." + S.user.id, S.grumbles); }
  catch (err) {
    if (/does not exist|schema cache|tino_grumbles/i.test(err.message)) { S.grumblesOk = false; S.grumbles = []; }
    else S.grumbles = store.get("grumbles." + S.user.id, S.grumbles); // hors ligne
  }
  const box = document.querySelector(".mp-grumbles");
  if (box) fillGrumbles(box);
}
function fillGrumbles(box) {
  const head = `<div class="pl-legend">Tap Tino 5 times quickly and he snaps one of these at you (both screens).</div>`;
  if (S.grumblesOk === false) { box.innerHTML = head + `<div class="pl-legend">Your own grumpy lines aren't available yet — Tony needs to run <code>supabase/13_tino_grumbles.sql</code>. Tino uses his default ones meanwhile.</div>`; return; }
  const who = (g) => (g.by === S.user.id ? S.me : S.partner);
  box.innerHTML = head + `<div class="mp-lines">${S.grumbles.length ? S.grumbles.map((g) => `<div class="mp-line"><span class="mp-line-who" title="${esc(who(g)?.label ?? "")}">${esc(who(g)?.mark ?? "•")}</span><span class="mp-line-text">${esc(g.body)}</span><button type="button" data-grumble="${g.id}" title="Remove this line">✕</button></div>`).join("")
      : `<div class="pl-legend">None yet — Tino uses his default ones: ${DEFAULT_GRUMBLES(S.partner).map(esc).join(" · ")}</div>`}</div>
    <div class="mp-row mp-lineadd"><input type="text" name="newgrumble" maxlength="120" placeholder="Something Tino snaps when he's annoyed…" enterkeyhint="done"><button type="button" data-act="grumbleadd">Add</button></div>`;
  box.querySelectorAll("[data-grumble]").forEach((b) => b.addEventListener("click", async () => {
    if (await guard(() => db.deleteGrumble(+b.dataset.grumble), "Couldn't remove the line")) loadGrumbles();
  }));
  const add = async () => {
    const field = box.querySelector("[name=newgrumble]"), text = field.value.trim();
    if (!text) return;
    if (await guard(() => db.addGrumble(text), "Couldn't add the line")) { field.value = ""; await loadGrumbles(); box.querySelector("[name=newgrumble]")?.focus(); }
  };
  box.querySelector("[data-act=grumbleadd]").addEventListener("click", add);
  box.querySelector("[name=newgrumble]").addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); add(); } });
}

// ---------- Garde-robe du petit Tino (supabase/12_tino_outfits.sql) ----------
// Une tenue = un dessin PNG transparent fait sur le modèle (⬇ Template), posé sur la tête ou sur le corps de Tino.
// Commune aux deux, comme ce que Tino porte (une tenue « head » + une tenue « body » au plus).
let unsubOutfits = null;
const outfitUrls = new Map(); // fichier → adresse locale de l'image (gardée tant que la tenue existe)
async function loadOutfits() {
  if (!S.user) return;
  try { const r = await db.listOutfits(); S.outfits = r.outfits; S.worn = r.worn; S.outfitHours = r.hours ?? null; S.outfitsOk = true; store.set("outfits." + S.user.id, r); }
  catch (err) {
    if (/does not exist|schema cache|tino_outfits/i.test(err.message)) { S.outfitsOk = false; S.outfits = []; S.worn = { head: null, body: null }; }
    else { const r = store.get("outfits." + S.user.id, null); if (r) { S.outfits = r.outfits; S.worn = r.worn; S.outfitHours = r.hours ?? null; } } // hors ligne
  }
  await applyOutfit();
  const box = document.querySelector(".mp-wardrobe");
  if (box && !wardrobeBusy(box)) fillWardrobe(box);
  refreshFishing();
  scheduleFishTimer();
  syncWidgetScenes();
  const fset = document.querySelector(".mp-fishset"); // (l'autre a changé la durée : ⚙ → 🎣 Fishing suit, sauf si on y touche)
  if (fset && !fset.contains(document.activeElement)) fillFishSet(fset);
}

// ---------- Images du widget « Tino » avec la tenue portée (supabase/18_widget_scenes.sql) ----------
// Une image par scène (scenePng de mascot.js : le vrai dessin de Tino, avec sa tenue), rangée dans la base ; le widget la lit
// avec sa clé. Refaites quand la tenue portée change : tout de suite sur l'appareil qui l'a changée (outfitChangedHere),
// 40 s plus tard sur l'autre (s'il voit qu'elles ne sont toujours pas à jour — pas de travail en double). Plus de tenue :
// tout est effacé (le widget reprend ses images de base). Empreinte = version des scènes + tenues portées.
let outfitChangedHere = false, sceneChain = Promise.resolve(), sceneTimer = 0, sceneDue = Infinity;
const sceneSig = (head, body, fur) => `v${SCENES_V}|${head ? `${head.id}:${head.hideFlower ? 1 : 0}` : "-"}|${body?.id ?? "-"}${fur ? `|${fur.fill}` : ""}`;
const blobToDataUrl = (blob) => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ko(r.error); r.readAsDataURL(blob); });
// Tenue en adresse data: (une image SVG ne charge rien d'autre) ; tenue animée : sa première image (un widget ne bouge pas)
async function outfitDataUrl(o) {
  const blob = await mediaBlob(o.path);
  if (!o.anim) return blobToDataUrl(blob);
  const url = URL.createObjectURL(blob), A = o.anim, m = (A.cell - A.size) / 2;
  try {
    const img = await loadImg(url), c = document.createElement("canvas");
    c.width = c.height = A.size;
    c.getContext("2d").drawImage(img, m, m, A.size, A.size, 0, 0, A.size, A.size);
    const out = c.toDataURL("image/png");
    c.width = c.height = 0;
    return out;
  } finally { URL.revokeObjectURL(url); }
}
// (une mise à jour déjà prévue plus tôt n'est jamais repoussée — l'écho temps réel de notre propre changement arrive juste
// après — et les mises à jour passent l'une après l'autre, chacune ne refait que ce qui n'est pas à jour)
function syncWidgetScenes() {
  const due = Date.now() + (outfitChangedHere ? 300 : 40000);
  outfitChangedHere = false;
  if (due >= sceneDue) return;
  clearTimeout(sceneTimer);
  sceneDue = due;
  sceneTimer = setTimeout(() => {
    sceneDue = Infinity;
    sceneChain = sceneChain.then(renderWidgetScenes).catch((err) => console.warn("Tino widget pictures", err));
  }, due - Date.now());
}
async function renderWidgetScenes() {
  if (!S.user || !S.outfitsOk || S.scenesOk === false || !navigator.onLine) return;
  let sigs;
  try { sigs = await db.widgetSceneSigs(); S.scenesOk = true; }
  catch (err) { if (/widget_scenes|schema cache|does not exist/i.test(err.message)) S.scenesOk = false; return; } // (base sans 18 : rien à faire)
  const head = wornOutfit("head"), body = wornOutfit("body"), fur = furNow(), sig = sceneSig(head, body, fur);
  if (!head && !body && !fur) { if (sigs.size) await db.clearWidgetScenes(); return; }
  const todo = WIDGET_SCENES.filter(([name]) => sigs.get(name) !== sig);
  if (!todo.length) return;
  const outfit = head || body ? { head: head ? await outfitDataUrl(head) : null, body: body ? await outfitDataUrl(body) : null, hideFlower: !!head?.hideFlower } : null;
  for (const [name] of todo) {
    const now = sceneSig(wornOutfit("head"), wornOutfit("body"), furNow());
    if (now !== sig) return; // la tenue ou la couleur a encore changé : la prochaine fois
    const png = (await blobToDataUrl(await scenePng(name, { outfit, fur }))).replace(/^data:image\/png;base64,/, "");
    await db.saveWidgetScene(name, png, sig);
  }
}
async function outfitUrl(o) {
  if (!outfitUrls.has(o.path)) outfitUrls.set(o.path, URL.createObjectURL(await mediaBlob(o.path)));
  return outfitUrls.get(o.path);
}
// Pêche (20_fishing.sql) : une tenue se porte seulement si elle a été pêchée il y a moins de 7 jours (sinon : la réserve).
// Sans 20 : toutes se portent, comme avant.
// Durée d'une tenue pêchée : la sienne (28_outfit_duration.sql), sinon le réglage commun (26_outfit_hours.sql, 24 h par
// défaut) ; sans 26 : 7 jours
const outfitMs = (o) => (o?.hours ?? S.outfitHours ?? 168) * 3600e3;
const unlocked = (o) => S.fishingOk !== true || (!!o?.caughtAt && Date.parse(o.caughtAt) > Date.now() - outfitMs(o));
const caughtUntil = (o) => new Date(Date.parse(o.caughtAt) + outfitMs(o));
const durText = (h) => (h >= 48 && h % 24 === 0 ? `${h / 24} days` : h === 1 ? "1 hour" : `${h} hours`);
const untilText = (d) => (+d - Date.now() < 2 * 86400e3 ? hourOf(d) : dayShort(d)); // (bientôt : l'heure ; plus loin : le jour)
const showPool = () => store.get("showPool", false) === true; // (⚙ Settings → 🎣 Fishing, cet appareil : la réserve est une surprise)
const dayShort = (d) => `${DAYS[dow(d) - 1].slice(0, 3)} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
// Ce que Tino porte : { head, body } (les tenues) et { head, body, hideFlower } prêt pour wear() de mascot.js
const wornOutfit = (layer) => S.outfits.find((o) => o.id === S.worn[layer] && o.layer === layer && unlocked(o));
async function wornLook() {
  const head = wornOutfit("head"), body = wornOutfit("body");
  try {
    const it = async (o) => (o ? { url: await outfitUrl(o), anim: o.anim ?? null } : null); // (anim : tenue animée, voir 17)
    return { head: await it(head), body: await it(body), hideFlower: !!head?.hideFlower };
  } catch (err) { console.warn("Tino's outfit", err); return {}; }
}
// Habille Tino (calendrier et grand Tino de l'onglet Tino) ; fichiers des tenues disparues : retirés de l'appareil
async function applyOutfit() {
  const look = await wornLook();
  mascots?.wear(look);
  dressShowcase(look);
  const keep = new Set(S.outfits.map((o) => o.path));
  for (const [path, url] of outfitUrls) if (!keep.has(path)) { URL.revokeObjectURL(url); outfitUrls.delete(path); }
  if (S.outfitsOk && "caches" in window) {
    const cache = await caches.open(MEDIA).catch(() => null);
    for (const r of (await cache?.keys()) ?? []) { const m = r.url.match(/__media\/(outfits\/.+)$/); if (m && !keep.has(m[1])) await cache.delete(r); }
  }
}

// Dessin choisi : carré, avec de la transparence (sinon un carré blanc couvrirait Tino), réduit à 512 px en PNG
async function prepareOutfit(file) {
  if (!/^image\//.test(file.type)) throw new Error("pick a PNG drawing, a GIF or a video");
  const img = new Image();
  const url = URL.createObjectURL(file);
  try { await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = url; }); } // (onload, pas decode() : jamais fini dans une page cachée)
  catch { throw new Error("this image can't be read — export it as PNG"); } finally { URL.revokeObjectURL(url); }
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || Math.abs(w - h) > Math.max(2, w * 0.01)) throw new Error(`the drawing must be square, like the template (this one is ${w} × ${h})`);
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0, 512, 512);
  const a = g.getImageData(0, 0, 512, 512).data;
  let clear = 0;
  for (let i = 3; i < a.length; i += 4 * 7) if (a[i] < 200) clear++;
  if (clear < a.length / 4 / 7 * 0.2) throw new Error("no transparent background — export only your drawing layer as PNG (hide the template and the background), and pick it from Files");
  const blob = await new Promise((ok) => c.toBlob(ok, "image/png"));
  if (!blob || blob.type !== "image/png") throw new Error("this browser couldn't save the drawing");
  return blob;
}
// Tenue animée : un GIF, un PNG animé ou une vidéo (10 s au plus, la suite est ignorée) devient sur l'appareil une planche
// PNG transparente (images de 192 px, plus petites si la planche dépasse ~9,5 Mo) + anim (bigtino.js ; 17_outfit_anim.sql).
// kind : "gif" | "apng" | "video". Un fond uni (une vidéo n'a pas de transparence) est retiré.
// null : GIF / PNG d'une seule image (traité comme un dessin fixe).
const OUTFIT_MAX = 10 * 1024 * 1024;
async function animatedOutfit(file, kind, status) {
  const what = { gif: "GIF", apng: "animated PNG", video: "video" }[kind];
  if (kind !== "video" && file.size > OUTFIT_MAX) throw new Error(`this ${what} is too big (${(file.size / 1048576).toFixed(1)} MB, 10 MB max)`);
  const label = kind === "video" ? "Turning the video into an animation…" : `Reading the ${what}…`;
  status(label);
  await new Promise((r) => setTimeout(r, 40)); // (le message s'affiche avant le calcul)
  const opts = { size: 192, onProgress: (p) => status(`${label} ${Math.round(p * 100)}%`) };
  const { frames, fps } = kind === "gif" ? await gifFrames(new Uint8Array(await file.arrayBuffer()), opts)
    : kind === "apng" ? await apngFrames(new Uint8Array(await file.arrayBuffer()), opts)
    : await videoFrames(file, { ...opts, square: true });
  try {
    if (frames.length < 2) { if (kind !== "video") return null; throw new Error("this video is too short"); }
    if (keyBackground(frames)) status("Background removed — saving…"); else status("Saving…");
    let res = await outfitSheet(frames, fps);
    for (const size of [144, 112]) {
      if (res.blob.size <= 9.5 * 1024 * 1024) break;
      const small = shrinkFrames(frames, size);
      res = await outfitSheet(small, fps);
      small.forEach(releaseCanvas);
    }
    if (res.blob.size > OUTFIT_MAX) throw new Error("this animation is too big, even made smaller — use a shorter one");
    return res;
  } finally { frames.forEach(releaseCanvas); }
}
// Miniatures des tenues animées dans la garde-robe : la planche en fond, une case à la fois (minuterie tant qu'elles sont affichées)
let thumbTimer = 0;
function thumbFrame(el, i) {
  const A = el._anim, k = el.clientWidth / A.size, m = (A.cell - A.size) / 2;
  el.style.backgroundSize = `${A.cols * A.cell * k}px ${A.rows * A.cell * k}px`;
  el.style.backgroundPosition = `${-((i % A.cols) * A.cell + m) * k}px ${-(Math.floor(i / A.cols) * A.cell + m) * k}px`;
}
function animateThumbs(els) {
  clearInterval(thumbTimer);
  if (!els.length) return;
  const t0 = performance.now();
  thumbTimer = setInterval(() => {
    const live = els.filter((e) => e.isConnected && e._anim);
    if (!els.some((e) => e.isConnected)) { clearInterval(thumbTimer); return; }
    if (document.hidden) return;
    const t = (performance.now() - t0) / 1000;
    for (const e of live) if (e.offsetParent) thumbFrame(e, Math.floor(t * e._anim.fps) % e._anim.n); // (pas quand l'onglet est fermé)
  }, 80);
}
// Modèle : feuille de partage (iPhone / iPad : « Enregistrer l'image », « Enregistrer dans Fichiers »), sinon téléchargement
async function shareTemplate() { await shareFile(await outfitTemplate(), "tino-template.png", "Tino template"); }
async function shareFile(blob, name, title) {
  const file = new File([blob], name, { type: blob.type || "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return; } catch (err) { if (err.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

// Nom d'une tenue tiré du nom de son fichier (quand on n'en a pas tapé) : sans l'extension, sans ce qui est entre crochets /
// parenthèses / accolades (« [Pack name] - Bucket Hat.png » → « Bucket Hat »), « _ » → espace, sans
// séparateurs au début ni à la fin ; 40 caractères au plus (12_tino_outfits.sql)
const outfitNameOf = (fileName) => String(fileName ?? "").replace(/\.[^.]+$/, "").replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, " ").replace(/_/g, " ")
  .replace(/\s+/g, " ").replace(/^[\s\-–—:|·.,]+|[\s\-–—:|·.,]+$/g, "").trim().slice(0, 40).trim() || "Outfit";
let renaming = null; // id de la tenue qu'on est en train de renommer (la garde-robe n'est pas refaite pendant ce temps)
// Les mises à jour en direct ne refont pas la garde-robe pendant un renommage, un envoi, ni avec un nom ou une rareté
// tapés pour une nouvelle tenue (elles les effaceraient)
function wardrobeBusy(box) {
  return !!renaming || !!box.querySelector(".mp-busy") || !!box.querySelector("[name=oname]")?.value || !!box.querySelector("[name=odur]")?.value || !["", "1"].includes(box.querySelector("[name=orarity]")?.value ?? "1");
}
// Rareté d'une tenue à pêcher, « 1 sur N » (27_outfit_rarity.sql) : 1 = normale, 10 = édition limitée (10 fois plus rare
// qu'une tenue normale) ; de 1 à 1000
const rarityOf = (v) => Math.min(1000, Math.max(1, Math.round(Number(v)) || 1));
const rareBadge = (o) => ((o?.rarity ?? 1) > 1 ? `<b class="mp-rare">✨ 1 in ${o.rarity}</b>` : "");
// Durée propre d'une tenue pêchée (28_outfit_duration.sql) : null = la durée commune ; mêmes choix que ⚙ Settings → 🎣 Fishing.
// Seulement avec 26 (S.outfitHours connu), dont 28 a besoin.
const hoursOf = (v) => (v === "" || v == null ? null : Math.min(168, Math.max(1, Math.round(Number(v)) || 24)));
const hoursOptions = (h) => `<option value=""${h == null ? " selected" : ""}>default (${durText(S.outfitHours ?? 168)})</option>`
  + (OUTFIT_HOURS.includes(h) || h == null ? OUTFIT_HOURS : [...OUTFIT_HOURS, h].sort((a, b) => a - b)).map((x) => `<option value="${x}"${x === h ? " selected" : ""}>${durText(x)}</option>`).join("");
function fillWardrobe(box) {
  if (S.outfitsOk === false) { box.innerHTML = `<div class="pl-legend">Tino's wardrobe isn't available yet — Tony needs to run <code>supabase/12_tino_outfits.sql</code>.</div>`; return; }
  const who = (o) => (o.by === S.user.id ? S.me : S.partner), fishing = S.fishingOk === true, timed = fishing && S.outfitHours != null;
  const row = (o, inPool = false) => {
    const on = !inPool && wornOutfit(o.layer)?.id === o.id;
    const when = inPool ? " · in the pool" : fishing ? ` · until ${untilText(caughtUntil(o))}` : "";
    const thumb = o.anim ? `<span class="mp-othumb" title="Animated"><i data-athumb="${o.id}"></i></span>` : `<img alt="" data-thumb="${o.id}">`;
    return `<div class="mp-outfit${on ? " on" : ""}${inPool ? " mp-pooled" : ""}" data-orow="${o.id}">${thumb}<span class="mp-outfit-name"><span class="mp-oname">${esc(o.name)}</span> <span class="pl-legend">${o.layer === "head" ? "head" : "body"}${o.anim ? " · animated" : ""} · ${esc(who(o)?.mark ?? "")}${when}${fishing && rareBadge(o) ? ` · ${rareBadge(o)}` : ""}${timed && o.hours ? ` · ⏱ ${durText(o.hours)}` : ""}</span></span>
      ${inPool ? "" : `<button type="button" data-wear="${o.id}">${on ? "Take off" : "Wear"}</button>`}<button type="button" data-rename="${o.id}" title="${timed ? "Rename / rarity / duration" : fishing ? "Rename / rarity" : "Rename"}">✏️</button><button type="button" data-drop="${o.id}" title="Remove from the wardrobe">✕</button></div>`;
  };
  const wearable = S.outfits.filter(unlocked), pool = fishing ? S.outfits.filter((o) => !unlocked(o)) : [];
  box.innerHTML = (fishing ? `<div class="pl-legend">🎣 Outfits come from <b>fishing</b>: a new drawing goes into the <b>pool</b>; catch it in the <b>🎣 Fishing</b> tab and you can both dress Tino with it for <b>${durText(S.outfitHours ?? 168)}</b>${timed ? " (or its own ⏱ duration)" : ""} — then it goes back into the pool.</div>` : "")
    + `<div class="pl-legend">Draw outfits for Tino on a tablet: download the template, draw on a <b>new layer</b> on top of it, then export <b>only your layer</b> as a PNG with a transparent background. Shared: ${esc(S.partner?.label ?? "the other")} sees what Tino wears.</div>
    <div class="pl-legend">✨ It can also <b>move</b>: export your animation as an <b>animated PNG</b> or a <b>GIF</b> with a transparent background, or as a <b>video</b> on a plain background color you don't use in the drawing (it's removed). Square like the template, 10 s max (the rest is cut), plays in a loop.</div>
    <span class="mp-row"><button type="button" data-act="template">⬇ Template</button></span>
    ${fishing ? `<div class="pl-sub">👒 Caught — wear them</div>` : ""}
    <div class="mp-outfits">${wearable.length ? wearable.map((o) => row(o)).join("") : `<div class="pl-empty">${fishing ? "Nothing caught right now — go fishing 🎣" : "No outfits yet."}</div>`}</div>
    ${fishing && !showPool() ? `<div class="pl-sub">🎣 In the pool (${pool.length})</div>
      <div class="pl-legend">Hidden — it's a surprise. To see, rename, remove them or change their rarity or duration: ⚙ Settings → 🎣 Fishing → “Show the outfit pool”.</div>` : ""}
    ${fishing && showPool() ? `<div class="pl-sub">🎣 In the pool (${pool.length})</div>
      <div class="mp-outfits">${pool.map((o) => row(o, true)).join("")}${pool.length ? "" : `<div class="pl-empty">Empty — draw a new outfit!</div>`}</div>
      ${pool.length ? `<div class="pl-legend">One of these comes up when you catch an outfit — ✏️ to rename it, make it rarer (✨ limited edition) or change how long it lasts once caught (⏱), ✕ to take it out of the pool.</div>` : ""}` : ""}
    <div class="mp-outfit-add">
      <input type="text" name="oname" maxlength="40" placeholder="Name (e.g. Summer hat)">
      <span class="mp-row"><label class="mp-check"><input type="radio" name="olayer" value="head" checked> On his head</label><label class="mp-check"><input type="radio" name="olayer" value="body"> On his body</label></span>
      <label class="mp-check mp-oflower"><input type="checkbox" name="oflower"> Hide his flower</label>
      ${fishing ? `<label class="mp-check mp-orarity">🎲 Rarity: 1 in <input type="number" name="orarity" min="1" max="1000" step="1" value="1" inputmode="numeric" aria-label="Rarity: 1 in"></label>
      ${timed ? `<label class="mp-check mp-orarity">⏱ Lasts <select name="odur" aria-label="How long it lasts once caught">${hoursOptions(null)}</select> once caught</label>` : ""}
      <div class="pl-legend">1 = normal · 10 = ✨ limited edition, 10× rarer than a normal outfit.${timed ? " ⏱ default = the duration for all outfits (⚙ Settings → 🎣 Fishing)." : ""} To change it later: ✏️ (for outfits in the pool: ⚙ Settings → 🎣 Fishing → “Show the outfit pool”)</div>` : ""}
      <span class="mp-row"><label class="mp-filebtn"><input type="file" accept="image/png,image/apng,.apng,image/webp,image/gif,video/*" hidden> ＋ Add a drawing (PNG, GIF or video)</label></span>
      <div class="pl-legend mp-ostatus"></div>
    </div>`;
  box.querySelectorAll("[data-thumb]").forEach(async (im) => { const o = S.outfits.find((x) => x.id === im.dataset.thumb); try { im.src = await outfitUrl(o); } catch { im.alt = "?"; } });
  const anims = [...box.querySelectorAll("[data-athumb]")];
  anims.forEach(async (el) => {
    const o = S.outfits.find((x) => x.id === el.dataset.athumb);
    try { el.style.backgroundImage = `url("${await outfitUrl(o)}")`; el._anim = o.anim; thumbFrame(el, 0); } catch { el.textContent = "?"; }
  });
  animateThumbs(anims);
  box.querySelector("[data-act=template]").addEventListener("click", () => shareTemplate().catch((err) => toast(`⚠️ Couldn't make the template (${err.message})`)));
  box.querySelectorAll("[data-wear]").forEach((b) => b.addEventListener("click", async () => {
    const o = S.outfits.find((x) => x.id === b.dataset.wear);
    if (await guard(() => db.wearOutfit(o.layer, wornOutfit(o.layer)?.id === o.id ? null : o.id), "Couldn't change Tino's outfit")) { outfitChangedHere = true; loadOutfits(); }
  }));
  box.querySelectorAll("[data-drop]").forEach((b) => b.addEventListener("click", async () => {
    const o = S.outfits.find((x) => x.id === b.dataset.drop);
    if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = o && o.by !== S.user.id ? `Sure? ${S.partner?.label ?? "The other"} loses it too ✕` : "Sure? ✕"; return; } // 2e appui pour confirmer
    if (await guard(() => db.deleteOutfit(b.dataset.drop), "Couldn't remove the outfit")) { outfitChangedHere = true; loadOutfits(); }
  }));
  // Renommer : le nom devient un champ (Entrée / ✓ enregistre, Échap / ✕ annule) ; un seul à la fois ; pendant ce temps,
  // les mises à jour en direct ne refont pas la garde-robe (renaming)
  box.querySelectorAll("[data-rename]").forEach((b) => b.addEventListener("click", () => {
    const o = S.outfits.find((x) => x.id === b.dataset.rename), rowEl = b.closest(".mp-outfit");
    if (!o || box.querySelector(".mp-orename")) return;
    renaming = o.id;
    const span = rowEl.querySelector(".mp-oname");
    span.innerHTML = `<span class="mp-orename"><input type="text" maxlength="40" value="${esc(o.name)}" aria-label="New name" enterkeyhint="done">${fishing ? `<label class="mp-orare" title="1 = normal · 10 = limited edition (10× rarer)">🎲 1 in <input type="number" name="rerarity" min="1" max="1000" step="1" inputmode="numeric" enterkeyhint="done" value="${o.rarity ?? 1}" aria-label="Rarity: 1 in"></label>` : ""}${timed ? `<label class="mp-orare" title="How long it lasts once caught">⏱ <select name="redur" aria-label="How long it lasts once caught">${hoursOptions(o.hours ?? null)}</select></label>` : ""}<button type="button" data-ok title="Save">✓</button><button type="button" data-no title="Cancel">✕</button></span>`;
    const input = span.querySelector("input"), rIn = span.querySelector("[name=rerarity]"), dIn = span.querySelector("[name=redur]");
    input.focus(); input.select();
    const close = () => { renaming = null; fillWardrobe(box); };
    const save = async () => {
      const name = input.value.trim(), rarity = rIn ? rarityOf(rIn.value) : o.rarity ?? 1, hours = dIn ? hoursOf(dIn.value) : o.hours ?? null;
      const newName = !!name && name !== o.name, newRarity = rarity !== (o.rarity ?? 1), newHours = hours !== (o.hours ?? null);
      if (!newName && !newRarity && !newHours) { close(); return; }
      const lock = (on) => span.querySelectorAll("input, select, button").forEach((x) => { x.disabled = on; });
      lock(true);
      // (chaque changement réussi est gardé tout de suite : si le suivant échoue, ✓ ne renvoie que ce qui reste)
      if (newName) { if (!(await guard(() => db.renameOutfit(o.id, name), "Couldn't rename the outfit"))) { lock(false); return; } o.name = name; outfitChangedHere = true; }
      if (newRarity) { if (!(await guard(() => db.setOutfitRarity(o.id, rarity), "Couldn't change the rarity"))) { lock(false); return; } o.rarity = rarity; }
      if (newHours) { if (!(await guard(() => db.setOutfitDuration(o.id, hours), "Couldn't change how long it lasts"))) { lock(false); return; } o.hours = hours; }
      const said = [newName && "✏️ renamed", newRarity && (rarity > 1 ? `✨ now a limited edition: 1 in ${rarity}` : "🎲 a normal outfit again"),
        newHours && (hours ? `⏱ lasts ${durText(hours)} once caught` : `⏱ back to the default duration (${durText(S.outfitHours ?? 168)})`)].filter(Boolean);
      toast(newName && said.length === 1 ? `✏️ Renamed: “${name}”` : `“${o.name}”: ${said.join(" · ")}`);
      renaming = null; await loadOutfits(); fillWardrobe(box);
    };
    span.querySelector("[data-ok]").addEventListener("click", save);
    span.querySelector("[data-no]").addEventListener("click", close);
    [input, rIn].forEach((el) => el?.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); save(); } else if (ev.key === "Escape") close(); }));
  }));
  const flower = box.querySelector(".mp-oflower");
  box.querySelectorAll("[name=olayer]").forEach((r) => r.addEventListener("change", () => { flower.hidden = box.querySelector("[name=olayer]:checked").value !== "head"; })); // (seulement pour la tête)
  const status = (t) => { box.querySelector(".mp-ostatus").textContent = t; };
  const input = box.querySelector("input[type=file]");
  input.addEventListener("change", async () => {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    const name = box.querySelector("[name=oname]").value.trim() || outfitNameOf(file.name);
    const layer = box.querySelector("[name=olayer]:checked").value, rarity = rarityOf(box.querySelector("[name=orarity]")?.value), hours = hoursOf(box.querySelector("[name=odur]")?.value);
    if (!navigator.onLine) { toast("📴 You're offline — try again once you're back online."); return; }
    box.querySelector(".mp-filebtn").classList.add("mp-busy");
    try {
      status("Checking the drawing…");
      const isVideo = file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(file.name), isGif = file.type === "image/gif" || /\.gif$/i.test(file.name);
      const isPng = file.type === "image/png" || /\.a?png$/i.test(file.name), animated = !isVideo && !isGif && await isAnimatedImage(file);
      if (animated && !isPng) throw new Error("an animated WebP can't be used — export the animation as an animated PNG, a GIF or a video");
      const kind = isVideo ? "video" : isGif ? "gif" : animated ? "apng" : null;
      const moving = kind ? await animatedOutfit(file, kind, status) : null;
      const blob = moving?.blob ?? await prepareOutfit(file), anim = moving?.anim ?? null;
      status("Sending…");
      const id = await db.addOutfit(blob, { name, layer, hideFlower: layer === "head" && box.querySelector("[name=oflower]").checked, anim });
      // (rareté réglée après l'ajout : sans 27, la tenue est quand même ajoutée, en normale)
      let rare = "";
      if (S.fishingOk === true && rarity > 1) {
        try { await db.setOutfitRarity(id, rarity); rare = ` ✨ Limited edition: 1 in ${rarity}.`; }
        catch (err) { rare = ` ⚠️ Added as a normal outfit (${err.message}).`; }
      }
      if (S.fishingOk === true && hours) { // (durée réglée après l'ajout aussi : sans 28, durée commune)
        try { await db.setOutfitDuration(id, hours); rare += ` ⏱ Lasts ${durText(hours)} once caught.`; }
        catch (err) { rare += ` ⚠️ Added with the default duration (${err.message}).`; }
      }
      if (S.fishingOk === true) toast(`🎣 “${name}” is in the pool — catch it in Fishing!${anim ? " ✨" : ""}${rare}`, { ms: rare ? 9000 : 6000 });
      else { await db.wearOutfit(layer, id); toast(`👒 Tino is wearing “${name}”!${anim ? " ✨" : ""}`); } // (sans 20 : il la porte tout de suite, comme avant)
      outfitChangedHere = true; // (images du widget refaites tout de suite)
      await loadOutfits();
      fillWardrobe(box); // (nom et état remis à zéro)
    } catch (err) {
      const why = /bucket not found/i.test(err.message) ? "the file storage isn't set up yet — Tony needs to run supabase/08_tino_extras.sql"
        : /anim/i.test(err.message) && /column|schema cache/i.test(err.message) ? "animated outfits aren't set up yet — Tony needs to run supabase/17_outfit_anim.sql"
        : err.message;
      toast(`⚠️ Couldn't add the outfit (${why})`);
      fillWardrobe(box);
    }
  });
}

// ---------- Jour / nuit et thème clair / sombre (réglages de CET appareil : ⚙ Settings → 🎨 Appearance) ----------
// « Le jour » = du lever au coucher du soleil du lieu choisi sur cet appareil (par défaut : d'après le fuseau horaire),
// ou les heures choisies (« de 07:00 à 20:00 », peut passer minuit). Il sert au thème « Auto » de l'interface ET au décor
// « Auto » (image de jour / de nuit) : les deux changent en même temps. Thème forcé (toujours clair / toujours sombre) :
// le décor, lui, continue de suivre l'heure.
// Thème clair = classe mp-light sur <html> (style.css, bloc à la fin ; le thème sombre reste celui de toujours).
const THEMES = [["auto", "🌗 Auto"], ["light", "☀️ Always light"], ["dark", "🌙 Always dark"]];
// Lieux du lever / coucher du soleil : [clé, nom, pays, latitude, longitude]
const PLACES = [
  ["yverdon", "Yverdon-les-Bains", "Switzerland", 46.78, 6.64],
  ["hanoi", "Hà Nội", "Vietnam", 21.03, 105.85],
  ["haiphong", "Hải Phòng", "Vietnam", 20.86, 106.68],
  ["hue", "Huế", "Vietnam", 16.46, 107.59],
  ["danang", "Đà Nẵng", "Vietnam", 16.05, 108.21],
  ["nhatrang", "Nha Trang", "Vietnam", 12.24, 109.19],
  ["dalat", "Đà Lạt", "Vietnam", 11.94, 108.44],
  ["hcmc", "Hồ Chí Minh City", "Vietnam", 10.78, 106.70],
  ["cantho", "Cần Thơ", "Vietnam", 10.04, 105.79],
];
// « Auto » = d'après le fuseau horaire de l'appareil (Asia/Saigon : ancien nom, encore donné par certains Android) ;
// fuseau inconnu → Yverdon, comme avant
const PLACE_OF_TZ = { "Europe/Zurich": "yverdon", "Asia/Ho_Chi_Minh": "hcmc", "Asia/Saigon": "hcmc" };
const placeOfTz = (tz) => PLACE_OF_TZ[tz] ?? "yverdon";
const deviceTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; } };
function sunPlace() {
  const pref = store.get("sunPlace", "auto"), auto = !PLACES.some((p) => p[0] === pref);
  const [key, name, country, lat, lon] = PLACES.find((p) => p[0] === (auto ? placeOfTz(deviceTz()) : pref));
  return { key, name, country, lat, lon, auto };
}
const minutesOf = (hm) => { const [h, m] = String(hm).split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const dayHours = (dl) => (dl.mode === "hours" ? `☀️ ${dl.from} – 🌙 ${dl.to}` : `☀️ ${hhmm(dl.sun.rise)} – 🌙 ${hhmm(dl.sun.set)}`);
function daylight(now = new Date()) {
  const mode = store.get("dayMode", "sun"), from = store.get("dayFrom", "07:00"), to = store.get("dayTo", "20:00");
  const place = sunPlace(), sun = sunTimes(now, place.lat, place.lon);
  let day, edges; // edges : les prochains passages possibles (aujourd'hui et demain)
  if (mode === "hours") {
    const a = minutesOf(from), b = minutesOf(to), t = now.getHours() * 60 + now.getMinutes();
    day = a === b || (a < b ? t >= a && t < b : t >= a || t < b);
    edges = [0, 1].flatMap((k) => [a, b].map((m) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + k, 0, m)));
  } else {
    const tmr = sunTimes(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1), place.lat, place.lon);
    day = now >= sun.rise && now < sun.set;
    edges = [sun.rise, sun.set, tmr.rise, tmr.set];
  }
  const next = edges.filter((d) => d > now).sort((x, y) => x - y)[0] ?? new Date(+now + 86400000);
  return { day, next, mode, from, to, sun, place };
}
let themeTimer = 0;
function applyTheme() {
  clearTimeout(themeTimer);
  const pref = store.get("theme", "auto"), dl = daylight(), light = pref === "light" || (pref === "auto" && dl.day);
  document.documentElement.classList.toggle("mp-light", light);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", light ? "#e6ebf7" : "#0e1230");
  if (pref === "auto") themeTimer = setTimeout(applyTheme, Math.max(1000, Math.min(30 * 60000, dl.next - Date.now() + 1000)));
}
// Carte « 🎨 Appearance » de l'onglet Settings
function fillLook(box) {
  const pref = store.get("theme", "auto"), dl = daylight(), light = document.documentElement.classList.contains("mp-light");
  box.innerHTML = `<div class="pl-legend">On this device only — ${esc(S.partner?.label ?? "the other")} chooses on theirs.</div>
    <div class="pl-sub">Theme</div>
    <span class="mp-seg">${THEMES.map(([k, l]) => `<button type="button" data-theme="${k}" aria-pressed="${k === pref}">${l}</button>`).join("")}</span>
    <div class="pl-sub">Day time <span class="pl-legend">— Auto is light during the day, dark at night; the decor's day / night pictures follow it too</span></div>
    <span class="mp-seg"><button type="button" data-daymode="sun" aria-pressed="${dl.mode === "sun"}">🌅 Sunrise → sunset</button><button type="button" data-daymode="hours" aria-pressed="${dl.mode === "hours"}">🕒 My hours</button></span>
    ${dl.mode === "hours" ? `<span class="mp-row mp-dayhours"><label>☀️ Day from <input type="time" name="dfrom" value="${dl.from}"></label><label>🌙 night from <input type="time" name="dto" value="${dl.to}"></label></span>`
      : `<label class="mp-sunplace">📍 Sun of <select name="sunplace">
          <option value="auto"${dl.place.auto ? " selected" : ""}>Auto: ${esc(PLACES.find((p) => p[0] === placeOfTz(deviceTz()))[1])}</option>
          ${[...new Set(PLACES.map((p) => p[2]))].map((c) => `<optgroup label="${c}">${PLACES.filter((p) => p[2] === c).map(([k, n]) =>
            `<option value="${k}"${!dl.place.auto && dl.place.key === k ? " selected" : ""}>${esc(n)}</option>`).join("")}</optgroup>`).join("")}
        </select></label>
        <div class="pl-legend">${dl.place.auto ? "Auto = from this device's time zone. " : ""}Today in ${esc(dl.place.name)}: sunrise ${hhmm(dl.sun.rise)}, sunset ${hhmm(dl.sun.set)}.</div>`}
    <div class="pl-legend mp-lookstate">Now: ${light ? "☀️ light" : "🌙 dark"}${pref === "auto" ? ` — ${dl.day ? "🌙 dark" : "☀️ light"} from ${hhmm(dl.next)}${dl.next.getDate() !== new Date().getDate() ? " tomorrow" : ""}` : ""}.</div>`;
  const redo = () => { applyTheme(); applyDecor(); fillLook(box); };
  box.querySelectorAll("[data-theme]").forEach((b) => b.addEventListener("click", () => { store.set("theme", b.dataset.theme); redo(); }));
  box.querySelectorAll("[data-daymode]").forEach((b) => b.addEventListener("click", () => { store.set("dayMode", b.dataset.daymode); redo(); }));
  box.querySelector("[name=sunplace]")?.addEventListener("change", (ev) => { store.set("sunPlace", ev.target.value); redo(); });
  for (const [name, key] of [["dfrom", "dayFrom"], ["dto", "dayTo"]])
    box.querySelector(`[name=${name}]`)?.addEventListener("change", (ev) => { if (/^\d\d:\d\d$/.test(ev.target.value)) { store.set(key, ev.target.value); redo(); } });
}

// ---------- Décor dessiné (supabase/16_decor.sql) ----------
// Une image par saison × format (phone = écran en hauteur, desktop = en largeur) × moment (day / night), commune aux deux,
// posée en fond plein écran (body::before, ancré en haut au centre). Ce qui est montré dépend de CET appareil : saison
// « auto » = celle du jour, moment « auto » = le jour de daylight() (soleil ou heures choisies, comme le thème) ; s'il manque
// l'image voulue, la plus proche qui existe (saison la plus proche, puis autre moment ; dans chaque cas d'abord ce format,
// sinon l'autre, ADAPTÉ à l'écran : un seul dessin suffit pour le téléphone et l'ordinateur), sinon le fond d'origine.
let unsubDecor = null, decorShown = null, decorTimer = 0;
const decorUrls = new Map(); // fichier → adresse locale de l'image
const portrait = matchMedia("(orientation: portrait)");
const SEASONS = [["winter", "❄️ Winter"], ["spring", "🌸 Spring"], ["summer", "☀️ Summer"], ["autumn", "🍂 Autumn"]];
const LAYOUTS = [["phone", "📱 Phone"], ["desktop", "💻 Computer"]];
const LIGHTS = [["day", "☀️ Day"], ["night", "🌙 Night"]];
const DECOR_SIZE = { phone: [1290, 2796], desktop: [2560, 1440] }; // = les modèles (art/decor-template-*.png)
const DECOR_MAX = 4.5 * 1024 * 1024; // sous l'ancienne limite de 5 Mo du stockage
const decorLabel = (list, k) => list.find((x) => x[0] === k)?.[1] ?? k;

// Saisons astronomiques (à un jour près)
function seasonOf(d) {
  const md = (d.getMonth() + 1) * 100 + d.getDate();
  return md >= 1221 || md < 320 ? "winter" : md < 621 ? "spring" : md < 923 ? "summer" : "autumn";
}
// Lever / coucher du soleil au lieu (lat, lon) donné, Yverdon par défaut (équation du lever, ±3 min ; vérifié avec
// sunrise-sunset.org, été / hiver / changement d'heure, à Yverdon et au Vietnam).
// n = ⌈jour julien − 2451545 + 0,0008⌉ (corrigé le 2026-10-07 : l'ancien arrondi donnait le lever et le coucher de LA VEILLE,
// date comprise — à quelques minutes près les mêmes heures, mais le décor « Auto » restait en version nuit toute la journée).
// Jour julien pris à 00:00 UTC de la date locale (2026-10-08 ; avant : midi local, même n en Suisse et au Vietnam, mais
// le lendemain pour un appareil à UTC+0 ou à l'ouest) → même n quel que soit le fuseau de l'appareil.
function sunTimes(d, lat = 46.78, lon = 6.64) {
  const R = Math.PI / 180, day0 = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const J = Math.ceil(day0 / 86400000 + 2440587.5 - 2451545 + 0.0008) - lon / 360;
  const M = (357.5291 + 0.98560028 * J) % 360;
  const L = (M + 1.9148 * Math.sin(M * R) + 0.02 * Math.sin(2 * M * R) + 0.0003 * Math.sin(3 * M * R) + 282.9372) % 360;
  const T = 2451545 + J + 0.0053 * Math.sin(M * R) - 0.0069 * Math.sin(2 * L * R);
  const dec = Math.asin(Math.sin(L * R) * Math.sin(23.4397 * R));
  const w = Math.acos(Math.max(-1, Math.min(1, (Math.sin(-0.833 * R) - Math.sin(lat * R) * Math.sin(dec)) / (Math.cos(lat * R) * Math.cos(dec))))) / R;
  const at = (j) => new Date((j - 2440587.5) * 86400000);
  return { rise: at(T - w / 360), set: at(T + w / 360) };
}
function decorWanted(now = new Date()) {
  const season = store.get("decorSeason", "auto"), light = store.get("decorLight", "auto"), dl = daylight(now);
  return {
    season: season === "auto" ? seasonOf(now) : season, autoSeason: season === "auto",
    light: light === "auto" ? (dl.day ? "day" : "night") : light, autoLight: light === "auto",
    layout: portrait.matches ? "phone" : "desktop", dl,
  };
}
// Le format compte le moins : le dessin de la bonne saison et du bon moment, même fait pour l'autre écran (il est adapté),
// passe avant une autre saison ou l'autre moment
function decorPick(w) {
  const order = SEASONS.map((x) => x[0]), i = order.indexOf(w.season);
  const seasons = [0, 1, -1, 2].map((k) => order[(i + k + 4) % 4]); // la saison voulue, la suivante, la précédente, l'opposée
  for (const season of seasons)
    for (const light of [w.light, w.light === "day" ? "night" : "day"])
      for (const layout of [w.layout, w.layout === "phone" ? "desktop" : "phone"]) {
        const d = S.decor.find((x) => x.season === season && x.layout === layout && x.light === light);
        if (d) return d;
      }
  return null;
}
async function loadDecor() {
  if (!S.user) return;
  let fresh = false;
  try { S.decor = await db.listDecor(); S.decorOk = true; fresh = true; store.set("decor." + S.user.id, S.decor); }
  catch (err) {
    if (/does not exist|schema cache/i.test(err.message) && /decor/.test(err.message)) { S.decorOk = false; S.decor = []; }
    else S.decor = store.get("decor." + S.user.id, S.decor); // hors ligne : la dernière liste connue
  }
  await applyDecor();
  if (fresh) pruneDecor(); // (jamais depuis la copie hors ligne)
  const box = document.querySelector(".mp-decor");
  if (box) fillDecor(box);
}
async function decorUrl(path) {
  if (!decorUrls.has(path)) decorUrls.set(path, URL.createObjectURL(await mediaBlob(path)));
  return decorUrls.get(path);
}
// Dessin de téléphone (en hauteur) sur un écran en largeur : posé au centre à la hauteur de l'image (la plage et la mer
// restent à la même hauteur que sur le modèle « ordinateur »), les côtés remplis par le même dessin étiré en largeur et très
// flou (réduit à 32 × 18 puis agrandi : ctx.filter n'est pas fiable sur iPhone), bords du dessin fondus. Fait une fois par
// image. (Dessin d'ordinateur sur un téléphone : `cover` suffit — la plage reste en haut, on voit le milieu.)
const decorWide = new Map(); // fichier → adresse de l'image adaptée
async function decorWideUrl(path) {
  if (decorWide.has(path)) return decorWide.get(path);
  const img = await loadImg(await decorUrl(path));
  const [W, H] = DECOR_SIZE.desktop, canvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  const out = canvas(W, H), g = out.getContext("2d");
  let blur = img;
  for (const [w, h] of [[256, 144], [64, 36], [32, 18]]) { const c = canvas(w, h); c.getContext("2d").drawImage(blur, 0, 0, w, h); blur = c; } // par paliers : pas de crénelage
  g.imageSmoothingEnabled = true;
  g.drawImage(blur, 0, 0, W, H);
  const w = Math.round(H * img.naturalWidth / img.naturalHeight), x = Math.round((W - w) / 2), sharp = canvas(w, H), s = sharp.getContext("2d");
  s.drawImage(img, 0, 0, w, H);
  const fade = s.createLinearGradient(0, 0, w, 0), f = Math.min(0.08, 60 / w);
  fade.addColorStop(0, "rgba(0,0,0,0)"); fade.addColorStop(f, "#000"); fade.addColorStop(1 - f, "#000"); fade.addColorStop(1, "rgba(0,0,0,0)");
  s.globalCompositeOperation = "destination-in";
  s.fillStyle = fade; s.fillRect(0, 0, w, H);
  g.drawImage(sharp, x, 0);
  const blob = await new Promise((ok) => out.toBlob(ok, "image/jpeg", 0.86));
  if (!blob) throw new Error("couldn't adapt the picture");
  const url = URL.createObjectURL(blob);
  decorWide.set(path, url);
  return url;
}
// Montre l'image choisie ; se refait tout seul au passage jour / nuit (au plus tard toutes les 30 min)
async function applyDecor() {
  clearTimeout(decorTimer);
  const w = decorWanted(), d = S.user ? decorPick(w) : null;
  decorTimer = setTimeout(applyDecor, Math.max(1000, Math.min(30 * 60000, w.dl.next - Date.now() + 2000)));
  const wide = !!d && d.layout === "phone" && w.layout === "desktop"; // à adapter (voir decorWideUrl)
  const was = S.decorNow;
  S.decorNow = d ? { ...d, wanted: w } : null;
  const box = document.querySelector(".mp-decor"); // carte ouverte : « On screen » à jour (sauf pendant un envoi)
  if (box && !box.querySelector(".mp-busy") && JSON.stringify(was) !== JSON.stringify(S.decorNow)) fillDecor(box);
  const key = d ? d.path + (wide ? "|wide" : "") : ""; // (même dessin, écran tourné : l'autre version)
  if (key === decorShown) return;
  decorShown = key;
  if (!d) { document.body.classList.remove("mp-decor-on"); document.body.style.removeProperty("--mp-decor"); return; }
  try {
    const url = wide ? await decorWideUrl(d.path) : await decorUrl(d.path);
    await Promise.race([loadImg(url).catch(() => {}), new Promise((ok) => setTimeout(ok, 4000))]); // prête avant d'être posée (pas d'écran vide)
    if (decorShown !== key) return; // une autre image a été choisie entre-temps
    document.body.style.setProperty("--mp-decor", `url("${url}")`);
    document.body.classList.add("mp-decor-on");
  } catch (err) { console.warn("Decor", err); decorShown = null; } // hors ligne sans copie : on garde le fond actuel
}
// Images qui n'existent plus : retirées de l'appareil (seulement après une liste fraîche)
async function pruneDecor() {
  const keep = new Set(S.decor.map((d) => d.path));
  for (const m of [decorUrls, decorWide]) for (const [p, u] of m) if (!keep.has(p)) { URL.revokeObjectURL(u); m.delete(p); }
  if (!("caches" in window)) return;
  const cache = await caches.open(MEDIA).catch(() => null);
  for (const r of (await cache?.keys()) ?? []) { const m = r.url.match(/__media\/(decor\/.+)$/); if (m && !keep.has(m[1])) await cache.delete(r); }
}
// Dessin choisi : bon sens (en hauteur pour le téléphone, en largeur pour l'ordinateur), réduit à la taille du modèle,
// posé sur un fond uni (le transparent deviendrait noir) et enregistré en JPEG de moins de 4,5 Mo
async function prepareDecor(file, layout) {
  if (file.type && !/^image\//.test(file.type)) throw new Error("pick a picture (PNG or JPG)");
  const url = URL.createObjectURL(file);
  let img;
  try { img = await loadImg(url); } catch { throw new Error("this picture can't be read — export it as PNG or JPG"); } finally { URL.revokeObjectURL(url); }
  const w = img.naturalWidth, h = img.naturalHeight;
  if (layout === "phone" && w > h) throw new Error(`this picture is wide (${w} × ${h}): it's for 💻 Computer — the phone picture is tall, like its template`);
  if (layout === "desktop" && h > w) throw new Error(`this picture is tall (${w} × ${h}): it's for 📱 Phone — the computer picture is wide, like its template`);
  const [tw, th] = DECOR_SIZE[layout], k = Math.min(1, Math.max(tw / w, th / h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  const g = c.getContext("2d");
  g.fillStyle = "#0b0f2a"; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  for (const q of [0.88, 0.8, 0.7, 0.6]) {
    const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", q));
    if (!blob) throw new Error("this phone couldn't process the picture — try a smaller export");
    if (blob.size <= DECOR_MAX) return blob;
  }
  throw new Error("the picture is too big even after shrinking it");
}
// (onload plutôt que decode() : decode() ne finit jamais tant que la page est cachée)
function loadImg(url) {
  return new Promise((ok, fail) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => fail(new Error("unreadable image")); im.src = url; });
}
// Modèles chargés dès que la carte s'affiche : sur iPhone, la feuille de partage doit s'ouvrir tout de suite après l'appui
const decorTpl = {};
function fetchDecorTemplate(layout) {
  decorTpl[layout] ??= fetch(`art/decor-template-${layout}.png`)
    .then((r) => { if (!r.ok) throw new Error(navigator.onLine ? "not found" : "you're offline"); return r.blob(); })
    .then((blob) => (decorTpl[layout] = blob))
    .catch((err) => { delete decorTpl[layout]; throw err; });
  return Promise.resolve(decorTpl[layout]); // (déjà là : le fichier ; sinon : le chargement en cours)
}
async function shareDecorTemplate(layout) {
  const blob = decorTpl[layout] instanceof Blob ? decorTpl[layout] : await fetchDecorTemplate(layout);
  await shareFile(blob, `meopeo-decor-template-${layout}.png`, "MeoPeo decor template");
}
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
function fillDecor(box) {
  if (S.decorOk === false) { box.innerHTML = `<div class="pl-legend">The decor isn't available yet — Tony needs to run <code>supabase/16_decor.sql</code>.</div>`; return; }
  const P = S.partner, now = S.decorNow, w = decorWanted();
  const sel = box.dataset.season || now?.season || "winter"; // (rien de dessiné : on commence par l'hiver)
  box.dataset.season = sel;
  const slot = (layout, light) => S.decor.find((d) => d.season === sel && d.layout === layout && d.light === light);
  const who = (d) => (d.by === S.user.id ? S.me : P);
  const tile = (layout, light) => {
    const d = slot(layout, light);
    return `<div class="mp-decor-slot ${layout}${d ? " on" : ""}${d && now?.path === d.path ? " shown" : ""}">
      <div class="mp-decor-thumb">${d ? `<img alt="" data-decor="${d.path}">` : "<span>no picture</span>"}</div>
      <span class="mp-decor-name">${decorLabel(LAYOUTS, layout)} · ${decorLabel(LIGHTS, light)}${d ? ` <span class="pl-legend">${esc(who(d)?.mark ?? "")}${now?.path === d.path ? " · on screen now" : ""}</span>` : ""}</span>
      <span class="mp-row"><label class="mp-filebtn"><input type="file" accept="image/png,image/jpeg,image/webp" hidden data-slot="${layout}|${light}"> ${d ? "Replace" : "＋ Add"}</label>${d ? `<button type="button" data-undecor="${layout}|${light}" title="Remove this picture">✕</button>` : ""}</span></div>`;
  };
  const why = !now ? "" : [
    now.season !== now.wanted.season ? `no ${decorLabel(SEASONS, now.wanted.season).split(" ")[1]} drawing yet` : "",
    now.light !== now.wanted.light ? `no ${now.wanted.light} version yet` : "",
    now.layout !== now.wanted.layout ? (now.layout === "phone" ? "the 📱 phone picture, adapted to this wide screen" : "the 💻 computer picture — a phone shows its middle") : "",
  ].filter(Boolean).join(", ");
  box.innerHTML = `<div class="pl-legend">Draw the background yourselves on a tablet: download a template, draw on your own layers, <b>hide the template</b>, then export the whole picture (PNG or JPG). One picture per season, for the day ☀️ and the night 🌙 — tall for phones, wide for computers. <b>One of the two is enough</b>: a phone picture is adapted to computers (centred, blurred sides), and a phone shows the middle of a computer picture. Shared: ${esc(P?.mark ?? "")} ${esc(P?.label ?? "the other")} sees the same decor.</div>
    <span class="mp-row"><button type="button" data-tpl="phone">⬇ Phone template</button><button type="button" data-tpl="desktop">⬇ Computer template</button></span>
    <span class="mp-seg mp-decor-seasons">${SEASONS.map(([k, l]) => `<button type="button" data-season="${k}" aria-pressed="${k === sel}">${l}${S.decor.some((d) => d.season === k) ? " ●" : ""}</button>`).join("")}</span>
    <div class="mp-decor-grid">${LAYOUTS.map(([lay]) => LIGHTS.map(([li]) => tile(lay, li)).join("")).join("")}</div>
    <div class="pl-legend mp-dstatus"></div>
    <div class="mp-decor-device"><b>On this device</b>
      <label>Season <select name="dseason"><option value="auto">Auto (now: ${decorLabel(SEASONS, seasonOf(new Date()))})</option>${SEASONS.map(([k, l]) => `<option value="${k}">Always ${l}</option>`).join("")}</select></label>
      <label>Day / night <select name="dlight"><option value="auto">Auto (${dayHours(w.dl)})</option><option value="day">Always ☀️ day</option><option value="night">Always 🌙 night</option></select></label>
      <div class="pl-legend">Auto uses the same day hours as the light / dark theme: <a href="#settings">⚙ Settings → Appearance</a>.</div>
      <div class="pl-legend">${now ? `On screen: ${decorLabel(SEASONS, now.season)} · ${decorLabel(LIGHTS, now.light)} · ${decorLabel(LAYOUTS, now.layout)}${why ? ` (${why})` : ""}` : "On screen: the original background (no drawing yet)"}</div></div>`;
  box.querySelector("[name=dseason]").value = store.get("decorSeason", "auto");
  box.querySelector("[name=dlight]").value = store.get("decorLight", "auto");
  box.querySelectorAll("[data-decor]").forEach(async (im) => { try { im.src = await decorUrl(im.dataset.decor); } catch { im.alt = "?"; } });
  if (navigator.onLine) for (const [lay] of LAYOUTS) fetchDecorTemplate(lay).catch(() => {});
  box.querySelectorAll("[data-tpl]").forEach((b) => b.addEventListener("click", () => shareDecorTemplate(b.dataset.tpl).catch((err) => toast(`⚠️ Couldn't get the template (${err.message})`))));
  box.querySelectorAll("[data-season]").forEach((b) => b.addEventListener("click", () => { box.dataset.season = b.dataset.season; fillDecor(box); }));
  for (const [name, key] of [["dseason", "decorSeason"], ["dlight", "decorLight"]])
    box.querySelector(`[name=${name}]`).addEventListener("change", async (ev) => { store.set(key, ev.target.value); await applyDecor(); fillDecor(box); });
  box.querySelectorAll("[data-undecor]").forEach((b) => b.addEventListener("click", async () => {
    if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Sure? ✕"; return; } // 2e appui pour confirmer
    const [layout, light] = b.dataset.undecor.split("|");
    if (await guard(() => db.deleteDecor({ season: sel, layout, light }), "Couldn't remove the picture")) loadDecor();
  }));
  const status = (t) => { box.querySelector(".mp-dstatus").textContent = t; };
  box.querySelectorAll("input[data-slot]").forEach((input) => input.addEventListener("change", async () => {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    const [layout, light] = input.dataset.slot.split("|");
    if (!navigator.onLine) { toast("📴 You're offline — try again once you're back online."); return; }
    input.closest(".mp-filebtn").classList.add("mp-busy");
    try {
      status("Preparing the picture…");
      const blob = await prepareDecor(file, layout);
      status(`Sending (${(blob.size / 1048576).toFixed(1)} MB)…`);
      await db.setDecor(blob, { season: sel, layout, light });
      toast(`🏖 New decor: ${decorLabel(SEASONS, sel)} · ${decorLabel(LIGHTS, light)} · ${decorLabel(LAYOUTS, layout)}`);
      await loadDecor();
    } catch (err) {
      const why = /bucket not found/i.test(err.message) ? "the file storage isn't set up yet — Tony needs to run supabase/08_tino_extras.sql"
        : /exceeded the maximum allowed size/i.test(err.message) ? "too big for the storage" : err.message;
      toast(`⚠️ Couldn't add the picture (${why})`);
      fillDecor(box);
    }
  }));
}

// En dessous : les prochaines tâches de l'autre
function renderPartner(el, P) {
  if (!P) { el.innerHTML = ""; return; }
  const up = upcomingOf(S.theirs);
  el.innerHTML = `<div class="pl-card pl-partner"><h4>${esc(P.mark)} ${esc(P.label)} — next ${UPCOMING_COUNT} tasks</h4>
    ${up.length ? up.map(itemHtml).join("") : `<div class="pl-empty">Nothing coming up.</div>`}<div class="pl-legend">Read-only · updates live</div></div>`;
}

// ---------- Fenêtres (édition, compte) — posées sur <body> pour survivre aux mises à jour en temps réel ----------
function overlay(html, { onClose = null } = {}) {
  document.querySelector(".pl-editor")?.remove();
  const ov = document.createElement("div");
  ov.className = "pl-editor";
  ov.innerHTML = html;
  document.body.appendChild(ov);
  const close = () => (onClose ? onClose() : ov.remove());
  ov.addEventListener("click", (ev) => { if (ev.target === ov) close(); });
  ov.querySelector("[data-act=cancel]")?.addEventListener("click", close);
  return ov;
}

// Nouvelle tâche pour un jour précis (bouton « ＋ Add a task on … » sous le calendrier)
function openNewTask(date) {
  const cats = myCats();
  const ov = overlay(`<form class="pl-editor-card"><h4>➕ New task — ${dayTitle(fromIso(date))}</h4>
    <label>Task<input type="text" name="text" maxlength="300" placeholder="What needs doing" required></label>
    <div class="pl-editor-row"><label>Date<input type="date" name="date" value="${date}" required></label><label title="Last day — only for something that lasts several days">Until<input type="date" name="end"></label><label>Time<input type="time" name="time"></label></div>
    <label>Category<select name="course"><option value="">— no category —</option>${cats.map((c) => `<option ${c.name === UI.addCat ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
    ${moonRadios()}
    <div class="pl-editor-row">${remindInputs()}</div>
    <div class="pl-editor-row">${repeatInputs()}</div>
    <div class="pl-editor-row"><label class="mp-check" title="Private: ${esc(S.partner?.label ?? "the other")} won't see it"><input type="checkbox" name="private"> 🔒 Private</label></div>
    <div class="pl-editor-actions"><span class="mp-grow"></span><button type="button" data-act="cancel">Cancel</button><button type="submit" class="mp-cta">Add</button></div></form>`);
  const f = ov.querySelector("form");
  bindRepeat(f);
  f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const d = new FormData(f);
    const label = String(d.get("text")).trim();
    if (!label) return;
    const end = endOf(d.get("date"), d.get("end"));
    if (d.get("end") && !end) toast("“until” must be after the start date — saved as a one-day task");
    f.querySelector("button[type=submit]").disabled = true;
    const task = { date: d.get("date"), end, time: d.get("time") || null, course: d.get("course") || null,
      label, moon: d.get("moon") || null, private: d.get("private") === "on", remind: remindOf(d) };
    const rule = ruleOf(d);
    const ok = await guard(() => (rule ? db.createSeries(task, rule, today) : db.insertTask(task)), "Couldn't add the task");
    if (!ok) { f.querySelector("button[type=submit]").disabled = false; return; }
    ov.remove();
    UI.day = d.get("date"); UI.addCat = d.get("course") || "";
    toast(`Added: ${label}${rule ? " — 🔁 " + ruleText(rule) : ""}`);
    if (rule) loadSeries();
    remindNotice(remindOf(d));
    load();
  });
  f.text.focus({ preventScroll: true });
}

function openEditor(e) {
  if (!e?.tickable) return;
  if (e.fromPC) { toast("This task comes from your Obsidian dashboard (Devoirs.md / Excel / deadlines / phone planner) — edit it there. You can tick it here."); return; }
  const cats = myCats();
  const ov = overlay(`<form class="pl-editor-card"><h4>✏️ Edit task</h4>
    <label>Task<input type="text" name="text" value="${esc(e.label)}" maxlength="300" required></label>
    <div class="pl-editor-row"><label>Date<input type="date" name="date" value="${e.date}" required></label><label title="Last day — only for something that lasts several days">Until<input type="date" name="end" value="${e.end ?? ""}"></label><label>Time<input type="time" name="time" value="${e.time ?? ""}"></label></div>
    <label>Category<select name="course"><option value="">— no category —</option>${cats.map((c) => `<option ${c.name === e.course ? "selected" : ""}>${esc(c.name)}</option>`).join("")}${e.course && !cats.some((c) => c.name === e.course) ? `<option selected>${esc(e.course)}</option>` : ""}</select></label>
    ${moonRadios(e.moon)}
    <div class="pl-editor-row">${remindInputs(e)}</div>
    <div class="pl-editor-row"><label class="mp-check"><input type="checkbox" name="private" ${e.private ? "checked" : ""}> 🔒 Private</label>
      <label class="mp-check" title="Untick to put the task back in your to-do list"><input type="checkbox" name="done" ${e.done ? "checked" : ""}> ✓ Done</label></div>
    ${e.series ? `<div class="mp-repeat-info">🔁 Repeats ${esc(ruleText(seriesOf(e)))}</div><div class="mp-scope" hidden></div>` : ""}
    <div class="pl-editor-actions"><button type="button" data-act="delete" class="mp-danger">🗑 Delete</button><span class="mp-grow"></span><button type="button" data-act="cancel">Cancel</button><button type="submit" class="mp-cta">Save</button></div></form>`);
  const f = ov.querySelector("form"), scopeBox = f.querySelector(".mp-scope");
  // Tâche récurrente : on demande à quoi s'applique le changement
  const askScope = (what, run) => {
    scopeBox.innerHTML = `${what} <span class="mp-row"><button type="button" data-s="one">Only this one</button><button type="button" class="mp-cta" data-s="following">This and the following ones</button></span>`;
    scopeBox.hidden = false;
    scopeBox.querySelectorAll("[data-s]").forEach((b) => b.addEventListener("click", () => run(b.dataset.s)));
    scopeBox.scrollIntoView({ block: "nearest" });
  };
  const saveOne = async (patch) => {
    if (!navigator.onLine) { toast("📴 You're offline — this change can't be saved yet."); return false; }
    try { await db.updateTask(e.id, patch); return true; }
    catch (err) { toast(/tasks_series_date/.test(err.message) ? "⚠️ This repeating task already happens on that day — pick another day" : `⚠️ Couldn't save (${err.message})`); return false; }
  };
  const saved = (patch) => { ov.remove(); toast("Task updated"); if (patch.remind !== e.remind) remindNotice(patch.remind); load(); };
  f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const d = new FormData(f);
    const label = String(d.get("text")).trim();
    if (!label) return;
    const end = endOf(d.get("date"), d.get("end"));
    if (d.get("end") && !end) toast("“until” must be after the start date — saved as a one-day task");
    const patch = { label, date: d.get("date"), end, time: d.get("time") || null, course: d.get("course") || null, moon: d.get("moon") || null, remind: remindOf(d), private: d.get("private") === "on", done: d.get("done") === "on" };
    const changed = ["label", "date", "end", "time", "course", "moon", "remind", "private"].some((k) => (patch[k] ?? null) !== (e[k] ?? null));
    if (!e.series || !changed) { if (await saveOne(patch)) saved(patch); return; }
    askScope("Change", async (scope) => {
      if (scope === "one") { if (await saveOne(patch)) saved(patch); return; }
      const ok = await guard(async () => {
        if (patch.done !== e.done) await db.updateTask(e.id, { done: patch.done });
        await db.splitSeries(e.id, patch, diffDays(e.date, patch.date));
      }, "Couldn't change the repeating task");
      if (ok) { saved(patch); loadSeries(); }
    });
  });
  const del = f.querySelector("[data-act=delete]");
  del.addEventListener("click", async () => {
    if (e.series) {
      askScope("Delete", async (scope) => {
        const ok = await guard(() => (scope === "one" ? db.deleteTask(e.id) : db.endSeries(e.id)), "Couldn't delete");
        if (ok) { ov.remove(); toast(scope === "one" ? `Deleted: ${e.label} (${dm(e.date)})` : `Deleted: ${e.label} from ${dm(e.date)} on`); load(); loadSeries(); }
      });
      return;
    }
    if (!del.dataset.armed) { del.dataset.armed = "1"; del.textContent = "Sure? 🗑"; return; } // 2e appui pour confirmer
    if (await guard(() => db.deleteTask(e.id), "Couldn't delete")) { ov.remove(); toast(`Deleted: ${e.label}`); load(); }
  });
  f.text.focus({ preventScroll: true });
}

const when = (isoStr) => { const d = new Date(isoStr); return `${d.getDate()}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
async function fillNotif(box) {
  const st = await pushState();
  let html = {
    install: "📲 Install MeoPeo on your home screen first (Safari → Share → <b>Add to Home Screen</b>), then open it from its icon and come back here.",
    unsupported: "This browser can't receive notifications. Use MeoPeo installed on your phone's home screen.",
    blocked: "⚠️ Notifications are blocked for MeoPeo. Allow them in the phone's settings (iPhone: Settings → Notifications → MeoPeo), then come back here.",
    off: `<button type="button" class="mp-cta" data-act="enable">Turn on notifications on this device</button>`,
    on: `✓ Notifications are on for this device. <span class="mp-row"><button type="button" data-act="test">Send me a test</button><button type="button" data-act="disable">Turn off</button></span>`,
  }[st];
  try {
    const info = await db.pushStatus();
    if (info.last) html += `<div class="pl-legend">Last notification: ${esc(info.last.title)} — <b>${esc(info.last.status ?? (info.last.sent_at ? "sent" : "waiting to be sent…"))}</b> (${when(info.last.created_at)})</div>`;
    html += `<div class="pl-legend">${info.devices.length} device${info.devices.length === 1 ? "" : "s"} receiving your notifications</div>`;
  } catch { /* hors connexion ou pas encore installé côté serveur */ }
  box.innerHTML = html;
  box.querySelector("[data-act=enable]")?.addEventListener("click", async () => {
    const perm = await Notification.requestPermission(); // en premier : doit suivre directement l'appui (iPhone)
    if (perm !== "granted") { toast("Notifications not allowed"); fillNotif(box); return; }
    if (await guard(() => subscribePush(), "Couldn't turn on notifications")) { toast("🔔 Notifications are on — sending a test…"); await guard(() => db.queueTestPush()); }
    fillNotif(box);
  });
  box.querySelector("[data-act=test]")?.addEventListener("click", async () => {
    if (await guard(() => db.queueTestPush())) toast("Test on its way — it should arrive within a minute");
    setTimeout(() => box.isConnected && fillNotif(box), 4000);
  });
  box.querySelector("[data-act=disable]")?.addEventListener("click", async () => {
    const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
    if (sub) { await guard(() => db.removePushSubscription(sub.endpoint)); await sub.unsubscribe(); }
    toast("Notifications turned off on this device");
    fillNotif(box);
  });
}

// ---------- Widgets d'écran d'accueil (⚙) ----------
// La clé est tirée au hasard ICI ; seule son empreinte SHA-256 part dans la base. Elle n'est montrée qu'une fois.
const WIDGET_CODE_URL = new URL("widget/scriptable.js", location.href).href;
const WIDGET_PAGE_URL = new URL("widget.html", location.href).href;
async function newWidgetKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return { token, sha: [...hash].map((b) => b.toString(16).padStart(2, "0")).join("") };
}
// Petit script à coller dans Scriptable : il télécharge le vrai widget (widget/scriptable.js) et garde une copie hors connexion
const scriptableLoader = (token) => `// MeoPeo widget for Scriptable — paste ALL of this into a new script named "MeoPeo".
// KEY = your personal widget key: don't share it. Lost phone? Remove this widget in MeoPeo (Settings → Home-screen widget).
const KEY = "${token}";
const CODE_URL = "${WIDGET_CODE_URL}";
const fm = FileManager.local();
const file = fm.joinPath(fm.documentsDirectory(), "meopeo-widget-code.js");
let code = null;
try {
  const req = new Request(CODE_URL);
  req.timeoutInterval = 15;
  code = await req.loadString();
  if (!code.includes("MEOPEO_WIDGET")) throw new Error("bad download");
  fm.writeString(file, code);
} catch (e) {
  code = fm.fileExists(file) ? fm.readString(file) : null;
}
if (!code) throw new Error("MeoPeo: no connection — try again once the phone is online");
await new Function("KEY", "return (async () => {\\n" + code + "\\n})()")(KEY);
`;
async function copyText(text, area) {
  try { await navigator.clipboard.writeText(text); toast("Copied ✓"); }
  catch { area?.select(); toast("Select all and copy it by hand"); }
}
const shortDate = (isoStr) => { const d = new Date(isoStr); return `${d.getDate()}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; };

async function fillWidgets(box) {
  let keys;
  try { keys = await db.listWidgetKeys(); }
  catch (err) {
    box.innerHTML = /widget_tokens|schema cache|does not exist/i.test(err.message)
      ? `Widgets aren't set up yet — Tony needs to run <code>supabase/05_widgets.sql</code> in Supabase.`
      : `Couldn't load your widgets (${esc(err.message)}). Check the connection and open this menu again.`;
    return;
  }
  box.innerHTML = `<div class="pl-legend">Your calendar on the home screen: month (large widget), week (medium) or today (small). Your 🔒 tasks show as “🔒 Private”, without their text; ${esc(S.partner?.label ?? "the other")}'s private tasks never show.</div>
    ${keys.map((k) => `<div class="mp-wkey"><span>📱 <b>${esc(k.label)}</b> <span class="pl-legend">added ${shortDate(k.created_at)} · ${k.last_used_at ? "last update " + when(k.last_used_at) : "not used yet"}</span></span><button type="button" data-revoke="${k.id}">Remove</button></div>`).join("")}
    <span class="mp-row"><button type="button" data-new="iPhone">＋ iPhone widget</button><button type="button" data-new="Android">＋ Android widget</button></span>`;
  box.querySelectorAll("[data-revoke]").forEach((b) => b.addEventListener("click", async () => {
    if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Sure? It stops working"; return; } // 2e appui pour confirmer
    if (await guard(() => db.revokeWidgetKey(b.dataset.revoke), "Couldn't remove the widget")) { toast("Widget removed — it will show an error until you delete it from the home screen"); fillWidgets(box); }
  }));
  box.querySelectorAll("[data-new]").forEach((b) => b.addEventListener("click", async () => {
    const label = b.dataset.new;
    b.disabled = true;
    const { token, sha } = await newWidgetKey();
    if (!(await guard(() => db.registerWidgetKey(sha, label), "Couldn't create the widget"))) { b.disabled = false; return; }
    await fillWidgets(box);
    showWidgetSetup(box, label, token);
  }));
}

// ---------- Widget « Tino » (widget/tino.js pour Scriptable, widget/tino.html pour Android) ----------
// Tino et ses activités sur l'écran d'accueil, choisies selon l'heure (images widget/tino/*.png faites avec
// design/make-tino-widget.html). Pas de données perso → pas de clé ; les heures de sommeil de CET appareil sont mises
// dans le code / le lien au moment de l'ajout.
const TINO_CODE_URL = new URL("widget/tino.js", location.href).href;
const TINO_PAGE_URL = new URL("widget/tino.html", location.href).href;
const tinoLoader = (h, token) => `// MeoPeo Tino widget for Scriptable — paste ALL of this into a new script named "Tino".
// KEY = your personal widget key (shows Tino's outfit): don't share it. Lost phone? Remove it in MeoPeo (Settings → Home-screen widget).
const KEY = "${token}";
// Tino's sleep hours, from MeoPeo on this phone (changed them? make the widget again, or edit this line).
const HOURS = { night: ["${h.from}", "${h.to}"], nap: ["${h.napFrom}", "${h.napTo}"] };
const CODE_URL = "${TINO_CODE_URL}";
const fm = FileManager.local();
const file = fm.joinPath(fm.documentsDirectory(), "meopeo-tino-code.js");
let code = null;
try {
  const req = new Request(CODE_URL);
  req.timeoutInterval = 15;
  code = await req.loadString();
  if (!code.includes("MEOPEO_TINO_WIDGET")) throw new Error("bad download");
  fm.writeString(file, code);
} catch (e) {
  code = fm.fileExists(file) ? fm.readString(file) : null;
}
if (!code) throw new Error("MeoPeo: no connection — try again once the phone is online");
await new Function("KEY", "HOURS", "return (async () => {\\n" + code + "\\n})()")(KEY, HOURS);
`;
function fillTinoWidget(box) {
  box.innerHTML = `<div class="pl-sub">🦭 Tino widget</div>
    <div class="pl-legend">Tino on your home screen, doing his things — cooking at mealtimes, asleep at night (with this phone's sleep hours)… a new one each time the widget refreshes, wearing his outfit.${S.scenesOk === false ? " (For the outfit, Tony needs to run <code>supabase/18_widget_scenes.sql</code>.)" : ""}</div>
    <span class="mp-row"><button type="button" data-tino="iPhone">＋ iPhone Tino widget</button><button type="button" data-tino="Android">＋ Android Tino widget</button></span>`;
  box.querySelectorAll("[data-tino]").forEach((b) => b.addEventListener("click", async () => {
    box.querySelector(".mp-wsetup")?.remove();
    const ios = b.dataset.tino === "iPhone", h = tinoSleep();
    // une clé de widget (comme le calendrier) : le widget lit avec elle les images de Tino habillé (18)
    b.disabled = true;
    const { token, sha } = await newWidgetKey();
    const made = await guard(() => db.registerWidgetKey(sha, `Tino ${b.dataset.tino}`), "Couldn't create the widget");
    b.disabled = false;
    if (!made) return;
    const list = document.querySelector(".mp-widgets");
    if (list) fillWidgets(list); // (la clé apparaît dans la liste, avec « Remove »)
    const text = ios ? tinoLoader(h, token) : `${TINO_PAGE_URL}#k=${token}&night=${h.from}-${h.to}&nap=${h.napFrom}-${h.napTo}`;
    const steps = ios
      ? `<ol><li>In <b>Scriptable</b> (free, App Store): <b>＋</b>, then tap <b>Copy</b> below and paste, name the script <b>Tino</b>, <b>Done</b>.</li>
         <li>Home screen: hold an empty spot → <b>Edit</b> → <b>Add Widget</b> → <b>Scriptable</b> → pick a size → <b>Add Widget</b>. Then hold the new widget → <b>Edit Widget</b> → Script: <b>Tino</b>.</li></ol>`
      : `<ol><li>Tap <b>Copy</b> below.</li><li>Home screen: hold an empty spot → <b>Widgets</b> → your web-page widget app (e.g. <b>WebsiteWidget</b>) → drag it to the screen, paste the link when it asks for a URL. Any size works.</li></ol>`;
    const div = document.createElement("div");
    div.className = "mp-wsetup";
    div.innerHTML = `<b>${ios ? "📱 iPhone" : "🤖 Android"} Tino widget</b>${steps}
      <textarea readonly rows="${ios ? 6 : 3}" spellcheck="false">${esc(text)}</textarea>
      <span class="mp-row"><button type="button" class="mp-cta" data-act="copy">Copy</button></span>
      <div class="pl-legend">⚠️ Shown only once. ${KEY_WARN} Lost it? Make a new one and remove this one above.</div>`;
    box.append(div);
    const area = div.querySelector("textarea");
    div.querySelector("[data-act=copy]").addEventListener("click", () => copyText(text, area));
    div.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }));
}

// ---------- Widget « Doodle » (widget/doodle.js pour Scriptable, widget/doodle.html pour Android) ----------
// Le dernier dessin reçu de l'autre (📝 Notes → ✏️ Doodles), lu avec une clé de widget (widget_doodle de 19_doodles.sql).
const DOODLE_CODE_URL = new URL("widget/doodle.js", location.href).href;
const DOODLE_PAGE_URL = new URL("widget/doodle.html", location.href).href;
const doodleLoader = (token) => `// MeoPeo Doodle widget for Scriptable — paste ALL of this into a new script named "Doodle".
// KEY = your personal widget key (shows the doodles you receive): don't share it. Lost phone? Remove it in MeoPeo (Settings → Home-screen widget).
const KEY = "${token}";
const CODE_URL = "${DOODLE_CODE_URL}";
const fm = FileManager.local();
const file = fm.joinPath(fm.documentsDirectory(), "meopeo-doodle-code.js");
let code = null;
try {
  const req = new Request(CODE_URL);
  req.timeoutInterval = 15;
  code = await req.loadString();
  if (!code.includes("MEOPEO_DOODLE_WIDGET")) throw new Error("bad download");
  fm.writeString(file, code);
} catch (e) {
  code = fm.fileExists(file) ? fm.readString(file) : null;
}
if (!code) throw new Error("MeoPeo: no connection — try again once the phone is online");
await new Function("KEY", "return (async () => {\\n" + code + "\\n})()")(KEY);
`;
function fillDoodleWidget(box) {
  const P = S.partner ?? { mark: "", label: "the other" };
  box.innerHTML = `<div class="pl-sub">✏️ Doodle widget</div>
    <div class="pl-legend">The last doodle ${esc(P.mark)} ${esc(P.label)} sent you (📝 Notes → ✏️ Doodles), on your home screen.${S.doodlesOk === false ? " (Tony needs to run <code>supabase/19_doodles.sql</code> first.)" : ""}</div>
    <span class="mp-row"><button type="button" data-doodlew="iPhone">＋ iPhone Doodle widget</button><button type="button" data-doodlew="Android">＋ Android Doodle widget</button></span>`;
  box.querySelectorAll("[data-doodlew]").forEach((b) => b.addEventListener("click", async () => {
    box.querySelector(".mp-wsetup")?.remove();
    const ios = b.dataset.doodlew === "iPhone";
    b.disabled = true;
    const { token, sha } = await newWidgetKey();
    const made = await guard(() => db.registerWidgetKey(sha, `Doodle ${b.dataset.doodlew}`), "Couldn't create the widget");
    b.disabled = false;
    if (!made) return;
    const list = document.querySelector(".mp-widgets");
    if (list) fillWidgets(list); // (la clé apparaît dans la liste, avec « Remove »)
    const text = ios ? doodleLoader(token) : `${DOODLE_PAGE_URL}#k=${token}`;
    const steps = ios
      ? `<ol><li>In <b>Scriptable</b>: <b>＋</b>, then tap <b>Copy</b> below and paste, name the script <b>Doodle</b>, <b>Done</b>.</li>
         <li>Home screen: hold an empty spot → <b>Edit</b> → <b>Add Widget</b> → <b>Scriptable</b> → pick a size (small = just the doodle) → <b>Add Widget</b>. Then hold the new widget → <b>Edit Widget</b> → Script: <b>Doodle</b>.</li>
         <li>The iPhone refreshes widgets when it wants (every 15 min to 1 h): a new doodle can take a while to show — the notification comes right away.</li></ol>`
      : `<ol><li>Tap <b>Copy</b> below.</li><li>Home screen: hold an empty spot → <b>Widgets</b> → your web-page widget app (e.g. <b>WebsiteWidget</b>) → drag it to the screen, paste the link when it asks for a URL. A square size suits a doodle best.</li>
         <li>In the widget app's settings, pick the shortest refresh time, so new doodles show up sooner.</li></ol>`;
    const div = document.createElement("div");
    div.className = "mp-wsetup";
    div.innerHTML = `<b>${ios ? "📱 iPhone" : "🤖 Android"} Doodle widget</b>${steps}
      <textarea readonly rows="${ios ? 6 : 3}" spellcheck="false">${esc(text)}</textarea>
      <span class="mp-row"><button type="button" class="mp-cta" data-act="copy">Copy</button></span>
      <div class="pl-legend">⚠️ Shown only once. ${KEY_WARN} Lost it? Make a new one and remove this one above.</div>`;
    box.append(div);
    const area = div.querySelector("textarea");
    div.querySelector("[data-act=copy]").addEventListener("click", () => copyText(text, area));
    div.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }));
}
// ---------- Widget Android « tout-en-un » (widget/all.html) ----------
// Pour une app de widget qui n'en accepte qu'UN (version gratuite de certaines apps) : le dernier dessin reçu, Tino (avec
// les heures de sommeil de cet appareil, comme le widget Tino) et les tâches, avec une seule clé.
const ALL_PAGE_URL = new URL("widget/all.html", location.href).href;
function fillAllWidget(box) {
  box.innerHTML = `<div class="pl-sub">🧩 All-in-one widget (Android)</div>
    <div class="pl-legend">Your widget app only allows one widget? This one shows everything together: the last doodle, Tino and your tasks. Wide = side by side, big square = doodle and Tino on top with the tasks below, small = the doodle.</div>
    <span class="mp-row"><button type="button" data-allw>＋ Android all-in-one widget</button></span>`;
  const b = box.querySelector("[data-allw]");
  b.addEventListener("click", async () => {
    box.querySelector(".mp-wsetup")?.remove();
    const h = tinoSleep();
    b.disabled = true;
    const { token, sha } = await newWidgetKey();
    const made = await guard(() => db.registerWidgetKey(sha, "All-in-one Android"), "Couldn't create the widget");
    b.disabled = false;
    if (!made) return;
    const list = document.querySelector(".mp-widgets");
    if (list) fillWidgets(list); // (la clé apparaît dans la liste, avec « Remove »)
    const text = `${ALL_PAGE_URL}#k=${token}&night=${h.from}-${h.to}&nap=${h.napFrom}-${h.napTo}`;
    const div = document.createElement("div");
    div.className = "mp-wsetup";
    div.innerHTML = `<b>🤖 Android all-in-one widget</b>
      <ol><li>Tap <b>Copy</b> below.</li><li>In your web-page widget app (e.g. <b>WebsiteWidget</b>), open the widget you already have and replace its link with this one (or add the widget: hold an empty spot → <b>Widgets</b> → the app → paste the link).</li>
        <li>Resize it as you like: wide (4 × 2), big (4 × 3 or 4 × 4) or small. In the app's settings, pick the shortest refresh time.</li></ol>
      <textarea readonly rows="3" spellcheck="false">${esc(text)}</textarea>
      <span class="mp-row"><button type="button" class="mp-cta" data-act="copy">Copy</button></span>
      <div class="pl-legend">⚠️ Shown only once. ${KEY_WARN} Lost it? Make a new one and remove this one above.</div>`;
    box.append(div);
    const area = div.querySelector("textarea");
    div.querySelector("[data-act=copy]").addEventListener("click", () => copyText(text, area));
    div.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}
// Une clé de widget (n'importe lequel) ouvre le calendrier, la tenue de Tino et les dessins reçus
const KEY_WARN = "It contains your widget key: anyone who has it can see your calendar (without private tasks' text), Tino's outfit and the doodles you receive.";

// Mode d'emploi + code, montrés une seule fois juste après la création de la clé
function showWidgetSetup(box, label, token) {
  const ios = label === "iPhone";
  const text = ios ? scriptableLoader(token) : `${WIDGET_PAGE_URL}#k=${token}`;
  const steps = ios
    ? `<ol><li>Install <b>Scriptable</b> (free, App Store).</li><li>Tap <b>Copy</b> below. In Scriptable: <b>＋</b>, paste, name the script <b>MeoPeo</b> (tap the title at the top), <b>Done</b>.</li>
       <li>Tap the script once: you'll see a preview of the large widget.</li><li>Home screen: hold an empty spot → <b>Edit</b> → <b>Add Widget</b> → <b>Scriptable</b> → pick a size → <b>Add Widget</b>. Then hold the new widget → <b>Edit Widget</b> → Script: <b>MeoPeo</b>.</li></ol>`
    : `<ol><li>Install a widget app that shows a web page (e.g. <b>WebsiteWidget</b> on the Play Store).</li><li>Tap <b>Copy</b> below.</li>
       <li>Home screen: hold an empty spot → <b>Widgets</b> → the widget app → drag it to the screen, paste the link when it asks for a URL. Resize it: large = month, medium = week, small = today.</li>
       <li>Wrong layout for the size? Add <code>&view=month</code>, <code>&view=week</code> or <code>&view=today</code> at the end of the link.</li></ol>`;
  const div = document.createElement("div");
  div.className = "mp-wsetup";
  div.innerHTML = `<b>${ios ? "📱 iPhone widget" : "🤖 Android widget"} — set it up now</b>${steps}
    <textarea readonly rows="${ios ? 6 : 3}" spellcheck="false">${esc(text)}</textarea>
    <span class="mp-row"><button type="button" class="mp-cta" data-act="copy">Copy</button></span>
    <div class="pl-legend">⚠️ This is shown only once. ${KEY_WARN} Lost it? Make a new widget and remove this one.</div>`;
  box.append(div);
  const area = div.querySelector("textarea");
  div.querySelector("[data-act=copy]").addEventListener("click", () => copyText(text, area));
  div.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ---------- Tâches récurrentes (supabase/15_recurring.sql) ----------
// Chaque occurrence est une vraie tâche (colonne series) ; la série garde la règle. À l'ouverture (en ligne, au plus une
// fois toutes les 10 min) : complétion de mes séries sans fin. Sans 15 : le choix « 🔁 » est caché, rien d'autre ne change.
let unsubSeries = null, toppedUp = 0;
async function loadSeries() {
  if (!S.user) return;
  const before = S.seriesOk;
  try { S.series = await db.listSeries(); S.seriesOk = true; store.set("series." + S.user.id, S.series); }
  catch (err) {
    if (/does not exist|schema cache/i.test(err.message)) { S.seriesOk = false; S.series = []; }
    else S.series = store.get("series." + S.user.id, S.series); // hors ligne
  }
  if (S.seriesOk && navigator.onLine && Date.now() - toppedUp > 10 * 60 * 1000) {
    toppedUp = Date.now();
    try { if (await db.topUpSeries(today)) reload(); } catch (err) { console.warn("Repeating tasks", err); }
  }
  if (S.me && S.seriesOk !== before) render(); // (affiche ou cache le choix « 🔁 », textes des règles)
}

// ---------- Onglets : barre de 5 boutons en bas (téléphone et ordinateur) ----------
// Calendar = la page de toujours (#app + carte des messages Tino) ; Notes, Tino, Fishing et Settings = sections à part,
// remplies à chaque ouverture. L'onglet est dans l'adresse (#notes…) : le bouton « retour » et un rechargement y restent.
// Le bouton Tino = sa tête (le dessin de mascot.js).
const TABS = [["calendar", "📅", "Calendar"], ["notes", "📝", "Notes"], ["tino", tinoHeadSvg(), "Tino"], ["fishing", "🎣", "Fishing"], ["settings", "⚙", "Settings"]];
let nav = null;
const panes = {};
const currentTab = () => { const t = location.hash.replace("#", ""); return TABS.some(([id]) => id === t) ? t : "calendar"; };
function setupTabs() {
  nav = document.createElement("nav");
  nav.className = "mp-nav";
  nav.setAttribute("aria-label", "MeoPeo");
  nav.innerHTML = TABS.map(([id, icon, label]) => `<button type="button" data-tab="${id}"><span class="mp-nav-i" aria-hidden="true">${icon}</span>${label}</button>`).join("");
  document.body.append(nav);
  nav.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.tab === currentTab()) { scrollTo({ top: 0, behavior: "smooth" }); return; }
    location.hash = b.dataset.tab === "calendar" ? "" : b.dataset.tab; // → hashchange → showTab
  }));
  for (const [id] of TABS.slice(1)) {
    const p = document.createElement("section");
    p.className = "mp-pane";
    p.hidden = true;
    toastBox.before(p);
    panes[id] = p;
  }
  addEventListener("hashchange", () => showTab());
}
function showTab() {
  const t = currentTab(), logged = !!(S.user && S.me);
  document.body.classList.toggle("mp-logged", logged);
  document.body.classList.toggle("mp-on-calendar", !logged || t === "calendar");
  nav?.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-current", b.dataset.tab === t ? "page" : "false"));
  for (const [id, p] of Object.entries(panes)) p.hidden = !logged || id !== t;
  if (t !== "fishing") { fishGame?.stop(); fishGame = null; } // (animations des onglets qu'on quitte : arrêtées)
  if (t !== "tino" && showcase) { bathing?.end(); showcase.card.remove(); showcase = null; }
  if (!logged) return;
  if (t === "calendar") { placeBigTino(); align(); } // de retour : Tino, son lit, le grand Tino et les colonnes se remettent en place
  else if (t === "notes") renderNotes(panes.notes);
  else if (t === "tino") renderTinoPane(panes.tino);
  else if (t === "fishing") renderFishing(panes.fishing);
  else renderSettings(panes.settings);
  scrollTo(0, 0);
  if (t !== "calendar") mascots?.refresh(); // Tino vient dans Notes, disparaît dans Tino, Fishing et Settings (au calendrier : align())
}

// ---------- Sections repliables (onglets Tino et Settings) ----------
// Un titre qui ouvre / ferme sa section ; une seule ouverte à la fois par onglet (la page reste une courte liste de titres).
// La section ouverte le reste quand on revient sur l'onglet, tant que l'app tourne (en mémoire seulement).
// Le contenu est rempli même fermé (les fill… et les mises à jour en direct ne changent pas).
const foldOpen = {}; // onglet → clé de la section ouverte
const fold = (key, title, body, tag = "div") => `<${tag} class="pl-editor-card mp-pane-card mp-fold" data-fold="${key}">
  <h4><button type="button" class="mp-fold-btn" aria-expanded="false"><span>${title}</span><span class="mp-fold-i" aria-hidden="true">›</span></button></h4>
  <div class="mp-fold-body">${body}</div></${tag}>`;
function setupFolds(pane, tab) {
  const all = [...pane.querySelectorAll(".mp-fold")];
  const show = (key) => all.forEach((f) => {
    const on = f.dataset.fold === key;
    f.classList.toggle("mp-open", on);
    f.querySelector(".mp-fold-btn").setAttribute("aria-expanded", String(on));
  });
  show(foldOpen[tab]);
  for (const f of all) f.querySelector(".mp-fold-btn").addEventListener("click", () => {
    const key = f.classList.contains("mp-open") ? null : f.dataset.fold;
    foldOpen[tab] = key;
    show(key);
    if (key) f.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); // titre en haut de l'écran
  });
}

// ---------- Onglet Tino : Tino en grand (avec ses habits), puis tout ce qui le personnalise ----------
function renderTinoPane(pane) {
  pane.innerHTML = `<div class="pl-editor-card mp-pane-card mp-showcase"><div class="mp-show-stage"></div><div class="pl-legend mp-show-cap"></div><div class="mp-tummy"></div><div class="mp-bath"></div></div>`
    + fold("tino", "🦭 Tino", `<div class="mp-tinoset"></div>`)
    + fold("hunger", "🍽 Hunger lines", `<div class="mp-hunger"></div>`)
    + fold("grumbles", "💢 Grumpy lines", `<div class="mp-grumbles"></div>`)
    + fold("wardrobe", "👒 Tino's wardrobe", `<div class="mp-wardrobe"></div>`)
    + fold("decor", "🏖 Decor", `<div class="mp-decor"></div>`);
  fillShowcase(pane.querySelector(".mp-showcase"));
  const tummy = pane.querySelector(".mp-tummy");
  tummy._eater = () => showcase?.m; // (c'est le grand Tino qui mange)
  fillTummy(tummy);
  fillBath(pane.querySelector(".mp-bath"));
  fillHungerLines(pane.querySelector(".mp-hunger"));
  fillTinoSettings(pane.querySelector(".mp-tinoset"));
  fillGrumbles(pane.querySelector(".mp-grumbles"));
  fillWardrobe(pane.querySelector(".mp-wardrobe"));
  fillDecor(pane.querySelector(".mp-decor"));
  setupFolds(pane, "tino");
}

// Tino en grand en haut de l'onglet Tino : le vrai dessin du petit Tino (mascot.js, demoPose), avec sa tenue ; il se repose,
// salue, s'assoit… On peut le toucher, le frotter, comme dans le calendrier. Refait à chaque ouverture de l'onglet (l'ancien
// s'arrête tout seul quand il quitte la page).
let showcase = null;
function fillShowcase(card) {
  const stage = card.querySelector(".mp-show-stage"), box = document.createElement("div");
  stage.append(box);
  const m = demoPose(box, "tino", "idle", matchMedia("(min-width: 700px)").matches ? 180 : 150);
  m.think = () => {
    const b = bellyInfo(); // (de temps en temps il dit sa faim : plus souvent quand il a très faim)
    if (b && !m.bubble && Math.random() < ({ hungry: 0.35, peckish: 0.15, full: 0.1 }[b.level] ?? 0)) return { type: "belly", dur: 4.2 };
    const r = Math.random() * 8; return r < 4 ? { type: "idle", dur: 2 + Math.random() * 3 } : r < 6 ? { type: "wave", dur: 2.2 } : { type: "sit", dur: 3 + Math.random() * 3 };
  };
  m.eng.grumbles = grumbleLines;
  m.eng.belly = bellyInfo;
  showcase = { m, card };
  dressShowcase();
}
async function dressShowcase(look) {
  const sc = showcase;
  if (!sc?.card.isConnected) return;
  sc.m.wear(look ?? await wornLook());
  const items = ["head", "body"].map(wornOutfit).filter(Boolean), c = colorNow();
  sc.card.querySelector(".mp-show-cap").textContent = (items.length ? `Wearing: ${items.map((o) => o.name + (S.fishingOk === true ? ` (until ${untilText(caughtUntil(o))})` : "")).join(" · ")}` : "No outfit right now")
    + (c ? ` · 🎨 colour for ${timeLeft(c.until)}` : "");
}

// ---------- Onglet 🎣 Fishing : la pêche (supabase/20_fishing.sql) ----------
// Tino pêche au bout d'un ponton : on lance, on attend que le bouchon plonge, on ferre vite. Ce qu'on attrape est tiré au
// sort par la base (fish_tino) au moment où on ferre : on ne le sait qu'en le sortant de l'eau. Une tenue : portable par
// les deux pendant 7 jours ; une couleur : Tino la prend tout de suite, chez les deux, pendant 30 min (22 ; avant 2 h) (pas d'autre couleur
// pendant ce temps) ; sinon un poisson, une vieille botte… Lancers illimités (choix de Tony, pour l'instant). Tout est commun.
let unsubCatches = null, fishTimer = 0, lastCatch = null, fishGame = null;
const JUNK = { fish: ["🐟", "a fish"], big_fish: ["🐠", "a big fish"], golden_fish: ["✨🐟", "a golden fish"], boot: ["🥾", "an old boot"], can: ["🥫", "a tin can"], weed: ["🌿", "some seaweed"], shell: ["🐚", "a shell"], crab: ["🦀", "a grumpy crab"] };
const colorNow = () => (S.color && Date.parse(S.color.until) > Date.now() ? S.color : null);
// Couleur pêchée { h, s, l } → pelage et contour (plus foncé) pour mascot.js (variables --ms-fur / --ms-fur-line sur <html>)
const furOf = (c) => (c ? { fill: `hsl(${c.h}, ${c.s}%, ${c.l}%)`, line: `hsl(${c.h}, ${Math.min(100, c.s + 5)}%, ${Math.max(18, c.l - 24)}%)` } : null);
const furNow = () => furOf(colorNow()?.color);
const whoMark = (id) => esc((id === S.user?.id ? S.me : S.partner)?.mark ?? "•");
const timeLeft = (until) => { const m = Math.max(1, Math.round((Date.parse(until) - Date.now()) / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)}` : `${m} min`; };
const hourOf = (d) => `${iso(d) === today ? "" : relDay(iso(d)) + " "}${hhmm(d)}`;
function applyColor() {
  const f = furNow(), r = document.documentElement.style;
  if (f) { r.setProperty("--ms-fur", f.fill); r.setProperty("--ms-fur-line", f.line); }
  else { r.removeProperty("--ms-fur"); r.removeProperty("--ms-fur-line"); }
}
async function loadCatches() {
  if (!S.user) return;
  const was = S.fishingOk;
  try { const r = await db.listCatches(); S.catches = r.catches; S.color = r.color; S.fishingOk = true; store.set("catches." + S.user.id, r); }
  catch (err) {
    if (/does not exist|schema cache|tino_catches|fish_tino/i.test(err.message)) { S.fishingOk = false; S.catches = []; S.color = null; }
    else { const r = store.get("catches." + S.user.id, null); if (r) { S.catches = r.catches; S.color = r.color; S.fishingOk = true; } } // hors ligne (copie : la pêche existe)
  }
  const top = S.catches[0]; // une prise de l'autre arrive en direct : on le dit (pas pour un « rien »)
  if (lastCatch !== null && top && top.id !== lastCatch && top.by !== S.user.id && top.kind !== "junk" && S.partner)
    toast(`🎣 ${S.partner.mark} ${S.partner.label} caught ${top.kind === "color" ? "a new colour for Tino 🎨" : `“${catchName(top)}” 👒${(S.outfits.find((o) => o.id === top.outfit)?.rarity ?? 1) > 1 ? " — ✨ a limited edition!" : ""}`}`);
  lastCatch = top?.id ?? 0;
  fishingChanged(was !== S.fishingOk);
  loadFeeding(); // (un poisson pêché va dans le seau)
}
// Une prise, une fin de couleur ou de tenue : Tino, l'onglet Fishing et les images du widget suivent ; la garde-robe
// seulement si wardrobe (la pêche apparaît / disparaît, une tenue revient dans la réserve) — une tenue pêchée la refait déjà
// par loadOutfits — et jamais pendant qu'on y ajoute un dessin (nom tapé, envoi en cours)
function fishingChanged(wardrobe = true) {
  applyColor();
  applyOutfit();
  const box = document.querySelector(".mp-wardrobe");
  if (box && wardrobe && !wardrobeBusy(box)) fillWardrobe(box);
  refreshFishing();
  scheduleFishTimer();
  syncWidgetScenes();
}
// Prochaine fin (couleur après 30 min, tenue après 7 jours) : tout se remet à jour à ce moment-là si l'app est ouverte
function scheduleFishTimer() {
  clearTimeout(fishTimer);
  if (S.fishingOk !== true) return;
  const c = colorNow(), ends = S.outfits.filter((o) => o.caughtAt && unlocked(o)).map((o) => +caughtUntil(o));
  if (c) ends.push(Date.parse(c.until));
  if (ends.length) fishTimer = setTimeout(fishingChanged, Math.min(2 ** 31 - 1, Math.max(1000, Math.min(...ends) - Date.now() + 1000)));
}
function refreshFishing() {
  if (currentTab() !== "fishing" || !document.body.classList.contains("mp-logged")) return;
  if (!fishGame || (S.fishingOk === false) !== !!panes.fishing.querySelector(".mp-fish-missing")) { if (!fishGame?.busy()) renderFishing(panes.fishing); return; }
  fishGame.dress();
  fillFishInfo(panes.fishing);
}
function renderFishing(pane) {
  fishGame?.stop();
  fishGame = null;
  if (S.fishingOk === false) {
    pane.innerHTML = `<div class="pl-editor-card mp-pane-card mp-fish-missing"><h4>🎣 Fishing</h4><div class="pl-legend">Fishing isn't available yet — Tony needs to run <code>supabase/20_fishing.sql</code>.</div></div>`;
    return;
  }
  pane.innerHTML = `<div class="pl-editor-card mp-pane-card mp-fish">
      <div class="mp-fish-scene"></div>
      <div class="mp-fish-out" hidden></div>
      <button type="button" class="mp-cta mp-fish-btn">🎣 Cast</button>
      <div class="pl-legend mp-fish-msg">Cast, wait for the float to dip, then reel in — quick!</div>
    </div>
    <div class="pl-editor-card mp-pane-card mp-fish-info"></div>
    <div class="pl-editor-card mp-pane-card"><h4>🪣 Catches</h4><div class="mp-catches"></div></div>`;
  fishGame = fishScene(pane);
  fillFishInfo(pane);
}
// Nom d'une tenue pêchée : son nom actuel (elle a pu être renommée), sinon celui gardé avec la prise (tenue retirée)
const catchName = (c) => S.outfits.find((o) => o.id === c.outfit)?.name ?? c.outfitName;
const catchRow = (c) => {
  const when = `<span class="pl-legend">· ${tinoWhen(c.at)}</span>`;
  if (c.kind === "junk") { const [e, n] = JUNK[c.junk] ?? ["🫧", c.junk]; return `<div class="mp-catch">${e} ${whoMark(c.by)} ${n}${FISH[c.junk] && S.feedingOk === true ? ` <span class="pl-legend">${c.eatenAt ? "· eaten 😋" : "· in the bucket"}</span>` : ""} ${when}</div>`; }
  const live = Date.parse(c.until) > Date.now();
  if (c.kind === "color") return `<div class="mp-catch"><span class="mp-swatch" style="background:${furOf(c.color).fill}"></span> ${whoMark(c.by)} a colour <span class="pl-legend">${live ? `· until ${hourOf(new Date(c.until))}` : "· faded"}</span> ${when}</div>`;
  const end = new Date(Date.parse(c.at) + outfitMs(S.outfits.find((o) => o.id === c.outfit))), on = +end > Date.now(); // (la durée réglée maintenant, pas celle du moment de la prise)
  return `<div class="mp-catch">👒 ${whoMark(c.by)} “${esc(catchName(c))}”${(S.outfits.find((o) => o.id === c.outfit)?.rarity ?? 1) > 1 ? " ✨" : ""} <span class="pl-legend">${on ? `· until ${untilText(end)}` : "· back in the pool"}</span> ${when}</div>`;
};
function fillFishInfo(pane) {
  const info = pane.querySelector(".mp-fish-info"), list = pane.querySelector(".mp-catches");
  if (!info || !list) return;
  const c = colorNow(), pool = S.outfits.filter((o) => !unlocked(o)).length, caught = S.outfits.filter((o) => o.caughtAt && unlocked(o)).length;
  const limited = S.outfits.filter((o) => !unlocked(o) && (o.rarity ?? 1) > 1).length;
  info.innerHTML = `<h4>🎨 Tino's colour</h4>
    <div class="mp-fish-line">${c ? `<span class="mp-swatch" style="background:${furOf(c.color).fill}"></span> Caught by ${whoMark(c.by)} — ${timeLeft(c.until)} left (until ${hourOf(new Date(c.until))}). No other colour until then.` : "White, as usual — you might catch a colour! It lasts 30 minutes."}</div>
    <h4>👒 Outfits</h4>
    <div class="mp-fish-line">🎣 ${pool} in the pool · 👒 ${caught} caught — wear them in the Tino tab → Tino's wardrobe</div>
    <h4>🍽 Tino's tummy</h4><div class="mp-tummy"></div>
    <h4>🌊 In the water</h4>
    <div class="mp-fish-line">${S.feedingOk === true ? "🐟 Fish about 1 cast in 2 (🐠 big ones, now and then ✨🐟 a golden one) — food for Tino" : "🐟 Now and then a fish"} · 👒 an outfit from the pool (${pool}${limited ? ` — ✨ ${limited} limited edition${limited > 1 ? "s" : ""}` : ""}) · 🎨 a colour for Tino · 🦀🥾 crabs, boots and other junk</div>`;
  const tummy = info.querySelector(".mp-tummy");
  tummy._eater = () => fishGame?.m; // (le Tino de la scène mange)
  fillTummy(tummy);
  list.innerHTML = S.catches.length ? S.catches.map(catchRow).join("") : `<div class="pl-empty">Nothing caught yet.</div>`;
}
// La scène et le jeu : Tino (le vrai, avec sa tenue et sa couleur) assis au bout du ponton, la canne, le fil, le bouchon
function fishScene(pane) {
  const host = pane.querySelector(".mp-fish-scene"), btn = pane.querySelector(".mp-fish-btn"), out = pane.querySelector(".mp-fish-out");
  const say = (t) => { pane.querySelector(".mp-fish-msg").textContent = t; };
  const W = 360, H = 200, DOCK = 104, TX = 92, SEA = 118, ROD = [85, -51]; // ROD : du bas de la canne (dans sa patte droite) au bout
  const day = daylight().day, reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const waves = (y, a, c) => `<path d="M0 ${y}${Array.from({ length: 13 }, (_, i) => ` q15 ${-a} 30 0 t30 0`).join("")}" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`;
  host.innerHTML = `<svg class="mp-fish-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <defs>
      <linearGradient id="mp-fsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${day ? "#9fd6ff" : "#121845"}"/><stop offset="1" stop-color="${day ? "#fdeecb" : "#3a4685"}"/></linearGradient>
      <linearGradient id="mp-fsea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${day ? "#5ab4e6" : "#25508f"}"/><stop offset="1" stop-color="${day ? "#1d5c9c" : "#0c1d40"}"/></linearGradient>
    </defs>
    <rect width="${W}" height="${SEA + 2}" fill="url(#mp-fsky)"/>
    ${day ? `<circle cx="300" cy="38" r="17" fill="#ffe08a"/><circle cx="300" cy="38" r="25" fill="#ffe08a" opacity="0.25"/>`
      : `<circle cx="300" cy="36" r="14" fill="#fff3c4"/><circle cx="306" cy="31" r="12" fill="#121845" opacity="0.85"/>${[[40, 20], [120, 34], [210, 16], [250, 52], [340, 70], [170, 64]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.1" fill="#fff"/>`).join("")}`}
    <rect y="${SEA}" width="${W}" height="${H - SEA}" fill="url(#mp-fsea)"/>
    <g class="mp-waves">${waves(SEA + 14, 2.5, "rgba(255,255,255,0.35)")}${waves(SEA + 38, 3, "rgba(255,255,255,0.22)")}${waves(SEA + 66, 3.5, "rgba(255,255,255,0.15)")}</g>
    ${[16, 66, 114].map((x) => `<rect x="${x}" y="${DOCK + 6}" width="7" height="${H - DOCK}" fill="#6e4a2e"/>`).join("")}
    <rect x="-6" y="${DOCK}" width="134" height="9" rx="2" fill="#a0724a"/>
    ${[24, 52, 80, 108].map((x) => `<line x1="${x}" y1="${DOCK + 1}" x2="${x}" y2="${DOCK + 8}" stroke="#7d5536" stroke-width="1"/>`).join("")}
    <ellipse class="mp-ripple" cx="0" cy="${SEA + 2}" rx="10" ry="2.6" fill="none" stroke="#fff" stroke-width="1.2" opacity="0"/>
    <path class="mp-line" d="" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="0.9"/>
    <g class="mp-rod"><line x1="-3" y1="2" x2="${ROD[0]}" y2="${ROD[1]}" stroke="#5b3a22" stroke-width="2.6" stroke-linecap="round"/>
      <circle cx="8" cy="-5" r="3.2" fill="#c9ced8" stroke="#7d8291" stroke-width="1"/></g>
    <g class="mp-float"><circle r="4.2" fill="#fff" stroke="#c22" stroke-width="0.8"/><path d="M-4.2 0A4.2 4.2 0 0 1 4.2 0Z" fill="#e33"/><line y1="-4" y2="-9" stroke="#333" stroke-width="0.9"/></g>
    <text class="mp-bang" x="${TX + 14}" y="${DOCK - 66}" font-size="22" font-weight="800" fill="#ff4d5e" opacity="0" text-anchor="middle">!</text>
    <g class="mp-prize" opacity="0"></g>
  </svg><div class="mp-fish-tino"></div>`;
  const svg = host.querySelector("svg"), rod = svg.querySelector(".mp-rod"), line = svg.querySelector(".mp-line"), fl = svg.querySelector(".mp-float");
  const bang = svg.querySelector(".mp-bang"), ripple = svg.querySelector(".mp-ripple"), prize = svg.querySelector(".mp-prize");
  // Tino, à l'échelle de la scène
  const k = (host.clientWidth || 340) / W, size = Math.round(62 * k), tbox = host.querySelector(".mp-fish-tino"), box = document.createElement("div");
  tbox.style.cssText = `left:${((TX - 31) / W) * 100}%;top:${((DOCK - 62) / H) * 100}%`;
  tbox.append(box);
  const m = demoPose(box, "tino", "sit", size);
  m.think = () => ({ type: "sit", dur: Infinity });
  m.eng.grumbles = grumbleLines;
  const dress = async () => m.wear(await wornLook());
  dress();
  // État du jeu ; la boucle d'animation s'arrête quand l'onglet est quitté
  let state = "idle", t0 = performance.now(), fx = 260, angle = 0, timer = 0, stopped = false, prizeAt = null;
  // La canne part de sa patte droite, mesurée à chaque image (elle suit Tino quand il respire, saute…) ; la patte est
  // dessinée par-dessus le bas de la canne : il la tient
  const paw = box.querySelector(".ms-arm-r > ellipse");
  let base = [TX + 19, DOCK - 12];
  const pawAt = () => {
    const p = paw?.getBoundingClientRect(), r = svg.getBoundingClientRect();
    if (p?.width && r.width) base = [((p.left + p.width / 2 - r.left) / r.width) * W, ((p.top + p.height * 0.6 - r.top) / r.height) * H];
    return base;
  };
  const rot = ([x, y], a) => { const r = (a * Math.PI) / 180; return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)]; };
  const set = (st, label, text, disabled = false) => { state = st; t0 = performance.now(); btn.textContent = label; btn.disabled = disabled; btn.classList.toggle("mp-fish-now", st === "bite"); if (text) say(text); };
  function frame(now) {
    if (stopped || !svg.isConnected) return;
    const t = (now - t0) / 1000, wob = reduce ? 0 : Math.sin(now / 320);
    angle = state === "cast" ? (t < 0.25 ? -38 * (t / 0.25) : t < 0.45 ? -38 + 50 * ((t - 0.25) / 0.2) : 12 - 12 * Math.min(1, (t - 0.45) / 0.3))
      : state === "reel" ? -10 + 4 * Math.sin(t * 18) : state === "bite" ? -4 : 0;
    const b = pawAt(), d = rot(ROD, angle), tip = [b[0] + d[0], b[1] + d[1]];
    let fp; // position du bouchon
    if (state === "idle" || state === "done") fp = [tip[0] + 2, tip[1] + 34 + 2 * wob];
    else if (state === "cast") { const s = Math.max(0, Math.min(1, (t - 0.35) / 0.55)); fp = s <= 0 ? [tip[0] + 2, tip[1] + 34] : [tip[0] + (fx - tip[0]) * s, tip[1] + 34 + (SEA - tip[1] - 34) * s - 60 * s * (1 - s)]; if (s >= 1 && state === "cast") wait(); }
    else if (state === "wait" || state === "early") fp = [fx, SEA + 1.2 * wob];
    else if (state === "bite") fp = [fx + (reduce ? 0 : 1.6 * Math.sin(now / 35)), SEA + 6 + (reduce ? 0 : 1.5 * Math.sin(now / 60))];
    else { const s = Math.min(1, t / 0.9); fp = [fx + (tip[0] + 2 - fx) * s, SEA + (tip[1] + 34 - SEA) * s - 30 * s * (1 - s)]; }
    if (state === "reel" || state === "done") prizeAt = fp; // la prise pend au bout du fil
    rod.setAttribute("transform", `translate(${b[0].toFixed(1)} ${b[1].toFixed(1)}) rotate(${angle.toFixed(1)})`);
    fl.setAttribute("transform", `translate(${fp[0].toFixed(1)} ${fp[1].toFixed(1)})`);
    const sag = state === "wait" || state === "early" ? 22 : state === "bite" || state === "reel" ? 2 : 8;
    line.setAttribute("d", `M${tip[0].toFixed(1)} ${tip[1].toFixed(1)} Q${((tip[0] + fp[0]) / 2).toFixed(1)} ${((tip[1] + fp[1]) / 2 + sag).toFixed(1)} ${fp[0].toFixed(1)} ${(fp[1] - 9).toFixed(1)}`);
    bang.setAttribute("opacity", state === "bite" ? "1" : "0");
    if (prizeAt && prize.childElementCount) prize.setAttribute("transform", `translate(${prizeAt[0].toFixed(1)} ${(prizeAt[1] + 4).toFixed(1)})`);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  const splash = () => { ripple.setAttribute("cx", fx); ripple.classList.remove("mp-ripple-go"); void ripple.getBBox(); ripple.classList.add("mp-ripple-go"); };
  function cast() {
    if (!navigator.onLine) { toast("📴 You're offline — try again once you're back online."); return; }
    out.hidden = true; prize.replaceChildren(); prize.setAttribute("opacity", "0"); prizeAt = null;
    fx = 205 + Math.random() * 120;
    set("cast", "Wait…", "Splash! Now wait for a bite…");
  }
  function wait() {
    splash();
    set("wait", "Wait…", "Waiting for a bite… don't reel in too early!");
    timer = setTimeout(bite, 1500 + Math.random() * 3500);
  }
  function bite() {
    navigator.vibrate?.(70);
    splash();
    set("bite", "🎣 Reel in!", "It's biting — reel in, quick!");
    timer = setTimeout(() => { set("idle", "🎣 Cast", "It got away… 🫧 Try again!"); }, 1400);
  }
  function early() {
    clearTimeout(timer);
    set("early", "Wait…", "Too early — you scared it away! 🐟💨", true);
    timer = setTimeout(() => set("idle", "🎣 Cast", "Cast again!"), 1300);
  }
  async function reel() {
    clearTimeout(timer);
    set("reel", "Reeling in…", "Reeling in… what is it?", true);
    let c;
    try { [c] = await Promise.all([db.fishTino(), new Promise((r) => setTimeout(r, 900))]); }
    catch (err) { toast(`⚠️ The line snapped (${/fish_tino|schema cache|does not exist/i.test(err.message) ? "Tony needs to run supabase/20_fishing.sql" : err.message})`); set("idle", "🎣 Cast", "Cast again!"); return; }
    if (stopped) return;
    show(c);
  }
  function show(c) {
    // la prise, tout de suite (les données arrivent aussi par le temps réel)
    S.catches = [c, ...S.catches.filter((x) => x.id !== c.id)];
    lastCatch = c.id;
    if (c.kind === "color") S.color = c;
    if (c.kind === "outfit") { const o = S.outfits.find((x) => x.id === c.outfit); if (o) { o.caughtAt = c.at; o.caughtBy = c.by; } outfitChangedHere = true; }
    if (c.kind === "color") outfitChangedHere = true; // (images du widget refaites tout de suite)
    fishingChanged(false);
    loadOutfits(); loadCatches();
    const o = c.kind === "outfit" ? S.outfits.find((x) => x.id === c.outfit) : null, limited = (o?.rarity ?? 1) > 1 ? o.rarity : 0; // (27 : édition limitée)
    const NS = "http://www.w3.org/2000/svg";
    const picture = o && (o.anim ? outfitDataUrl(o) : outfitUrl(o)); // (tenue animée : sa première image, pas la planche)
    if (c.kind === "outfit" && o) {
      const im = document.createElementNS(NS, "image");
      im.setAttribute("x", "-16"); im.setAttribute("y", "-30"); im.setAttribute("width", "32"); im.setAttribute("height", "32");
      picture.then((u) => im.setAttribute("href", u)).catch(() => {});
      prize.append(im);
    } else {
      const tx = document.createElementNS(NS, "text");
      tx.setAttribute("text-anchor", "middle"); tx.setAttribute("font-size", "20"); tx.setAttribute("y", "-4");
      tx.textContent = c.kind === "color" ? "🎨" : (JUNK[c.junk] ?? ["🫧"])[0];
      prize.append(tx);
    }
    prize.setAttribute("opacity", "1");
    const until = c.until ? new Date(c.until) : null;
    out.innerHTML = c.kind === "outfit"
      ? `<div class="mp-fish-got">${o ? `<img alt="" class="mp-fish-img">` : "👒"}<span>${limited ? `<b class="mp-rare">✨ LIMITED EDITION (1 in ${limited})!</b> ` : ""}You caught <b>“${esc(catchName(c))}”</b>! You can both dress Tino with it until <b>${untilText(until)}</b>.</span></div>
         ${o ? `<button type="button" class="mp-cta" data-puton>👒 Put it on Tino</button>` : ""}`
      : c.kind === "color"
        ? `<div class="mp-fish-got"><span class="mp-swatch mp-swatch-big" style="background:${furOf(c.color).fill}"></span><span>A new colour! Tino wears it for <b>30 minutes</b> (until ${hourOf(until)}) — for both of you.</span></div>`
        : `<div class="mp-fish-got"><span class="mp-fish-emoji">${(JUNK[c.junk] ?? ["🫧"])[0]}</span><span>${(JUNK[c.junk] ?? ["", "Something odd"])[1].replace(/^./, (x) => x.toUpperCase())}… Try again!</span></div>`;
    out.hidden = false;
    if (o) picture.then((u) => { const im = out.querySelector(".mp-fish-img"); if (im) im.src = u; }).catch(() => {});
    out.querySelector("[data-puton]")?.addEventListener("click", async (ev) => {
      ev.target.disabled = true;
      if (await guard(() => db.wearOutfit(o.layer, o.id), "Couldn't change Tino's outfit")) { outfitChangedHere = true; await loadOutfits(); toast(`👒 Tino is wearing “${o.name}”!`); }
    });
    const fish = c.kind === "junk" && FISH[c.junk]; // un poisson : bonne nouvelle (de quoi nourrir Tino)
    if (fish) {
      out.innerHTML = `<div class="mp-fish-got"><span class="mp-fish-emoji">${fish[0]}</span><span>${fish[1].replace(/^./, (x) => x.toUpperCase())}! ${S.feedingOk === true ? `It goes in Tino's bucket (+${BELLY.gain[c.junk]} for his tummy).` : ""}</span></div>
        ${S.feedingOk === true ? `<button type="button" class="mp-cta" data-feednow>🍳 Cook it and feed Tino</button>` : ""}`;
      out._eater = () => m;
      out.querySelector("[data-feednow]")?.addEventListener("click", (ev) => { ev.target.disabled = true; feedTino(c.junk, out); });
    }
    if (c.kind === "junk" && !fish) m.say(c.junk === "boot" ? "A boot… again? 😑" : c.junk === "crab" ? "Ouch! 🦀" : "Hmm… 🤔", { ms: 2400 });
    else { m.now([{ type: "react" }, { type: "sit", dur: Infinity }]); m.love(); if (fish) m.say(c.junk === "golden_fish" ? "A GOLDEN fish!! ✨" : "A fish! Yum 🐟", { ms: 2400 }); else if (limited) m.say("A limited edition!! ✨", { ms: 2600 }); }
    set("done", "🎣 Cast again", c.kind === "junk" && !fish ? "Not this time." : limited ? "WOW — a limited edition! 🎉✨" : "Nice catch! 🎉");
  }
  btn.addEventListener("click", () => {
    if (state === "idle" || state === "done") cast();
    else if (state === "cast" || state === "wait") early();
    else if (state === "bite") reel();
  });
  return {
    dress,
    m, // (le Tino de la scène : il mange quand on le nourrit d'ici)
    busy: () => ["cast", "wait", "bite", "reel"].includes(state),
    stop() { stopped = true; clearTimeout(timer); host.replaceChildren(); }, // (le Tino de la scène s'arrête avec)
  };
}

// ---------- Nourrir Tino (supabase/21_feeding.sql) ----------
// Avec les poissons pêchés (pas les crabes ni le reste). Ventre commun aux deux, qui se vide tout seul avec le temps ; trois
// niveaux — rassasié, petit creux, très faim — et nos phrases pour chacun (Tino les dit de temps en temps : mascot.js, belly).
// ⚠️ Mêmes nombres que dans 21_feeding.sql (et data-mock.js) : 100 → 0 en 24 h ; poissons +25 / +45 / +100 ;
// rassasié ≥ 66, petit creux 33 – 66, très faim < 33 ; plus de repas à partir de 95.
const BELLY = { perDay: 300, // (25_faster_needs.sql : vide en 8 h → à nourrir ~3 fois par jour ; avant 100 = 24 h)
   gain: { fish: 25, big_fish: 45, golden_fish: 100 }, full: 66, peckish: 33, max: 95 };
const FISH = { fish: ["🐟", "a fish", "Fish"], big_fish: ["🐠", "a big fish", "Big fish"], golden_fish: ["✨🐟", "a golden fish", "Golden fish"] };
const LEVELS = { full: ["😋", "Full"], peckish: ["🙂", "A little peckish"], hungry: ["🥺", "Very hungry"] };
const DEFAULT_HUNGER = (P) => ({
  full: ["I'm so full 😋", "That fish was delicious! 🐟", "Yum yum 💕", "*happy tummy pat*"],
  peckish: ["I could eat a little fish… 🐟", "A snack would be nice 🍤", "Is it fishing time? 🎣"],
  hungry: ["I'm SO hungry… 🥺", "Feed me please! 🐟🐟", "My tummy is rumbling 😩", `${P?.label ?? "Someone"}, go fishing for me! 🎣`],
});
let unsubFeeding = null, feedSeen = null, tummyTimer = 0, feedingNow = false;
const bellyNow = () => { const b = S.feeding?.belly; return b ? Math.max(0, b.fill - (BELLY.perDay * (Date.now() - Date.parse(b.at))) / 86400e3) : null; };
const bellyLevel = (v) => (v >= BELLY.full ? "full" : v >= BELLY.peckish ? "peckish" : "hungry");
const hungerLines = (level) => { const own = S.hungerLines.filter((l) => l.level === level).map((l) => l.body); return own.length ? own : DEFAULT_HUNGER(S.partner)[level]; };
// Pour mascot.js : son niveau de faim et ses phrases (null sans 21 : il ne parle pas de faim)
const bellyInfo = () => { const v = S.feedingOk === true ? bellyNow() : null; if (v == null) return null; const level = bellyLevel(v); return { level, lines: hungerLines(level) }; };
async function loadFeeding() {
  if (!S.user) return;
  try {
    const [f, lines] = await Promise.all([db.listFeeding(), db.listHungerLines()]);
    S.feeding = f; S.hungerLines = lines; S.feedingOk = true; store.set("feeding." + S.user.id, { f, lines });
  } catch (err) {
    if (/does not exist|schema cache|tino_belly|tino_hunger|feed_tino|eaten_at/i.test(err.message)) { S.feedingOk = false; S.feeding = null; S.hungerLines = []; }
    else { const r = store.get("feeding." + S.user.id, null); if (r) { S.feeding = r.f; S.hungerLines = r.lines; S.feedingOk = true; } } // hors ligne
  }
  // L'autre vient de nourrir Tino (pas au démarrage ; repère = date du dernier repas vu) : on le dit, le petit Tino mange aussi
  const b = S.feeding?.belly;
  if (b?.at && feedSeen !== null && newerThan(b.at, feedSeen) && b.by && b.by !== S.user.id && S.partner) {
    toast(`🍽 ${S.partner.mark} ${S.partner.label} fed Tino ${b.burnt ? "a burnt fish 😖" : `${FISH[b.fish]?.[1] ?? "a fish"} ${FISH[b.fish]?.[0] ?? "🐟"}`}`);
    mascots?.eat(b.fish, { cooked: true, burnt: !!b.burnt });
  }
  if (b?.at && (feedSeen === null || newerThan(b.at, feedSeen))) feedSeen = b.at;
  else if (feedSeen === null) feedSeen = "";
  feedingChanged();
}
// La jauge et le seau (sous le grand Tino, dans Fishing) et les phrases suivent (pas pendant qu'on tape une phrase)
function feedingChanged() {
  document.querySelectorAll(".mp-tummy").forEach((b) => { if (!b.classList.contains("mp-cooking")) fillTummy(b); }); // (pas pendant une cuisson)
  const h = document.querySelector(".mp-hunger");
  if (h && ![...h.querySelectorAll("input")].some((i) => i.value)) fillHungerLines(h);
}
// La jauge de faim + les poissons du seau (un bouton « Feed » par sorte) ; box._eater() = le Tino qui mange à l'écran
function fillTummy(box) {
  if (!box) return;
  clearTimeout(tummyTimer);
  if (S.feedingOk === false) { box.innerHTML = `<div class="pl-legend">🍽 Feeding Tino isn't set up yet — Tony needs to run <code>supabase/21_feeding.sql</code>.</div>`; return; }
  if (S.feedingOk !== true || !S.feeding) { box.innerHTML = ""; return; }
  const v = bellyNow() ?? 0, level = bellyLevel(v), [emo, label] = LEVELS[level], n = S.feeding.fish ?? {}, full = v >= BELLY.max;
  box.innerHTML = `<div class="mp-tummy-head"><span>${emo} Tino's tummy: <b>${label}</b></span><span class="pl-legend">${Math.round(v)}%</span></div>
    <div class="mp-tummy-bar mp-${level}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(v)}" aria-label="Tino's tummy"><i style="width:${v.toFixed(1)}%"></i></div>
    <span class="mp-row mp-tummy-fish">${Object.entries(FISH).map(([k, [e, , name]]) => `<button type="button" data-feed="${k}" ${!n[k] || full || feedingNow ? "disabled" : ""} title="Feed Tino ${name.toLowerCase()} (+${BELLY.gain[k]})">${e} ×${n[k] ?? 0} · 🍳 Cook & feed</button>`).join("")}</span>
    <div class="pl-legend">${full ? "He's full — he can eat again a little later. " : ""}Catch fish in 🎣 Fishing to feed him (🦀 crabs and 🥾 boots aren't food). His tummy empties in about 8 hours — feed him about 3 times a day.</div>`;
  box.querySelectorAll("[data-feed]").forEach((b) => b.addEventListener("click", () => feedTino(b.dataset.feed, box)));
  tummyTimer = setTimeout(() => document.querySelectorAll(".mp-tummy").forEach((x) => fillTummy(x)), 60000); // (la jauge baisse toute seule)
}
// On cuit le poisson avant de le donner (24_cooking.sql) : une poêle sur le feu, le poisson grésille et dore (~2,8 s) ;
// 1 fois sur 10 la fumée le grille et il devient noir (tirage fait par la base, pendant la cuisson) — Tino le mange quand
// même, en grimaçant (il nourrit deux fois moins)
const COOK_MS = 2800;
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
async function feedTino(kind, box) {
  if (feedingNow) return;
  if (!navigator.onLine) { toast("📴 You're offline — try again once you're back online."); return; }
  feedingNow = true;
  document.querySelectorAll("[data-feed]").forEach((b) => { b.disabled = true; });
  const pan = document.createElement("div");
  pan.className = "mp-cook";
  pan.innerHTML = `<svg viewBox="0 0 140 78" aria-hidden="true">
      <g class="mp-smoke">${[[56, 22], [70, 16], [84, 22], [64, 10], [78, 8]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${5 + (i % 3)}" style="animation-delay:${i * 0.25}s"/>`).join("")}</g>
      <g class="mp-flames">${[48, 62, 76, 90].map((x) => `<path d="M${x} 76Q${x - 6} 66 ${x} 58Q${x + 6} 66 ${x} 76Z"/>`).join("")}</g>
      <path d="M118 49L138 42" stroke="#555a66" stroke-width="5" stroke-linecap="round"/>
      <ellipse cx="70" cy="52" rx="50" ry="9" fill="#3b3f4a"/><path d="M20 50Q22 62 70 62Q118 62 120 50Z" fill="#2c2f38"/>
      <g class="mp-cook-fish"><path d="M88 46L98 39V53Z"/><ellipse cx="68" cy="46" rx="22" ry="8"/><circle cx="54" cy="44.5" r="1.8" fill="#2f3038"/></g>
    </svg><span class="mp-cook-msg">🍳 Cooking ${FISH[kind][1]}… it sizzles!</span>`;
  box?.classList.add("mp-cooking");
  box?.append(pan);
  let r = null;
  try { [r] = await Promise.all([db.feedTino(kind), sleepMs(COOK_MS)]); }
  catch (err) { toast(/tino is full/i.test(err.message) ? "😋 Tino is full — try again a bit later" : /no fish left/i.test(err.message) ? "🪣 No fish like that left — go fishing!" : `⚠️ Couldn't feed Tino (${err.message})`); }
  if (r) {
    pan.classList.add(r.burnt ? "mp-burnt" : "mp-cooked");
    pan.querySelector(".mp-cook-msg").textContent = r.burnt ? "💨 Oh no! The smoke grilled it — it's all black…" : "✨ Nicely cooked!";
    await sleepMs(1400);
  }
  pan.remove();
  box?.classList.remove("mp-cooking");
  feedingNow = false;
  if (r) {
    S.feeding.belly = r; S.feeding.fish[kind] = Math.max(0, (S.feeding.fish[kind] ?? 1) - 1); feedSeen = r.at;
    const meal = { type: "eat", fish: kind, cooked: true, burnt: !!r.burnt }, eater = box?._eater?.();
    eater?.now([meal]);
    if (r.burnt) setTimeout(() => eater?.say("Bleh… burnt! 😖", { ms: 2600 }), 3500);
    if (currentTab() === "calendar") mascots?.eat(kind, { cooked: true, burnt: !!r.burnt });
    toast(r.burnt ? `😖 Tino ate the burnt fish anyway… (half as filling)` : `😋 Yum! Tino ate ${FISH[kind][1]}, nicely cooked ${FISH[kind][0]}`);
  }
  feedingChanged();
  loadFeeding();
}
// Ce que Tino dit selon sa faim : nos phrases par niveau (liste commune), sinon ses phrases par défaut
function fillHungerLines(box) {
  if (!box) return;
  if (S.feedingOk === false) { box.innerHTML = `<div class="pl-legend">Hunger lines aren't available yet — Tony needs to run <code>supabase/21_feeding.sql</code>.</div>`; return; }
  const who = (l) => (l.by === S.user.id ? S.me : S.partner), def = DEFAULT_HUNGER(S.partner);
  box.innerHTML = `<div class="pl-legend">What Tino says now and then, depending on his tummy: full (${BELLY.full}% and up), a little peckish (${BELLY.peckish}–${BELLY.full}%), very hungry (under ${BELLY.peckish}%) — more often when he's very hungry. Shared by both of you.</div>`
    + Object.entries(LEVELS).map(([lv, [e, label]]) => {
      const own = S.hungerLines.filter((l) => l.level === lv);
      return `<div class="pl-sub">${e} ${label}</div>
        <div class="mp-lines">${own.length ? own.map((l) => `<div class="mp-line"><span class="mp-line-who" title="${esc(who(l)?.label ?? "")}">${esc(who(l)?.mark ?? "•")}</span><span class="mp-line-text">${esc(l.body)}</span><button type="button" data-hdel="${l.id}" title="Remove this line">✕</button></div>`).join("")
          : `<div class="pl-legend">None yet — Tino says: ${def[lv].map(esc).join(" · ")}</div>`}</div>
        <div class="mp-row mp-lineadd"><input type="text" data-hlevel="${lv}" maxlength="120" placeholder="Something Tino says when he's ${label.toLowerCase()}…" enterkeyhint="done"><button type="button" data-hadd="${lv}">Add</button></div>`;
    }).join("");
  box.querySelectorAll("[data-hdel]").forEach((b) => b.addEventListener("click", async () => {
    if (await guard(() => db.deleteHungerLine(+b.dataset.hdel), "Couldn't remove the line")) loadFeeding();
  }));
  const add = async (lv) => {
    const field = box.querySelector(`[data-hlevel="${lv}"]`), text = field.value.trim();
    if (!text) return;
    if (await guard(() => db.addHungerLine(lv, text), "Couldn't add the line")) { field.value = ""; await loadFeeding(); box.querySelector(`[data-hlevel="${lv}"]`)?.focus(); }
  };
  box.querySelectorAll("[data-hadd]").forEach((b) => b.addEventListener("click", () => add(b.dataset.hadd)));
  box.querySelectorAll("[data-hlevel]").forEach((f) => f.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); add(f.dataset.hlevel); } }));
}

// ---------- Laver Tino (supabase/23_bath.sql) ----------
// Il se salit au fil du temps (taches de boue sur lui, partout : calendrier, grand Tino, bouton d'onglet) ; on le lave dans
// l'onglet Tino, sous sa faim : « 🧽 Give him a bath » → une baignoire sous le grand Tino, on tape sur lui pour le frotter
// (SCRUBS fois) → il est propre ET sa couleur pêchée s'en va (wash_tino). Commun aux deux, comme sa faim.
// ⚠️ Mêmes nombres que dans 23_bath.sql : de propre (0) à très sale (100) en 24 h ; propre < 33, un peu sale < 66.
const BATH = { perDay: 200, clean: 33, dirty: 66 }, SCRUBS = 6; // (très sale après 12 h → à laver 2 fois par jour ; avant 100 = 24 h)
const DIRT = { clean: ["✨", "Clean"], grubby: ["😐", "A bit dirty"], dirty: ["🙈", "Very dirty"] };
let unsubBath = null, bathSeen = null, dirtTimer = 0, bathing = null;
const dirtNow = () => (S.bathOk === true && S.bath?.at ? Math.min(100, (BATH.perDay * (Date.now() - Date.parse(S.bath.at))) / 86400e3) : 0);
const dirtLevel = (v) => (v < BATH.clean ? "clean" : v < BATH.dirty ? "grubby" : "dirty");
const dirtOpacity = (v) => (v < 8 ? 0 : Math.min(0.9, 0.15 + 0.75 * (v / 100)));
// Les taches de Tino (variable --ms-dirt sur <html>, comme la couleur) ; se refait toutes les minutes (il se salit)
function applyDirt() {
  clearTimeout(dirtTimer);
  const o = dirtOpacity(dirtNow()), r = document.documentElement.style;
  if (o) r.setProperty("--ms-dirt", o.toFixed(2)); else r.removeProperty("--ms-dirt");
  if (S.bathOk === true) dirtTimer = setTimeout(() => { applyDirt(); document.querySelectorAll(".mp-bath").forEach((b) => { if (!bathing) fillBath(b); }); }, 60000);
}
async function loadBath() {
  if (!S.user) return;
  try { S.bath = await db.getBath(); S.bathOk = true; store.set("bath." + S.user.id, S.bath); }
  catch (err) {
    if (/does not exist|schema cache|tino_bath|wash_tino/i.test(err.message)) { S.bathOk = false; S.bath = null; }
    else { const r = store.get("bath." + S.user.id, null); if (r) { S.bath = r; S.bathOk = true; } } // hors ligne
  }
  const b = S.bath; // l'autre vient de le laver (pas au démarrage) : on le dit
  if (b?.at && bathSeen !== null && b.at !== bathSeen && b.by && b.by !== S.user.id && S.partner) toast(`🛁 ${S.partner.mark} ${S.partner.label} gave Tino a bath — he's squeaky clean ✨`);
  bathSeen = b?.at ?? "";
  applyDirt();
  if (!bathing) document.querySelectorAll(".mp-bath").forEach((x) => fillBath(x));
}
function fillBath(box) {
  if (!box) return;
  if (S.bathOk === false) { box.innerHTML = `<div class="pl-legend">🛁 Bath time isn't set up yet — Tony needs to run <code>supabase/23_bath.sql</code>.</div>`; return; }
  if (S.bathOk !== true) { box.innerHTML = ""; return; }
  const v = dirtNow(), level = dirtLevel(v), [emo, label] = DIRT[level], clean = 100 - v;
  box.innerHTML = `<div class="mp-tummy-head"><span>${emo} Cleanliness: <b>${label}</b></span><span class="pl-legend">${Math.round(clean)}%</span></div>
    <div class="mp-tummy-bar mp-bath-bar mp-${level}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(clean)}" aria-label="Tino's cleanliness"><i style="width:${clean.toFixed(1)}%"></i></div>
    <span class="mp-row"><button type="button" data-bath>🧽 Give him a bath</button></span>
    <div class="pl-legend">He gets dirty in about 12 hours — give him a bath twice a day. A bath also washes off his colour${colorNow() ? " (the one he has now!)" : ""}.</div>`;
  box.querySelector("[data-bath]").addEventListener("click", () => startBath(box));
}
// Le bain (sans baignoire : demande de Tony) : chaque toucher sur le grand Tino le frotte au savon (mousse, il fait « boing »), ses taches
// pâlissent ; au bout de SCRUBS, il est lavé pour de vrai (wash_tino)
function startBath(box) {
  const sc = showcase;
  if (!sc?.card.isConnected || bathing) return;
  if (!navigator.onLine) { toast("📴 You're offline — try again once you're back online."); return; }
  const stage = sc.card.querySelector(".mp-show-stage"), dirt0 = dirtOpacity(dirtNow());
  let n = 0, done = false;
  sc.card.classList.add("mp-bathing");
  const say = (t) => { const b = box.querySelector(".mp-bath-msg") ?? box.appendChild(Object.assign(document.createElement("div"), { className: "pl-legend mp-bath-msg" })); b.textContent = t; };
  box.querySelector("[data-bath]").disabled = true;
  say(`🧼 Tap Tino to rub the soap on him! (0/${SCRUBS})`);
  const end = () => { stage.removeEventListener("click", scrub, true); stage.querySelectorAll(".mp-foam-stick, .mp-soap").forEach((f) => f.remove()); sc.card.classList.remove("mp-bathing"); sc.card.style.removeProperty("--ms-dirt"); bathing = null; };
  async function scrub(ev) {
    ev.stopPropagation(); ev.preventDefault(); // (pas le saut / la colère du toucher habituel)
    if (done) return;
    n++;
    const r = stage.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    // le savon : il apparaît là où on touche et frotte (va-et-vient), puis s'en va
    const soap = document.createElement("i");
    soap.className = "mp-soap";
    soap.style.left = `${x}px`; soap.style.top = `${y}px`;
    stage.append(soap);
    setTimeout(() => soap.remove(), 900);
    // la mousse : elle reste collée sur lui (jusqu'au rinçage) ; quelques bulles s'envolent
    for (let i = 0; i < 6; i++) {
      const f = document.createElement("i"), stick = i < 4;
      f.className = stick ? "mp-foam mp-foam-stick" : "mp-foam";
      f.style.left = `${x + (Math.random() - 0.5) * (stick ? 34 : 50)}px`; f.style.top = `${y + (Math.random() - 0.5) * (stick ? 24 : 30)}px`;
      f.style.setProperty("--d", `${0.5 + Math.random() * 0.6}s`); f.style.width = f.style.height = `${(stick ? 10 : 7) + Math.random() * 12}px`;
      stage.append(f);
      if (!stick) setTimeout(() => f.remove(), 1300);
    }
    sc.m.flat = 0.45; sc.m.flatV = 0; // (il fait « boing » sous la brosse)
    sc.card.style.setProperty("--ms-dirt", (dirt0 * (1 - n / SCRUBS)).toFixed(2)); // ses taches pâlissent
    say(n < SCRUBS ? `🧼 Scrub scrub… (${n}/${SCRUBS})` : "🚿 Rinsing…");
    if (n < SCRUBS) return;
    done = true;
    // rinçage : des gouttes tombent, la mousse s'en va
    for (let i = 0; i < 14; i++) {
      const d = document.createElement("i");
      d.className = "mp-drop";
      d.style.left = `${r.width / 2 + (Math.random() - 0.5) * 120}px`; d.style.animationDelay = `${Math.random() * 0.6}s`;
      stage.append(d);
      setTimeout(() => d.remove(), 1600);
    }
    stage.querySelectorAll(".mp-foam-stick").forEach((f) => f.classList.add("mp-rinse"));
    await sleepMs(900);
    let w = null;
    try { w = await db.washTino(); }
    catch (err) { toast(/wash_tino|schema cache|does not exist/i.test(err.message) ? "⚠️ Tony needs to run supabase/23_bath.sql" : `⚠️ Couldn't give Tino a bath (${err.message})`); }
    end();
    if (w) {
      S.bath = { at: w.at, by: w.by }; bathSeen = w.at;
      if (w.washedColour && S.color) S.color = { ...S.color, until: new Date().toISOString() };
      applyDirt(); applyColor(); outfitChangedHere = true; fishingChanged(false);
      sc.m.love(); sc.m.now([{ type: "wave", dur: 2 }]);
      toast(`🛁 Tino is squeaky clean! ✨${w.washedColour ? " His colour washed off too." : ""}`);
      loadCatches();
    }
    fillBath(box);
  }
  stage.addEventListener("click", scrub, true);
  bathing = { end };
}

// ---------- La marmite et PeoPeo (présence en direct, sans SQL) ----------
// À côté du mois, à la place de la case « MeoMeo » : une marmite dorée (casserole coréenne à ramyeon / tteokbokki) où PeoPeo
// (et MeoMeo, plus tard) vit. Celui qui a MeoPeo ouvert à l'écran en ce moment y est : sa tête sort et guette (endormie la
// nuit) ; de temps en temps il saute dehors, se promène sur le calendrier, poursuit Tino… puis y retourne (mascot.js, « peo »,
// homeTick). Absent : il reste dans la marmite, endormi (setDream). Quand il est dans la marmite (là ou pas), Tino le fait
// souvent mijoter : il touille
// avec une louche et attise le feu sous la marmite avec un éventail (mascot.js, « stir » ; dessin ici : potFx). Toucher la
// marmite = afficher / cacher les tâches de l'autre (comme la case d'avant).
let presenceCh = null;
const personId = (label) => [S.me, S.partner].find((p) => p?.label === label)?.id ?? null;
const isHere = (id) => !!id && (id === S.user?.id ? !document.hidden : S.online.has(id));
// MeoMeo et PeoPeo ont l'app ouverte en même temps : les deux téléphones montrent les mêmes actions au même moment (mascot.js,
// « ensemble ») et Tino reste éveillé, même la nuit
const bothHere = () => isHere(personId("PeoPeo")) && isHere(personId("MeoMeo"));
// (sa tête sort de la marmite ; pas là : il y dort toujours)
const peoUp = () => (mascots ? peoDream() || mascots.inPot("peo") : true);
const peoDream = () => !isHere(personId("PeoPeo"));
function potButton() {
  const P = S.partner;
  // repère 64 × 60 (y de −8 à 52) ; bord de la marmite : ellipse de centre (32, 24), 26 × 5 ; l'arrière du bord est dessiné
  // derrière la tête, l'avant devant ; la tête est coupée sous le bord avant (clipPath) : elle est DANS la marmite
  return `<button type="button" class="pl-toggle mp-pot${potState ? " mp-pot-hot" : ""}${potState === "fan" ? " mp-pot-fan" : ""}" aria-pressed="${UI.showPartner}" title="${UI.showPartner ? "Hide" : "Show"} ${esc(P.label)}'s tasks on the calendar">
    <svg class="mp-pot-art" viewBox="0 -8 64 60" aria-hidden="true">
      <defs>
        <linearGradient id="mp-pot-gold" x1="0" x2="1"><stop offset="0" stop-color="#b9821c"/><stop offset="0.3" stop-color="#f7d675"/><stop offset="0.55" stop-color="#e5ae3e"/><stop offset="1" stop-color="#a86f14"/></linearGradient>
        <clipPath id="mp-pot-clip"><path d="M-20 -30H84V24H58Q32 34 6 24H-20Z"/></clipPath>
      </defs>
      <ellipse cx="32" cy="49" rx="23" ry="2.4" fill="#000" opacity="0.18"/>
      <g class="mp-pot-fire"><g class="mp-flame"><path d="M6 53Q-1 44 4 33Q6.5 41 8.5 42Q8 35 11.5 30Q16 41 15 53Z" fill="#ff7a1a"/><path d="M7 53Q3.5 47 6.5 41Q8 46 10 47Q11 51 10.5 53Z" fill="#ffd34a"/></g><g class="mp-flame"><path d="M22 53Q18 44 24 35Q25 43 28 44Q28 37 32 32Q37 42 35 47Q38 44 39 40Q44 47 40 53Z" fill="#ff6a14"/><path d="M25 53Q23 47 27 42Q28 47 31 47Q31 43 33 40Q36 47 34 53Z" fill="#ffc93a"/></g><g class="mp-flame"><path d="M58 53Q65 44 60 33Q57.5 41 55.5 42Q56 35 52.5 30Q48 41 49 53Z" fill="#ff7a1a"/><path d="M57 53Q60.5 47 57.5 41Q56 46 54 47Q53 51 53.5 53Z" fill="#ffd34a"/></g><g class="mp-pot-sparks" fill="#ffd96a"><circle cx="16" cy="44" r="0.9"/><circle cx="33" cy="40" r="1"/><circle cx="47" cy="43" r="0.8"/></g></g>
      <ellipse cx="32" cy="24" rx="26" ry="5" fill="#6e4a10"/>
      <ellipse class="mp-pot-broth" cx="32" cy="24.6" rx="24.5" ry="4.2" fill="#d4502a"/>
      <path d="M6 24Q32 14 58 24" fill="none" stroke="#c99230" stroke-width="2.4"/>
      <g clip-path="url(#mp-pot-clip)"><g class="mp-pot-peo${peoUp() ? " mp-up" : ""}${peoDream() ? " mp-dream" : ""}${peoDream() || (!bothHere() && (tinoNight() || tinoNap())) ? " ms-sleep" : ""}"><g class="mp-pot-bob"><svg x="13" y="-7" width="38" height="38">${peoHeadSvg("ms-flush-peo-pot")}</svg></g></g>
        <g class="mp-pot-spoon" style="display: none"><path class="mp-spoon-stick" d="" fill="none" stroke="#9a6a3c" stroke-width="2.4" stroke-linecap="round"/><path class="mp-spoon-shine" d="" fill="none" stroke="#d9a874" stroke-width="0.8" stroke-linecap="round"/></g></g>
      <g class="mp-pot-bubbles" fill="#ff8a5c"><circle cx="14" cy="24" r="1.3"/><circle cx="48" cy="23.5" r="1.1"/><circle cx="22" cy="26" r="0.9"/></g>
      <path d="M2 25.5H7.5V29.5H2Q0 29.5 0 27.5Q0 25.5 2 25.5ZM62 25.5H56.5V29.5H62Q64 29.5 64 27.5Q64 25.5 62 25.5Z" fill="#c48a24" stroke="#8a5a10" stroke-width="1"/>
      <path d="M6 24L7.6 43Q8 47 12.5 47H51.5Q56 47 56.4 43L58 24Q32 34 6 24Z" fill="url(#mp-pot-gold)" stroke="#8a5a10" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M7 31Q32 40 57 31" fill="none" stroke="#a8721a" stroke-width="1.1"/>
      <g fill="#fff3c4" opacity="0.55"><ellipse cx="17" cy="37" rx="1.6" ry="1.1"/><ellipse cx="24" cy="42" rx="1.4" ry="1"/><ellipse cx="21" cy="34.5" rx="1.2" ry="0.8"/></g>
      <g fill="#8a5a10" opacity="0.25"><ellipse cx="44" cy="38" rx="1.6" ry="1.1"/><ellipse cx="50" cy="42" rx="1.3" ry="0.9"/><ellipse cx="38" cy="43" rx="1.2" ry="0.8"/></g>
      <path d="M6 24Q32 34 58 24" fill="none" stroke="#fbe08a" stroke-width="2.4" stroke-linecap="round"/>
      <g class="mp-pot-logs"><rect x="14" y="48.6" width="36" height="3.6" rx="1.8" fill="#7a4a26" stroke="#4f2d14" stroke-width="0.8" transform="rotate(-4 32 50)"/><rect x="15" y="49" width="34" height="3.4" rx="1.7" fill="#8e5a30" stroke="#4f2d14" stroke-width="0.8" transform="rotate(5 32 50)"/><ellipse cx="32" cy="50.5" rx="9" ry="1.4" fill="#ff9a3c" opacity="0.85"/></g>
      <g class="mp-pot-steam" fill="none" stroke="#f3f5ff" stroke-width="1.5" stroke-linecap="round"><path d="M18 18Q15 13 18 9Q21 5 18 1"/><path d="M45 17Q48 12 45 8Q42 4 45 0"/></g>
    </svg><span class="mp-pot-label">${esc(P.mark)} ${esc(P.label)}</span></button>`;
}
// Le bord de la marmite (coordonnées de la page) : là où PeoPeo saute dehors et revient ; null si elle n'est pas affichée
function potSpot() {
  if (currentTab() !== "calendar") return null;
  const art = root?.querySelector(".mp-pot .mp-pot-art"), r = art?.getBoundingClientRect();
  if (!r?.width) return null;
  const M = art.getScreenCTM(); // (repère de la marmite → écran : fond y = 47, flancs x = 6 et 58)
  return { x: r.left + scrollX + r.width / 2, y: r.top + scrollY + r.height * (32 / 60), bottom: (M ? M.d * 47 + M.f : r.bottom) + scrollY, half: M ? Math.abs(M.a) * 26 : r.width * 0.4 };
}
// Tino fait mijoter PeoPeo (mascot.js, action « stir » ; PeoPeo dans la marmite) : feu sous la marmite (plus
// grand quand il l'attise à l'éventail), bouillon qui frémit, vapeur ; la louche part du bouillon et finit dans sa nageoire
// (mesurée à chaque image, comme la canne à pêche) ; la tête de PeoPeo est un peu remuée. potState = ce que dessine
// potButton() quand le calendrier est refait. Sans nouvelles pendant 0,5 s (animation arrêtée) : tout s'éteint.
let potState = null, potOff = 0;
function potFx(st) {
  clearTimeout(potOff);
  const mode = st && st.mode !== "walk" ? st.mode : null; // (en chemin : pas encore de feu)
  if (mode !== potState) {
    potState = mode;
    document.querySelectorAll(".mp-pot").forEach((b) => { b.classList.toggle("mp-pot-hot", !!mode); b.classList.toggle("mp-pot-fan", mode === "fan"); });
  }
  const art = root?.querySelector(".mp-pot .mp-pot-art"), spoon = art?.querySelector(".mp-pot-spoon"), bob = art?.querySelector(".mp-pot-bob");
  const stir = mode === "stir" && st.paw ? st : null;
  if (bob) bob.setAttribute("transform", stir ? `rotate(${(4 * Math.sin(stir.phase)).toFixed(2)} 32 30) translate(${(1.2 * Math.cos(stir.phase)).toFixed(2)} 0)` : "");
  let drawn = false;
  if (stir && spoon) {
    const r = stir.paw.getBoundingClientRect(), M = art.getScreenCTM()?.inverse();
    if (M && r.width) {
      const P = new DOMPoint(r.left + r.width / 2, r.top + r.height / 2).matrixTransform(M);
      const sx = 32 + stir.side * (8 + 4 * Math.cos(stir.phase)), sy = 31 + 1.5 * Math.sin(stir.phase); // (le bout dans le bouillon, caché par le bord avant)
      const d = `M${sx.toFixed(1)} ${sy.toFixed(1)}L${P.x.toFixed(1)} ${P.y.toFixed(1)}`;
      spoon.querySelector(".mp-spoon-stick").setAttribute("d", d);
      spoon.querySelector(".mp-spoon-shine").setAttribute("d", d);
      drawn = true;
    }
  }
  if (spoon) spoon.style.display = drawn ? "" : "none";
  if (st) potOff = setTimeout(() => potFx(null), 500);
}
// Quelqu'un arrive ou s'en va, PeoPeo sort de la marmite ou y retourne, la nuit tombe : la tête dans la marmite suit (sans
// redessiner le calendrier)
function presenceChanged() {
  mascots?.setDream("peo", peoDream()); // (pas là : il reste dans la marmite, endormi)
  const up = peoUp(), dream = peoDream(), asleep = dream || (!bothHere() && (tinoNight() || tinoNap()));
  document.querySelectorAll(".mp-pot-peo").forEach((g) => { g.classList.toggle("mp-up", up); g.classList.toggle("mp-dream", dream); g.classList.toggle("ms-sleep", asleep); });
}
setInterval(() => { if (!document.hidden) presenceChanged(); }, 60000); // (la nuit tombe : il s'endort dans la marmite)

// Version qui tourne sur cet appareil = celle du cache du service worker (« meopeo-2026-10-07.8 », voir sw.js) : pour savoir
// si un téléphone a bien reçu une nouvelle version. Sans service worker (PC de test) : « test (no offline copy) ».
// Une nouvelle version installée pendant que la page tourne ne s'affiche qu'après un rechargement : on le dit.
let swUpdated = false;
navigator.serviceWorker?.addEventListener("controllerchange", () => { swUpdated = true; });
// Notification touchée alors que l'app était déjà ouverte : aller à l'onglet qu'elle indique (sw.js, « ./#notes »)
navigator.serviceWorker?.addEventListener("message", (ev) => {
  if (ev.data?.type !== "meopeo-open") return;
  const hash = new URL(ev.data.url, location.href).hash;
  if (hash && hash !== location.hash) location.hash = hash;
});
async function appVersion() {
  try {
    const v = (await caches.keys()).filter((k) => k.startsWith("meopeo-")).map((k) => k.slice(7)).sort().pop();
    return v ? v + (swUpdated ? " — just installed: close and reopen MeoPeo to use it" : "") : "test (no offline copy)";
  } catch { return "?"; }
}

// ---------- Onglet ⚙ Settings : apparence (cet appareil), compte, notifications, widget, mot de passe ----------
function renderSettings(pane) {
  const P = S.partner;
  pane.innerHTML = fold("look", "🎨 Appearance", `<div class="mp-look"></div>`)
    + fold("account", `${esc(S.me.mark)} ${esc(S.me.label)}`, `<p class="mp-sub">Signed in as ${esc(S.user.email)}</p>
      <div class="pl-editor-actions"><button type="button" data-act="logout" class="mp-danger">⎋ Log out</button></div>`)
    + fold("notif", "🔔 Notifications", `<div class="mp-notif">Checking…</div>
      ${P ? `<label class="mp-check"><input type="checkbox" name="notify" ${S.me.notify_partner !== false ? "checked" : ""}> Tell me when ${esc(P.mark)} ${esc(P.label)} adds a task</label>` : ""}`)
    + fold("fishing", "🎣 Fishing", `<div class="mp-fishset"></div>`)
    + fold("widget", "📱 Home-screen widget", `<div class="mp-widgets">Checking…</div><div class="mp-tinowidget"></div><div class="mp-doodlewidget"></div><div class="mp-allwidget"></div>`)
    + fold("password", "🔑 Password", `<label>New password<input type="password" name="pw" autocomplete="new-password" minlength="6"></label>
      <label>Repeat it<input type="password" name="pw2" autocomplete="new-password" minlength="6"></label>
      <div class="pl-editor-actions"><span class="mp-grow"></span><button type="submit" class="mp-cta">Change password</button></div>`, "form")
    + `<p class="pl-legend mp-version">MeoPeo version …</p>`; // (toujours visible : pour savoir quelle version tourne sur un téléphone)
  const f = pane.querySelector("form");
  f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!f.pw.value) return;
    if (f.pw.value !== f.pw2.value) { toast("The two passwords are different"); return; }
    if (await guard(() => db.changePassword(f.pw.value), "Couldn't change the password")) { f.pw.value = f.pw2.value = ""; toast("Password changed"); }
  });
  pane.querySelector("[data-act=logout]").addEventListener("click", async () => { location.hash = ""; await logout(); });
  fillLook(pane.querySelector(".mp-look"));
  fillFishSet(pane.querySelector(".mp-fishset"));
  appVersion().then((v) => { pane.querySelector(".mp-version").textContent = `MeoPeo version ${v}`; });
  fillNotif(pane.querySelector(".mp-notif"));
  fillWidgets(pane.querySelector(".mp-widgets"));
  fillTinoWidget(pane.querySelector(".mp-tinowidget"));
  fillDoodleWidget(pane.querySelector(".mp-doodlewidget"));
  fillAllWidget(pane.querySelector(".mp-allwidget"));
  setupFolds(pane, "settings");
  pane.querySelector("[name=notify]")?.addEventListener("change", async (ev) => {
    const on = ev.target.checked;
    if (await guard(() => db.updateMyProfile({ notify_partner: on }))) { S.me.notify_partner = on; toast(on ? `You'll be told when ${P.label} adds a task` : `No more notifications for ${P.label}'s new tasks`); }
    else ev.target.checked = !on;
  });
}

// ⚙ → 🎣 Fishing : combien de temps on garde une tenue pêchée (commun aux deux, 26) et voir la réserve (cet appareil)
const OUTFIT_HOURS = [1, 3, 6, 12, 24, 48, 72, 168];
function fillFishSet(box) {
  if (!box) return;
  if (S.fishingOk !== true) { box.innerHTML = `<div class="pl-legend">Fishing isn't set up yet.</div>`; return; }
  const h = S.outfitHours, opts = OUTFIT_HOURS.includes(h) || h == null ? OUTFIT_HOURS : [...OUTFIT_HOURS, h].sort((a, b) => a - b);
  box.innerHTML = (h == null
    ? `<div class="pl-legend">👒 Caught outfits last 7 days. To choose how long, Tony needs to run <code>supabase/26_outfit_hours.sql</code>.</div>`
    : `<label>👒 Caught outfits last <select name="ohours">${opts.map((x) => `<option value="${x}"${x === h ? " selected" : ""}>${durText(x)}</option>`).join("")}</select></label>
      <div class="pl-legend">For both of you — then they go back into the pool. It also counts for outfits already caught. An outfit can also have its own duration (✏️ in 🦭 Tino → 👒 Tino's wardrobe).</div>`)
    + `<label class="mp-check"><input type="checkbox" name="showpool"${showPool() ? " checked" : ""}> Show the outfit pool (🦭 Tino → 👒 Tino's wardrobe) — to see, rename or remove the outfits you can catch</label>
    <div class="pl-legend">This device only. Off: what's in the pool stays a surprise.</div>`;
  box.querySelector("[name=ohours]")?.addEventListener("change", async (ev) => {
    const v = +ev.target.value;
    if (await guard(() => db.setOutfitHours(v), "Couldn't change it")) { S.outfitHours = v; toast(`👒 Caught outfits now last ${durText(v)}`); await loadOutfits(); fishingChanged?.(true); }
    else ev.target.value = String(S.outfitHours);
  });
  box.querySelector("[name=showpool]").addEventListener("change", (ev) => {
    store.set("showPool", ev.target.checked);
    const w = document.querySelector(".mp-wardrobe");
    if (w) fillWardrobe(w);
    toast(ev.target.checked ? "🎣 The pool is shown in Tino's wardrobe" : "🎣 The pool is hidden again");
  });
}

// ---------- Onglet 📝 Notes partagées (supabase/14_notes.sql) ----------
// Les deux lisent, écrivent et suppriment les notes partagées ; 🔒 = seulement l'auteur. L'éditeur enregistre tout seul
// (1,5 s après la dernière frappe, et en fermant) en vérifiant la version : si l'autre a modifié la note entre-temps,
// on demande laquelle garder au lieu d'écraser. Le temps réel rafraîchit la liste, jamais l'éditeur ouvert.
// Hors ligne : le texte est gardé sur l'appareil (brouillon) et enregistré à la prochaine ouverture de la note.
let unsubNotes = null, noteOpen = null;
const draftKey = (id) => "draft." + S.user.id + "." + (id ?? "new");
async function loadNotes() {
  if (!S.user) return;
  try { S.notes = await db.listNotes(); S.notesOk = true; store.set("notes." + S.user.id, S.notes); }
  catch (err) {
    if (/does not exist|schema cache/i.test(err.message)) { S.notesOk = false; S.notes = []; }
    else S.notes = store.get("notes." + S.user.id, S.notes); // hors ligne : la dernière liste
  }
  noteOpen?.refreshed();
  if (currentTab() === "notes" && document.body.classList.contains("mp-logged")) renderNotes(panes.notes);
}
// « - [ ] » / « - [x] » = case à cocher, « - » (ou « * », « • ») = puce, dans le texte des notes
const CHECK_RE = /^\s*[-*•] \[( |x|X)\] ?(.*)$/;
const BULLET_RE = /^\s*[-*•] (.*)$/;
const LIST_RE = /^\s*(?:[-*•] \[(?: |x|X)\] ?|[-*•] )/;
// Horodatage Supabase (microsecondes) plus récent qu’un autre ; illisible → « différent »
const newerThan = (a, b) => { const ms = (t) => Date.parse(String(t).replace(/(\.\d{3})\d+/, "$1")), x = ms(a), y = ms(b); return Number.isNaN(x) || Number.isNaN(y) ? a !== b : x > y; };
function renderNotes(host) {
  const P = S.partner;
  let pane = host.querySelector(".mp-notes-list");
  if (!pane) { host.innerHTML = `<div class="mp-notes-list"></div>`; pane = host.firstChild; }
  doodleCard(host); // (sous les notes ; créée une fois, jamais réécrite ici : un dessin en cours reste)
  if (S.notesOk === false) {
    pane.innerHTML = `<div class="pl-editor-card mp-pane-card mp-notes-card"><h4>📝 Notes</h4><div class="pl-legend">Shared notes aren't available yet — Tony needs to run <code>supabase/14_notes.sql</code>.</div></div>`;
    return;
  }
  const who = (id) => (id === S.user.id ? S.me : P);
  const preview = (n) => n.body.split("\n").map((l) => l.replace(CHECK_RE, (_, x, t) => (x === " " ? "☐ " : "☑ ") + t).replace(BULLET_RE, "• $1").replace(/^#{1,3} /, "")).join("\n").replace(/\s*\n\s*/g, " · ").slice(0, 140);
  const progress = (n) => { const c = n.body.split("\n").map((l) => l.match(CHECK_RE)).filter(Boolean); return c.length ? ` <span class="mp-src">☑ ${c.filter((m) => m[1] !== " ").length}/${c.length}</span>` : ""; };
  const newDraft = store.get(draftKey(null), null);
  const card = (n) => `<button type="button" class="mp-note" data-note="${n.id}">
      <span class="mp-note-title">${n.private ? "🔒 " : ""}${esc(n.title || "Untitled")}${progress(n)}${store.get(draftKey(n.id), null) ? ` <span class="mp-src">not saved yet</span>` : ""}</span>
      ${n.body.trim() ? `<span class="mp-note-preview">${esc(preview(n))}</span>` : ""}
      <span class="pl-legend">${esc(who(n.updatedBy)?.mark ?? "")} ${tinoWhen(n.updated)}</span></button>`;
  pane.innerHTML = `<div class="pl-editor-card mp-pane-card mp-notes-card"><div class="mp-notes-head"><h4>📝 Notes</h4><button type="button" class="mp-cta" data-act="newnote">＋ New note</button></div>
    ${newDraft ? `<button type="button" class="mp-note" data-note="new"><span class="mp-note-title">${esc(newDraft.title || "Untitled")} <span class="mp-src">new · not saved yet</span></span></button>` : ""}
    <div class="mp-notes">${S.notes.length ? S.notes.map(card).join("") : newDraft ? "" : `<div class="pl-empty">No notes yet — shopping lists, ideas, plans… anything you both want to keep.</div>`}</div>
    <div class="pl-legend">Shared with ${esc(P?.mark ?? "")} ${esc(P?.label ?? "the other")}: you can both edit and delete shared notes. 🔒 = only you.</div></div>`;
  pane.querySelector("[data-act=newnote]").addEventListener("click", () => openNote(null));
  pane.querySelectorAll("[data-note]").forEach((b) => b.addEventListener("click", () => openNote(b.dataset.note === "new" ? null : S.notes.find((n) => n.id === b.dataset.note) ?? null)));
}
function openNote(note) {
  const P = S.partner?.label ?? "the other";
  const mine = !note || note.by === S.user.id;
  let cur = note ? { ...note } : null, dirty = false, timer = 0, busy = null;
  const draft = store.get(draftKey(cur?.id ?? null), null); // texte pas encore enregistré, gardé sur cet appareil
  const start = draft ?? cur ?? { title: "", body: "", private: false };
  let mode = start.body.trim() ? "read" : "edit", onlyTicks = !draft;
  const ticks = new Map(); // cases cochées / décochées depuis le dernier enregistrement (texte → coché)
  const ov = overlay(`<form class="pl-editor-card mp-note-editor">
    <input type="text" name="title" maxlength="120" placeholder="Title" value="${esc(start.title)}">
    <div class="mp-note-tools"><span class="mp-seg"><button type="button" data-mode="read">👁 Read</button><button type="button" data-mode="edit">✏️ Edit</button></span><span class="mp-grow"></span>
      <span class="mp-note-ins"><button type="button" data-ins="- " title="Bullet point">• Bullet</button><button type="button" data-ins="- [ ] " title="Checkbox">☐ Checkbox</button></span></div>
    <div class="mp-note-view"></div>
    <textarea name="body" maxlength="20000" rows="12" placeholder="Write here… (• Bullet and ☐ Checkbox make lists)">${esc(start.body)}</textarea>
    <div class="mp-note-conflict" hidden></div>
    <div class="pl-editor-row"><label class="mp-check"${mine ? "" : " hidden"}><input type="checkbox" name="private" ${start.private ? "checked" : ""}> 🔒 Only me</label><span class="mp-grow"></span><span class="pl-legend mp-note-state"></span></div>
    <div class="pl-editor-actions">${cur ? `<button type="button" data-act="delete" class="mp-danger">🗑 Delete</button>` : ""}<span class="mp-grow"></span><button type="submit" class="mp-cta">Done</button></div></form>`, { onClose: () => close() });
  const f = ov.querySelector("form"), conflictBox = f.querySelector(".mp-note-conflict");
  const state = (t) => { f.querySelector(".mp-note-state").textContent = t; };
  const values = () => ({ title: f.title.value.trim(), body: f.body.value, private: mine ? f.private.checked : !!cur?.private });
  if (draft) { dirty = true; state("Not saved yet (kept on this phone)"); }
  else if (cur) state(`${S.user.id === cur.updatedBy ? "You" : P} · ${tinoWhen(cur.updated)}`);

  // ---- lecture / écriture, puces, cases à cocher ----
  const view = f.querySelector(".mp-note-view");
  const renderView = () => {
    view.innerHTML = noteHtml(f.body.value) || `<div class="pl-empty">Empty note — tap ✏️ Edit to write.</div>`;
  };
  const setMode = (m) => {
    mode = m;
    f.body.hidden = m !== "edit"; view.hidden = m !== "read";
    f.querySelector(".mp-note-ins").hidden = m !== "edit";
    f.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
    if (m === "read") renderView(); else f.body.focus({ preventScroll: true });
  };
  f.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  // Cocher en lecture : la ligne « - [ ] » devient « - [x] », enregistrée vite
  view.addEventListener("change", (ev) => {
    const cb = ev.target.closest("[data-line]");
    if (!cb) return;
    const lines = f.body.value.split("\n"), i = +cb.dataset.line, m = lines[i]?.match(CHECK_RE);
    if (!m) return;
    lines[i] = lines[i].replace(/\[( |x|X)\]/, cb.checked ? "[x]" : "[ ]");
    ticks.set(m[2].trim(), cb.checked);
    f.body.value = lines.join("\n");
    dirty = true; state("…"); clearTimeout(timer); timer = setTimeout(saveOnce, 600);
    renderView();
  });
  view.addEventListener("click", (ev) => { if (!ev.target.closest("label, input, a")) setMode("edit"); }); // toucher le texte = l'écrire
  // • / ☐ au début de la ligne du curseur (re-appuyer l'enlève)
  f.querySelectorAll("[data-ins]").forEach((b) => {
    for (const t of ["pointerdown", "mousedown"]) b.addEventListener(t, (ev) => ev.preventDefault()); // le clavier reste ouvert
    b.addEventListener("click", () => {
      const ta = f.body, v = ta.value, at = ta.selectionStart, ls = v.lastIndexOf("\n", at - 1) + 1, le = v.indexOf("\n", at) < 0 ? v.length : v.indexOf("\n", at);
      const line = v.slice(ls, le), bare = line.replace(LIST_RE, ""), isCheck = CHECK_RE.test(line), isBullet = !isCheck && BULLET_RE.test(line);
      const next = (b.dataset.ins === "- " ? isBullet : isCheck) ? bare : b.dataset.ins + bare;
      ta.value = v.slice(0, ls) + next + v.slice(le);
      const caret = Math.max(ls, at + (next.length - line.length));
      ta.focus(); ta.setSelectionRange(caret, caret);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });
  // Entrée sur une ligne de liste : la ligne suivante a la même puce (une ligne vide de liste termine la liste)
  f.body.addEventListener("beforeinput", (ev) => {
    if (ev.isComposing || (ev.inputType !== "insertLineBreak" && ev.inputType !== "insertParagraph")) return; // (mot en cours de saisie : Entrée normale)
    const ta = f.body, v = ta.value, at = ta.selectionStart;
    if (at !== ta.selectionEnd) return;
    const ls = v.lastIndexOf("\n", at - 1) + 1, line = v.slice(ls, at), m = line.match(LIST_RE);
    if (!m) return;
    ev.preventDefault();
    if (!line.slice(m[0].length).trim() && v.slice(at, v.indexOf("\n", at) < 0 ? v.length : v.indexOf("\n", at)).trim() === "") {
      ta.value = v.slice(0, ls) + v.slice(at); ta.setSelectionRange(ls, ls); // fin de la liste
    } else {
      const pre = m[0].replace(/\[(x|X)\]/, "[ ]");
      ta.value = v.slice(0, at) + "\n" + pre + v.slice(at); ta.setSelectionRange(at + 1 + pre.length, at + 1 + pre.length);
    }
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  });

  async function save() {
    if (!dirty) return true;
    const v = values();
    if (!cur && !v.title && !v.body.trim()) { dirty = false; store.del(draftKey(null)); return true; } // note vide : jamais créée
    store.set(draftKey(cur?.id ?? null), v);
    if (!navigator.onLine) { state("📴 Offline — kept on this phone"); return false; }
    state("Saving…");
    try {
      if (!cur) { cur = await db.addNote(v); store.del(draftKey(null)); }
      else {
        const saved = await db.saveNote(cur.id, mine ? v : { title: v.title, body: v.body }, cur.updated);
        if (!saved) return await conflict(v);
        cur = saved;
      }
      store.del(draftKey(cur.id));
      if (values().title === v.title && values().body === v.body && values().private === v.private) { dirty = false; ticks.clear(); onlyTicks = true; } // (rien tapé pendant l'envoi)
      state(dirty ? "…" : `Saved ${tinoWhen(cur.updated)}`);
      if (!f.querySelector("[data-act=delete]")) addDelete();
      loadNotes();
      return !dirty;
    } catch (err) { state(`⚠️ Not saved (${err.message})`); return false; }
  }
  const saveOnce = () => (busy ??= save().finally(() => { busy = null; }));
  // L'autre a modifié (ou supprimé) la note pendant qu'on écrivait : on demande au lieu d'écraser
  async function conflict(v) {
    const latest = await db.getNote(cur.id).catch(() => undefined);
    conflictBox.hidden = false;
    if (latest === null) {
      conflictBox.innerHTML = `${esc(P)} deleted this note while you were writing. <span class="mp-row"><button type="button" data-c="new">Keep my text as a new note</button></span>`;
      conflictBox.querySelector("[data-c=new]").addEventListener("click", () => { store.del(draftKey(cur.id)); cur = null; conflictBox.hidden = true; dirty = true; saveOnce(); });
      state("⚠️ Not saved");
      return false;
    }
    if (!latest) { state("⚠️ Not saved (connection)"); conflictBox.hidden = true; return false; }
    if (onlyTicks && ticks.size) {
      const merged = latest.body.split("\n").map((l) => { const m = l.match(CHECK_RE); return m && ticks.has(m[2].trim()) ? l.replace(/\[( |x|X)\]/, ticks.get(m[2].trim()) ? "[x]" : "[ ]") : l; }).join("\n");
      const again = await db.saveNote(cur.id, mine ? { title: latest.title, body: merged, private: latest.private } : { title: latest.title, body: merged }, latest.updated).catch(() => null);
      if (again) {
        cur = again; f.title.value = again.title; f.body.value = again.body; if (mine) f.private.checked = again.private;
        conflictBox.hidden = true; ticks.clear(); dirty = false; store.del(draftKey(cur.id));
        if (mode === "read") renderView();
        state(`Saved ${tinoWhen(cur.updated)} — with ${P}'s changes too`);
        loadNotes();
        return true;
      }
    }
    conflictBox.innerHTML = `${esc(P)} changed this note while you were writing. <span class="mp-row"><button type="button" data-c="mine">Keep mine</button><button type="button" data-c="theirs">Show theirs</button></span>`;
    conflictBox.querySelector("[data-c=mine]").addEventListener("click", () => { cur = latest; conflictBox.hidden = true; dirty = true; saveOnce(); });
    conflictBox.querySelector("[data-c=theirs]").addEventListener("click", () => {
      cur = latest; f.title.value = latest.title; f.body.value = latest.body; if (mine) f.private.checked = latest.private;
      store.del(draftKey(cur.id)); dirty = false; ticks.clear(); onlyTicks = true; conflictBox.hidden = true; state(`${P}'s version · ${tinoWhen(latest.updated)}`);
      if (mode === "read") renderView();
    });
    state("⚠️ Not saved");
    return false;
  }
  f.addEventListener("input", (ev) => {
    if (ev.target.closest(".mp-note-view")) return; // (une case cochée en lecture : déjà gérée)
    dirty = true; onlyTicks = false; state("…"); clearTimeout(timer); timer = setTimeout(saveOnce, 1500);
  });
  async function close() {
    clearTimeout(timer);
    let ok = await saveOnce();
    if (!ok && dirty && conflictBox.hidden && navigator.onLine) ok = await saveOnce(); // (tapé pendant l'envoi)
    if (!ok && !conflictBox.hidden) return; // une question est posée : on reste
    if (!ok && dirty) toast(navigator.onLine ? "⚠️ The note wasn't saved — it's kept on this phone, open it again to retry" : "📴 Kept on this phone — open the note again when you're online to save it");
    noteOpen = null;
    ov.remove();
    if (currentTab() === "notes") renderNotes(panes.notes);
  }
  f.addEventListener("submit", (ev) => { ev.preventDefault(); close(); });
  function addDelete() {
    const actions = f.querySelector(".pl-editor-actions");
    actions.insertAdjacentHTML("afterbegin", `<button type="button" data-act="delete" class="mp-danger">🗑 Delete</button>`);
    const del = actions.querySelector("[data-act=delete]");
    del.addEventListener("click", async () => {
      if (!del.dataset.armed) { del.dataset.armed = "1"; del.textContent = cur.private ? "Sure? 🗑" : `Sure? ${P} loses it too 🗑`; return; } // 2e appui pour confirmer
      clearTimeout(timer);
      if (await guard(() => db.deleteNote(cur.id), "Couldn't delete the note")) { store.del(draftKey(cur.id)); noteOpen = null; ov.remove(); toast(`Deleted: ${cur.title || "Untitled"}`); loadNotes(); }
    });
  }
  if (cur) { f.querySelector("[data-act=delete]").remove(); addDelete(); }
  // Liste rechargée (temps réel) : on prévient seulement, l'éditeur n'est jamais réécrit
  noteOpen = {
    refreshed() {
      const n = cur && S.notes.find((x) => x.id === cur.id);
      if (!n || !newerThan(n.updated, cur.updated) || n.updatedBy === S.user.id) return; // (une réponse en retard, plus ancienne, est ignorée)
      if (!dirty && !busy) { // rien à perdre : on affiche sa version
        const at = f.body.selectionStart;
        cur = n; f.title.value = n.title; f.body.value = n.body; if (mine) f.private.checked = n.private;
        if (mode === "read") renderView(); else if (document.activeElement === f.body) f.body.setSelectionRange(Math.min(at, n.body.length), Math.min(at, n.body.length));
        state(`✏️ Updated by ${P} · ${tinoWhen(n.updated)}`);
      } else state(`✏️ ${P} just edited this note — when you save, you'll choose which version to keep`);
    },
  };
  setMode(mode);
  if (!cur) f.title.focus({ preventScroll: true });
}

// Rendu d'une note en lecture (CHECK_RE / BULLET_RE plus haut), « # » = titre
function noteHtml(body) {
  if (!body.trim()) return "";
  return body.split("\n").map((line, i) => {
    let m;
    if ((m = line.match(CHECK_RE))) return `<label class="mp-nl mp-nl-check${m[1] !== " " ? " done" : ""}"><input type="checkbox" data-line="${i}" ${m[1] !== " " ? "checked" : ""}><span>${esc(m[2]) || "&nbsp;"}</span></label>`;
    if ((m = line.match(BULLET_RE))) return `<div class="mp-nl mp-nl-bullet">${esc(m[1])}</div>`;
    if ((m = line.match(/^#{1,3} (.*)$/))) return `<div class="mp-nl mp-nl-head">${esc(m[1])}</div>`;
    return line.trim() ? `<div class="mp-nl">${esc(line)}</div>` : `<div class="mp-nl mp-nl-gap"></div>`;
  }).join("");
}

// ---------- ✏️ Dessins pour l'écran d'accueil de l'autre (supabase/19_doodles.sql) ----------
// Dans l'onglet 📝 Notes, sous les notes : on dessine (doigt, stylet, souris) et on envoie à l'autre ; son widget « Doodle »
// montre le dernier dessin reçu (widget_doodle) et une notification le prévient. La carte est créée une fois par connexion
// et n'est JAMAIS réécrite par renderNotes (qui refait la liste à chaque événement temps réel) : un dessin en cours reste.
// Brouillon (les traits) gardé sur l'appareil à chaque trait fini. Les images (~30–300 Ko) ne sont lues que pour ce qui
// est affiché, une fois. Sans 19 : la carte le dit, rien d'autre ne change.
const DOODLE = 600, DOODLE_SHOWN = 12;
const INKS = ["#1c1c28", "#ffffff", "#e5383b", "#ff8c42", "#ffd23f", "#3bb273", "#3a86ff", "#8338ec", "#ff5d8f", "#8d5a3b"];
const PAPERS = [["#ffffff", "White"], ["#fff6e5", "Cream"], ["#ffe3ec", "Pink"], ["#e3f0ff", "Sky"], ["#1c2046", "Night"]];
const NIBS = [["S", 5], ["M", 12], ["L", 26]];
let unsubDoodles = null, doodleUi = null, doodleSeen = null;
const doodlePng = new Map(); // id → PNG en base64 (lu une fois)
async function loadDoodles() {
  if (!S.user) return;
  try { S.doodles = await db.listDoodles(); S.doodlesOk = true; }
  catch (err) {
    if (/does not exist|schema cache/i.test(err.message)) { S.doodlesOk = false; S.doodles = []; }
    else console.warn("Doodles", err); // hors ligne : la dernière liste reste
  }
  const want = S.doodles.slice(0, DOODLE_SHOWN).map((d) => d.id).filter((id) => !doodlePng.has(id));
  if (want.length) try { for (const [id, png] of await db.doodlePngs(want)) doodlePng.set(id, png); } catch (err) { console.warn("Doodles", err); }
  // Un nouveau dessin de l'autre pendant que l'app est ouverte (pas au démarrage) : on le dit, sauf si on regarde déjà.
  // Repère = date du plus récent déjà vu (pas son id : s'il retire son dernier, l'avant-dernier n'est pas « nouveau »)
  const got = S.doodles.find((d) => d.by !== S.user.id), P = S.partner;
  const fresh = got && (doodleSeen === null || newerThan(got.at, doodleSeen));
  if (fresh && doodleSeen !== null && currentTab() !== "notes")
    toast(`✏️ ${P?.mark ?? ""} ${P?.label ?? "Someone"} sent you a doodle`, { action: "See it", onAction: () => { location.hash = "notes"; } });
  if (fresh) doodleSeen = got.at;
  else if (doodleSeen === null) doodleSeen = "";
  doodleUi?.refresh();
}
function doodleCard(host) {
  if (doodleUi?.user === S.user.id && doodleUi.el.parentNode === host) return;
  doodleUi?.el.remove();
  doodleUi = makeDoodle(host);
}
const doodleSrc = (id) => (doodlePng.has(id) ? `data:image/png;base64,${doodlePng.get(id)}` : "");
function makeDoodle(host) {
  const P = () => S.partner ?? { mark: "", label: "the other" };
  const key = "doodle." + S.user.id;
  let d = store.get(key, null); // brouillon : { paper, strokes: [{ c: couleur, w: épaisseur, e: gomme 0/1, p: [x, y, x, y…] }] }
  if (!d || !Array.isArray(d.strokes) || typeof d.paper !== "string") d = { paper: PAPERS[1][0], strokes: [] };
  let ink = INKS[0], nib = 1, erase = false, cur = null, sending = false, clearArmed = false;
  const el = document.createElement("div");
  el.className = "pl-editor-card mp-pane-card mp-doodle";
  el.innerHTML = `<h4>✏️ Doodles</h4>
    <div class="mp-doodle-got"></div>
    <div class="mp-doodle-draw">
      <div class="mp-doodle-pad"><canvas width="${DOODLE}" height="${DOODLE}" role="img" aria-label="Drawing area"></canvas></div>
      <div class="mp-doodle-inks">${INKS.map((c) => `<button type="button" class="mp-swatch" data-ink="${c}" style="--c:${c}" aria-label="Colour ${c}"></button>`).join("")}</div>
      <div class="mp-doodle-tools">
        <span class="mp-seg">${NIBS.map(([n], i) => `<button type="button" data-nib="${i}">${n}</button>`).join("")}</span>
        <button type="button" data-act="erase" aria-pressed="false">🧽 Eraser</button>
        <button type="button" data-act="undo">↶ Undo</button>
        <button type="button" data-act="clear">🗑 Clear</button>
      </div>
      <div class="mp-doodle-papers"><span class="pl-legend">Paper</span>${PAPERS.map(([c, n]) => `<button type="button" class="mp-swatch mp-paper" data-paper="${c}" style="--c:${c}" aria-label="${n} paper" title="${n}"></button>`).join("")}</div>
      <div class="pl-editor-actions"><span class="mp-grow"></span><button type="button" class="mp-cta" data-act="send">Send</button></div>
      <div class="pl-legend mp-doodle-hint"></div>
    </div>
    <div class="mp-doodle-hist"></div>`;
  host.append(el);
  const cv = el.querySelector("canvas"), g = cv.getContext("2d");
  const layer = document.createElement("canvas"); // les traits seuls (la gomme y efface), posés sur le papier
  layer.width = layer.height = DOODLE;
  const lg = layer.getContext("2d");
  const send = el.querySelector("[data-act=send]"), clear = el.querySelector("[data-act=clear]");
  const save = () => store.set(key, d);
  function strokeOn(c, s, from = 0) {
    const p = s.p;
    c.save();
    c.globalCompositeOperation = s.e ? "destination-out" : "source-over";
    c.strokeStyle = c.fillStyle = s.c;
    c.lineWidth = s.w;
    c.lineCap = c.lineJoin = "round";
    c.beginPath();
    if (p.length <= 2) { c.arc(p[0], p[1], s.w / 2, 0, Math.PI * 2); c.fill(); } // un point
    else {
      const i0 = Math.max(0, from - 2);
      c.moveTo(p[i0], p[i0 + 1]);
      for (let i = i0 + 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]);
      c.stroke();
    }
    c.restore();
  }
  const paint = () => { g.fillStyle = d.paper; g.fillRect(0, 0, DOODLE, DOODLE); g.drawImage(layer, 0, 0); };
  const redraw = () => { lg.clearRect(0, 0, DOODLE, DOODLE); d.strokes.forEach((s) => strokeOn(lg, s)); paint(); tools(); };
  function tools() {
    el.querySelectorAll("[data-ink]").forEach((b) => b.setAttribute("aria-pressed", String(!erase && b.dataset.ink === ink)));
    el.querySelectorAll("[data-nib]").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.nib === nib)));
    el.querySelectorAll("[data-paper]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.paper === d.paper)));
    el.querySelector("[data-act=erase]").setAttribute("aria-pressed", String(erase));
    el.querySelector("[data-act=undo]").disabled = clear.disabled = !d.strokes.length;
    if (!d.strokes.length) { clearArmed = false; clear.textContent = "🗑 Clear"; }
    send.disabled = sending || !d.strokes.length;
    send.textContent = sending ? "Sending…" : `Send to ${P().mark} ${P().label}`;
  }
  // Dessin : un seul doigt à la fois ; points rapprochés ignorés ; seulement le nouveau bout de trait est dessiné
  const pt = (ev) => { const b = cv.getBoundingClientRect(); return [Math.round(((ev.clientX - b.left) / b.width) * DOODLE), Math.round(((ev.clientY - b.top) / b.height) * DOODLE)]; };
  cv.addEventListener("pointerdown", (ev) => {
    if (cur || ev.button > 0) return;
    ev.preventDefault();
    try { cv.setPointerCapture(ev.pointerId); } catch { /* (pointeur déjà parti : le trait se dessine quand même) */ }
    cur = { id: ev.pointerId, s: { c: erase ? "#000000" : ink, w: NIBS[nib][1] * (erase ? 2 : 1), e: erase ? 1 : 0, p: pt(ev) } };
    d.strokes.push(cur.s);
    strokeOn(lg, cur.s);
    paint();
  });
  cv.addEventListener("pointermove", (ev) => {
    if (!cur || ev.pointerId !== cur.id) return;
    ev.preventDefault();
    const p = cur.s.p, from = p.length, evs = ev.getCoalescedEvents?.() ?? [];
    for (const e of evs.length ? evs : [ev]) {
      const [x, y] = pt(e);
      if (Math.abs(x - p[p.length - 2]) + Math.abs(y - p[p.length - 1]) >= 2) p.push(x, y);
    }
    if (p.length > from) { strokeOn(lg, cur.s, from); paint(); }
  });
  const end = (ev) => { if (!cur || ev.pointerId !== cur.id) return; cur = null; save(); tools(); };
  cv.addEventListener("pointerup", end);
  cv.addEventListener("pointercancel", end);
  cv.addEventListener("contextmenu", (ev) => ev.preventDefault());
  el.querySelectorAll("[data-ink]").forEach((b) => b.addEventListener("click", () => { ink = b.dataset.ink; erase = false; tools(); }));
  el.querySelectorAll("[data-nib]").forEach((b) => b.addEventListener("click", () => { nib = +b.dataset.nib; tools(); }));
  el.querySelectorAll("[data-paper]").forEach((b) => b.addEventListener("click", () => { d.paper = b.dataset.paper; paint(); save(); tools(); }));
  el.querySelector("[data-act=erase]").addEventListener("click", () => { erase = !erase; tools(); });
  el.querySelector("[data-act=undo]").addEventListener("click", () => { d.strokes.pop(); save(); redraw(); });
  clear.addEventListener("click", () => {
    if (!clearArmed) { clearArmed = true; clear.textContent = "Sure? 🗑"; return; } // 2e appui pour confirmer
    d.strokes = []; save(); redraw();
  });
  // Envoi : papier + traits en PNG (fond plein : un PNG transparent disparaîtrait sur un widget sombre)
  const png = (size) => {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const x = c.getContext("2d");
    x.fillStyle = d.paper; x.fillRect(0, 0, size, size); x.drawImage(layer, 0, 0, size, size);
    return c.toDataURL("image/png").split(",")[1];
  };
  send.addEventListener("click", async () => {
    if (sending || !d.strokes.length) return;
    let data = png(DOODLE);
    if (data.length > 1400000) data = png(420); // (dessin très chargé : plus petit, sous la limite de la base)
    sending = true; tools();
    let made = null;
    const ok = await guard(async () => { made = await db.sendDoodle(data); }, "Couldn't send the doodle");
    sending = false;
    if (ok) {
      doodlePng.set(made.id, data);
      d.strokes = []; save(); redraw();
      toast(`✏️ Sent to ${P().mark} ${P().label} — it'll show on their Doodle widget`);
      loadDoodles();
    } else tools(); // (hors ligne ou erreur : le dessin reste, on peut réessayer)
  });
  function refresh() {
    const Q = P(), off = S.doodlesOk === false;
    el.classList.toggle("mp-off", off);
    const got = S.doodles.find((x) => x.by !== S.user.id), box = el.querySelector(".mp-doodle-got");
    box.innerHTML = off
      ? `<div class="pl-legend">Doodles aren't set up yet — Tony needs to run <code>supabase/19_doodles.sql</code> in Supabase.</div>`
      : got
        ? `<button type="button" class="mp-doodle-last" data-doodle="${got.id}">${doodleSrc(got.id) ? `<img src="${doodleSrc(got.id)}" alt="Latest doodle from ${esc(Q.label)}">` : `<span class="mp-doodle-wait">✏️</span>`}
            <span><b>From ${esc(Q.mark)} ${esc(Q.label)}</b><span class="pl-legend">${tinoWhen(got.at)}</span></span></button>`
        : `<div class="pl-empty">No doodle from ${esc(Q.mark)} ${esc(Q.label)} yet — draw one for them below ✏️</div>`;
    el.querySelector(".mp-doodle-hint").textContent = `It shows on ${Q.label}'s Doodle widget (⚙ Settings → Home-screen widget) and they get a notification.`;
    const shown = S.doodles.slice(0, DOODLE_SHOWN);
    el.querySelector(".mp-doodle-hist").innerHTML = off || !shown.length ? "" : `<div class="pl-sub">Sent & received</div><div class="mp-doodle-grid">${shown.map((x) => `<button type="button" class="mp-doodle-thumb" data-doodle="${x.id}" title="${x.by === S.user.id ? "You" : esc(Q.label)} · ${tinoWhen(x.at)}">
        ${doodleSrc(x.id) ? `<img src="${doodleSrc(x.id)}" alt="">` : ""}<span class="mp-doodle-who">${x.by === S.user.id ? esc(S.me.mark) : esc(Q.mark)}</span></button>`).join("")}</div>`;
    el.querySelectorAll("[data-doodle]").forEach((b) => b.addEventListener("click", () => openDoodle(b.dataset.doodle)));
    tools();
  }
  redraw();
  refresh();
  return { user: S.user.id, el, refresh };
}
// Un dessin en grand ; les siens peuvent être retirés (ils disparaissent aussi du widget de l'autre)
function openDoodle(id) {
  const x = S.doodles.find((y) => y.id === id), P = S.partner ?? { mark: "", label: "the other" };
  if (!x) return;
  const mine = x.by === S.user.id;
  const ov = overlay(`<div class="pl-editor-card mp-doodle-view"><h4>${mine ? `✏️ You → ${esc(P.mark)} ${esc(P.label)}` : `✏️ ${esc(P.mark)} ${esc(P.label)} → you`}</h4>
    ${doodleSrc(id) ? `<img src="${doodleSrc(id)}" alt="Doodle">` : `<div class="pl-empty">The picture isn't loaded yet — check the connection.</div>`}
    <div class="pl-legend">${tinoWhen(x.at)}</div>
    <div class="pl-editor-actions">${mine ? `<button type="button" data-act="unsend" class="mp-danger">🗑 Unsend</button>` : ""}<span class="mp-grow"></span><button type="button" data-act="cancel">Close</button></div></div>`);
  const un = ov.querySelector("[data-act=unsend]");
  un?.addEventListener("click", async () => {
    if (!un.dataset.armed) { un.dataset.armed = "1"; un.textContent = `Sure? It goes from ${P.label}'s widget too 🗑`; return; } // 2e appui pour confirmer
    if (await guard(() => db.deleteDoodle(id), "Couldn't unsend the doodle")) { ov.remove(); toast("Unsent — their widget catches up at its next refresh"); loadDoodles(); }
  });
}
