// MeoPeo — l'interface (même mise en page que les planners Obsidian MeoMeo / PeoPeo).
// Ne parle jamais directement à Supabase : tout passe par `db` (data.js ; data-mock.js dans test.html).
import { mountMascots, outfitTemplate } from "./mascot.js";
import { createBigTino, DEFAULT_ANIM, videoToSprite } from "./bigtino.js";

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
  if (diffDays(today, lastDay(e)) < 0) return "late";
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
const upcomingOf = (list) => [
  ...list.filter((e) => urgency(e) === "late"),
  ...list.filter((e) => !e.done && lastDay(e) >= today).slice(0, UPCOMING_COUNT),
];

// ---------- État ----------
let db, root, toastBox, unsubscribe = null, reloadTimer = null;
const S = { user: null, me: null, partner: null, cats: [], mine: [], theirs: [], tino: [], tinoOk: null, lines: [], big: null, extrasOk: null, outfits: [], worn: { head: null, body: null }, outfitsOk: null, grumbles: [], grumblesOk: null, notes: [], notesOk: null };
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
  const wake = () => { if (!S.user || document.hidden) return; tick(); reload(); loadTino(); loadExtras(); loadOutfits(); loadGrumbles(); loadNotes(); resubscribe(); };
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("focus", wake);
  window.addEventListener("online", wake);
  window.addEventListener("resize", () => align());
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
  loadGrumbles();
  loadNotes();
  resubscribe();
  ensurePush();
}
function resubscribe() {
  unsubscribe?.(); unsubscribe = S.user ? db.subscribe(() => reload()) : null;
  unsubTino?.(); unsubTino = S.user ? db.subscribeTino(() => loadTino()) : null;
  unsubExtras?.(); unsubExtras = S.user ? db.subscribeTinoExtras(() => loadExtras()) : null;
  unsubOutfits?.(); unsubOutfits = S.user ? db.subscribeOutfits(() => loadOutfits()) : null; // canal à part (sans 12, rien d'autre ne casse)
  unsubGrumbles?.(); unsubGrumbles = S.user ? db.subscribeGrumbles(() => loadGrumbles()) : null; // idem (13)
  unsubNotes?.(); unsubNotes = S.user ? db.subscribeNotes(() => loadNotes()) : null; // idem (14)
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
  unsubGrumbles?.(); unsubGrumbles = null; S.grumbles = []; S.grumblesOk = null;
  unsubNotes?.(); unsubNotes = null; S.notes = []; S.notesOk = null;
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
function render() {
  if (root.offsetHeight) root.style.minHeight = root.offsetHeight + "px"; // pas de saut de page pendant le réaffichage
  const P = S.partner;
  const off = S.offline ? new Date(S.offline) : null;
  root.innerHTML = `${off ? `<div class="mp-offline">📴 Offline — showing your tasks as of ${off.getDate()}.${pad(off.getMonth() + 1)} at ${pad(off.getHours())}:${pad(off.getMinutes())}. Changes can't be saved until you're back online.</div>` : ""}<header class="pl-hello"><span class="mp-date">${dayTitle(now)}, ${now.getFullYear()}</span>
      <span class="mp-who">${esc(S.me.mark)} ${esc(S.me.label)}</span>
      <button class="pl-refresh" data-act="refresh" title="Reload">⟳</button></header>
    <div class="pl-split"><div class="pl-left"></div><div class="pl-right"></div></div>
    <div class="pl-bottom"><div class="mp-partner"></div></div>`;
  renderMine(root.querySelector(".pl-left"));
  renderCalendar(root.querySelector(".pl-right"));
  renderPartner(root.querySelector(".mp-partner"), P);
  root.querySelector("[data-act=refresh]").addEventListener("click", () => { tick(); load(); loadTino(); loadExtras(); loadOutfits(); loadGrumbles(); loadNotes(); resubscribe(); });
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
  return `<div class="pl-item ${urgency(e)}${glowClass(e)}" style="--c:${e.color}">${box}
    <span class="pl-when">${when ? "now" : relDay(e.date)}<small>${dm(when ? today : e.date)}</small></span>
    <span class="pl-what"${e.tickable ? ` data-edit="${e.id}"` : ""}>${tag}${hourPill(e)}${esc(e.label)}${SRC[e.source] ? ` <span class="mp-src" title="From Tony's Obsidian dashboard">${SRC[e.source]}</span>` : ""}${e.private ? ` <span class="mp-priv" title="Private: only you can see it">🔒</span>` : ""}${rangeInfo(e)}${bellPill(e)}</span>${e.editable ? `<button class="pl-edit" data-edit="${e.id}" title="Edit this task">✏️</button>` : ""}</div>`;
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
      <button type="submit" class="mp-cta">Add</button></form></details></div>`;
  bindItems(el);
  const form = el.querySelector("form");
  const details = el.querySelector(".pl-add");
  details.addEventListener("toggle", () => { UI.addOpen = details.open; });
  if (UI.focusAdd) { UI.focusAdd = false; form.text.focus({ preventScroll: true }); }
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = new FormData(form);
    const label = String(f.get("text")).trim();
    if (!label) return;
    const end = endOf(f.get("date"), f.get("end"));
    if (f.get("end") && !end) toast("“until” must be after the start date — saved as a one-day task");
    form.querySelector("button[type=submit]").disabled = true;
    const ok = await guard(() => db.insertTask({ date: f.get("date"), end, time: f.get("time") || null, course: f.get("course") || null,
      label, moon: f.get("moon") || null, private: f.get("private") === "on", remind: remindOf(f) }), "Couldn't add the task");
    UI.addCat = f.get("course") || ""; UI.focusAdd = ok;
    if (ok) { toast(`Added: ${label}`); remindNotice(remindOf(f)); }
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
      ${S.partner ? `<label class="pl-toggle"><input type="checkbox" ${UI.showPartner ? "checked" : ""}> ${esc(S.partner.mark)} ${esc(S.partner.label)}</label>` : ""}</div>
    <div class="pl-cal">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, c) => `<div class="pl-dow" style="grid-row:1;grid-column:${c + 1}">${d}</div>`).join("")}`;
  let lanes = { segs: [], n: 0 };
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i), k = iso(d), list = byDay[k] ?? [];
    const w = Math.floor(i / 7), c = i % 7;
    if (c === 0) lanes = weekLanes(spans, k);
    const cls = [d.getMonth() !== first.getMonth() && "out", k === today && "today", k === UI.day && "sel", dow(d) >= 6 && "we"].filter(Boolean).join(" ");
    html += `<div class="pl-day ${cls}" data-day="${k}" style="grid-row:${w + 2};grid-column:${c + 1}"><div class="pl-num">${d.getDate()}</div>${lanes.n ? `<div class="pl-lanes" style="--n:${lanes.n}"></div>` : ""}`;
    html += list.slice(0, CAL_PER_DAY).map((e) => `<div class="pl-chip ${urgency(e)}${glowClass(e)}"${e.tickable ? ` data-edit="${e.id}"` : ""} style="--c:${e.color}" title="${chipTitle(e)}${e.time ? " (" + e.time + ")" : ""}">${e.course ? `<b>${esc(e.course)}</b> ` : ""}${hourPill(e)}${esc(e.label)}${bellMark(e)}</div>`).join("");
    if (list.length > CAL_PER_DAY) html += `<div class="pl-more">+${list.length - CAL_PER_DAY}</div>`;
    html += `</div>`;
    if (c === 6) html += lanes.segs.map((g) => {
      const e = g.e;
      return `<div class="pl-chip pl-span ${urgency(e)}${glowClass(e)}${g.head ? " head" : ""}${g.tail ? " tail" : ""}"${e.tickable ? ` data-edit="${e.id}"` : ` data-goto="${g.first}"`}
        style="--c:${e.color};--lane:${g.lane};grid-row:${w + 2};grid-column:${g.c0 + 1} / ${g.c1 + 2}" title="${chipTitle(e)} (${dm(e.date)} → ${dm(e.end)})">${e.course ? `<b>${esc(e.course)}</b> ` : ""}${g.head ? hourPill(e) : "↪ "}${esc(e.label)}${bellMark(e)}</div>`;
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
  el.querySelector(".pl-toggle input")?.addEventListener("change", (ev) => { UI.showPartner = ev.target.checked; store.set("showPartner", UI.showPartner); renderCalendar(el); align(); });
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

// Personnages qui se promènent sur le calendrier (mascot.js : Tino, le phoque). Calque posé sur la page, hors de l'app : il survit
// aux réaffichages ; plateformes = haut du calendrier, haut de chaque semaine, bas du calendrier (coordonnées de page)
let mascots = null;
function calDays() { return [...(root?.querySelectorAll(".pl-cal .pl-day") ?? [])]; }
function mascotPlatforms() {
  const cal = root?.querySelector(".pl-cal"), days = calDays();
  if (!cal || !days.length || !cal.getClientRects().length) return [];
  const c = cal.getBoundingClientRect(), ys = [c.top];
  for (let i = 7; i < days.length; i += 7) ys.push(days[i].getBoundingClientRect().top);
  ys.push(c.bottom);
  return ys.map((y) => ({ y: y + scrollY, x0: c.left + scrollX + 18, x1: c.right + scrollX - 18, cell: c.width / 7 })); // cell : largeur d'une case (le lit n'en dépasse pas)
}
function mascotToday() {
  const days = calDays(), i = days.findIndex((d) => d.classList.contains("today"));
  if (i < 0) return null;
  const r = days[i].getBoundingClientRect();
  return { p: Math.floor(i / 7) + 1, x: r.left + scrollX + r.width / 2 };
}
function refreshMascots() {
  if (mascots) return mascots.refresh();
  const layer = document.createElement("div");
  document.body.append(layer);
  // un appui sur un personnage passe au calendrier en dessous, jamais aux boutons du mois ni à l'interrupteur
  mascots = mountMascots({ layer, kinds: ["tino"], platforms: mascotPlatforms, today: mascotToday, tapThrough: (el) => !!el.closest(".pl-cal"), lines: () => S.lines.map((l) => l.body), grumbles: grumbleLines });
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
  box.innerHTML = `<label class="mp-check"><input type="checkbox" name="bigtino" ${showBig() ? "checked" : ""}> Big Tino above the calendar <span class="pl-legend">(this device)</span></label>
    ${ok ? `<div class="mp-row mp-anim"><span>Animation: <b>${big ? `new one, from ${who} (${shortDate(big.at)})` : "the original"}</b></span></div>
    <span class="mp-row"><label class="mp-filebtn"><input type="file" accept="image/gif,image/webp,image/png,image/jpeg,video/*" hidden> Change… (GIF or video)</label>${big ? `<button type="button" data-act="bigreset">Back to the original</button>` : ""}</span>
    <div class="pl-legend mp-animstatus">Shared: ${esc(P?.label ?? "the other")} sees the same animation. A video becomes a looping animation (10 s max); files up to 10 MB.</div>
    <div class="pl-sub">Tino's lines <span class="pl-legend">— Tino says them now and then, on both screens</span></div>
    <div class="mp-lines">${S.lines.length ? S.lines.map((l) => `<div class="mp-line"><span class="mp-line-who" title="${esc(lineWho(l)?.label ?? "")}">${esc(lineWho(l)?.mark ?? "•")}</span><span class="mp-line-text">${esc(l.body)}</span><button type="button" data-line="${l.id}" title="Remove this line">✕</button></div>`).join("") : `<div class="pl-empty">No lines yet.</div>`}</div>
    <div class="mp-row mp-lineadd"><input type="text" name="newline" maxlength="120" placeholder="Something Tino should say…" enterkeyhint="done"><button type="button" data-act="lineadd">Add</button></div>`
    : `<div class="pl-legend">Tino's lines and changing the animation aren't available yet — Tony needs to run <code>supabase/08_tino_extras.sql</code>.</div>`}`;
  box.querySelector("[name=bigtino]").addEventListener("change", (ev) => { store.set("bigTino", ev.target.checked); placeBigTino(); align(); });
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
  const head = `<div class="pl-sub">Grumpy lines <span class="pl-legend">— tap Tino 5 times quickly and he snaps one at you (both screens)</span></div>`;
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
  try { const r = await db.listOutfits(); S.outfits = r.outfits; S.worn = r.worn; S.outfitsOk = true; store.set("outfits." + S.user.id, r); }
  catch (err) {
    if (/does not exist|schema cache|tino_outfits/i.test(err.message)) { S.outfitsOk = false; S.outfits = []; S.worn = { head: null, body: null }; }
    else { const r = store.get("outfits." + S.user.id, null); if (r) { S.outfits = r.outfits; S.worn = r.worn; } } // hors ligne
  }
  await applyOutfit();
  const box = document.querySelector(".mp-wardrobe");
  if (box) fillWardrobe(box);
}
async function outfitUrl(o) {
  if (!outfitUrls.has(o.path)) outfitUrls.set(o.path, URL.createObjectURL(await mediaBlob(o.path)));
  return outfitUrls.get(o.path);
}
// Habille Tino ; fichiers des tenues disparues : retirés de l'appareil
async function applyOutfit() {
  const pick = (layer) => S.outfits.find((o) => o.id === S.worn[layer] && o.layer === layer);
  const head = pick("head"), body = pick("body");
  try {
    mascots?.wear({ head: head ? await outfitUrl(head) : null, body: body ? await outfitUrl(body) : null, hideFlower: !!head?.hideFlower });
  } catch (err) { console.warn("Tino's outfit", err); mascots?.wear({}); }
  const keep = new Set(S.outfits.map((o) => o.path));
  for (const [path, url] of outfitUrls) if (!keep.has(path)) { URL.revokeObjectURL(url); outfitUrls.delete(path); }
  if (S.outfitsOk && "caches" in window) {
    const cache = await caches.open(MEDIA).catch(() => null);
    for (const r of (await cache?.keys()) ?? []) { const m = r.url.match(/__media\/(outfits\/.+)$/); if (m && !keep.has(m[1])) await cache.delete(r); }
  }
}

// Dessin choisi : carré, avec de la transparence (sinon un carré blanc couvrirait Tino), réduit à 512 px en PNG
async function prepareOutfit(file) {
  if (!/^image\//.test(file.type)) throw new Error("pick a PNG drawing");
  const img = new Image();
  const url = URL.createObjectURL(file);
  try { img.src = url; await img.decode(); } catch { throw new Error("this image can't be read — export it as PNG"); } finally { URL.revokeObjectURL(url); }
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
// Modèle : feuille de partage (iPhone / iPad : « Enregistrer l'image », « Enregistrer dans Fichiers »), sinon téléchargement
async function shareTemplate() {
  const blob = await outfitTemplate();
  const file = new File([blob], "tino-template.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Tino template" }); return; } catch (err) { if (err.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

function fillWardrobe(box) {
  if (S.outfitsOk === false) { box.innerHTML = `<div class="pl-legend">Tino's wardrobe isn't available yet — Tony needs to run <code>supabase/12_tino_outfits.sql</code>.</div>`; return; }
  const who = (o) => (o.by === S.user.id ? S.me : S.partner);
  const row = (o) => {
    const on = S.worn[o.layer] === o.id;
    return `<div class="mp-outfit${on ? " on" : ""}"><img alt="" data-thumb="${o.id}"><span class="mp-outfit-name">${esc(o.name)} <span class="pl-legend">${o.layer === "head" ? "head" : "body"} · ${esc(who(o)?.mark ?? "")}</span></span>
      <button type="button" data-wear="${o.id}">${on ? "Take off" : "Wear"}</button><button type="button" data-drop="${o.id}" title="Remove from the wardrobe">✕</button></div>`;
  };
  box.innerHTML = `<div class="pl-legend">Draw outfits for Tino on a tablet: download the template, draw on a <b>new layer</b> on top of it, then export <b>only your layer</b> as a PNG with a transparent background. Shared: ${esc(S.partner?.label ?? "the other")} sees what Tino wears.</div>
    <span class="mp-row"><button type="button" data-act="template">⬇ Template</button></span>
    <div class="mp-outfits">${S.outfits.length ? S.outfits.map(row).join("") : `<div class="pl-empty">No outfits yet.</div>`}</div>
    <div class="mp-outfit-add">
      <input type="text" name="oname" maxlength="40" placeholder="Name (e.g. Summer hat)">
      <span class="mp-row"><label class="mp-check"><input type="radio" name="olayer" value="head" checked> On his head</label><label class="mp-check"><input type="radio" name="olayer" value="body"> On his body</label></span>
      <label class="mp-check mp-oflower"><input type="checkbox" name="oflower"> Hide his flower</label>
      <span class="mp-row"><label class="mp-filebtn"><input type="file" accept="image/png,image/webp" hidden> ＋ Add a drawing (PNG)</label></span>
      <div class="pl-legend mp-ostatus"></div>
    </div>`;
  box.querySelectorAll("[data-thumb]").forEach(async (im) => { const o = S.outfits.find((x) => x.id === im.dataset.thumb); try { im.src = await outfitUrl(o); } catch { im.alt = "?"; } });
  box.querySelector("[data-act=template]").addEventListener("click", () => shareTemplate().catch((err) => toast(`⚠️ Couldn't make the template (${err.message})`)));
  box.querySelectorAll("[data-wear]").forEach((b) => b.addEventListener("click", async () => {
    const o = S.outfits.find((x) => x.id === b.dataset.wear);
    if (await guard(() => db.wearOutfit(o.layer, S.worn[o.layer] === o.id ? null : o.id), "Couldn't change Tino's outfit")) loadOutfits();
  }));
  box.querySelectorAll("[data-drop]").forEach((b) => b.addEventListener("click", async () => {
    if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Sure? ✕"; return; } // 2e appui pour confirmer
    if (await guard(() => db.deleteOutfit(b.dataset.drop), "Couldn't remove the outfit")) loadOutfits();
  }));
  const flower = box.querySelector(".mp-oflower");
  box.querySelectorAll("[name=olayer]").forEach((r) => r.addEventListener("change", () => { flower.hidden = box.querySelector("[name=olayer]:checked").value !== "head"; })); // (seulement pour la tête)
  const status = (t) => { box.querySelector(".mp-ostatus").textContent = t; };
  const input = box.querySelector("input[type=file]");
  input.addEventListener("change", async () => {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    const name = box.querySelector("[name=oname]").value.trim() || file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "Outfit";
    const layer = box.querySelector("[name=olayer]:checked").value;
    if (!navigator.onLine) { toast("📴 You're offline — try again once you're back online."); return; }
    box.querySelector(".mp-filebtn").classList.add("mp-busy");
    try {
      status("Checking the drawing…");
      const blob = await prepareOutfit(file);
      status("Sending…");
      await db.addOutfit(blob, { name, layer, hideFlower: layer === "head" && box.querySelector("[name=oflower]").checked });
      toast(`👒 Tino is wearing “${name}”!`);
      await loadOutfits();
    } catch (err) {
      const why = /bucket not found/i.test(err.message) ? "the file storage isn't set up yet — Tony needs to run supabase/08_tino_extras.sql" : err.message;
      toast(`⚠️ Couldn't add the outfit (${why})`);
      fillWardrobe(box);
    }
  });
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
    <div class="pl-editor-row"><label class="mp-check" title="Private: ${esc(S.partner?.label ?? "the other")} won't see it"><input type="checkbox" name="private"> 🔒 Private</label></div>
    <div class="pl-editor-actions"><span class="mp-grow"></span><button type="button" data-act="cancel">Cancel</button><button type="submit" class="mp-cta">Add</button></div></form>`);
  const f = ov.querySelector("form");
  f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const d = new FormData(f);
    const label = String(d.get("text")).trim();
    if (!label) return;
    const end = endOf(d.get("date"), d.get("end"));
    if (d.get("end") && !end) toast("“until” must be after the start date — saved as a one-day task");
    f.querySelector("button[type=submit]").disabled = true;
    const ok = await guard(() => db.insertTask({ date: d.get("date"), end, time: d.get("time") || null, course: d.get("course") || null,
      label, moon: d.get("moon") || null, private: d.get("private") === "on", remind: remindOf(d) }), "Couldn't add the task");
    if (!ok) { f.querySelector("button[type=submit]").disabled = false; return; }
    ov.remove();
    UI.day = d.get("date"); UI.addCat = d.get("course") || "";
    toast(`Added: ${label}`);
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
    <div class="pl-editor-actions"><button type="button" data-act="delete" class="mp-danger">🗑 Delete</button><span class="mp-grow"></span><button type="button" data-act="cancel">Cancel</button><button type="submit" class="mp-cta">Save</button></div></form>`);
  const f = ov.querySelector("form");
  f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const d = new FormData(f);
    const label = String(d.get("text")).trim();
    if (!label) return;
    const end = endOf(d.get("date"), d.get("end"));
    if (d.get("end") && !end) toast("“until” must be after the start date — saved as a one-day task");
    const patch = { label, date: d.get("date"), end, time: d.get("time") || null, course: d.get("course") || null, moon: d.get("moon") || null, remind: remindOf(d), private: d.get("private") === "on", done: d.get("done") === "on" };
    if (await guard(() => db.updateTask(e.id, patch))) { ov.remove(); toast("Task updated"); if (patch.remind !== e.remind) remindNotice(patch.remind); load(); }
  });
  const del = f.querySelector("[data-act=delete]");
  del.addEventListener("click", async () => {
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
    <div class="pl-legend">⚠️ This is shown only once. It contains your widget key: anyone who has it can see your calendar (without private tasks' text). Lost it? Make a new widget and remove this one.</div>`;
  box.append(div);
  const area = div.querySelector("textarea");
  div.querySelector("[data-act=copy]").addEventListener("click", () => copyText(text, area));
  div.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ---------- Onglets : barre de 4 boutons en bas (téléphone et ordinateur) ----------
// Calendar = la page de toujours (#app + carte des messages Tino) ; Notes, Tino et Settings = sections à part, remplies
// à chaque ouverture. L'onglet est dans l'adresse (#notes…) : le bouton « retour » et un rechargement y restent.
const TABS = [["calendar", "📅", "Calendar"], ["notes", "📝", "Notes"], ["tino", "🎣", "Tino"], ["settings", "⚙", "Settings"]];
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
  if (!logged) return;
  if (t === "calendar") { placeBigTino(); align(); } // de retour : Tino, son lit, le grand Tino et les colonnes se remettent en place
  else if (t === "notes") renderNotes(panes.notes);
  else if (t === "tino") renderTinoPane(panes.tino);
  else renderSettings(panes.settings);
  scrollTo(0, 0);
}

// ---------- Onglet 🎣 Tino : tout ce qui le personnalise (le jeu viendra ici) ----------
function renderTinoPane(pane) {
  pane.innerHTML = `<div class="pl-editor-card mp-pane-card"><h4>🦭 Tino</h4><div class="mp-tinoset"></div><div class="mp-grumbles"></div></div>
    <div class="pl-editor-card mp-pane-card"><h4>👒 Tino's wardrobe</h4><div class="mp-wardrobe"></div></div>
    <div class="pl-editor-card mp-pane-card mp-soon"><h4>🎣 Coming soon</h4><p>Take care of Tino 🍼 and go fishing with him 🎣 — and win things to dress him up.</p></div>`;
  fillTinoSettings(pane.querySelector(".mp-tinoset"));
  fillGrumbles(pane.querySelector(".mp-grumbles"));
  fillWardrobe(pane.querySelector(".mp-wardrobe"));
}

// ---------- Onglet ⚙ Settings : compte, notifications, widget, mot de passe ----------
function renderSettings(pane) {
  const P = S.partner;
  pane.innerHTML = `<form class="pl-editor-card mp-pane-card"><h4>${esc(S.me.mark)} ${esc(S.me.label)}</h4>
    <p class="mp-sub">Signed in as ${esc(S.user.email)}</p>
    <h4>🔔 Notifications</h4>
    <div class="mp-notif">Checking…</div>
    ${P ? `<label class="mp-check"><input type="checkbox" name="notify" ${S.me.notify_partner !== false ? "checked" : ""}> Tell me when ${esc(P.mark)} ${esc(P.label)} adds a task</label>` : ""}
    <h4>📱 Home-screen widget</h4>
    <div class="mp-widgets">Checking…</div>
    <h4>🔑 Password</h4>
    <label>New password<input type="password" name="pw" autocomplete="new-password" minlength="6"></label>
    <label>Repeat it<input type="password" name="pw2" autocomplete="new-password" minlength="6"></label>
    <div class="pl-editor-actions"><button type="button" data-act="logout" class="mp-danger">⎋ Log out</button><span class="mp-grow"></span><button type="submit" class="mp-cta">Change password</button></div></form>`;
  const f = pane.querySelector("form");
  f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!f.pw.value) return;
    if (f.pw.value !== f.pw2.value) { toast("The two passwords are different"); return; }
    if (await guard(() => db.changePassword(f.pw.value), "Couldn't change the password")) { f.pw.value = f.pw2.value = ""; toast("Password changed"); }
  });
  f.querySelector("[data-act=logout]").addEventListener("click", async () => { location.hash = ""; await logout(); });
  fillNotif(f.querySelector(".mp-notif"));
  fillWidgets(f.querySelector(".mp-widgets"));
  f.notify?.addEventListener("change", async (ev) => {
    const on = ev.target.checked;
    if (await guard(() => db.updateMyProfile({ notify_partner: on }))) { S.me.notify_partner = on; toast(on ? `You'll be told when ${P.label} adds a task` : `No more notifications for ${P.label}'s new tasks`); }
    else ev.target.checked = !on;
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
function renderNotes(pane) {
  const P = S.partner;
  if (S.notesOk === false) {
    pane.innerHTML = `<div class="pl-editor-card mp-pane-card"><h4>📝 Notes</h4><div class="pl-legend">Shared notes aren't available yet — Tony needs to run <code>supabase/14_notes.sql</code>.</div></div>`;
    return;
  }
  const who = (id) => (id === S.user.id ? S.me : P);
  const preview = (n) => n.body.replace(/\s*\n\s*/g, " · ").slice(0, 140);
  const newDraft = store.get(draftKey(null), null);
  const card = (n) => `<button type="button" class="mp-note" data-note="${n.id}">
      <span class="mp-note-title">${n.private ? "🔒 " : ""}${esc(n.title || "Untitled")}${store.get(draftKey(n.id), null) ? ` <span class="mp-src">not saved yet</span>` : ""}</span>
      ${n.body.trim() ? `<span class="mp-note-preview">${esc(preview(n))}</span>` : ""}
      <span class="pl-legend">${esc(who(n.updatedBy)?.mark ?? "")} ${tinoWhen(n.updated)}</span></button>`;
  pane.innerHTML = `<div class="pl-editor-card mp-pane-card"><div class="mp-notes-head"><h4>📝 Notes</h4><button type="button" class="mp-cta" data-act="newnote">＋ New note</button></div>
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
  const ov = overlay(`<form class="pl-editor-card mp-note-editor">
    <input type="text" name="title" maxlength="120" placeholder="Title" value="${esc(start.title)}">
    <textarea name="body" maxlength="20000" rows="12" placeholder="Write here…">${esc(start.body)}</textarea>
    <div class="mp-note-conflict" hidden></div>
    <div class="pl-editor-row"><label class="mp-check"${mine ? "" : " hidden"}><input type="checkbox" name="private" ${start.private ? "checked" : ""}> 🔒 Only me</label><span class="mp-grow"></span><span class="pl-legend mp-note-state"></span></div>
    <div class="pl-editor-actions">${cur ? `<button type="button" data-act="delete" class="mp-danger">🗑 Delete</button>` : ""}<span class="mp-grow"></span><button type="submit" class="mp-cta">Done</button></div></form>`, { onClose: () => close() });
  const f = ov.querySelector("form"), conflictBox = f.querySelector(".mp-note-conflict");
  const state = (t) => { f.querySelector(".mp-note-state").textContent = t; };
  const values = () => ({ title: f.title.value.trim(), body: f.body.value, private: mine ? f.private.checked : !!cur?.private });
  if (draft) { dirty = true; state("Not saved yet (kept on this phone)"); }
  else if (cur) state(`${S.user.id === cur.updatedBy ? "You" : P} · ${tinoWhen(cur.updated)}`);

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
        if (!saved) { await conflict(v); return false; }
        cur = saved;
      }
      store.del(draftKey(cur.id));
      if (values().title === v.title && values().body === v.body && values().private === v.private) dirty = false; // (rien tapé pendant l'envoi)
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
      return;
    }
    if (!latest) { state("⚠️ Not saved (connection)"); conflictBox.hidden = true; return; }
    conflictBox.innerHTML = `${esc(P)} changed this note while you were writing. <span class="mp-row"><button type="button" data-c="mine">Keep mine</button><button type="button" data-c="theirs">Show theirs</button></span>`;
    conflictBox.querySelector("[data-c=mine]").addEventListener("click", () => { cur = latest; conflictBox.hidden = true; dirty = true; saveOnce(); });
    conflictBox.querySelector("[data-c=theirs]").addEventListener("click", () => {
      cur = latest; f.title.value = latest.title; f.body.value = latest.body; if (mine) f.private.checked = latest.private;
      store.del(draftKey(cur.id)); dirty = false; conflictBox.hidden = true; state(`${P}'s version · ${tinoWhen(latest.updated)}`);
    });
    state("⚠️ Not saved");
  }
  f.addEventListener("input", () => { dirty = true; state("…"); clearTimeout(timer); timer = setTimeout(saveOnce, 1500); });
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
      if (n && n.updated !== cur.updated && n.updatedBy !== S.user.id) state(`✏️ ${P} just edited this note — when you save, you'll choose which version to keep`);
    },
  };
  if (!cur) f.title.focus({ preventScroll: true });
}
