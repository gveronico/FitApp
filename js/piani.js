/* piani.js — legge i piani e dice a che punto del programma siamo.

   Tre strati, dal basso:
   1. i file in dati/. Di sola lettura: qui non si scrivono mai;
   2. le copie sul telefono (`piano:<id>` in impostazioni). Un piano cambiato
      dal telefono diventa una copia intera, e da lì in poi vale quella: il
      telefono vale quanto il repo, e non si chiede niente (dal 05/10/2026).
      Un piano creato dal telefono esiste solo come copia (`locale`);
   3. personalizza.js, che applica nome e gruppo di ogni esercizio e le
      modifiche al cibo. Si applica a ogni lettura, su una copia.

   Accanto ai piani, il catalogo degli esercizi: quelli dei piani più quelli
   creati dal telefono, da cui si sceglie con Cambia in sessione.

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

/* ---------- copie sul telefono ---------------------------- */

/**
 * copia = {
 *   piano,                 // il piano intero, com'è dopo le modifiche
 *   locale: bool,          // creato dal telefono: nel repo non esiste
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
    return c && !c.locale ? { ...r, nome: c.piano.nome || r.nome } : r;
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
  return aggiornaVecchio(personalizza.applica(grezzo));
}

/** Il piano senza personalizzazioni, da modificare. Sempre una copia nuova. */
export async function pianoGrezzo(riferimento) {
  const copia = riferimento?.id ? await leggiCopia(riferimento.id) : null;
  if (copia) return aggiornaVecchio(clona(copia.piano));
  if (!riferimento?.file) throw new Error('Questo piano non esiste più.');
  return clona(await prendi(riferimento.file));
}

/** Salva il piano modificato. */
export async function salvaPiano(riferimento, pianoNuovo) {
  const prima = await leggiCopia(riferimento.id);
  const locale = prima ? !!prima.locale : !riferimento.file;
  await store.scrivi(PREFISSO_COPIA + riferimento.id, {
    piano: clona(pianoNuovo),
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

/** Butta la copia. Per un piano creato dal telefono vuol dire eliminarlo. */
export async function eliminaPiano(riferimento) {
  await store.cancella(PREFISSO_COPIA + riferimento.id);
  if (riferimento.locale && await store.leggi('pianoAttivo') === riferimento.id) {
    await store.scrivi('pianoAttivo', null);
  }
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
      sedute: [nuovaSeduta([])],
    };
  nuovo.monitorata = true;
  const meta = { settimanaDa, settimanaA: settimanaDa + settimane - 1, monitorata: true };
  await store.scrivi(PREFISSO_COPIA + id, {
    piano: nuovo, locale: true, meta, modificato: Date.now(),
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

/* ---------- catalogo degli esercizi ------------------------ */

/* Gli esercizi che si possono scegliere quando se ne cambia uno in sessione:
   quelli di tutti i piani, più quelli creati dal telefono. Un esercizio creato
   dal telefono vive in impostazioni come `esercizio:<id>` (senza `pz:`), e così
   entra nel backup. L'id non cambia mai: è quello a cui si legano le serie.
   Dal 08/10/2026. */
const PREFISSO_ESERCIZIO = 'esercizio:';

/**
 * [{ id, nome, gruppo, recuperoSec }], ordinati per gruppo e per nome. Di un
 * esercizio che compare in più piani vale la prima volta che si incontra, con
 * nome e gruppo personalizzati sopra.
 */
export async function catalogoEsercizi() {
  const [idx, tutte] = await Promise.all([indice(), store.leggiTutte()]);
  const out = new Map();
  for (const r of idx.allenamento) {
    let p;
    try { p = await piano(r); } catch { continue; }
    (p.sedute || []).forEach((s) => (s.esercizi || []).forEach((e) => {
      if (!out.has(e.id)) out.set(e.id, { id: e.id, nome: e.nome, gruppo: e.gruppo || null, recuperoSec: e.recuperoSec });
    }));
  }
  for (const [k, v] of Object.entries(tutte)) {
    if (!k.startsWith(PREFISSO_ESERCIZIO) || !v || !v.locale) continue;
    const id = k.slice(PREFISSO_ESERCIZIO.length);
    if (out.has(id)) continue;
    const pz = personalizza.leggi(personalizza.chiaveEsercizio(id)) || {};
    out.set(id, {
      id, nome: pz.nome || v.nome || id, gruppo: pz.gruppo || v.gruppo || null, recuperoSec: v.recuperoSec ?? 90,
    });
  }
  return [...out.values()].sort((a, b) => ordineGruppo(a.gruppo) - ordineGruppo(b.gruppo)
    || a.nome.localeCompare(b.nome, 'it'));
}

/**
 * Un esercizio nuovo, creato dal telefono. Se nel catalogo ce n'è già uno con
 * lo stesso nome si riusa quello: stesso id, e lo storico continua.
 */
export async function creaEsercizio({ nome, gruppo, recuperoSec = 90 }) {
  const t = String(nome || '').trim();
  if (!t) return null;
  const s = personalizza.slug(t);
  const gia = (await catalogoEsercizi()).find((e) => personalizza.slug(e.nome) === s);
  if (gia) return gia;
  const id = `app-${s || 'esercizio'}-${Date.now().toString(36)}`;
  const record = {
    locale: true, nome: t, gruppo: gruppo || null, recuperoSec, creato: Date.now(),
  };
  await store.scrivi(PREFISSO_ESERCIZIO + id, record);
  return { id, nome: t, gruppo: record.gruppo, recuperoSec };
}

/* ---------- ripetizioni scritte a mano --------------------- */

/**
 * Dal testo digitato ai campi del piano.
 *   "10"        -> 10 fisse
 *   "8-10"      -> range: si sale di carico quando si chiude al numero alto
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

/* Il tag `gruppo` di ogni esercizio: è la divisione con cui si guardano i
   progressi, non una classificazione anatomica. Le spinte su panca, anche
   inclinata, sono petto; le spinte sopra la testa e le alzate sono spalle. */
export const GRUPPI = [
  { id: 'braccia', nome: 'Braccia', nota: 'Bicipiti e tricipiti' },
  { id: 'gambe', nome: 'Gambe', nota: '' },
  { id: 'dorso', nome: 'Dorso', nota: '' },
  { id: 'petto', nome: 'Petto', nota: '' },
  { id: 'spalle', nome: 'Spalle', nota: '' },
  { id: 'addome', nome: 'Addome', nota: '' },
];

/* Una copia fatta sul telefono prima del 05/10/2026 può avere ancora quello che
   oggi non c'è più. Si sistema a ogni lettura, senza chiedere:
   - `petto-spalle` si smista dal nome dell'esercizio;
   - il primo esercizio di una superserie aveva recupero 0: prende quello del
     compagno, così il timer riparte;
   - i campi tolti (superserie, tipo di carico, incremento, progressione) spariscono,
     e alla prima modifica la copia si salva pulita. */
const DA_SPALLE = /military|lento|alzat|face pull|arnold|spalle/i;
const CAMPI_TOLTI = ['superserie', 'carico', 'caricoAlternativo', 'incrementoKg', 'serieDaSettimana'];

function aggiornaVecchio(p) {
  if (!p) return p;
  delete p.progressione;
  (p.sedute || []).forEach((s) => (s.esercizi || []).forEach((e, i, tutti) => {
    if (e.gruppo === 'petto-spalle') e.gruppo = DA_SPALLE.test(e.nome || '') ? 'spalle' : 'petto';
    if (e.superserie != null && !e.recuperoSec) {
      const compagno = tutti.slice(i + 1).find((x) => x.superserie === e.superserie && x.recuperoSec);
      e.recuperoSec = compagno ? compagno.recuperoSec : 60;
    }
  }));
  (p.sedute || []).forEach((s) => (s.esercizi || []).forEach((e) => {
    CAMPI_TOLTI.forEach((k) => delete e[k]);
  }));
  return p;
}

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

/** Quanti allenamenti prevede la settimana: `allenamentiDaSettimana`
    ({ "<da settimana>": quanti }) se c'è, altrimenti uno per seduta. */
export function allenamentiPrevisti(piano, settimanaNellaFase) {
  let n = (piano?.sedute || []).length;
  const scala = piano?.allenamentiDaSettimana;
  if (scala) {
    const voci = Object.entries(scala).sort((a, b) => Number(a[0]) - Number(b[0]));
    for (const [da, quanti] of voci) {
      if ((settimanaNellaFase || 1) >= Number(da)) n = quanti;
    }
  }
  return n;
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
