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

async function isGameResultsEntryPage() {
  try {
    const clients = await self.clients.matchAll({ type: 'window' });
    return clients.some(client => {
      const url = new URL(client.url);
      return url.pathname.includes('/games/') && url.pathname.includes('/results');
    });
  } catch (error) {
    return false;
  }
}

function isGameResultsApi(pathname) {
  return pathname.startsWith('/api/results/') || 
         pathname.startsWith('/api/games/');
}

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
    pathname === '/manifest.json';

  if (pathname.startsWith('/api/')) {
    event.respondWith(
      (async () => {
        const isGameResultsPage = await isGameResultsEntryPage();
        const isGameResultsEndpoint = isGameResultsApi(pathname);
        
        if (isGameResultsPage && isGameResultsEndpoint) {
          try {
            const response = await fetch(event.request);
            if (response && response.status === 200 && event.request.method === 'GET') {
              const responseClone = response.clone();
              caches.open(RUNTIME_CACHE).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
            return response;
          } catch (error) {
            const cached = await caches.match(event.request);
            if (cached) {
              return cached;
            }
            throw error;
          }
        }
        
        try {
          const response = await Promise.race([
            fetch(event.request),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('timeout')), 5000)
            )
          ]);
          
          if (response && response.status === 200 && event.request.method === 'GET') {
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        } catch (error) {
          const cached = await caches.match(event.request);
          if (cached) {
            console.log('Serving API from cache (offline):', pathname);
            return cached;
          }
          
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
        }
      })()
    );
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
