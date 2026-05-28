/* Work Calendar PWA service worker (hand-rolled, no extra deps).
 *
 * Strategy:
 * - Static app shell + icons go through a stale-while-revalidate cache.
 * - GET requests to `/calendar` (the entry view) are also cached so the
 *   schedule view remains visible while offline.
 * - All other requests bypass the worker and use the network directly.
 */

const CACHE_NAME = "work-calendar-v1";
const SHELL = ["/", "/me", "/calendar", "/manifest.webmanifest", "/icon-192.svg", "/icon-512.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(SHELL).catch(() => undefined),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (
    url.pathname === "/" ||
    url.pathname === "/me" ||
    url.pathname === "/calendar" ||
    url.pathname.startsWith("/icon-") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached || Response.error());
        return cached || network;
      }),
    );
  }
});

self.addEventListener("push", (event) => {
  const payload = event.data ? safeJson(event.data.text()) : null;
  const title = payload?.title || "Work Calendar";
  const body = payload?.body || "";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.svg",
      data: payload?.url || "/notifications",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data || "/notifications";
  event.waitUntil(clients.openWindow(target));
});

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
