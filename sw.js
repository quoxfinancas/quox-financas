// Service worker do QUOX - Finanças: deixa o site e o assessor abrirem sem internet.
// Rede primeiro (para sempre mostrar a versão mais nova); cache só como reserva.
const CACHE = "quox-v10";
const BASICO = ["./", "artigos.html", "simulador.html", "assessor.html", "assessor.js", "assessor-parser.js", "assessor-lib.js", "assessor-xlsx.js", "assessor-extras.js", "assessor-fase3.js", "push-config.js", "assessor.css", "nav.css", "site.css", "site.js", "config.js", "manifest.webmanifest", "manifest-assessor.webmanifest", "icon-192.png", "icon-512.png"];

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
  const ehLib = url.hostname === "cdn.jsdelivr.net" && url.pathname.indexOf("supabase-js") >= 0; // biblioteca do login: guardada para abrir sem internet
  if (req.method !== "GET" || (url.origin !== self.location.origin && !ehLib)) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok || res.type === "opaque") {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || (req.mode === "navigate" ? caches.match("./") : undefined)))
  );
});

// Notificações (lembretes). O servidor manda {titulo, corpo, url, tag}; aqui só mostramos e abrimos o app ao tocar.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { corpo: e.data ? e.data.text() : "" }; }
  const titulo = String(d.titulo || "QUOX Assessor").slice(0, 80);
  e.waitUntil(self.registration.showNotification(titulo, {
    body: String(d.corpo || "").slice(0, 200), icon: "icon-192.png", badge: "icon-192.png",
    tag: String(d.tag || "quox"), data: { url: typeof d.url === "string" && d.url.indexOf("assessor.html") === 0 ? d.url : "assessor.html" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const alvo = new URL((e.notification.data && e.notification.data.url) || "assessor.html", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    for (const c of cs) { if (c.url.indexOf("assessor.html") >= 0 && "focus" in c) { c.navigate(alvo).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(alvo);
  }));
});
