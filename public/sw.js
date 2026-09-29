/* Switchboard service worker — web push + PWA installability + offline shell. */

// Bumped when cached entries must be dropped: v4 purges any failed responses
// v3 could have stored (see the static-asset branch below).
const CACHE = 'switchboard-v4';
// Static, non-user-specific assets safe to cache. Authenticated page HTML is
// NEVER cached (it's per-user); navigations are network-first with a generic
// offline fallback, so one user can't be served another's cached content.
const PRECACHE = ['/offline.html', '/manifest.webmanifest', '/icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
        ),
      self.clients.claim(),
    ]),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GETs; never touch API routes, auth, or writes.
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/')
  ) {
    return;
  }

  // Static assets: cache-first (they're content-hashed / immutable enough).
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            // Cache-first never revisits an entry, so storing a 404 or 500
            // (a chunk requested mid-deploy) would serve that failure for this
            // URL until the cache name changes.
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Navigations: network-first, fall back to the offline shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(
        () => caches.match(request).then((cached) => cached || caches.match('/offline.html')),
      ),
    );
  }
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = { title: 'Switchboard', body: '', url: '/' };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      // Raster: Android Chrome does not render an SVG notification icon and
      // falls back to a generic glyph.
      icon: '/icons/icon-192.png',
      badge: '/icons/icon.svg',
      data: { url: payload.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
