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
//
// Format d'une tâche dans l'app : { id, owner, date: "AAAA-MM-JJ", end: "AAAA-MM-JJ" | null, time: "HH:MM" | null,
//   course: nom de catégorie | null, label, done, moon: "full" | "crescent" | null, private, source }
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm";
import { SUPABASE_URL, SUPABASE_KEY, VAPID_PUBLIC_KEY } from "./config.js";

const TASK_COLS = "id, owner, date, end_date, time, category, label, done, moon, private, source, remind_at";

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
