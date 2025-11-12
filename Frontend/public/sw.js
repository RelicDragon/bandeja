const CACHE_VERSION = Date.now();
const CACHE_NAME = `bandeja-v${CACHE_VERSION}`;
const RUNTIME_CACHE = `bandeja-runtime-v${CACHE_VERSION}`;

const urlsToCache = [
  '/',
  '/index.html',
  '/tennis-ball.svg',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .catch((err) => {
        console.error('Failed to cache resources:', err);
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const pathname = requestUrl.pathname;
  
  // Define what should be cached
  const shouldCache = 
    pathname.endsWith('.svg') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.gif') ||
    pathname.endsWith('.webp') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.js') ||
    pathname === '/' ||
    pathname === '/index.html' ||
    pathname === '/manifest.json';

  // For API requests, use network-first strategy with timeout
  if (pathname.startsWith('/api/')) {
    event.respondWith(
      Promise.race([
        fetch(event.request).then((response) => {
          // Cache successful GET API responses for offline access
          if (response && response.status === 200 && event.request.method === 'GET') {
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('timeout')), 5000)
        )
      ]).catch(() => {
        // If network fails, try cache
        return caches.match(event.request).then((cached) => {
          if (cached) {
            console.log('Serving API from cache (offline):', pathname);
            return cached;
          }
          // Return a custom offline response
          return new Response(
            JSON.stringify({ 
              error: 'offline', 
              message: 'No internet connection' 
            }), 
            {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        });
      })
    );
    return;
  }

  // For other resources, use cache-first strategy
  if (!shouldCache) {
    return fetch(event.request);
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request).then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          if (requestUrl.protocol === 'http:' || requestUrl.protocol === 'https:') {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          
          return response;
        });
      })
      .catch(() => {
        // If both cache and network fail, return fallback
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
        return new Response('Offline', { status: 503 });
      })
  );
});
