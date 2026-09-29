// Service Worker: Offline-Betrieb. Eigene Dateien: Netzwerk zuerst (Updates kommen sofort an), Cache als Fallback.
// Anmeldebibliothek vom CDN: Cache zuerst (versionierte, unveränderliche Datei).
const CACHE = 'zeiterfassung-v4';
const MSAL_URL = 'https://cdn.jsdelivr.net/npm/@azure/msal-browser@3.30.0/lib/msal-browser.min.js';
const ASSETS = ['./', './index.html', './styles.css', './help.js', './app.js', './cloud.js', './anleitung.html', './config.js', './manifest.webmanifest',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
  './icons/logo-quer-schwarz.png', './icons/logo-quer-weiss.png', './icons/logo-mark-schwarz.png', './icons/logo-mark-weiss.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(ASSETS);
    try { await c.add(new Request(MSAL_URL, { mode: 'cors' })); } catch (err) { /* später erneut */ }
  }));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.url === MSAL_URL) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    })));
    return;
  }
  if (new URL(req.url).origin !== location.origin) return; // Microsoft-Anmeldung und Graph nie abfangen
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
