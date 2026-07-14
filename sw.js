/* Moss — service worker: caches the app shell so it can launch offline,
   but always checks the network first for the app files so updates you
   push to GitHub show up immediately instead of being stuck on an old
   cached copy. */

/* IMPORTANT: bump this version string every time you deploy a change.
   Bumping it makes the browser treat this as a new service worker,
   which triggers 'activate' below to delete the old cache. */
const CACHE_NAME = 'moss-cache-v2';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js',
  'https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Quicksand:wght@500;600;700;800&display=swap'
];

// Files where freshness matters most — always try the network first.
const NETWORK_FIRST = ['/index.html', '/manifest.json', '/sw.js'];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL).catch(function () {
        /* Some cross-origin assets (fonts CSS) may fail to precache in some browsers; ignore and continue */
      });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return key !== CACHE_NAME; })
            .map(function (key) { return caches.delete(key); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

function isNetworkFirst(url) {
  return NETWORK_FIRST.some(function (path) { return url.pathname.endsWith(path); })
    || url.pathname === '/' || url.pathname.endsWith('/');
}

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  var url = new URL(event.request.url);

  if (isNetworkFirst(url)) {
    // Network-first: always try to get the latest file; fall back to cache offline.
    event.respondWith(
      fetch(event.request).then(function (response) {
        if (response && response.status === 200) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
        }
        return response;
      }).catch(function () {
        return caches.match(event.request);
      })
    );
    return;
  }

  // Cache-first for everything else (icons, fonts, third-party libs).
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      var networkFetch = fetch(event.request).then(function (response) {
        if (response && response.status === 200) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
        }
        return response;
      }).catch(function () {
        return cached;
      });
      return cached || networkFetch;
    })
  );
});
