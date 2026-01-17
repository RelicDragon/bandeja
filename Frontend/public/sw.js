const CACHE_VERSION = 'v169';
const CACHE_NAME = `bandeja-${CACHE_VERSION}`;
const RUNTIME_CACHE = `bandeja-runtime-${CACHE_VERSION}`;

const urlsToCache = [
  '/',
  '/index.html',
  '/tennis-ball.svg',
  '/bandeja-blue-flat-small.png',
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
    pathname === '/manifest.json' ||
    pathname.startsWith('/games/');

  if (pathname.startsWith('/api/')) {
    return;
  }

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
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
        return new Response('Offline', { status: 503 });
      })
  );
});
