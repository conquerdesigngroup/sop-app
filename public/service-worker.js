/* eslint-disable no-restricted-globals */

// Service Worker for SOP App
// Enables offline functionality and caching

// IMPORTANT: Increment this version number whenever you deploy to force cache refresh
const CACHE_VERSION = '1.0.22';
const CACHE_NAME = `sop-app-v${CACHE_VERSION}`;

const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
];

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CHECK_FOR_UPDATE') {
    self.registration.update();
  }
});

// Install event - cache essential files
self.addEventListener('install', (event) => {
  console.log(`Installing new service worker version: ${CACHE_VERSION}`);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Opened cache');
      return cache.addAll(urlsToCache.map(url => new Request(url, { cache: 'reload' })));
    }).catch((error) => {
      console.log('Cache install failed:', error);
    })
  );
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log(`Activating service worker version: ${CACHE_VERSION}`);
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log(`Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('All old caches cleared');
      // Take control of all pages immediately
      return self.clients.claim();
    })
  );
});

// Fetch event - Network-first strategy for HTML/API, cache-first for assets
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Skip chrome extension requests
  if (event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  const { request } = event;
  const url = new URL(request.url);

  // Network-first strategy for HTML documents and API calls
  if (request.headers.get('accept')?.includes('text/html') ||
      url.pathname.includes('/api/') ||
      url.pathname === '/' ||
      url.pathname === '/index.html') {

    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone and cache the new response
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          // Network failed, try cache as fallback
          return caches.match(request).then((cachedResponse) => {
            return cachedResponse || caches.match('/index.html');
          });
        })
    );
    return;
  }

  // Cache-first strategy for static assets (CSS, JS, images)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached version but update cache in background
        fetch(request).then((response) => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, response.clone());
            });
          }
        }).catch(() => {});
        return cachedResponse;
      }

      // Not in cache, fetch from network
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });

        return response;
      }).catch(() => {
        return caches.match('/index.html');
      });
    })
  );
});

// Background sync for offline changes
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-offline-changes') {
    event.waitUntil(syncOfflineChanges());
  }
});

async function syncOfflineChanges() {
  // This will be handled by the IndexedDB sync mechanism
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({
      type: 'SYNC_OFFLINE_CHANGES',
    });
  });
}

// Push notification handler. Payloads come from the alert-push Edge Function
// as JSON { title, body, url, tag }. Guarded: a push with a non-JSON body
// (a test from a browser devtools panel, say) must still show something
// rather than throw inside the handler and show nothing.
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { body: event.data.text() };
    }
  }
  const title = data.title || 'DIDC';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // One tag per kind of alert, so a second digest replaces the first
    // instead of stacking up unread in the tray.
    tag: data.tag || 'didc-alert',
    renotify: true,
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click: focus an open tab if there is one and send it to the
// alert's page, otherwise open a new one there.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) {
            return client.navigate(url);
          }
          return client;
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
