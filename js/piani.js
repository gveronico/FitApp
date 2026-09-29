/* piani.js — legge i piani e dice a che punto del programma siamo.

   Tre strati, dal basso:
   1. i file in dati/, scritti da Claude. Di sola lettura: qui non si scrivono mai;
   2. le copie sul telefono (`piano:<id>` in impostazioni). Un piano del repo
      modificato dall'app diventa una copia intera, con la firma del file da cui
      è partita: se Claude poi cambia quel file, l'app se ne accorge e chiede
      quale tenere. Un piano creato dall'app esiste solo come copia (`locale`);
   3. personalizza.js, che applica nome e gruppo di ogni esercizio e le
      modifiche al cibo. Si applica a ogni lettura, su una copia.

   La cache tiene il JSON com'è nel repo. */

import { iso, daIso, giornoIso } from './ui.js';
import * as store from './store.js';
import * as personalizza from './personalizza.js';

const cache = new Map();
const PREFISSO_COPIA = 'piano:';

async function prendi(percorso) {
  if (cache.has(percorso)) return cache.get(percorso);
  const r = await fetch(percorso, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Non riesco a leggere ${percorso} (${r.status})`);
  const dati = await r.json();
  cache.set(percorso, dati);
  return dati;
}

const clona = (x) => JSON.parse(JSON.stringify(x));

/** Firma breve di un JSON: basta a dire se il file nel repo è cambiato. */
export function firma(dati) {
  const t = JSON.stringify(dati);
  let h = 5381;
  for (let i = 0; i < t.length; i += 1) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0;
  return `${t.length.toString(36)}-${h.toString(36)}`;
}

/* ---------- copie sul telefono ---------------------------- */

/**
 * copia = {
 *   piano,                 // il piano intero, com'è dopo le modifiche
 *   base: string|null,     // firma del file del repo da cui è partita; null se locale
 *   locale: bool,          // creato dall'app: nel repo non esiste
 *   meta: { settimanaDa, settimanaA, monitorata },   // solo per i locali
 *   modificato: ms
 * }
 */
async function copie() {
  const tutte = await store.leggiTutte();
  const out = new Map();
  for (const [k, v] of Object.entries(tutte)) {
    if (k.startsWith(PREFISSO_COPIA) && v && v.piano) out.set(k.slice(PREFISSO_COPIA.length), v);
  }
  return out;
}

async function leggiCopia(id) {
  const v = await store.leggi(PREFISSO_COPIA + id);
  return v && v.piano ? v : null;
}

export async function indice() {
  const [idx, salvate] = await Promise.all([prendi('dati/indice.json'), copie()]);
  const allenamento = idx.allenamento.map((r) => {
    const c = salvate.get(r.id);
    return c && !c.locale ? { ...r, nome: c.piano.nome || r.nome, modificato: true } : r;
  });
  salvate.forEach((c, id) => {
    if (!c.locale) return;
    allenamento.push({
      id,
      file: null,
      locale: true,
      nome: c.piano.nome || 'Piano senza nome',
      settimanaDa: c.meta?.settimanaDa ?? 1,
      settimanaA: c.meta?.settimanaA ?? 8,
      monitorata: c.meta?.monitorata !== false,
    });
  });
  return { ...idx, allenamento };
}

/** Il piano com'è da leggere: copia se c'è, altrimenti il file; sopra, le personalizzazioni. */
export async function piano(riferimento) {
  const [grezzo] = await Promise.all([pianoGrezzo(riferimento), personalizza.carica()]);
  return personalizza.applica(grezzo);
}

/** Il piano senza personalizzazioni, da modificare. Sempre una copia nuova. */
export async function pianoGrezzo(riferimento) {
  const copia = riferimento?.id ? await leggiCopia(riferimento.id) : null;
  if (copia) return clona(copia.piano);
  if (!riferimento?.file) throw new Error('Questo piano non esiste più.');
  return clona(await prendi(riferimento.file));
}

/**
 * Come sta la copia rispetto al repo.
 *   { copia: bool, locale: bool, repoCambiato: bool }
 * repoCambiato: Claude ha aggiornato il file dopo che il piano è stato modificato qui.
 */
export async function statoCopia(riferimento) {
  const copia = riferimento?.id ? await leggiCopia(riferimento.id) : null;
  if (!copia) return { copia: false, locale: false, repoCambiato: false };
  if (copia.locale || !riferimento.file) return { copia: true, locale: true, repoCambiato: false };
  const repo = await prendi(riferimento.file);
  return { copia: true, locale: false, repoCambiato: !!copia.base && copia.base !== firma(repo) };
}

/** Salva il piano modificato. La firma di partenza resta quella della prima modifica. */
export async function salvaPiano(riferimento, pianoNuovo) {
  const prima = await leggiCopia(riferimento.id);
  const locale = prima ? !!prima.locale : !riferimento.file;
  let base = prima ? prima.base : null;
  if (!locale && !base) base = firma(await prendi(riferimento.file));
  await store.scrivi(PREFISSO_COPIA + riferimento.id, {
    piano: clona(pianoNuovo),
    base: locale ? null : base,
    locale,
    meta: prima?.meta || null,
    modificato: Date.now(),
  });
}

/** Cambia i dati di contorno di un piano creato dall'app. */
export async function salvaMeta(riferimento, meta) {
  const prima = await leggiCopia(riferimento.id);
  if (!prima || !prima.locale) return;
  await store.scrivi(PREFISSO_COPIA + riferimento.id, { ...prima, meta: { ...prima.meta, ...meta } });
}

/** Butta la copia: torna il piano del repo. Per un piano creato dall'app vuol dire eliminarlo. */
export async function ripristinaPiano(riferimento) {
  await store.cancella(PREFISSO_COPIA + riferimento.id);
  if (riferimento.locale && await store.leggi('pianoAttivo') === riferimento.id) {
    await store.scrivi('pianoAttivo', null);
  }
}

/** Tiene la copia anche se il repo è cambiato: la firma si aggiorna e l'avviso sparisce. */
export async function tieniCopia(riferimento) {
  const prima = await leggiCopia(riferimento.id);
  if (!prima || prima.locale) return;
  await store.scrivi(PREFISSO_COPIA + riferimento.id, { ...prima, base: firma(await prendi(riferimento.file)) });
}

/** Quante copie di piani del repo ci sono: contano come "modifiche ai piani". */
export async function quanteCopie() {
  let n = 0;
  (await copie()).forEach((c) => { if (!c.locale) n += 1; });
  return n;
}

/** Via tutte le copie dei piani del repo. I piani creati dall'app restano. */
export async function azzeraCopie() {
  const salvate = await copie();
  const via = [...salvate.entries()].filter(([, c]) => !c.locale).map(([id]) => id);
  await Promise.all(via.map((id) => store.cancella(PREFISSO_COPIA + id)));
  return via.length;
}

/**
 * Crea un piano nuovo, sul telefono. `da` è il riferimento del piano da copiare,
 * null per partire da una seduta vuota. Restituisce il riferimento.
 */
export async function creaPiano({ nome, da = null, settimanaDa = 1, settimane = 8 }) {
  const id = `mio-${Date.now().toString(36)}`;
  const base = da ? await pianoGrezzo(da) : null;
  const nuovo = base
    ? { ...base, id, nome, fonte: 'app' }
    : {
      id,
      nome,
      fonte: 'app',
      regole: [],
      progressione: {
        tipo: 'doppia',
        descrizione: 'Si resta sullo stesso carico finché si completa il numero alto di ripetizioni in tutte le serie. Poi si sale.',
      },
      sedute: [nuovaSeduta([])],
    };
  nuovo.monitorata = true;
  const meta = { settimanaDa, settimanaA: settimanaDa + settimane - 1, monitorata: true };
  await store.scrivi(PREFISSO_COPIA + id, {
    piano: nuovo, base: null, locale: true, meta, modificato: Date.now(),
  });
  return { id, file: null, locale: true, nome, ...meta };
}

/** Una seduta vuota, con un id che non c'è già nel piano. */
export function nuovaSeduta(sedute = []) {
  let n = sedute.length + 1;
  const presi = new Set(sedute.map((s) => s.id));
  while (presi.has(`seduta-${n}`)) n += 1;
  return {
    id: `seduta-${n}`,
    nome: `Seduta ${n}`,
    sottotitolo: '',
    riscaldamento: null,
    scarico: null,
    esercizi: [],
  };
}

/** Modifica un esercizio del piano e salva. `cambi` sono campi del JSON. */
export async function aggiornaEsercizio(riferimento, sedutaId, esercizioId, cambi) {
  const p = await pianoGrezzo(riferimento);
  const seduta = (p.sedute || []).find((s) => s.id === sedutaId);
  const e = seduta && (seduta.esercizi || []).find((x) => x.id === esercizioId);
  if (!e) return false;
  applicaCambi(e, cambi);
  await salvaPiano(riferimento, p);
  return true;
}

/** Scrive i campi dati sull'esercizio; `null` toglie il campo. */
export function applicaCambi(esercizio, cambi) {
  for (const [k, v] of Object.entries(cambi || {})) {
    if (v === null || v === undefined) delete esercizio[k];
    else esercizio[k] = v;
  }
  return esercizio;
}

/* ---------- ripetizioni scritte a mano --------------------- */

/**
 * Dal testo digitato ai campi del piano.
 *   "10"        -> 10 fisse
 *   "8-10"      -> range, per la doppia progressione
 *   "12-10-8"   -> un numero per serie (ripSerie). Anche "10-8": due numeri
 *                  che scendono non sono un range
 * null se il testo non si capisce.
 */
export function leggiRip(testo) {
  const t = String(testo ?? '').trim().replace(/[–—]/g, '-');
  if (!t) return null;
  const numeri = t.split(/[\s,;/x×-]+/).filter(Boolean).map(Number);
  if (!numeri.length || numeri.some((n) => !Number.isInteger(n) || n <= 0)) return null;
  if (numeri.length === 1) {
    return { rip: String(numeri[0]), ripMin: numeri[0], ripMax: numeri[0], ripSerie: null };
  }
  if (numeri.length === 2 && numeri[0] < numeri[1]) {
    return { rip: `${numeri[0]}-${numeri[1]}`, ripMin: numeri[0], ripMax: numeri[1], ripSerie: null };
  }
  return {
    rip: numeri.join('-'),
    ripMin: Math.min(...numeri),
    ripMax: Math.max(...numeri),
    ripSerie: numeri,
  };
}

/** Il testo delle ripetizioni come si scrive nel campo. */
export function testoRip(esercizio) {
  if (Array.isArray(esercizio?.ripSerie) && esercizio.ripSerie.length) return esercizio.ripSerie.join('-');
  return esercizio?.rip || '';
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
 *     riferimento, piano,                // allenamento: le sedute si scelgono, non hanno giorno
 *     riferimentoCibo, cibo, spesa,
 *     dataInizio, impostato, forzato,
 *     fineProgramma                      // true quando la settimana supera l'ultimo piano
 *   }
 */
export async function stato(quando = new Date()) {
  const [idx, impostazioni] = await Promise.all([indice(), store.leggiTutte()]);
  const settimana = settimanaAl(impostazioni.dataInizio, quando);

  // Il calendario sceglie solo tra i piani del repo: uno creato dall'app vale
  // quando lo si attiva a mano.
  const delRepo = idx.allenamento.filter((r) => !r.locale);
  let riferimento = riferimentoPer(delRepo, settimana);
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

  // Il giorno serve al cibo. Le sedute non hanno giorno: quale fare lo sceglie
  // chi si allena, in Oggi (dal 29/09/2026).
  const giorno = giornoIso(quando);

  const ultima = delRepo[delRepo.length - 1];

  return {
    settimana,
    settimanaNellaFase: settimana && riferimento ? settimana - riferimento.settimanaDa + 1 : null,
    settimaneFase: riferimento ? riferimento.settimanaA - riferimento.settimanaDa + 1 : null,
    giorno,
    riferimento,
    piano: pianoAll,
    riferimentoCibo,
    cibo: pianoCibo,
    spesa,
    dataInizio: impostazioni.dataInizio,
    impostato: !!impostazioni.dataInizio,
    forzato,
    fineProgramma: !forzato && settimana != null && ultima != null && settimana > ultima.settimanaA,
    impostazioni,
  };
}

/** Il valore in vigore in una settimana, da una scala { "<da settimana>": valore }. */
function daScala(base, scala, settimanaNellaFase) {
  let n = base;
  if (scala && settimanaNellaFase) {
    const voci = Object.entries(scala).sort((a, b) => Number(a[0]) - Number(b[0]));
    for (const [da, valore] of voci) {
      if (settimanaNellaFase >= Number(da)) n = valore;
    }
  }
  return n;
}

/** Serie effettive di un esercizio nella settimana data (gestisce serieDaSettimana). */
export function serieDi(esercizio, settimanaNellaFase) {
  return daScala(esercizio.serie, esercizio.serieDaSettimana, settimanaNellaFase);
}

/** Quanti allenamenti prevede la settimana: `allenamentiDaSettimana` se c'è,
    altrimenti uno per seduta. */
export function allenamentiPrevisti(piano, settimanaNellaFase) {
  const base = (piano?.sedute || []).length;
  return daScala(base, piano?.allenamentiDaSettimana, settimanaNellaFase || 1);
}

/**
 * Primo giorno della settimana in corso, 'YYYY-MM-DD'.
 * Con la data di inizio è la settimana del programma (blocchi di 7 giorni da lì),
 * senza è la settimana del calendario, da lunedì.
 */
export function inizioSettimana(dataInizio, quando = new Date()) {
  const n = settimanaAl(dataInizio, quando);
  const d = n != null ? daIso(dataInizio) : daIso(iso(quando));
  if (n != null) d.setDate(d.getDate() + (n - 1) * 7);
  else d.setDate(d.getDate() - (giornoIso(d) - 1));
  return iso(d);
}

/**
 * Gli allenamenti fatti nella settimana in corso, dal più vecchio.
 * Conta una sessione solo se ha almeno una serie registrata: aprire una seduta
 * per sbaglio e uscire non vale come allenamento. Uno fatto a metà conta, e
 * lo dice `completa`.
 *   [{ sessioneId, sedutaId, data, nSerie, previste, completa, saltati }]
 * `saltati`: esercizi saltati con Salta. Non tolgono la completezza: saltare è
 * una scelta, non una serie mancata.
 * `previste` sono le serie che la sessione aveva in programma quel giorno —
 * null per le sessioni registrate prima che l'app lo annotasse.
 * `escludi` toglie una sessione, di solito quella aperta a schermo.
 * `persona` dice di chi: senza, la persona in vista (vedi store.js).
 */
export async function fatteInSettimana(dataInizio, quando = new Date(), escludi = null, persona = undefined) {
  const da = inizioSettimana(dataInizio, quando);
  const a = iso(quando);
  const [tutte, elencoSessioni] = await Promise.all([store.tutteLeSerie(persona), store.sessioni(persona)]);
  const sessioniPerId = new Map(elencoSessioni.map((x) => [x.id, x]));
  const per = new Map();
  tutte.forEach((s) => {
    if (!s.sessioneId || s.sessioneId === escludi || s.data < da || s.data > a) return;
    if (!per.has(s.sessioneId)) {
      per.set(s.sessioneId, {
        sessioneId: s.sessioneId, sedutaId: s.sedutaId, data: s.data, nSerie: 0,
      });
    }
    per.get(s.sessioneId).nSerie += 1;
  });
  per.forEach((f) => {
    const ses = sessioniPerId.get(f.sessioneId);
    f.previste = Number.isFinite(ses?.seriePreviste) ? ses.seriePreviste : null;
    f.completa = f.previste != null ? f.nSerie >= f.previste : !ses?.ridotto;
    f.saltati = Number.isFinite(ses?.saltati) ? ses.saltati : 0;
  });
  return [...per.values()].sort((x, y) => (x.data < y.data ? -1 : x.data > y.data ? 1 : 0));
}

/** Com'è andata una seduta nella settimana: la più completa delle volte in cui
    è stata fatta. null se non è stata fatta. */
export function statoSeduta(fatte, sedutaId) {
  const sue = (fatte || []).filter((f) => f.sedutaId === sedutaId);
  if (!sue.length) return null;
  const completa = sue.find((f) => f.completa);
  return { volte: sue, completa: !!completa, migliore: completa || sue[sue.length - 1] };
}

/** Gli id dei piani i cui carichi entrano nei calcoli. Decide il piano, non la
    serie: così le serie registrate prima che una fase diventasse monitorata
    contano lo stesso. */
export async function pianiMonitorati() {
  const idx = await indice();
  return new Set(idx.allenamento.filter((r) => r.monitorata).map((r) => r.id));
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
    passato: !r.locale && st.settimana != null && st.settimana > r.settimanaA,
    futuro: !r.locale && st.settimana != null && st.settimana < r.settimanaDa,
  }));
}
