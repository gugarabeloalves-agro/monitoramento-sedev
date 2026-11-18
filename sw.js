// Service worker: deixa o app abrir sem sinal e guarda as fotos já vistas.
// Ao mudar arquivos do app, aumente a VERSAO para os celulares pegarem a atualização.
const VERSAO = "mon-v3";
const CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.min.js";
const LEAFLET = ["https://unpkg.com/leaflet@1.9.4/dist/leaflet.js", "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"];
const BASE = ["./", "index.html", "css/app.css", "js/app.js", "js/local.js", "config.js",
  "dados/pivos.js", "dados/mapa.js", "dados/opcoes.js", "dados/site.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", CDN].concat(LEAFLET);

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO && k !== "mon-fotos").map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function comLimite(p, ms) {
  return Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("timeout")), ms))]);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // fotos (links assinados do Storage): guarda depois de ver uma vez
  if (url.pathname.includes("/storage/v1/object/sign/")) {
    e.respondWith(caches.open("mon-fotos").then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) c.put(req, r.clone());
      return r;
    }));
    return;
  }
  // bibliotecas (Supabase e Leaflet): do cache. As imagens de satélite (Esri) vão direto para a rede.
  if (req.url === CDN || LEAFLET.includes(req.url)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
    return;
  }
  // arquivos do app: tenta a rede (3 s) para pegar atualização; sem sinal, usa o cache
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(VERSAO);
      try {
        const r = await comLimite(fetch(req), 3000);
        if (r.ok) c.put(req, r.clone());
        return r;
      } catch (err) {
        return (await c.match(req, { ignoreSearch: true })) || (await c.match("index.html")) || Response.error();
      }
    })());
  }
});
