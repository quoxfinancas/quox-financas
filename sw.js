// Service worker do QUOX - Finanças: deixa o site e o assessor abrirem sem internet.
// Rede primeiro (para sempre mostrar a versão mais nova); cache só como reserva.
const CACHE = "quox-v3";
const BASICO = ["./", "artigos.html", "simulador.html", "assessor.html", "assessor.js", "assessor.css", "nav.css", "site.css", "site.js", "config.js", "manifest.webmanifest", "manifest-assessor.webmanifest", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (e) => {
  // cada arquivo é guardado separadamente: se um faltar, os outros continuam
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(BASICO.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return; // login e CDN passam direto
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || (req.mode === "navigate" ? caches.match("./") : undefined)))
  );
});
