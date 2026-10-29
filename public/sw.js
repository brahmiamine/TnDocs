const CACHE_NAME = "tndocs-public-v2";
// Public HTML only. New routes are private by default. Template detail currently
// contains session-dependent controls, so it is deliberately absent.
const PUBLIC_PAGES = ["/fr", "/ar", "/fr/hors-ligne", "/ar/hors-ligne", "/fr/catalogue", "/ar/catalogue"];
const START_PAGES = ["/fr", "/ar", "/fr/hors-ligne", "/ar/hors-ligne"];
const cacheable = (response) => response.ok && !/(?:no-store|private)/i.test(response.headers.get("Cache-Control") || "");

async function cachePageAndAssets(cache, path) {
  const response = await fetch(path, { credentials: "omit" });
  if (!cacheable(response)) return;
  await cache.put(path, response.clone());
  // The offline shell must remain executable after a browser restart. Cache only
  // same-origin hashed Next.js assets referenced by this public HTML, never data.
  const html = await response.text();
  const assets = [...new Set(html.match(/\/_next\/static\/[^"'<>\s\\]+\.(?:js|css)/g) || [])];
  await Promise.allSettled(assets.map(async (asset) => {
    const result = await fetch(asset, { credentials: "omit" });
    if (result.ok) await cache.put(asset, result);
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(async (cache) => {
    await Promise.all(START_PAGES.map((path) => cachePageAndAssets(cache, path)));
  }));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("tndocs-public-") && key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== "GET" || url.search) return;

  if (request.mode === "navigate") {
    if (!PUBLIC_PAGES.includes(url.pathname)) return;
    event.respondWith((async () => {
      try {
        // Every page in the allowlist is anonymous. Never put personalized HTML
        // into the public cache even when the browser carries a session cookie.
        const response = await fetch(new Request(request, { credentials: "omit" }));
        if (cacheable(response)) {
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

function safeNotificationPath(value) {
  const uuid = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
  const allowed = new RegExp(`^/(fr|ar)/(?:notifications|mes-documents(?:/${uuid})?|contact|contributions|catalogue|securite)$`);
  return typeof value === "string" && allowed.test(value) ? value : "/fr/notifications";
}

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { /* A generic notification contains no private content. */ }
  const path = safeNotificationPath(payload.url);
  const ar = path.startsWith("/ar/");
  // Keep push content generic even if a malformed upstream payload contains PII.
  event.waitUntil(self.registration.showNotification("TnDocs", {
    body: ar ? "لديك إشعار جديد في مساحتك الخاصة." : "Une nouvelle notification vous attend dans votre espace privé.",
    icon: "/icon.svg",
    tag: typeof payload.tag === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(payload.tag) ? payload.tag : "tndocs-update",
    data: { url: path },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = safeNotificationPath(event.notification.data?.url);
  event.waitUntil(self.clients.openWindow(path));
});
