// Hearth service worker: keeps the app and its built-in frames available offline. Live NASA layers still need a connection.
const CACHE = 'hearth-v3';
const SHELL = ['./', 'index.html', 'src/hearth.css', 'vendor/three.min.js', 'src/core.js', 'src/data.js', 'src/sky.js', 'src/frames.js', 'src/audio.js', 'src/scenes.js', 'src/eic.js', 'src/visuals.js', 'src/app.js',
  'assets/frames/earth-at-night-2012-1024.jpg', 'assets/frames/earth-at-night-2012-2048.jpg', 'assets/frames/blue-marble-1024.jpg', 'assets/frames/blue-marble-2048.jpg', 'assets/icons/icon.svg', 'manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => { const u = new URL(e.request.url); if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }))); });
