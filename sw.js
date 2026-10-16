// Offline support: app shell + lesson content, stale-while-revalidate.
const CACHE = 'dk90-v2';
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
  e.respondWith(caches.match(e.request).then(cached => {
    const net = fetch(e.request).then(r => {
      if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => cached);
    return cached || net;
  }));
});
