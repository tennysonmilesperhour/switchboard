/* Switchboard service worker — web push + PWA installability + offline shell. */

// Bumped when cached entries must be dropped. v5 splits the shell (offline
// page, manifest, icons) from the build's static chunks so each can be kept
// fresh on its own terms, and drops everything v4 accumulated.
const VERSION = 'v5';
const SHELL_CACHE = `switchboard-shell-${VERSION}`;
const STATIC_CACHE = `switchboard-static-${VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, STATIC_CACHE];

// Static, non-user-specific assets safe to cache. Authenticated page HTML is
// NEVER cached (it's per-user); navigations are network-first with a generic
// offline fallback, so one user can't be served another's cached content.
const PRECACHE = ['/offline.html', '/manifest.webmanifest', '/icons/icon.svg'];

// Content-hashed build chunks never change, but every deploy adds new ones and
// nothing ever removed the old: the cache only grew. Keep the most recent few
// deploys' worth and let the rest go.
const STATIC_MAX_ENTRIES = 250;
const STATIC_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const CACHED_AT_HEADER = 'sw-cached-at';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE)).catch(() => {}),
  );
  self.skipWaiting();
});

/** Delete old-version caches, then trim this version's static chunks. */
async function pruneCaches() {
  const keys = await caches.keys();
  await Promise.all(
    keys.filter((key) => !CURRENT_CACHES.includes(key)).map((key) => caches.delete(key)),
  );
  await trimStaticCache();
}

async function trimStaticCache() {
  const cache = await caches.open(STATIC_CACHE);
  const requests = await cache.keys();
  const now = Date.now();
  const fresh = [];
  for (const request of requests) {
    const response = await cache.match(request);
    const cachedAt = Number(response && response.headers.get(CACHED_AT_HEADER));
    if (!cachedAt || now - cachedAt > STATIC_MAX_AGE_MS) {
      await cache.delete(request);
    } else {
      fresh.push({ request, cachedAt });
    }
  }
  // Oldest first, so the overflow that goes is the stalest.
  fresh.sort((a, b) => a.cachedAt - b.cachedAt);
  const overflow = fresh.length - STATIC_MAX_ENTRIES;
  for (let i = 0; i < overflow; i += 1) {
    await cache.delete(fresh[i].request);
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([pruneCaches().catch(() => {}), self.clients.claim()]));
});

function isBuildChunk(url) {
  return url.pathname.startsWith('/_next/static/');
}

function isShellAsset(url) {
  return url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest';
}

/** A copy of a response stamped with when it was cached, for pruning by age. */
async function stamped(response) {
  const headers = new Headers(response.headers);
  headers.set(CACHED_AT_HEADER, String(Date.now()));
  const body = await response.blob();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

let putsSinceTrim = 0;

async function cacheBuildChunk(request, response) {
  const cache = await caches.open(STATIC_CACHE);
  await cache.put(request, await stamped(response));
  // A long-lived tab across many deploys should not have to wait for the next
  // service-worker update to be trimmed.
  putsSinceTrim += 1;
  if (putsSinceTrim >= 50) {
    putsSinceTrim = 0;
    await trimStaticCache();
  }
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

  // Build chunks: cache-first. They are content-hashed, so a cached one is
  // never stale — only unused, which the pruning above deals with.
  if (isBuildChunk(url)) {
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
              event.waitUntil(cacheBuildChunk(request, copy).catch(() => {}));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Manifest and icons: stale-while-revalidate. They keep the same URL when
  // they change, so cache-first meant an installed app kept its old name and
  // icon forever. Serve the cached copy for speed (and offline), and refresh it
  // in the background for next time.
  if (isShellAsset(url)) {
    event.respondWith(
      caches.open(SHELL_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const refresh = fetch(request)
            .then((response) => {
              if (response.ok) {
                return cache.put(request, response.clone()).then(() => response);
              }
              return response;
            })
            .catch(() => cached);
          if (cached) {
            event.waitUntil(refresh.then(() => undefined, () => undefined));
            return cached;
          }
          return refresh.then((response) => response || Response.error());
        }),
      ),
    );
    return;
  }

  // Navigations: network-first, fall back to the offline shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(
        () =>
          caches
            .match('/offline.html', { cacheName: SHELL_CACHE })
            .then((cached) => cached || caches.match('/offline.html'))
            .then((cached) => cached || Response.error()),
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

/** Only ever open our own pages from a notification. */
function notificationTarget(raw) {
  try {
    const url = new URL(raw || '/', self.location.origin);
    return url.origin === self.location.origin ? url.href : new URL('/', self.location.origin).href;
  } catch {
    return new URL('/', self.location.origin).href;
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = notificationTarget(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Prefer a window already showing Switchboard. `navigate()` rejects for
      // a window this worker does not control (one opened before it was
      // installed, or after a hard reload), and the old code did not wait for
      // or catch that — so the tap focused nothing and went nowhere. Focus
      // first, then navigate, and if navigating is refused open a fresh window
      // instead: a tap must always land on the page it names.
      const client = windows.find((candidate) => 'focus' in candidate);
      if (!client) return self.clients.openWindow(url);
      return client
        .focus()
        .then((focused) => (focused || client).navigate(url))
        .catch(() => self.clients.openWindow(url));
    }),
  );
});
