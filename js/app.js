/* app.js — avvio, tema, navigazione.

   Contratto delle viste: ogni modulo in js/viste/ esporta
       export async function monta(contenitore, parametri) { … }
   Riceve un contenitore già vuoto e ci scrive dentro. Non tocca nient'altro. */

import * as store from './store.js';

const ROTTE = {
  oggi:      () => import('./viste/oggi.js'),
  scheda:    () => import('./viste/scheda.js'),
  sessione:  () => import('./viste/sessione.js'),
  progressi: () => import('./viste/progressi.js'),
  foto:      () => import('./viste/foto.js'),
  cibo:      () => import('./viste/cibo.js'),
  altro:     () => import('./viste/altro.js'),
  avvio:     () => import('./viste/avvio.js'),
};

/** Rotte a schermo pieno: nascondono la barra di navigazione. */
const PIENE = new Set(['sessione', 'avvio']);

const app = document.getElementById('app');
const barra = document.getElementById('barra');

/* ---------- tema ---------------------------------------- */

export function applicaTema(tema) {
  document.documentElement.dataset.tema = tema || 'auto';
}

/* ---------- navigazione --------------------------------- */

export function vaiA(percorso) {
  if (location.hash === '#' + percorso) rotta();
  else location.hash = percorso;
}

function leggiHash() {
  const grezzo = location.hash.replace(/^#\/?/, '');
  const pezzi = grezzo.split('/').filter(Boolean);
  return { nome: pezzi[0] || 'oggi', parametri: pezzi.slice(1) };
}

let rottaInCorso = null;

async function rotta() {
  const { nome, parametri } = leggiHash();

  // Primo avvio: finché manca il profilo non si va da nessuna parte.
  const profilo = await store.leggi('profilo');
  const destinazione = profilo ? nome : 'avvio';

  const carica = ROTTE[destinazione] || ROTTE.oggi;
  const chiave = destinazione + '/' + parametri.join('/');
  if (rottaInCorso === chiave) return;
  rottaInCorso = chiave;

  barra.classList.toggle('nascondi', PIENE.has(destinazione));
  for (const a of barra.querySelectorAll('a')) {
    const suo = a.dataset.rotta;
    const acceso = suo === destinazione
      || (suo === 'scheda' && destinazione === 'sessione')
      || (suo === 'progressi' && destinazione === 'foto');
    if (acceso) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }

  app.replaceChildren();
  window.scrollTo(0, 0);

  try {
    const modulo = await carica();
    await modulo.monta(app, parametri);
  } catch (e) {
    console.error(e);
    mostraErrore(e);
  }
}

function mostraErrore(e) {
  app.replaceChildren();
  const box = document.createElement('div');
  box.className = 'schermata';
  box.innerHTML = `
    <div class="blocco">
      <p class="occhiello">Qualcosa non ha funzionato</p>
      <p>${String(e?.message || e).replace(/</g, '&lt;')}</p>
      <p class="nota">Chiudi e riapri l'app. Se continua, i dati non sono stati toccati.</p>
    </div>`;
  app.append(box);
}

/* ---------- service worker ------------------------------ */

function registraSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW non registrato', e));
}

/* ---------- avvio --------------------------------------- */

async function avvia() {
  applicaTema(await store.leggi('tema'));
  window.addEventListener('hashchange', rotta);
  await rotta();
  registraSW();
}

avvia();
