/**
 * Shell-only service worker.
 *
 * It caches the app shell so the register opens on a bad connection and shows
 * the login or an error instead of the browser's dinosaur. It deliberately does
 * NOT cache or queue writes: a tap that appears to save and silently never
 * lands is worse than an error message. Real offline logging needs a sync queue
 * with conflict handling, which is a separate piece of work.
 */
const CACHE = "tuition-shell-v1";
const SHELL = ["/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never touch anything that changes data or reads the register. Those must
  // fail loudly when there is no network.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/data")) return;

  // Static build output is content-hashed, so cache-first is safe.
  if (url.pathname.startsWith("/_next/static") || SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
            return res;
          })
      )
    );
  }
});
