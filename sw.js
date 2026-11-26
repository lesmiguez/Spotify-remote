/* Studio One service worker.
   Network-first for the app shell (revalidating past the HTTP cache) so installed copies
   pick up new releases on the next open; the cache is only an offline fallback.
   Spotify API and image traffic is never intercepted. */
const VERSION = "studio-one-1";
const SHELL = ["./", "index.html", "styles.css?v=one-1", "app.js?v=one-1", "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(
    fetch(req, { cache: "no-cache" })
      .then(r => { if (r && r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); } return r; })
      .catch(() => caches.match(req, { ignoreSearch: req.mode === "navigate" }).then(r => r || caches.match("index.html")))
  );
});
