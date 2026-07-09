/* Gaia Food — Service Worker
   Offline reale: precache della shell completa (HTML + CSS + tutti i moduli JS +
   dati + brand) e runtime-cache per il resto.
   Strategie:
   - navigazioni/HTML e /api,/data  → network-first (sempre l'ultima versione, cache come fallback offline)
   - moduli JS / CSS / icone same-origin → network-first (online = sempre l'ultima; cache solo come fallback offline)
   - CDN (font Google, MapLibre, tiles), foto → cache-first (riusa la copia, scarica una volta)
   Aggiornamento: il nuovo SW si attiva subito (skipWaiting) e prende il controllo (clients.claim).
*/
const VERSION = 'gaia-food-v30';
const SHELL_CACHE = VERSION + '-shell';
const RUNTIME_CACHE = VERSION + '-runtime';

// Shell precaricata: tutto ciò che serve per il primo render offline.
// (I moduli screen sono import dinamici → vanno elencati esplicitamente,
//  altrimenti al primo avvio offline non sono in cache.)
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './css/app.css', './css/desktop.css', './css/polish.css',
  './js/main.js', './js/store.js', './js/icons.js', './js/components.js', './js/i18n.js',
  './js/i18n/it.js', './js/i18n/en.js', './js/i18n/de.js', './js/i18n/zh.js',
  './js/screens.js', './js/desktop.js', './js/map-style.json',
  './js/screens/AuthModal.js', './js/screens/OnbVideo.js', './js/screens/Zona.js',
  './js/screens/Ricerca.js', './js/screens/Filtri.js', './js/screens/Percorso.js',
  './js/screens/CiboVero.js', './js/screens/Player.js', './js/screens/Candidati.js',
  './js/screens/Form.js', './js/screens/StatoCandidatura.js', './js/screens/SashaCoda.js',
  './js/screens/SashaVerifica.js', './js/screens/SashaPianifica.js', './js/screens/SashaRevoca.js',
  './js/screens/Stati.js', './js/screens/DlvNonDisp.js', './js/screens/Admin.js',
  './js/screens/Azienda.js',
  './js/screens/Hub.js', './js/screens/Custodi.js', './js/screens/Legal.js',
  './data/producers.json',
  './assets/brand/gaia-food-pin.webp', './assets/brand/Marcellus-Regular.ttf',
  './assets/icon-192.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      // addAll è atomico: se un file manca fallisce tutto. Usiamo add() singoli tolleranti.
      .then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))))
  );
  // Attivazione immediata: durante lo sviluppo/test vogliamo che l'ultima versione arrivi al primo reload.
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// L'app può forzare l'attivazione del nuovo SW (banner "aggiornamento disponibile").
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isHTML(req) {
  return req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;

  // 1) Navigazioni HTML + dati dinamici (/api, /data): network-first, fallback cache → shell.
  if (isHTML(req) || (sameOrigin && (url.pathname.includes('/api/') || url.pathname.includes('/data/')))) {
    e.respondWith(
      fetch(req).then(r => {
        const copy = r.clone();
        caches.open(RUNTIME_CACHE).then(c => c.put(req, copy)).catch(() => {});
        return r;
      }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // 2) Asset same-origin (JS/CSS/img/svg/json): network-first.
  //    Online → sempre l'ultima versione (indispensabile mentre iteriamo il design);
  //    offline → fallback all'ultima copia in cache (runtime o shell precache).
  if (sameOrigin) {
    e.respondWith(
      fetch(req).then(r => {
        if (r && r.ok) { const copy = r.clone(); caches.open(RUNTIME_CACHE).then(c => c.put(req, copy)).catch(() => {}); }
        return r;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // 3) Cross-origin (font Google, MapLibre, tiles): cache-first, popola al primo passaggio.
  //    Le risposte opache si memorizzano comunque (offline best-effort).
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(r => {
      const copy = r.clone();
      caches.open(RUNTIME_CACHE).then(c => c.put(req, copy)).catch(() => {});
      return r;
    }).catch(() => cached))
  );
});
