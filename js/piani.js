/* piani.js — legge i piani dal repo e dice a che punto del programma siamo.
   I file in dati/ sono di sola lettura: qui non si scrive mai niente.

   Sopra al piano letto dal repo passa sempre personalizza.js, che applica le
   modifiche fatte dall'app (nomi cambiati, voci tolte o spostate di lista).
   La cache tiene il JSON com'è nel repo: le personalizzazioni si applicano a
   ogni lettura, su una copia. */

import { iso, daIso, giornoIso } from './ui.js';
import * as store from './store.js';
import * as personalizza from './personalizza.js';

const cache = new Map();

async function prendi(percorso) {
  if (cache.has(percorso)) return cache.get(percorso);
  const r = await fetch(percorso, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Non riesco a leggere ${percorso} (${r.status})`);
  const dati = await r.json();
  cache.set(percorso, dati);
  return dati;
}

export function indice() {
  return prendi('dati/indice.json');
}

export async function piano(riferimento) {
  const [dati] = await Promise.all([prendi(riferimento.file), personalizza.carica()]);
  return personalizza.applica(dati);
}

/* ---------- gruppi muscolari ------------------------------ */

/* Il tag `gruppo` di ogni esercizio. Sono quattro più l'addome: è la divisione
   con cui si guardano i progressi, non una classificazione anatomica. */
export const GRUPPI = [
  { id: 'braccia', nome: 'Braccia', nota: 'Bicipiti e tricipiti' },
  { id: 'gambe', nome: 'Gambe', nota: '' },
  { id: 'dorso', nome: 'Dorso', nota: '' },
  { id: 'petto-spalle', nome: 'Petto e spalle', nota: '' },
  { id: 'addome', nome: 'Addome', nota: '' },
];

const NOMI_GRUPPO = new Map(GRUPPI.map((g) => [g.id, g.nome]));

export function nomeGruppo(id) {
  return NOMI_GRUPPO.get(id) || 'Senza gruppo';
}

/** L'ordine dei gruppi come stanno in GRUPPI; quelli sconosciuti in fondo. */
export function ordineGruppo(id) {
  const i = GRUPPI.findIndex((g) => g.id === id);
  return i < 0 ? GRUPPI.length : i;
}

/**
 * Settimana del programma, 1-based, a partire dalla data del primo allenamento.
 * Le settimane sono blocchi di 7 giorni dalla data di inizio.
 * null se la data di inizio non è ancora stata impostata o è nel futuro.
 */
export function settimanaAl(dataInizio, quando = new Date()) {
  if (!dataInizio) return null;
  const inizio = daIso(dataInizio);
  const oggi = daIso(iso(quando));
  const giorni = Math.floor((oggi - inizio) / 86400000);
  if (giorni < 0) return null;
  return Math.floor(giorni / 7) + 1;
}

/** Il riferimento del piano attivo in una data settimana. */
export function riferimentoPer(elenco, settimana) {
  if (settimana == null) return elenco[0] || null;
  return elenco.find((r) => settimana >= r.settimanaDa && settimana <= r.settimanaA)
      || elenco[elenco.length - 1]
      || null;
}

/**
 * Fotografia di oggi: quale piano, quale settimana, quale seduta.
 *   {
 *     settimana, settimanaNellaFase, giorno,
 *     riferimento, piano, seduta,        // allenamento — seduta è null nei giorni di riposo
 *     riferimentoCibo, cibo, spesa,
 *     dataInizio, impostato, forzato,
 *     fineProgramma                      // true quando la settimana supera l'ultimo piano
 *   }
 */
export async function stato(quando = new Date()) {
  const [idx, impostazioni] = await Promise.all([indice(), store.leggiTutte()]);
  const settimana = settimanaAl(impostazioni.dataInizio, quando);

  let riferimento = riferimentoPer(idx.allenamento, settimana);
  let forzato = false;
  if (impostazioni.pianoAttivo) {
    const scelto = idx.allenamento.find((r) => r.id === impostazioni.pianoAttivo);
    if (scelto) { riferimento = scelto; forzato = true; }
  }

  const riferimentoCibo = riferimentoPer(idx.cibo, settimana);
  const riferimentoSpesa = idx.spesa?.[0] || null;

  const [pianoAll, pianoCibo, spesa] = await Promise.all([
    riferimento ? piano(riferimento) : null,
    riferimentoCibo ? piano(riferimentoCibo) : null,
    riferimentoSpesa ? piano(riferimentoSpesa) : null,
  ]);

  const giorno = giornoIso(quando);
  const seduta = pianoAll?.sedute.find((s) => s.giorno === giorno) || null;

  const ultima = idx.allenamento[idx.allenamento.length - 1];

  return {
    settimana,
    settimanaNellaFase: settimana && riferimento ? settimana - riferimento.settimanaDa + 1 : null,
    settimaneFase: riferimento ? riferimento.settimanaA - riferimento.settimanaDa + 1 : null,
    giorno,
    riferimento,
    piano: pianoAll,
    seduta,
    riferimentoCibo,
    cibo: pianoCibo,
    spesa,
    dataInizio: impostazioni.dataInizio,
    impostato: !!impostazioni.dataInizio,
    forzato,
    fineProgramma: settimana != null && ultima != null && settimana > ultima.settimanaA,
    impostazioni,
  };
}

/** Serie effettive di un esercizio nella settimana data (gestisce serieDaSettimana). */
export function serieDi(esercizio, settimanaNellaFase) {
  let n = esercizio.serie;
  const scala = esercizio.serieDaSettimana;
  if (scala && settimanaNellaFase) {
    for (const [da, valore] of Object.entries(scala)) {
      if (settimanaNellaFase >= Number(da)) n = valore;
    }
  }
  return n;
}

/**
 * Ripetizioni attese dalla serie di indice `i` (0-based).
 * Con `ripSerie` la scheda dice un numero diverso per ogni serie — il 12-10-8
 * della Fase 1. Senza, non c'è un numero atteso: il range sta in `rip`.
 */
export function ripAttese(esercizio, i) {
  const scala = esercizio && esercizio.ripSerie;
  if (!Array.isArray(scala) || !scala.length) return null;
  return scala[Math.min(i, scala.length - 1)] ?? null;
}

/**
 * Carico reale da registrare, dato quello che l'utente digita.
 *   esterno      -> il numero così com'è
 *   assistito    -> pesoCorporeo − assistenza
 *   corpoLibero  -> pesoCorporeo + zavorra
 */
export function caricoReale(esercizio, digitato, pesoCorporeo) {
  const n = Number(digitato);
  if (Number.isNaN(n)) return null;
  const pc = Number(pesoCorporeo);
  if (esercizio.carico === 'assistito') return Number.isNaN(pc) ? null : +(pc - n).toFixed(2);
  if (esercizio.carico === 'corpoLibero') return Number.isNaN(pc) ? null : +(pc + n).toFixed(2);
  return n;
}

/** L'inverso: dal carico registrato al numero che l'utente vede nel campo. */
export function caricoDigitato(esercizio, reale, pesoCorporeo) {
  if (reale == null) return null;
  const pc = Number(pesoCorporeo);
  if (esercizio.carico === 'assistito') return Number.isNaN(pc) ? null : +(pc - reale).toFixed(2);
  if (esercizio.carico === 'corpoLibero') return Number.isNaN(pc) ? null : +(reale - pc).toFixed(2);
  return reale;
}

/** Etichetta del campo carico, diversa a seconda del tipo. */
export function etichettaCarico(esercizio) {
  switch (esercizio.carico) {
    case 'assistito': return 'Assistenza';
    case 'corpoLibero': return 'Zavorra';
    case 'tempo': return 'Carico';
    default: return 'Carico';
  }
}

/** Tutti i piani di allenamento, attivo per primo. */
export async function elencoPiani() {
  const [idx, st] = await Promise.all([indice(), stato()]);
  return idx.allenamento.map((r) => ({
    ...r,
    attivo: st.riferimento?.id === r.id,
    passato: st.settimana != null && st.settimana > r.settimanaA,
    futuro: st.settimana != null && st.settimana < r.settimanaDa,
  }));
}
