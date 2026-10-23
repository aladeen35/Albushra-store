// Service worker: makes the store installable and usable offline.
//  - app shell + static files: cache, refreshed in the background (stale-while-revalidate)
//  - product images: cache first
//  - API: network first, last good answer when offline (never for orders/admin/payments)
const VERSION = 'bushra-v2';
const SHELL = [
  '/', '/index.html', '/css/app.css', '/manifest.webmanifest',
  '/js/app.js', '/js/api.js', '/js/cart.js', '/js/favorites.js', '/js/icons.js', '/js/rack.js', '/js/rack3d.js', '/js/garment3d.js',
  '/js/garment-image.js', '/js/splash.js', '/js/ui.js', '/js/motion.js', '/js/tryon/mannequin.js', '/js/pages/tryon.js',
  '/js/pages/home.js', '/js/pages/catalog.js', '/js/pages/product.js', '/js/pages/checkout.js', '/js/pages/info.js', '/js/pages/account.js',
  '/vendor/three.min.js', '/vendor/motion.min.js', '/fonts/cairo-arabic.woff2', '/fonts/cairo-latin.woff2', '/fonts/lalezar-arabic.woff2',
  '/brand/icon.svg', '/brand/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/admin') || url.pathname.startsWith('/api/orders') || url.pathname.startsWith('/api/payments') || url.pathname.startsWith('/admin')) return;

  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || Response.error())),
    );
    return;
  }
  if (req.mode === 'navigate') {
    // Client-side routes all use the app shell.
    e.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }
  if (url.pathname.startsWith('/media/') || url.pathname.startsWith('/demo/')) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => hit);
      return hit || net;
    }),
  );
});
