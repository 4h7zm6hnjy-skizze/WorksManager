'use strict';
/* WorksManager 1.8.4: reliable offline shell; encrypted IndexedDB left unchanged. */
const CACHE_PREFIX = 'worksmanager-v';
const CACHE_NAME = 'worksmanager-v1.8.4-offline-20261008';
const REQUIRED = [
  './index.html',
  './styles.css?v=1.8.4',
  './app.js?v=1.8.4',
  './manifest.json?v=1.8.4'
];
const OPTIONAL = [
  './', './worksmanager-logo.png', './favicon.png',
  './apple-touch-icon.png', './icon-192.png', './icon-512.png', './icon-1024.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // HTML, CSS and JS must all be cached before replacing an older worker.
    await cache.addAll(REQUIRED);
    await Promise.allSettled(OPTIONAL.map(url => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function fetchNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone()).catch(() => {});
      return response;
    }
    return await cache.match(request) || await cache.match('./index.html') || response;
  } catch {
    return await cache.match(request) || await cache.match('./index.html') ||
      new Response('WorksManager wurde noch nicht fuer die Offline-Nutzung gespeichert. Bitte einmal online oeffnen.', {
        status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}
      });
  }
}

async function fetchAppAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const stored = await cache.match(request);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone()).catch(() => {});
      return response;
    }
    return stored || response;
  } catch {
    // Never return index.html as a fallback for app.js or styles.css.
    return stored || Response.error();
  }
}

async function fetchOtherAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const stored = await cache.match(request);
  if (stored) return stored;
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch {
    return Response.error();
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetchNavigation(request));
  } else if (/\.(?:html|css|js|json)$/.test(url.pathname)) {
    event.respondWith(fetchAppAsset(request));
  } else {
    event.respondWith(fetchOtherAsset(request));
  }
});
