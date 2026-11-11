// O3 Car Spaa service worker.
// - Pages (index.html): network first, so a new release shows up on the next open; the cached copy is only for offline.
// - Built files (/assets/*, hashed names) and pictures: cache first, they never change under the same name.
// - API and live-update traffic: never touched, always fresh.
const CACHE_NAME = 'o3-car-spaa-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

const putInCache = (request, response) => {
  if (response && response.status === 200 && response.type === 'basic') {
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
  }
  return response;
};

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io') || url.pathname.startsWith('/uploads')) return;
  // videos stream in byte ranges; the browser handles them (a cached full copy breaks playback on iPhone)
  if (url.pathname.endsWith('.mp4')) return;

  // app pages: always ask the server first
  if (event.request.mode === 'navigate' || (event.request.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => putInCache('/index.html', response))
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // built files and pictures: cache first
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => putInCache(event.request, response)))
  );
});
