// Service Worker disabled for iOS Safari stability.
// Keep this file so old registered browsers can fetch /sw.js successfully,
// but do not intercept network requests.

self.addEventListener("install", function (event) {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    self.clients.claim().then(function () {
      return self.registration.unregister();
    })
  );
});
