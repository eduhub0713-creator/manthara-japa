const CACHE_NAME = "manthara-counter-v14"; // Bumped version for update

// By adding ALL preset MP3s here, they will download directly to the
// user's PC/Mobile phone immediately upon installation for offline use!
const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./0514.MP3",
  "./0514 (1).MP3",
  "./0514 (2).MP3",
  "./0514 (3).MP3",
  "./0514 (4).MP3",
  "./0514 (5).MP3",
  "./0514 (6).MP3",
  "./0514 (7).MP3",
  "./0514 (8).MP3",
  "./0514 (9).MP3",
  "./0514 (10).MP3",
  "./0514 (11).MP3",
  "./0514 (12).MP3",
  "./0514 (13).MP3",
  "./0514 (14).MP3",
  "./0514 (15).MP3",
  "./0514 (16).MP3",
  "./0514 (17).MP3",
  "./0514 (18).MP3",
  "./0514 (19).MP3",
  "./0514 (20).MP3",
  "./0514 (21).MP3",
  "./0514 (22).MP3",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Caches all core files AND all MP3s
      return cache.addAll(APP_FILES).catch((err) => {
        console.warn("Service Worker: Some files failed to cache.", err);
      });
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Deliver the cached file immediately if we are offline
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        // As a fallback, cache any dynamically fetched audio files
        if (event.request.url.includes(".MP3")) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      });
    }),
  );
});
