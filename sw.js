const shell = 'fantasy-huddle-shell-v5'
const assets = ['./', './index.html', './style.css', './app.mjs', './account.mjs', './scoring.mjs', './weeks.mjs', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png']
self.addEventListener('install', event => {
  event.waitUntil(caches.open(shell).then(cache => cache.addAll(assets.map(url => new Request(url, { cache: 'reload' })))))
})
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('fantasy-huddle-shell-') && key !== shell).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.open(shell)).match('./index.html')))
    return
  }
  event.respondWith(caches.open(shell).then(async cache => (await cache.match(request)) || fetch(request)))
})
