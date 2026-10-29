const CACHE_NAME = "tndocs-public-v1";
const PUBLIC_START_PAGES = ["/fr", "/ar"];
const PRIVATE_PATH = /^\/(?:api(?:\/|$)|(?:fr|ar)\/(?:admin|mes-documents|profils|dossiers|partage|connexion|inscription|verifier-email|mot-de-passe-oublie|reinitialiser-mot-de-passe)(?:\/|$))/;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PUBLIC_START_PAGES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("tndocs-public-") && key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== "GET" || PRIVATE_PATH.test(url.pathname)) return;
  if (url.search || url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/image")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && !response.headers.get("Cache-Control")?.includes("no-store")) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(url.pathname, response.clone());
        }
        return response;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(url.pathname);
        if (cached) return cached;
        const localeRoot = url.pathname.startsWith("/ar") ? "/ar" : "/fr";
        return (await cache.match(localeRoot)) ?? new Response("TnDocs is offline. Reconnect to continue.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.headers.get("Cache-Control")?.includes("immutable")) await cache.put(request, response.clone());
      return response;
    })());
  }
});
