// Offline support: app shell + lesson content, network-first with cache fallback.
const CACHE = 'dk90-v4';
const SHELL = ['./', './index.html', './css/app.css', './js/app.js', './js/views.js', './js/util.js', './js/store.js',
  './js/content.js', './js/plan.js', './js/quiz.js', './js/srs.js', './manifest.json', './icons/icon.svg', './content/placement.json', './audio/index.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Media goes straight to the network: Safari can't play audio served through a SW (range requests).
  if (url.pathname.endsWith('.mp3') || e.request.headers.has('range')) return;
  // Network first so an installed app always gets the latest version; cache only when offline.
  e.respondWith(fetch(e.request).then(r => {
    if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request)));
});
