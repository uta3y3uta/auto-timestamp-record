/* オフライン対応（Service Worker）
   ・アプリ本体（index.html）は「通信優先」：つながっていれば常に最新版を使い，
     通信が切れているときだけ保存しておいた版で開く。
   ・Excel/PDF 用のライブラリ（CDN・版番号つき）は一度取得したら保存した版を使う。
   ※記録データそのものはブラウザ内（IndexedDB）に保存されており，ここでは扱わない。 */
const CACHE = 'lesson-record-v1';
const CORE = ['./', './index.html'];
const LIBS = [
  'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js',
  'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
  'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    // ライブラリは取得できなくてもインストールは続ける（次回以降に保存される）
    await Promise.all(LIBS.map(url =>
      fetch(url, { mode: 'no-cors' }).then(res => cache.put(url, res)).catch(() => {})
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // アプリ本体：通信優先，だめなら保存しておいた版
  if (req.mode === 'navigate' || url.origin === self.location.origin) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      } catch (e) {
        const cached = await caches.match(req, { ignoreSearch: true });
        return cached || (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // ライブラリ（CDN）：保存した版を優先
  if (LIBS.includes(req.url)) {
    event.respondWith((async () => {
      const cached = await caches.match(req.url);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req.url, copy)).catch(() => {});
      }
      return res;
    })());
  }
});
