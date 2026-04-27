const CACHE_VERSION = 'v605';
const CACHE_NAME = `bandeja-${CACHE_VERSION}`;
const RUNTIME_CACHE = `bandeja-runtime-${CACHE_VERSION}`;

const CHAT_OFFLINE_BACKGROUND_SYNC_TAG = 'chat-offline-flush';
const CHAT_OFFLINE_FLUSH_REQUEST = 'CHAT_OFFLINE_FLUSH_REQUEST';
const CHAT_OFFLINE_FLUSH_ACK = 'CHAT_OFFLINE_FLUSH_ACK';

const urlsToCache = [
  '/',
  '/index.html',
  '/bandeja2-white-tr.png',
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

self.addEventListener('sync', (event) => {
  if (event.tag !== CHAT_OFFLINE_BACKGROUND_SYNC_TAG) return;
  event.waitUntil(runChatOfflineBackgroundSync());
});

function pickFlushClient(clientList) {
  if (!clientList.length) return null;
  const visible = clientList.filter((c) => c.visibilityState === 'visible');
  const pool = visible.length ? visible : clientList;
  const focused = pool.find((c) => c.focused);
  return focused ?? pool[0];
}

function waitForFlushAck(port, timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      port.onmessage = null;
      fn();
    };
    const t = setTimeout(() => {
      finish(() => reject(new Error('chat-offline-flush-ack-timeout')));
    }, timeoutMs);
    port.onmessage = (ev) => {
      if (ev.data?.type === CHAT_OFFLINE_FLUSH_ACK) {
        finish(() => resolve());
      }
    };
  });
}

async function probeReachableOrigin() {
  const paths = ['/api/health', '/health'];
  for (const p of paths) {
    try {
      const res = await fetch(new URL(p, self.location.origin), {
        credentials: 'include',
        cache: 'no-store',
      });
      if (res.ok) return;
    } catch {
      /* try next */
    }
  }
}

async function runChatOfflineBackgroundSync() {
  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const client = pickFlushClient(clientList);
  if (client) {
    const mc = new MessageChannel();
    const ackPromise = waitForFlushAck(mc.port1, 30000);
    try {
      client.postMessage({ type: CHAT_OFFLINE_FLUSH_REQUEST }, [mc.port2]);
    } catch (err) {
      mc.port1.onmessage = null;
      throw err;
    }
    await ackPromise;
  }
  await probeReachableOrigin();
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
