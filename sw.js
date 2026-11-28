// Service worker: makes the game installable and playable offline.
// App shell is cached on install. Code files (html / js / css / manifest) are NETWORK FIRST so an update shows up on the very next launch;
// everything else (images, audio, fonts) is cached as it is used (stale-while-revalidate).
const VERSION = 'tindang-sara-v2';   // bump this whenever you want every device to throw away its old cache
const SHELL = ['./', './index.html', './manifest.webmanifest', './js/main.js', './js/game.js', './js/view.js', './js/loadingscreen.js', './js/title3d.js',
  './js/ui/pixel.js', './lib/three.module.min.js', './assets/icons/icon-192.png', './assets/icons/icon-512.png'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const isCode = url => /\.(?:js|mjs|css|html|webmanifest)$/i.test(url.pathname) || url.pathname.endsWith('/');

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(SHELL.map(u => c.add(new Request(u, { cache: 'reload' }))))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || req.headers.has('range')) return;   // audio range requests go straight to the network
  const sameOrigin = url.origin === location.origin;
  if (!sameOrigin && !FONT_HOSTS.includes(url.hostname)) return;
  if (req.mode === 'navigate') {   // page loads: network first, cached page when offline
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put('./index.html', copy)); return r; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  if (sameOrigin && isCode(url)) {   // code: network first (always the newest), cache only when offline
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(r => { if (r && r.status === 200) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return r; })
      .catch(() => caches.match(req)));
    return;
  }
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(req);
    const net = fetch(req).then(r => { if (r && (r.status === 200 || r.type === 'opaque')) cache.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
