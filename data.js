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
//   listOutfits(), addOutfit(blob, { name, layer, hideFlower }), wearOutfit(layer, id | null), deleteOutfit(id), renameOutfit(id, name),
//   subscribeOutfits(onChange) → garde-robe du petit Tino (supabase/12_tino_outfits.sql) ; une tenue a aussi caughtAt /
//     caughtBy (20_fishing.sql : pêchée quand, par qui ; null = dans la réserve)
//   fishTino() → la prise d'un lancer, listCatches() → { catches (les plus récentes d'abord), color (couleur active | null) },
//   subscribeCatches(onChange) → la pêche (20_fishing.sql) ; une prise : { id, by, at, kind: "outfit" | "color" | "junk",
//     outfit, outfitName, color: { h, s, l } | null, junk, until }
//   listFeeding() → { belly: { fill, at, by, fish, burnt } | null, fish: { fish, big_fish, golden_fish } (pas encore mangés) },
//   feedTino(kind) → le ventre après le repas, listHungerLines(), addHungerLine(level, body), deleteHungerLine(id),
//   subscribeFeeding(onChange) → nourrir Tino (21_feeding.sql) ; une phrase de faim : { id, by, level, body }
//   presence(myId, onChange) → { set(here), stop() } : qui a MeoPeo ouvert à l'écran en ce moment (temps réel, sans table) ;
//     onChange(Set des id présents) — PeoPeo / MeoMeo dans la marmite
//   getBath() → { at, by } (dernier bain), washTino() → { at, by, washedColour }, subscribeBath(onChange) → laver Tino (23_bath.sql)
//   listDecor(), setDecor(blob, { season, layout, light }), deleteDecor({ season, layout, light }),
//   subscribeDecor(onChange) → décor dessiné, fond d'écran par saison / jour-nuit / format (supabase/16_decor.sql)
//   listGrumbles(), addGrumble(body), deleteGrumble(id), subscribeGrumbles(onChange) → phrases râleuses (13_tino_grumbles.sql)
//   listSeries(), createSeries(task, rule, today), topUpSeries(today), splitSeries(id, task, shift), endSeries(id),
//   subscribeSeries(onChange) → tâches récurrentes (15_recurring.sql) ; une tâche a aussi « series » (id de sa série ou null)
//   listNotes(), addNote({ title, body, private }), saveNote(id, patch, version) → note | null (conflit), getNote(id),
//   deleteNote(id), subscribeNotes(onChange) → notes partagées (14_notes.sql) ; une note : { id, by, title, body, private, at, updated, updatedBy }
//   listDoodles(), doodlePngs(ids), sendDoodle(png), deleteDoodle(id), subscribeDoodles(onChange) → dessins envoyés à l'autre,
//     pour son widget (19_doodles.sql) ; un dessin : { id, by, at } (l'image, PNG en base64, se lit à part : doodlePngs → Map id → png)
//
// Format d'une tâche dans l'app : { id, owner, date: "AAAA-MM-JJ", end: "AAAA-MM-JJ" | null, time: "HH:MM" | null,
//   course: nom de catégorie | null, label, done, moon: "full" | "crescent" | null, private, source }
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm";
import { SUPABASE_URL, SUPABASE_KEY, VAPID_PUBLIC_KEY } from "./config.js";

// « * » : marche avant et après 15_recurring.sql (colonne series) — une colonne inconnue ferait échouer tout le chargement
const TASK_COLS = "*";
const NOTE_COLS = "id, author, title, body, private, created_at, updated_at, updated_by";
const toCatch = (r) => ({ id: r.id, by: r.by, at: r.at, kind: r.kind, outfit: r.outfit ?? null, outfitName: r.outfit_name ?? null, color: r.color ?? null, junk: r.junk ?? null, until: r.until ?? null, eatenAt: r.eaten_at ?? null });
const FISH_KINDS = ["fish", "big_fish", "golden_fish"]; // (poissons mangeables : 21_feeding.sql)
const toNote = (r) => ({ id: r.id, by: r.author, title: r.title, body: r.body, private: !!r.private, at: r.created_at, updated: r.updated_at, updatedBy: r.updated_by });

// Rappel : « AAAA-MM-JJ HH:MM » en heure locale dans l'app, instant absolu (UTC) dans la base
const pad = (n) => String(n).padStart(2, "0");
const localStamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Ligne de la base → tâche de l'app (l'heure Postgres « HH:MM:SS » devient « HH:MM »)
const toTask = (r) => ({
  id: r.id, owner: r.owner, date: r.date, end: r.end_date ?? null, time: r.time ? r.time.slice(0, 5) : null,
  course: r.category ?? null, label: r.label, done: !!r.done, moon: r.moon ?? null, private: !!r.private, source: r.source,
  remind: r.remind_at ? localStamp(new Date(r.remind_at)) : null, series: r.series ?? null,
});
// Séries : fuseau du téléphone, et rappel découpé en « jour relatif à l'occurrence » + « heure »
const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Zurich"; } catch { return "Europe/Zurich"; } })();
const dayDiff = (a, b) => Math.round((Date.UTC(...b.split("-").map((n, i) => n - (i === 1))) - Date.UTC(...a.split("-").map((n, i) => n - (i === 1)))) / 86400000);
const remindParts = (date, remind) => (remind ? { days: dayDiff(date, remind.slice(0, 10)), time: remind.slice(11) } : { days: null, time: null });
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
    // Tâches récurrentes (supabase/15_recurring.sql) : chaque occurrence est une vraie tâche (colonne series).
    // rule = { freq: "daily" | "weekly" | "monthly" | "yearly", every, until }. Rappel : jour relatif + heure, fuseau du téléphone.
    async listSeries() {
      return must(await sb.from("task_series").select("id, owner, freq, every, anchor, until, label, private"));
    },
    async createSeries(t, rule, today) {
      const r = remindParts(t.date, t.remind);
      return must(await sb.rpc("create_series", {
        p_freq: rule.freq, p_every: rule.every ?? 1, p_anchor: t.date, p_until: rule.until || null, p_span: t.end ? dayDiff(t.date, t.end) : 0,
        p_time: t.time || null, p_category: t.course || null, p_label: t.label, p_moon: t.moon || null, p_private: !!t.private,
        p_remind_days: r.days, p_remind_time: r.time, p_tz: TZ, p_today: today,
      }));
    },
    async topUpSeries(today) { return must(await sb.rpc("top_up_my_series", { p_today: today })); },
    // « Cette occurrence et les suivantes » : shift = nombre de jours de décalage (nouvelle date − ancienne)
    async splitSeries(id, t, shift) {
      const r = remindParts(t.date, t.remind);
      return must(await sb.rpc("split_series", {
        p_task: id, p_shift: shift, p_time: t.time || null, p_category: t.course || null, p_label: t.label, p_moon: t.moon || null,
        p_private: !!t.private, p_remind_days: r.days, p_remind_time: r.time, p_tz: TZ,
      }));
    },
    async endSeries(id) { return must(await sb.rpc("end_series", { p_task: id })); },
    subscribeSeries(onChange) {
      const ch = sb.channel("series-" + Math.random().toString(36).slice(2))
        .on("postgres_changes", { event: "*", schema: "public", table: "task_series" }, () => onChange())
        .subscribe();
      return () => sb.removeChannel(ch);
    },

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

    // Dessins pour le widget de l'autre (supabase/19_doodles.sql) : la liste sans les images (plus récents d'abord), les
    // images seulement pour ce qu'on affiche (~30–300 Ko chacune) ; canal temps réel à part (sans 19, rien d'autre ne casse)
    async listDoodles() {
      return must(await sb.from("doodles").select("id, author, created_at").order("created_at", { ascending: false }).limit(60))
        .map((r) => ({ id: r.id, by: r.author, at: r.created_at }));
    },
    async doodlePngs(ids) {
      return new Map(ids.length ? must(await sb.from("doodles").select("id, png").in("id", ids)).map((r) => [r.id, r.png]) : []);
    },
    async sendDoodle(png) {
      const r = must(await sb.from("doodles").insert({ png }).select("id, author, created_at").single());
      return { id: r.id, by: r.author, at: r.created_at };
    },
    async deleteDoodle(id) { must(await sb.from("doodles").delete().eq("id", id)); },
    subscribeDoodles(onChange) {
      const ch = sb.channel("doodles-" + Math.random().toString(36).slice(2))
        .on("postgres_changes", { event: "*", schema: "public", table: "doodles" }, () => onChange())
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
      const [r1, r2, r3] = await Promise.all([
        sb.from("tino_outfits").select("*").order("created_at"), // (« * » : marche avant et après 17, qui ajoute anim)
        sb.from("shared_settings").select("value").eq("key", "tino_outfit").maybeSingle(),
        sb.rpc("outfit_hours"), // (26 : durée des tenues pêchées, en heures ; sans 26 : erreur → null = 7 jours)
      ]);
      const rows = must(r1), worn = must(r2);
      return {
        hours: r3.error ? null : r3.data,
        outfits: rows.map((r) => ({ id: r.id, by: r.author, name: r.name, layer: r.layer, path: r.path, hideFlower: r.hide_flower, anim: r.anim ?? null, at: r.created_at, caughtAt: r.caught_at ?? null, caughtBy: r.caught_by ?? null })),
        worn: { head: worn?.value?.head ?? null, body: worn?.value?.body ?? null },
      };
    },
    // Durée des tenues pêchées, commune aux deux (26_outfit_hours.sql) : 1 à 168 heures
    async setOutfitHours(hours) { must(await sb.from("shared_settings").upsert({ key: "outfit_hours", value: { hours } })); },
    // Nouveau dessin (PNG transparent déjà réduit sur l'appareil, ou planche d'une tenue animée + anim, voir
    // 17_outfit_anim.sql) : fichier, puis la tenue (sinon le fichier est retiré) ; renvoie son id (avec la pêche, 20, elle
    // part dans la réserve : c'est l'app qui décide de la faire porter ou non)
    async addOutfit(blob, { name, layer, hideFlower, anim = null }) {
      const ext = { "image/png": "png", "image/webp": "webp" }[blob.type];
      if (!ext) throw new Error("unsupported file type");
      const path = `outfits/${crypto.randomUUID()}.${ext}`;
      must(await sb.storage.from("tino").upload(path, blob, { contentType: blob.type, upsert: false }));
      let row;
      try { row = must(await sb.from("tino_outfits").insert({ name, layer, path, hide_flower: !!hideFlower, ...(anim ? { anim } : {}) }).select("id").single()); }
      catch (err) { await sb.storage.from("tino").remove([path]).catch(() => {}); throw err; }
      return row.id;
    },
    // La pêche (supabase/20_fishing.sql) : le tirage est fait par la base (on ne sait pas ce qu'on attrape avant)
    async fishTino() { return toCatch(must(await sb.rpc("fish_tino"))); },
    async listCatches() {
      const [rows, color] = (await Promise.all([
        sb.from("tino_catches").select("*").order("at", { ascending: false }).limit(30),
        sb.from("tino_catches").select("*").eq("kind", "color").gt("until", new Date().toISOString()).order("at", { ascending: false }).limit(1).maybeSingle(),
      ])).map(must);
      return { catches: rows.map(toCatch), color: color ? toCatch(color) : null };
    },
    // Nourrir Tino (supabase/21_feeding.sql) : canal temps réel à part (sans 21, la pêche marche comme avant)
    async listFeeding() {
      const [belly, fish] = (await Promise.all([
        sb.from("tino_belly").select("*").maybeSingle(), // (« * » : marche avant et après 24, qui ajoute burnt)
        sb.from("tino_catches").select("junk").eq("kind", "junk").in("junk", FISH_KINDS).is("eaten_at", null),
      ])).map(must);
      const n = { fish: 0, big_fish: 0, golden_fish: 0 };
      for (const r of fish) n[r.junk]++;
      return { belly: belly ? { fill: belly.fill, at: belly.at, by: belly.fed_by, fish: belly.fish, burnt: !!belly.burnt } : null, fish: n };
    },
    async feedTino(kind) { const r = must(await sb.rpc("feed_tino", { p_fish: kind })); return { fill: r.fill, at: r.at, by: r.by, fish: r.fish, burnt: !!r.burnt }; }, // (burnt : 24_cooking.sql, 1 fois sur 10)
    async listHungerLines() {
      return must(await sb.from("tino_hunger_lines").select("id, author, level, body").order("id")).map((r) => ({ id: r.id, by: r.author, level: r.level, body: r.body }));
    },
    async addHungerLine(level, body) { must(await sb.from("tino_hunger_lines").insert({ level, body })); },
    async deleteHungerLine(id) { must(await sb.from("tino_hunger_lines").delete().eq("id", id)); },
    // Présence (Realtime Presence, pas de table) : chacun « s'annonce » tant que l'app est à l'écran ; set(false) quand elle
    // passe en arrière-plan, set(true) au retour ; le téléphone coupe aussi la connexion en arrière-plan (l'app refait tout au retour)
    presence(myId, onChange) {
      let here = true;
      const ch = sb.channel("meopeo-presence", { config: { presence: { key: myId } } });
      ch.on("presence", { event: "sync" }, () => onChange(new Set(Object.keys(ch.presenceState()))));
      ch.subscribe((status) => { if (status === "SUBSCRIBED" && here) ch.track({ at: Date.now() }).catch(() => {}); });
      return {
        set(v) { here = v; (v ? ch.track({ at: Date.now() }) : ch.untrack()).catch(() => {}); },
        stop() { sb.removeChannel(ch); },
      };
    },
    // Laver Tino (supabase/23_bath.sql) : le dernier bain (la saleté se calcule avec le temps) ; le bain enlève la couleur
    async getBath() { const r = must(await sb.from("tino_bath").select("at, washed_by").maybeSingle()); return r ? { at: r.at, by: r.washed_by } : null; },
    async washTino() { const r = must(await sb.rpc("wash_tino")); return { at: r.at, by: r.by, washedColour: !!r.washed_colour }; },
    subscribeBath(onChange) {
      const ch = sb.channel("bath-" + Math.random().toString(36).slice(2))
        .on("postgres_changes", { event: "*", schema: "public", table: "tino_bath" }, () => onChange())
        .subscribe();
      return () => sb.removeChannel(ch);
    },
    subscribeFeeding(onChange) {
      const ch = sb.channel("feed-" + Math.random().toString(36).slice(2))
        .on("postgres_changes", { event: "*", schema: "public", table: "tino_belly" }, () => onChange())
        .on("postgres_changes", { event: "*", schema: "public", table: "tino_hunger_lines" }, () => onChange())
        .subscribe();
      return () => sb.removeChannel(ch);
    },
    subscribeCatches(onChange) {
      const ch = sb.channel("fish-" + Math.random().toString(36).slice(2))
        .on("postgres_changes", { event: "*", schema: "public", table: "tino_catches" }, () => onChange())
        .subscribe();
      return () => sb.removeChannel(ch);
    },
    // Images du widget « Tino » avec la tenue portée (supabase/18_widget_scenes.sql) : empreinte de chaque scène rangée,
    // ranger une image (PNG en base64), tout effacer (plus de tenue : le widget reprend ses images de base)
    async widgetSceneSigs() {
      return new Map(must(await sb.from("widget_scenes").select("scene, sig")).map((r) => [r.scene, r.sig]));
    },
    async saveWidgetScene(scene, png, sig) {
      must(await sb.from("widget_scenes").upsert({ scene, png, sig }, { onConflict: "scene", returning: "minimal" }));
    },
    async clearWidgetScenes() { must(await sb.from("widget_scenes").delete().gte("scene", "")); },
    // Ce que Tino porte : une seule écriture (le réglage entier)
    async wearOutfit(layer, id) {
      const cur = must(await sb.from("shared_settings").select("value").eq("key", "tino_outfit").maybeSingle())?.value ?? {};
      must(await sb.from("shared_settings").upsert({ key: "tino_outfit", value: { head: cur.head ?? null, body: cur.body ?? null, [layer]: id } }));
    },
    // Renommer une tenue (les deux peuvent : 12_tino_outfits.sql) ; 1 à 40 caractères
    async renameOutfit(id, name) { must(await sb.from("tino_outfits").update({ name }).eq("id", id)); },
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
    // Décor dessiné (supabase/16_decor.sql) : une image par saison × format (phone / desktop) × moment (day / night), commune
    async listDecor() {
      const rows = must(await sb.from("decor").select("season, layout, light, path, author, updated_at"));
      return rows.map((r) => ({ season: r.season, layout: r.layout, light: r.light, path: r.path, by: r.author, at: r.updated_at }));
    },
    // Nouveau fichier (nom unique), puis l'emplacement pointe dessus (set_decor renvoie l'ancien fichier), puis l'ancien est effacé
    async setDecor(blob, { season, layout, light }) {
      const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[blob.type];
      if (!ext) throw new Error("unsupported file type");
      const path = `decor/${crypto.randomUUID()}.${ext}`;
      must(await sb.storage.from("tino").upload(path, blob, { contentType: blob.type, upsert: false }));
      let old;
      try { old = must(await sb.rpc("set_decor", { p_season: season, p_layout: layout, p_light: light, p_path: path })); }
      catch (err) { await sb.storage.from("tino").remove([path]); throw err; } // (le fichier envoyé ne servirait à rien)
      if (old) await sb.storage.from("tino").remove([old]); // (s'il reste, il ne gêne pas)
    },
    async deleteDecor({ season, layout, light }) {
      const rows = must(await sb.from("decor").delete().match({ season, layout, light }).select("path"));
      if (rows[0]?.path) await sb.storage.from("tino").remove([rows[0].path]);
    },
    subscribeDecor(onChange) {
      const ch = sb.channel("decor-" + Math.random().toString(36).slice(2))
        .on("postgres_changes", { event: "*", schema: "public", table: "decor" }, () => onChange())
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
