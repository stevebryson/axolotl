/* Axolotl Gene Lab service worker: precache the app shell, serve cache-first, clean old versions. */
const VERSION = 'axolab-v2.3.0';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/main.js',
  './js/game.js',
  './js/genetics.js',
  './js/names.js',
  './js/storage.js',
  './js/axolotl3d.js',
  './js/tank3d.js',
  './js/controls.js',
  './js/ui.js',
  './js/audio.js',
  './js/heron3d.js',
  './js/decor3d.js',
  './js/tips.js',
  './vendor/BufferGeometryUtils.js',
  './vendor/three.module.min.js',
  './vendor/three.core.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => (request.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    }),
  );
});
