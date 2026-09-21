/* sw.js — l'app deve aprirsi in palestra anche senza campo.

   Due strategie, scelte per quello che serve davvero:
   - il guscio (html, css, js, icone) sta in cache e si apre subito;
   - i piani in dati/ si provano prima dalla rete, così una scheda nuova
     committata nel repo arriva alla prima apertura con campo, e si ricade
     sulla cache quando la rete non c'è.

   Cambiando i file dell'app va alzato VERSIONE: è l'unica manutenzione
   che questo file richiede. */

const VERSIONE = 'fitapp-v2';
const GUSCIO = `${VERSIONE}-guscio`;
const DATI = `${VERSIONE}-dati`;

const DA_PRECARICARE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/ui.js',
  './js/store.js',
  './js/piani.js',
  './js/personalizza.js',
  './js/backup.js',
  './js/viste/avvio.js',
  './js/viste/oggi.js',
  './js/viste/scheda.js',
  './js/viste/sessione.js',
  './js/viste/progressi.js',
  './js/viste/foto.js',
  './js/viste/cibo.js',
  './js/viste/altro.js',
  './dati/indice.json',
  './dati/allenamento/2026-fase1.json',
  './dati/allenamento/2026-fase2.json',
  './dati/cibo/2026-base.json',
  './dati/cibo/2026-spesa.json',
  './icone/icona.svg',
  './icone/icona-180.png',
  './icone/icona-192.png',
  './icone/icona-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(GUSCIO);
    // Uno per uno: un file mancante non deve far fallire tutta l'installazione.
    await Promise.all(DA_PRECARICARE.map(
      (url) => cache.add(url).catch((err) => console.warn('non precaricato', url, err)),
    ));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const nomi = await caches.keys();
    await Promise.all(nomi
      .filter((n) => !n.startsWith(VERSIONE))
      .map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const richiesta = e.request;
  if (richiesta.method !== 'GET') return;

  const url = new URL(richiesta.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.includes('/dati/')) {
    e.respondWith(primaLaRete(richiesta));
  } else {
    e.respondWith(primaLaCache(richiesta));
  }
});

/** Piani: rete se c'è, cache se non c'è. */
async function primaLaRete(richiesta) {
  const cache = await caches.open(DATI);
  try {
    const risposta = await fetch(richiesta);
    if (risposta.ok) cache.put(richiesta, risposta.clone());
    return risposta;
  } catch {
    const salvata = await caches.match(richiesta);
    if (salvata) return salvata;
    return new Response(
      JSON.stringify({ errore: 'Piano non disponibile senza rete.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

/** Guscio: cache subito, aggiornamento silenzioso per la volta dopo. */
async function primaLaCache(richiesta) {
  const cache = await caches.open(GUSCIO);
  const salvata = await cache.match(richiesta, { ignoreSearch: true });

  const dallaRete = fetch(richiesta)
    .then((risposta) => {
      if (risposta.ok) cache.put(richiesta, risposta.clone());
      return risposta;
    })
    .catch(() => null);

  if (salvata) return salvata;

  const risposta = await dallaRete;
  if (risposta) return risposta;

  // Navigazione senza rete e senza cache: si ricade sulla pagina.
  if (richiesta.mode === 'navigate') {
    const pagina = await cache.match('./index.html');
    if (pagina) return pagina;
  }
  return new Response('Non disponibile senza rete.', { status: 503 });
}
