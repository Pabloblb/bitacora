/* Service worker: la app abre sin conexión. Los datos van aparte (db.js guarda copia local). */
var CACHE = 'bitacora-v8';
var SHELL = ['./', 'index.html', 'db.js', 'gym.js', 'gym.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.indexOf('script.google') >= 0 || url.hostname.indexOf('googleusercontent') >= 0) return; // API: siempre red
  if (url.origin === location.origin) {
    // red primero (para ver siempre la última versión), caché si no hay conexión
    // no-cache: revalida con GitHub Pages en vez de usar la copia HTTP de 10 min
    e.respondWith(fetch(new Request(e.request.url, { cache: 'no-cache' })).then(function (r) {
      var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, cp); }); return r;
    }).catch(function () { return caches.match(e.request).then(function (m) { return m || caches.match('index.html'); }); }));
    return;
  }
  // fuentes de Google: caché primero
  e.respondWith(caches.match(e.request).then(function (m) {
    return m || fetch(e.request).then(function (r) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, cp); }); return r; });
  }));
});
