const CACHE_NAME = 'nutritrack-v249';
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

// Instalação: busca os arquivos direto no servidor (cache: 'reload'), nunca no cache HTTP do navegador.
// Sem isso, no celular a versão nova do service worker podia guardar o index.html ANTIGO que ainda estava no
// cache do navegador, e o app ficava preso na versão anterior mesmo fechando e abrindo de novo.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME)
    .then((cache) => cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // nunca guardar em cache chamadas ao backend (Apps Script) ou a outros domínios — sempre buscar da rede
  // A página do app (index.html): primeiro a rede, pra sempre abrir a versão mais nova quando há internet;
  // sem internet, usa a cópia guardada.
  const ehPagina = event.request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
  if (ehPagina) {
    event.respondWith(fetch(new Request(event.request.url, { cache: 'no-cache' })).then((response) => {
      if (response.ok) { const copy = response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)); }
      return response;
    }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html').then((idx) => idx || caches.match('./')))));
    return;
  }
  // Demais arquivos (ícones, manifest): cache primeiro.
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match('./'))));
});
