// MeoPeo — l'interface (même mise en page que les planners Obsidian MeoMeo / PeoPeo).
// Ne parle jamais directement à Supabase : tout passe par `db` (data.js ; data-mock.js dans test.html).

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
const byDate = (a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? ""));
const upcomingOf = (list) => [
  ...list.filter((e) => urgency(e) === "late"),
  ...list.filter((e) => !e.done && lastDay(e) >= today).slice(0, UPCOMING_COUNT),
];

// ---------- État ----------
let db, root, toastBox, unsubscribe = null, reloadTimer = null;
const S = { user: null, me: null, partner: null, cats: [], mine: [], theirs: [] };
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
  UI.day = today;
  UI.showPartner = store.get("showPartner", true);
  db.onAuthChange((u) => { if ((u?.id ?? null) !== (S.user?.id ?? null)) (u ? boot(u) : showLogin()); });
  const u = await db.user();
  if (u && u.id !== S.user?.id) await boot(u); // (le signal de connexion a pu arriver avant)
  else if (!u && !S.user) showLogin();
  // Retour sur l'app : sur téléphone, la connexion temps réel a pu être coupée → on relit tout et on se réabonne
  const wake = () => { if (!S.user || document.hidden) return; tick(); reload(); resubscribe(); };
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
  pushState().then((st) => toast(`${BELL} Reminder set: ${remindLabel(r)}${st === "on" ? "" : " — turn on notifications in ⚙ to receive it"}`));
}

async function boot(user) {
  S.user = user;
  toastBox.innerHTML = ""; // pas de message du compte précédent
  root.innerHTML = `<div class="mp-loading">🌙 Loading…</div>`;
  await load();
  resubscribe();
  ensurePush();
}
function resubscribe() { unsubscribe?.(); unsubscribe = S.user ? db.subscribe(() => reload()) : null; }
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
      return { ...e, who: mine ? "me" : "partner", editable: mine, color: catColor(e.owner, e.course) ?? person?.color ?? "#999" };
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
  root.innerHTML = `<div class="mp-login pl-card"><h1>MeoPeo</h1><p class="mp-sub">💗 MeoMeo · 💜 PeoPeo</p>
    <form><input type="email" name="email" placeholder="E-mail" autocomplete="username" required>
      <input type="password" name="password" placeholder="Password" autocomplete="current-password" required>
      <button type="submit" class="mp-cta">Sign in</button><div class="mp-err" hidden></div></form></div>`;
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
      <button class="pl-refresh" data-act="refresh" title="Reload">⟳</button><button class="pl-refresh" data-act="menu" title="Account">⚙</button></header>
    <div class="pl-split"><div class="pl-left"></div><div class="pl-right"></div></div>
    <div class="pl-bottom"><div class="mp-soon"></div><div class="mp-partner"></div></div>`;
  renderMine(root.querySelector(".pl-left"));
  renderCalendar(root.querySelector(".pl-right"));
  renderSoon(root.querySelector(".mp-soon"));
  renderPartner(root.querySelector(".mp-partner"), P);
  root.querySelector("[data-act=refresh]").addEventListener("click", () => { tick(); load(); resubscribe(); });
  root.querySelector("[data-act=menu]").addEventListener("click", openMenu);
  root.style.minHeight = "";
  align();
}

function itemHtml(e) {
  const box = e.editable ? `<input type="checkbox" data-tick="${e.id}" ${e.done ? "checked" : ""} aria-label="Done">`
    : `<span class="pl-lock" title="${esc(S.partner?.label ?? "")}'s task — read-only">●</span>`;
  const tag = e.course ? `<b>${esc(e.course)}</b> ` : "";
  const when = ongoing(e) && !e.done;
  return `<div class="pl-item ${urgency(e)}${glowClass(e)}" style="--c:${e.color}">${box}
    <span class="pl-when">${when ? "now" : relDay(e.date)}<small>${dm(when ? today : e.date)}</small></span>
    <span class="pl-what"${e.editable ? ` data-edit="${e.id}"` : ""}>${tag}${hourPill(e)}${esc(e.label)}${e.private ? ` <span class="mp-priv" title="Private: only you can see it">🔒</span>` : ""}${rangeInfo(e)}${bellPill(e)}</span>${e.editable ? `<button class="pl-edit" data-edit="${e.id}" title="Edit this task">✏️</button>` : ""}</div>`;
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
    html += list.slice(0, CAL_PER_DAY).map((e) => `<div class="pl-chip ${urgency(e)}${glowClass(e)}"${e.editable ? ` data-edit="${e.id}"` : ""} style="--c:${e.color}" title="${chipTitle(e)}${e.time ? " (" + e.time + ")" : ""}">${e.course ? `<b>${esc(e.course)}</b> ` : ""}${hourPill(e)}${esc(e.label)}${bellMark(e)}</div>`).join("");
    if (list.length > CAL_PER_DAY) html += `<div class="pl-more">+${list.length - CAL_PER_DAY}</div>`;
    html += `</div>`;
    if (c === 6) html += lanes.segs.map((g) => {
      const e = g.e;
      return `<div class="pl-chip pl-span ${urgency(e)}${glowClass(e)}${g.head ? " head" : ""}${g.tail ? " tail" : ""}"${e.editable ? ` data-edit="${e.id}"` : ` data-goto="${g.first}"`}
        style="--c:${e.color};--lane:${g.lane};grid-row:${w + 2};grid-column:${g.c0 + 1} / ${g.c1 + 2}" title="${chipTitle(e)} (${dm(e.date)} → ${dm(e.end)})">${e.course ? `<b>${esc(e.course)}</b> ` : ""}${g.head ? hourPill(e) : "↪ "}${esc(e.label)}${bellMark(e)}</div>`;
    }).join("");
  }
  html += `</div><div class="pl-legend"><span class="pl-dot" style="--c:${S.me.color}"></span> ${esc(S.me.label)}${S.partner ? ` · <span class="pl-dot" style="--c:${S.partner.color}"></span> ${esc(S.partner.label)}` : ""} · categories in their own colours · tap a day for details · struck through = done</div>
    <div class="pl-card pl-detail"></div>`;
  el.innerHTML = html;
  const detail = el.querySelector(".pl-detail");
  const showDay = (k) => {
    const list = all.filter((e) => onDay(e, k));
    detail.innerHTML = `<h4>${k === today ? "Today — " : ""}${dayTitle(fromIso(k))}</h4>` + (list.length ? list.map(itemHtml).join("") : `<div class="pl-empty">Nothing that day.</div>`);
    bindItems(detail);
  };
  showDay(UI.day);
  el.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => { UI.offset = +b.dataset.m === 0 ? 0 : UI.offset + +b.dataset.m; renderCalendar(el); align(); }));
  el.querySelector(".pl-toggle input")?.addEventListener("change", (ev) => { UI.showPartner = ev.target.checked; store.set("showPartner", UI.showPartner); renderCalendar(el); align(); });
  el.querySelectorAll("[data-day]").forEach((c) => c.addEventListener("click", () => {
    UI.day = c.dataset.day;
    el.querySelectorAll(".pl-day.sel").forEach((x) => x.classList.remove("sel"));
    c.classList.add("sel");
    showDay(UI.day);
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
  requestAnimationFrame(() => {
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
  });
}

// En dessous : aujourd'hui / demain, et les prochaines tâches de l'autre
function renderSoon(el) {
  const block = (k, title) => {
    const list = S.mine.filter((e) => onDay(e, k));
    return `<div class="pl-sub">${title}</div>` + (list.length ? list.map(itemHtml).join("") : `<div class="pl-empty">Nothing planned.</div>`);
  };
  el.innerHTML = `<div class="pl-card"><h4>Today and tomorrow</h4>${block(today, "Today")}${block(tomorrow, "Tomorrow — " + dayTitle(addDays(now, 1)))}</div>`;
  bindItems(el);
}
function renderPartner(el, P) {
  if (!P) { el.innerHTML = ""; return; }
  const up = upcomingOf(S.theirs);
  el.innerHTML = `<div class="pl-card pl-partner"><h4>${esc(P.mark)} ${esc(P.label)} — next ${UPCOMING_COUNT} tasks</h4>
    ${up.length ? up.map(itemHtml).join("") : `<div class="pl-empty">Nothing coming up.</div>`}<div class="pl-legend">Read-only · updates live</div></div>`;
}

// ---------- Fenêtres (édition, compte) — posées sur <body> pour survivre aux mises à jour en temps réel ----------
function overlay(html) {
  document.querySelector(".pl-editor")?.remove();
  const ov = document.createElement("div");
  ov.className = "pl-editor";
  ov.innerHTML = html;
  document.body.appendChild(ov);
  ov.addEventListener("click", (ev) => { if (ev.target === ov) ov.remove(); });
  ov.querySelector("[data-act=cancel]")?.addEventListener("click", () => ov.remove());
  return ov;
}

function openEditor(e) {
  if (!e?.editable) return;
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

function openMenu() {
  const P = S.partner;
  const ov = overlay(`<form class="pl-editor-card"><h4>${esc(S.me.mark)} ${esc(S.me.label)}</h4>
    <p class="mp-sub">Signed in as ${esc(S.user.email)}</p>
    <h4>🔔 Notifications</h4>
    <div class="mp-notif">Checking…</div>
    ${P ? `<label class="mp-check"><input type="checkbox" name="notify" ${S.me.notify_partner !== false ? "checked" : ""}> Tell me when ${esc(P.mark)} ${esc(P.label)} adds a task</label>` : ""}
    <h4>🔑 Password</h4>
    <label>New password<input type="password" name="pw" autocomplete="new-password" minlength="6"></label>
    <label>Repeat it<input type="password" name="pw2" autocomplete="new-password" minlength="6"></label>
    <div class="pl-editor-actions"><button type="button" data-act="logout" class="mp-danger">⎋ Log out</button><span class="mp-grow"></span><button type="button" data-act="cancel">Close</button><button type="submit" class="mp-cta">Change password</button></div></form>`);
  const f = ov.querySelector("form");
  f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!f.pw.value) return;
    if (f.pw.value !== f.pw2.value) { toast("The two passwords are different"); return; }
    if (await guard(() => db.changePassword(f.pw.value), "Couldn't change the password")) { ov.remove(); toast("Password changed"); }
  });
  f.querySelector("[data-act=logout]").addEventListener("click", async () => { ov.remove(); await logout(); });
  fillNotif(f.querySelector(".mp-notif"));
  f.notify?.addEventListener("change", async (ev) => {
    const on = ev.target.checked;
    if (await guard(() => db.updateMyProfile({ notify_partner: on }))) { S.me.notify_partner = on; toast(on ? `You'll be told when ${P.label} adds a task` : `No more notifications for ${P.label}'s new tasks`); }
    else ev.target.checked = !on;
  });
}
