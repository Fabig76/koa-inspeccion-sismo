// Portal KOA · permite abrir el portal sin señal. No guarda datos de la inspección: solo la página y sus archivos.
const V = 'koa-v3-1';
const BASE = ['./', 'config.js', 'manifest.webmanifest', 'icono-192.png', 'vendor/three.module.min.js', 'vendor/OrbitControls.js'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(V).then(c => Promise.all(BASE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => { }))))); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request; const u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/api/')) return;
  const vendor = u.pathname.includes('/vendor/') || /\.png$/.test(u.pathname);
  if (vendor) { e.respondWith(caches.match(r, { ignoreSearch: true }).then(m => m || fetch(r).then(x => { if (x.ok) { const c = x.clone(); caches.open(V).then(k => k.put(r, c)); } return x; }))); return; }
  // Página y configuración: primero la red (siempre la versión nueva); sin señal, la copia guardada
  e.respondWith(fetch(r).then(x => { if (x.ok) { const c = x.clone(); caches.open(V).then(k => k.put(r, c)); } return x; }).catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || (r.mode === 'navigate' ? caches.match('./') : Response.error()))));
});
