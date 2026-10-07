// Accès aux données : TOUTES les communications avec Supabase passent par ce fichier.
// test.html utilise data-mock.js à la place (même interface, données en mémoire) — l'app ne charge jamais le mock.
//
// Interface (identique dans data-mock.js) :
//   user()                         → utilisateur connecté ({ id, email }) ou null
//   onAuthChange(cb)               → cb(user | null) à chaque connexion / déconnexion
//   signIn(email, password), signOut(), changePassword(password)
//   loadAll(from)                  → { profiles, categories, tasks } (tâches depuis `from` + toutes celles pas faites)
//   insertTask(t), updateTask(id, patch), deleteTask(id)
//   insertCategory({ name, color }), updateCategory(id, patch), deleteCategory(id), renameCategory(id, oldName, newName)
//   subscribe(onChange)            → appelle onChange() à chaque modification (temps réel) ; renvoie la fonction d'arrêt
//   vapidPublicKey, savePushSubscription(sub), removePushSubscription(endpoint), queueTestPush(), pushStatus(),
//   updateMyProfile(patch)         → notifications (voir supabase/03_notifications.sql et supabase/functions/send-push)
//   listWidgetKeys(), registerWidgetKey(sha256, label), revokeWidgetKey(id) → widgets (supabase/05_widgets.sql)
//   listTinoMessages(), sendTinoMessage(to, body), markTinoSeen(id), subscribeTino(onChange) → messages via Tino
//     (supabase/07_tino_messages.sql) ; un message : { id, from, to, body, at: date ISO, seen: date ISO | null }
//   listTinoLines(), addTinoLine(body), deleteTinoLine(id), getBigTino(), setBigTino(blob, meta), resetBigTino(),
//   tinoFile(path), subscribeTinoExtras(onChange) → phrases de Tino et grand Tino (supabase/08_tino_extras.sql)
//   listOutfits(), addOutfit(blob, { name, layer, hideFlower }), wearOutfit(layer, id | null), deleteOutfit(id),
//   subscribeOutfits(onChange) → garde-robe du petit Tino (supabase/12_tino_outfits.sql)
//   listGrumbles(), addGrumble(body), deleteGrumble(id), subscribeGrumbles(onChange) → phrases râleuses (13_tino_grumbles.sql)
//   listNotes(), addNote({ title, body, private }), saveNote(id, patch, version) → note | null (conflit), getNote(id),
//   deleteNote(id), subscribeNotes(onChange) → notes partagées (14_notes.sql) ; une note : { id, by, title, body, private, at, updated, updatedBy }
//
// Format d'une tâche dans l'app : { id, owner, date: "AAAA-MM-JJ", end: "AAAA-MM-JJ" | null, time: "HH:MM" | null,
//   course: nom de catégorie | null, label, done, moon: "full" | "crescent" | null, private, source }
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm";
import { SUPABASE_URL, SUPABASE_KEY, VAPID_PUBLIC_KEY } from "./config.js";

const TASK_COLS = "id, owner, date, end_date, time, category, label, done, moon, private, source, remind_at";
const NOTE_COLS = "id, author, title, body, private, created_at, updated_at, updated_by";
const toNote = (r) => ({ id: r.id, by: r.author, title: r.title, body: r.body, private: !!r.private, at: r.created_at, updated: r.updated_at, updatedBy: r.updated_by });

// Rappel : « AAAA-MM-JJ HH:MM » en heure locale dans l'app, instant absolu (UTC) dans la base
const pad = (n) => String(n).padStart(2, "0");
const localStamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Ligne de la base → tâche de l'app (l'heure Postgres « HH:MM:SS » devient « HH:MM »)
const toTask = (r) => ({
  id: r.id, owner: r.owner, date: r.date, end: r.end_date ?? null, time: r.time ? r.time.slice(0, 5) : null,
  course: r.category ?? null, label: r.label, done: !!r.done, moon: r.moon ?? null, private: !!r.private, source: r.source,
  remind: r.remind_at ? localStamp(new Date(r.remind_at)) : null,
});
// Tâche de l'app → colonnes de la base (seulement les champs fournis)
const toRow = (t) => {
  const r = {};
  if ("date" in t) r.date = t.date;
  if ("end" in t) r.end_date = t.end || null;
  if ("time" in t) r.time = t.time || null;
  if ("course" in t) r.category = t.course || null;
  if ("label" in t) r.label = t.label;
  if ("done" in t) { r.done = !!t.done; r.done_at = t.done ? new Date().toISOString() : null; }
  if ("moon" in t) r.moon = t.moon || null;
  if ("private" in t) r.private = !!t.private;
  if ("remind" in t) r.remind_at = t.remind ? new Date(t.remind.replace(" ", "T")).toISOString() : null;
  return r;
};

export function createBackend() {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  let channel = null;

  return {
    async user() {
      const { data } = await sb.auth.getSession();
      const u = data.session?.user;
      return u ? { id: u.id, email: u.email } : null;
    },
    onAuthChange(cb) {
      // setTimeout : appeler Supabase directement dans ce callback peut bloquer la bibliothèque (cf. doc supabase-js)
      sb.auth.onAuthStateChange((_event, session) => setTimeout(() => cb(session?.user ? { id: session.user.id, email: session.user.email } : null), 0));
    },
    async signIn(email, password) { must(await sb.auth.signInWithPassword({ email, password })); },
    async signOut() { await sb.auth.signOut(); },
    async changePassword(password) { must(await sb.auth.updateUser({ password })); },

    async loadAll(from) {
      const [profiles, categories, tasks] = (await Promise.all([
        sb.from("profiles").select("*"), // « * » : marche avant et après 03_notifications.sql (colonne notify_partner)
        sb.from("categories").select("id, owner, name, color").order("name"),
        sb.from("tasks").select(TASK_COLS).or(`date.gte.${from},end_date.gte.${from},done.is.false`).order("date").order("time", { nullsFirst: true }),
      ])).map(must);
      return { profiles, categories, tasks: tasks.map(toTask) };
    },

    async insertTask(t) { return toTask(must(await sb.from("tasks").insert(toRow(t)).select(TASK_COLS).single())); },
    async updateTask(id, patch) { must(await sb.from("tasks").update(toRow(patch)).eq("id", id)); },
    async deleteTask(id) { must(await sb.from("tasks").delete().eq("id", id)); },

    async insertCategory({ name, color }) { must(await sb.from("categories").insert({ name, color })); },
    async updateCategory(id, patch) { must(await sb.from("categories").update(patch).eq("id", id)); },
    async deleteCategory(id) { must(await sb.from("categories").delete().eq("id", id)); },
    // Renommer met aussi à jour mes tâches qui l'utilisent (la catégorie d'une tâche est son nom)
    async renameCategory(id, oldName, newName) {
      must(await sb.from("categories").update({ name: newName }).eq("id", id));
      const me = (await this.user())?.id;
      must(await sb.from("tasks").update({ category: newName }).eq("owner", me).eq("category", oldName));
    },

    // Notifications : abonnement de cet appareil, test, état (dernier envoi), réglage « prévenir quand l'autre ajoute »
    vapidPublicKey: VAPID_PUBLIC_KEY,
    async savePushSubscription(sub) {
      const j = sub.toJSON ? sub.toJSON() : sub;
      must(await sb.rpc("save_push_subscription", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_user_agent: navigator.userAgent.slice(0, 200) }));
    },
    async removePushSubscription(endpoint) { must(await sb.from("push_subscriptions").delete().eq("endpoint", endpoint)); },
    async queueTestPush() { must(await sb.rpc("queue_test_push")); },
    async pushStatus() {
      const [devices, last] = (await Promise.all([
        sb.from("push_subscriptions").select("endpoint, user_agent, last_status, last_at").order("created_at"),
        sb.from("push_outbox").select("title, status, created_at, sent_at").order("id", { ascending: false }).limit(1),
      ])).map(must);
      return { devices, last: last[0] ?? null };
    },
    async updateMyProfile(patch) {
      const me = (await this.user())?.id;
      must(await sb.from("profiles").update(patch).eq("id", me));
    },

    // Widgets d'écran d'accueil : seule l'empreinte SHA-256 de la clé est envoyée (voir supabase/05_widgets.sql)
    async listWidgetKeys() { return must(await sb.from("widget_tokens").select("id, label, created_at, last_used_at").order("created_at")); },
    async registerWidgetKey(sha256, label) { return must(await sb.rpc("register_widget_token", { p_sha256: sha256, p_label: label })); },
    async revokeWidgetKey(id) { must(await sb.from("widget_tokens").delete().eq("id", id)); },

    // Messages via Tino (les 30 derniers, envoyés ou reçus) ; canal temps réel à part : s'il échoue, les tâches ne sont pas touchées
    async listTinoMessages() {
      const rows = must(await sb.from("tino_messages").select("id, sender, recipient, body, created_at, seen_at").order("id", { ascending: false }).limit(30));
      return rows.map((r) => ({ id: r.id, from: r.sender, to: r.recipient, body: r.body, at: r.created_at, seen: r.seen_at }));
    },
    async sendTinoMessage(to, body) { must(await sb.from("tino_messages").insert({ recipient: to, body })); },
    async markTinoSeen(id) { must(await sb.from("tino_messages").update({ seen_at: new Date().toISOString() }).eq("id", id)); },
    subscribeTino(onChange) {
      const ch = sb.channel("tino-" + Math.random().toString(36).slice(2))
        .on("postgres_changes", { event: "*", schema: "public", table: "tino_messages" }, () => onChange())
        .subscribe();
      return () => sb.removeChannel(ch);
    },

    // Phrases de Tino et grand Tino (supabase/08_tino_extras.sql) ; canal temps réel à part (sans le script 08, rien d'autre ne casse)
    async listTinoLines() {
      const rows = must(await sb.from("tino_lines").select("id, author, body, created_at").order("id"));
      return rows.map((r) => ({ id: r.id, by: r.author, body: r.body, at: r.created_at }));
    },
    async addTinoLine(body) { must(await sb.from("tino_lines").insert({ body })); },
    async deleteTinoLine(id) { must(await sb.from("tino_lines").delete().eq("id", id)); },
    // Animation du grand Tino : null = celle d'origine ; sinon { kind, path, n, cols, rows, fps, by, at }
    async getBigTino() {
      const r = must(await sb.from("shared_settings").select("value, updated_by, updated_at").eq("key", "big_tino").maybeSingle());
      return r ? { ...r.value, by: r.updated_by, at: r.updated_at } : null;
    },
    // Nouveau fichier (nom unique, jamais remplacé), puis le réglage commun, puis l'ancien fichier est supprimé
    async setBigTino(blob, meta) {
      const ext = { "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/png": "png" }[blob.type];
      if (!ext) throw new Error("unsupported file type");
      const old = await this.getBigTino();
      const path = `big/${crypto.randomUUID()}.${ext}`;
      must(await sb.storage.from("tino").upload(path, blob, { contentType: blob.type, upsert: false }));
      must(await sb.from("shared_settings").upsert({ key: "big_tino", value: { ...meta, path } }));
      if (old?.path) await sb.storage.from("tino").remove([old.path]); // (s'il reste, il ne gêne pas)
    },
    async resetBigTino() {
      const old = await this.getBigTino();
      must(await sb.from("shared_settings").delete().eq("key", "big_tino"));
      if (old?.path) await sb.storage.from("tino").remove([old.path]);
    },
    async tinoFile(path) { return must(await sb.storage.from("tino").download(path)); }, // → Blob
    // Notes partagées (supabase/14_notes.sql). saveNote vérifie la version : null = l'autre l'a modifiée (ou supprimée) entre-temps
    async listNotes() {
      return must(await sb.from("notes").select(NOTE_COLS).order("updated_at", { ascending: false })).map(toNote);
    },
    async addNote({ title, body, private: priv }) {
      return toNote(must(await sb.from("notes").insert({ title, body, private: !!priv }).select(NOTE_COLS).single()));
    },
    async saveNote(id, patch, version) {
      const rows = must(await sb.from("notes").update(patch).eq("id", id).eq("updated_at", version).select(NOTE_COLS));
      return rows.length ? toNote(rows[0]) : null;
    },
    async getNote(id) { const r = must(await sb.from("notes").select(NOTE_COLS).eq("id", id).maybeSingle()); return r ? toNote(r) : null; },
    async deleteNote(id) { must(await sb.from("notes").delete().eq("id", id)); },
    subscribeNotes(onChange) {
      const ch = sb.channel("notes-" + Math.random().toString(36).slice(2))
        .on("postgres_changes", { event: "*", schema: "public", table: "notes" }, () => onChange())
        .subscribe();
      return () => sb.removeChannel(ch);
    },

    // Phrases râleuses de Tino, quand on le touche 5 fois (supabase/13_tino_grumbles.sql) ; canal temps réel à part
    async listGrumbles() {
      const rows = must(await sb.from("tino_grumbles").select("id, author, body, created_at").order("id"));
      return rows.map((r) => ({ id: r.id, by: r.author, body: r.body, at: r.created_at }));
    },
    async addGrumble(body) { must(await sb.from("tino_grumbles").insert({ body })); },
    async deleteGrumble(id) { must(await sb.from("tino_grumbles").delete().eq("id", id)); },
    subscribeGrumbles(onChange) {
      const ch = sb.channel("tinog-" + Math.random().toString(36).slice(2))
        .on("postgres_changes", { event: "*", schema: "public", table: "tino_grumbles" }, () => onChange())
        .subscribe();
      return () => sb.removeChannel(ch);
    },

    // Garde-robe du petit Tino (supabase/12_tino_outfits.sql) : tenues dessinées + ce qu'il porte (réglage commun)
    async listOutfits() {
      const [rows, worn] = (await Promise.all([
        sb.from("tino_outfits").select("id, author, name, layer, path, hide_flower, created_at").order("created_at"),
        sb.from("shared_settings").select("value").eq("key", "tino_outfit").maybeSingle(),
      ])).map(must);
      return {
        outfits: rows.map((r) => ({ id: r.id, by: r.author, name: r.name, layer: r.layer, path: r.path, hideFlower: r.hide_flower, at: r.created_at })),
        worn: { head: worn?.value?.head ?? null, body: worn?.value?.body ?? null },
      };
    },
    // Nouveau dessin (PNG transparent déjà réduit sur l'appareil) : fichier, puis la tenue, puis Tino la porte
    async addOutfit(blob, { name, layer, hideFlower }) {
      const ext = { "image/png": "png", "image/webp": "webp" }[blob.type];
      if (!ext) throw new Error("unsupported file type");
      const path = `outfits/${crypto.randomUUID()}.${ext}`;
      must(await sb.storage.from("tino").upload(path, blob, { contentType: blob.type, upsert: false }));
      const row = must(await sb.from("tino_outfits").insert({ name, layer, path, hide_flower: !!hideFlower }).select("id").single());
      await this.wearOutfit(layer, row.id);
    },
    // Ce que Tino porte : une seule écriture (le réglage entier)
    async wearOutfit(layer, id) {
      const cur = must(await sb.from("shared_settings").select("value").eq("key", "tino_outfit").maybeSingle())?.value ?? {};
      must(await sb.from("shared_settings").upsert({ key: "tino_outfit", value: { head: cur.head ?? null, body: cur.body ?? null, [layer]: id } }));
    },
    // Supprimer une tenue (la base l'enlève aussi de ce que Tino porte), puis son fichier
    async deleteOutfit(id) {
      const row = must(await sb.from("tino_outfits").select("path").eq("id", id).maybeSingle());
      must(await sb.from("tino_outfits").delete().eq("id", id));
      if (row?.path) await sb.storage.from("tino").remove([row.path]);
    },
    subscribeOutfits(onChange) {
      const ch = sb.channel("tinow-" + Math.random().toString(36).slice(2))
        .on("postgres_changes", { event: "*", schema: "public", table: "tino_outfits" }, () => onChange())
        .on("postgres_changes", { event: "*", schema: "public", table: "shared_settings" }, () => onChange())
        .subscribe();
      return () => sb.removeChannel(ch);
    },
    subscribeTinoExtras(onChange) {
      const ch = sb.channel("tinox-" + Math.random().toString(36).slice(2))
        .on("postgres_changes", { event: "*", schema: "public", table: "tino_lines" }, () => onChange())
        .on("postgres_changes", { event: "*", schema: "public", table: "shared_settings" }, () => onChange())
        .subscribe();
      return () => sb.removeChannel(ch);
    },

    // Temps réel : sur téléphone, le système coupe la connexion en arrière-plan → l'app se réabonne au retour (voir app.js)
    subscribe(onChange) {
      if (channel) sb.removeChannel(channel);
      channel = sb.channel("meopeo-" + Math.random().toString(36).slice(2))
        .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => onChange())
        .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, () => onChange())
        .subscribe();
      return () => { if (channel) sb.removeChannel(channel); channel = null; };
    },
  };
}
