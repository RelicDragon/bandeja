const CACHE_VERSION = 'v940';
const CACHE_NAME = `bandeja-${CACHE_VERSION}`;
const RUNTIME_CACHE = `bandeja-runtime-${CACHE_VERSION}`;

const CHAT_OFFLINE_BACKGROUND_SYNC_TAG = 'chat-offline-flush';
const CHAT_OFFLINE_FLUSH_REQUEST = 'CHAT_OFFLINE_FLUSH_REQUEST';
const CHAT_OFFLINE_FLUSH_ACK = 'CHAT_OFFLINE_FLUSH_ACK';

const urlsToCache = [
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

function isNavigationRequest(request, pathname) {
  return (
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    pathname === '/' ||
    pathname === '/index.html'
  );
}

function isHashedBuildAsset(pathname) {
  return pathname.startsWith('/assets/') && /\.(js|css)$/.test(pathname);
}

function isStaticMedia(pathname) {
  return /\.(svg|png|jpg|jpeg|gif|webp|woff2?|ttf|eot|ico|lottie)$/.test(pathname);
}

async function putInCache(request, response, cacheName = CACHE_NAME) {
  if (!response || response.status !== 200 || response.type !== 'basic') return;
  const clone = response.clone();
  const cache = await caches.open(cacheName);
  await cache.put(request, clone);
}

async function networkFirst(request, { offlineDocumentFallback = false } = {}) {
  try {
    const response = await fetch(request);
    await putInCache(request, response);
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (offlineDocumentFallback) {
      const shell = await caches.match('/index.html');
      if (shell) return shell;
    }
    return new Response('Offline', { status: 503 });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  await putInCache(request, response);
  return response;
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const networkPromise = fetch(request)
    .then(async (response) => {
      await putInCache(request, response);
      return response;
    })
    .catch(() => null);

  if (cached) {
    void networkPromise;
    return cached;
  }

  const response = await networkPromise;
  if (response) return response;
  return new Response('Offline', { status: 503 });
}

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const pathname = requestUrl.pathname;

  if (pathname.startsWith('/api/') || pathname === '/sw.js') {
    return;
  }

  if (isNavigationRequest(event.request, pathname)) {
    event.respondWith(networkFirst(event.request, { offlineDocumentFallback: true }));
    return;
  }

  if (isHashedBuildAsset(pathname)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  if (isStaticMedia(pathname) || pathname === '/manifest.json') {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }
});
