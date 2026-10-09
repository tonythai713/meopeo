// Service worker de MeoPeo : l'app s'ouvre même sans réseau (ses fichiers sont gardés sur le téléphone).
// ⚠️ À CHAQUE publication d'une nouvelle version : changer VERSION, sinon les téléphones gardent l'ancienne.
// Les données (Supabase : tâches, connexion, temps réel) ne passent JAMAIS par ce cache.
const VERSION = "2026-10-09.7";
const CACHE = "meopeo-" + VERSION;
const SHELL = [
  "./", "index.html", "app.js", "mascot.js", "bigtino.js", "data.js", "config.js", "style.css", "manifest.webmanifest",
  "background.jpg", "art/big-tino.jpg",
  "art/peo/head.webp", "art/peo/head-sleep.webp", "art/peo/body.webp", "art/peo/arm-l.webp", "art/peo/arm-r.webp", "art/peo/shoe-l.webp", "art/peo/shoe-r.webp", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
];

// Bibliothèque Supabase 2.117.2 et ses modules (versions figées : à mettre à jour si data.js change de version)
const CDN = "https://cdn.jsdelivr.net/npm/";
const LIBS = [
  "@supabase/supabase-js@2.117.2/+esm", "@supabase/functions-js@2.117.2/+esm", "@supabase/postgrest-js@2.117.2/+esm",
  "@supabase/realtime-js@2.117.2/+esm", "@supabase/storage-js@2.117.2/+esm", "@supabase/auth-js@2.117.2/+esm",
  "tslib@2.8.1/+esm", "@supabase/phoenix@0.4.5/+esm", "iceberg-js@0.8.1/+esm",
].map((p) => CDN + p);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then(async (c) => {
    // cache: "reload" : toujours depuis le serveur. Sans ça, le téléphone peut reprendre un fichier de la version
    // d'avant dans sa mémoire HTTP (GitHub Pages : max-age=600) et le ranger sous la nouvelle version (vu le 2026-10-07 :
    // la .8 installée avec le mascot.js cassé de la .7)
    await c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })));
    await c.addAll(LIBS).catch(() => { /* gardés au premier chargement sinon */ });
  }).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("meopeo-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Fichiers de l'app : depuis le cache (ouverture instantanée, marche hors ligne), sinon le réseau
  if (url.origin === self.location.origin) {
    event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
    return;
  }
  // Bibliothèque Supabase (version figée sur jsdelivr) : gardée après le premier chargement
  if (url.hostname === "cdn.jsdelivr.net") {
    event.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
  }
  // Tout le reste (Supabase) : réseau direct, sans cache
});

// Notifications : affichées même quand l'app est fermée (sur iPhone, chaque message reçu DOIT afficher une notification)
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(d.title || "MeoPeo", {
    body: d.body || "", tag: d.tag || undefined, icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: { url: d.url || "./" },
  }));
});
// Toucher la notification ouvre MeoPeo (ou le remet au premier plan) ; si elle mène à un onglet (« ./#notes » pour un
// dessin), l'app déjà ouverte y va aussi (message « meopeo-open », écouté dans app.js)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = event.notification.data?.url || "./";
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = wins.find((w) => w.url.startsWith(self.registration.scope));
    if (open) { open.postMessage({ type: "meopeo-open", url }); return open.focus(); }
    return self.clients.openWindow(new URL(url, self.registration.scope).href);
  })());
});
