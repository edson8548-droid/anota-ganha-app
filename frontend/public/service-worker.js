const CACHE_NAME = 'venpro-app-v7';
const urlsToCache = [
  '/home.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

const shouldHandleRequest = (request) => {
  if (!request.url.startsWith(self.location.origin)) return false;
  if (request.method !== 'GET') return false;

  const requestUrl = new URL(request.url);
  if (requestUrl.pathname.startsWith('/api/')) return false;
  if (requestUrl.pathname.endsWith('.zip')) return false;

  return true;
};

// Install Service Worker
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching files');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
      .catch((err) => console.log('Service Worker: Cache failed', err))
  );
});

// Activate Service Worker
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache');
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Network First with Cache Fallback
self.addEventListener('fetch', (event) => {
  if (!shouldHandleRequest(event.request)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Check if valid response
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Clone the response
        const responseClone = response.clone();
        
        // Cache the new response
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        
        return response;
      })
      .catch(() => {
        // If network fails, try cache
        return caches.match(event.request).then((response) => {
          if (response) {
            return response;
          }
          
          // If not in cache, return offline page for navigations
          if (event.request.mode === 'navigate') {
            return caches.match('/home.html');
          }
        });
      })
  );
});

// Background Sync (optional - for future offline functionality)
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync', event.tag);
});

// Push Notifications (optional - for future notifications)
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push notification received', event);
});
