const CACHE_NAME = "aas-pwa-phase17-prod-v2-runtime-v4-release-control";
const APP_SHELL = [
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
];

function freshRequest(request) {
  return new Request(request, { cache: "no-store" });
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(freshRequest(request));
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await cache.match(request)) || Response.error();
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "AAS_ACTIVATE_RELEASE") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith("/auth/callback") ||
    url.pathname.startsWith("/api/") ||
    url.searchParams.has("code") ||
    url.searchParams.has("access_token") ||
    url.searchParams.has("refresh_token")
  ) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(freshRequest(request)).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match("/offline.html")) || Response.error();
      }),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (APP_SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(freshRequest(request)).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
