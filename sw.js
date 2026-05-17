// Loomyva Service Worker disabled for iOS Safari stability.
// This file intentionally does NOT intercept fetch requests.

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil((async function () {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(function (key) { return caches.delete(key); }));
      await self.registration.unregister();
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      clientsList.forEach(function (client) { client.navigate(client.url); });
    } catch (error) {
      // Silent fallback: never break the app because of service worker cleanup.
    }
  })());
});
