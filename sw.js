// Version bumped to v10 to clear cache, handle uppercase fix, and include new file
const CACHE_NAME = "manthara-counter-v10";
const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  // Pre-loaded audio files with synchronized cases
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
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)),
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
    caches
      .match(event.request)
      .then((cached) => cached || fetch(event.request)),
  );
});
