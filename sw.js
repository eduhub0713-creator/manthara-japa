// Version bumped to v11 to enable proper byte-range audio streaming
const CACHE_NAME = "manthara-counter-v11";
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

// Advanced Fetch handling built to handle streaming media files (HTTP Range Requests)
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isAudioFile = url.pathname.toUpperCase().endsWith(".MP3");

  // CRITICAL FIX: intercepted range requests for offline audio caching support
  if (isAudioFile && event.request.headers.has("range")) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (!cachedResponse) {
          return fetch(event.request);
        }

        return cachedResponse.blob().then((blob) => {
          const rangeHeader = event.request.headers.get("range");
          const match = rangeHeader.match(/^bytes=(\d+)-(\d+)?$/);
          
          if (!match) return cachedResponse;

          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : blob.size - 1;
          const slicedBlob = blob.slice(start, end + 1, blob.type);

          const responseHeaders = new Headers();
          cachedResponse.headers.forEach((value, key) => {
            responseHeaders.set(key, value);
          });
          responseHeaders.set("Content-Range", `bytes ${start}-${end}/${blob.size}`);
          responseHeaders.set("Content-Length", (end - start + 1).toString());

          return new Response(slicedBlob, {
            status: 206,
            statusText: "Partial Content",
            headers: responseHeaders,
          });
        });
      })
    );
  } else {
    event.respondWith(
      caches
        .match(event.request)
        .then((cached) => cached || fetch(event.request)),
    );
  }
});
