/* ERABG service worker — runtime caching for offline use + PWA installability.
   Asset filenames are content-hashed by Vite, so a runtime "cache on fetch"
   strategy keeps everything fresh without a precompiled manifest. */
const CACHE = 'erabg-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  // Navigations: network-first, fall back to the cached app shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('./index.html').then((r) => r || caches.match('./')),
      ),
    )
    return
  }

  // Everything else (hashed app assets, the WASM engine, CDN model files):
  // serve from cache if present, otherwise fetch and cache for next time.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request)
      const network = fetch(request)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone())
          return res
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})
