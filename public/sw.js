/** 최소 서비스워커 — 오프라인 캐시 없이 설치 가능용 */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
