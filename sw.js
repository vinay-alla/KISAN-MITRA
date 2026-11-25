// Kisan Mitra service worker — keeps the app shell usable on flaky/low-connectivity rural
// networks: the UI, icons and photos load instantly from cache, while data-ish requests
// (page navigation, live weather/geocoding) still prefer the network when it's available.
const CACHE = 'kisan-mitra-v5';

// Relative URLs resolve against this file's location, so the app works both at a domain
// root (python devserver) and under a sub-path (GitHub Pages project site: /<repo>/).
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/api.js',
  './js/app.js',
  './js/crypto.js',
  './js/data.js',
  './js/i18n.js',
  './js/icons.js',
  './js/logic.js',
  './js/pages.js',
  './js/remote.js',
  './js/store.js',
  './js/ui.js',
  './js/util.js',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/logo-192.png',
  './assets/logo-64.png',
  './assets/logo-32.png',
  './assets/field-hero.avif',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never intercept cross-origin calls (live weather/geocoding APIs) — those need the network.
  if (url.origin !== self.location.origin) return;

  // Live mandi prices come from the dev server's /api proxy — always go to the network so
  // a cached response can't pin stale prices.
  if (url.pathname.includes('/api/')) return;

  // App shell + local assets: cache-first, so the interface loads instantly and works offline.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) caches.open(CACHE).then((cache) => cache.put(req, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
