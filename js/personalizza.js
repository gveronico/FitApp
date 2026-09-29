/* personalizza.js — le modifiche che si fanno dall'app, sopra ai piani.

   I file in dati/ restano di sola lettura: li scrive Claude. Qui sopra c'è uno
   strato sottile di sovrascritture — un nome cambiato, un alimento acceso o
   spento, una voce della spesa in un altro reparto — che vive in IndexedDB insieme a
   tutto il resto: entra nel backup e resta sul telefono di chi l'ha fatta.

   Chiavi, tutte nell'archivio `impostazioni`, tutte con prefisso `pz:`
     pz:esercizio:<idEsercizio>                  { nome, gruppo }
     pz:pasto:<idPiano>:<giorno>:<quale>         { nome, testo, ingredienti, scelta, nota }
     pz:alimenti:<idPiano>:<colazione|spuntino>  { ingredienti, scelta }
     pz:spesa:<slug>                             { reparto, nascosto }
     pz:spesa:+<id>                              { testo, reparto }   aggiunta dall'app

   `ingredienti` è l'elenco intero quando è diverso da quello del piano;
   `scelta` è { <slug>: true|false } per gli alimenti accesi o spenti a mano.
   La spesa non ha voci sue: la compone spesa.js da quello che è acceso qui.

   Nome e gruppo di un esercizio stanno qui, legati all'id, e valgono in ogni
   piano: il gruppo è quello su cui si sommano i progressi, e deve restare lo
   stesso da una scheda all'altra. Serie, ripetizioni e il resto stanno nel
   piano (piani.js, copie sul telefono).

   Due scelte da sapere:

   1. Gli `id` degli esercizi non si toccano mai — si cambia solo il nome
      mostrato. Lo storico dei carichi continua a funzionare.
   2. Le voci di cibo non hanno un id nel piano, quindi la chiave è il loro
      testo. Se Claude riscrive quel testo la personalizzazione resta orfana.
      È accettabile: il piano nuovo arriva già scritto come lo si voleva.
*/

import * as store from './store.js';

const PREFISSO = 'pz:';

/** Chiavi di prima del 29/09/2026 (colazioni e spuntini come ricette, spesa in
    due liste): non corrispondono più a niente e non si contano. */
const OBSOLETE = /^pz:(colazione\+?|spuntino\+?):|^pz:spesa:[AB]:/;

/** chiave -> valore. Si popola con carica() e si tiene allineata a mano. */
let cache = new Map();
let caricata = false;

/* ---------- lettura e scrittura ------------------------- */

/** Legge tutte le personalizzazioni. Ripetibile: dopo la prima volta non costa. */
export async function carica(forza = false) {
  if (caricata && !forza) return cache;
  const tutte = await store.leggiTutte();
  const nuova = new Map();
  for (const [k, v] of Object.entries(tutte)) {
    if (k.startsWith(PREFISSO) && v && typeof v === 'object' && !OBSOLETE.test(k)) nuova.set(k, v);
  }
  cache = nuova;
  caricata = true;
  return cache;
}

export function leggi(chiave) {
  return cache.get(chiave) || null;
}

/** Scrive una personalizzazione. `valore` null (o vuoto) la toglie di mezzo. */
export async function scrivi(chiave, valore) {
  const pulito = ripulisci(valore);
  if (!pulito) {
    cache.delete(chiave);
    await store.cancella(chiave);
    return null;
  }
  cache.set(chiave, pulito);
  await store.scrivi(chiave, pulito);
  return pulito;
}

/** Toglie i campi vuoti: una personalizzazione senza contenuto non si salva. */
function ripulisci(valore) {
  if (!valore || typeof valore !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(valore)) {
    if (v == null || v === false || v === '') continue;
    if (Array.isArray(v)) {
      const voci = v.map((x) => String(x).trim()).filter(Boolean);
      if (voci.length) out[k] = voci;
      continue;
    }
    if (typeof v === 'object' && !Object.keys(v).length) continue;
    out[k] = typeof v === 'string' ? v.trim() : v;
    if (out[k] === '') delete out[k];
  }
  return Object.keys(out).length ? out : null;
}

/** Le chiavi che cominciano così, in ordine: gli id nuovi sono ordinati nel tempo. */
export function conPrefisso(prefisso) {
  return [...cache.keys()].filter((k) => k.startsWith(prefisso)).sort();
}

/* ---------- righe aggiunte dall'app --------------------- */

/** Una voce nuova nella spesa, fuori dalla dieta. `reparto` è il nome di un reparto. */
export async function aggiungiVoceSpesa({ testo, reparto }) {
  return scrivi(`${PREFISSO}spesa:+${store.nuovoId('v')}`, { testo, reparto });
}

/* ---------- alimenti: accesi, spenti, aggiunti, tolti ----- */

/**
 * Gli alimenti di un pasto, della colazione o degli spuntini, come stanno ora:
 * [{ nome, scelto, predefinito }]. `originali` e `spenti` vengono dal piano.
 * Un alimento acceso finisce nella spesa; uno spento resta lì, pronto.
 */
export function alimenti(chiave, originali = [], spenti = []) {
  const pz = leggi(chiave) || {};
  const elenco = pz.ingredienti || originali;
  const scelta = pz.scelta || {};
  const spentiPiano = new Set(spenti.map(slug));
  return elenco.map((nome) => {
    const s = slug(nome);
    const predefinito = !spentiPiano.has(s);
    return { nome, scelto: s in scelta ? !!scelta[s] : predefinito, predefinito };
  });
}

/** Accende o spegne un alimento. Tornato com'era nel piano, la scelta si toglie. */
export async function scegliAlimento(chiave, nome, acceso, predefinito = true) {
  const pz = leggi(chiave) || {};
  const scelta = { ...(pz.scelta || {}) };
  const s = slug(nome);
  if (acceso === predefinito) delete scelta[s];
  else scelta[s] = acceso;
  return scrivi(chiave, { ...pz, scelta });
}

/** Aggiunge un alimento, acceso. Se c'è già si riaccende e basta. */
export async function aggiungiAlimento(chiave, nome, originali = [], spenti = []) {
  const pz = leggi(chiave) || {};
  const t = String(nome).trim();
  if (!t) return pz;
  const elenco = pz.ingredienti || originali;
  const s = slug(t);
  const nuovo = elenco.some((x) => slug(x) === s) ? elenco : [...elenco, t];
  const scelta = { ...(pz.scelta || {}) };
  // Acceso è il suo stato naturale, tranne per chi nel piano parte spento.
  if (spenti.map(slug).includes(s)) scelta[s] = true;
  else delete scelta[s];
  return scrivi(chiave, { ...pz, ingredienti: stessoElenco(nuovo, originali) ? null : nuovo, scelta });
}

/** Toglie un alimento dall'elenco, e con lui la sua scelta. */
export async function togliAlimento(chiave, nome, originali = []) {
  const pz = leggi(chiave) || {};
  const s = slug(nome);
  const nuovo = (pz.ingredienti || originali).filter((x) => slug(x) !== s);
  const scelta = { ...(pz.scelta || {}) };
  delete scelta[s];
  return scrivi(chiave, { ...pz, ingredienti: stessoElenco(nuovo, originali) ? null : nuovo, scelta });
}

const stessoElenco = (a, b) => a.map(slug).join('|') === b.map(slug).join('|');

/** Quante ce ne sono, per dirlo in Altro. */
export function quante() {
  return cache.size;
}

/** Via tutte. Non tocca carichi, foto e spunte. */
export async function azzeraTutte() {
  const chiavi = [...cache.keys()];
  cache = new Map();
  await Promise.all(chiavi.map((k) => store.cancella(k)));
  return chiavi.length;
}

/* ---------- chiavi -------------------------------------- */

/** 'Semi di zucca' -> 'semi-di-zucca'. Accenti tolti, così la chiave è stabile. */
export function slug(testo) {
  return String(testo)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export const chiaveEsercizio = (id) => `${PREFISSO}esercizio:${id}`;
export const chiavePasto = (idPiano, giorno, quale) => `${PREFISSO}pasto:${idPiano}:${giorno}:${quale}`;
export const chiaveAlimenti = (idPiano, quale) => `${PREFISSO}alimenti:${idPiano}:${quale}`;
export const chiaveVoceSpesa = (testo) => `${PREFISSO}spesa:${slug(testo)}`;

/** La spunta della spesa vive in un altro archivio ma usa la stessa coordinata:
    la chiave della spunta è quella della personalizzazione senza il prefisso. */
export const spuntaDaChiave = (chiave) => chiave.slice(PREFISSO.length);

/* ---------- applicazione ai piani ------------------------ */

/**
 * Restituisce una copia del piano con le personalizzazioni applicate.
 * Non modifica mai l'originale: piani.js tiene in cache il JSON com'è nel repo.
 */
export function applica(dati) {
  if (!dati || typeof dati !== 'object') return dati;
  if (Array.isArray(dati.sedute)) return applicaAllenamento(dati);
  if (Array.isArray(dati.settimana)) return applicaCibo(dati);
  return dati;
}

/* --- allenamento: nome e gruppo dell'esercizio ------------ */

function applicaAllenamento(piano) {
  return {
    ...piano,
    sedute: piano.sedute.map((seduta) => ({
      ...seduta,
      esercizi: (seduta.esercizi || []).map((e) => {
        const pz = leggi(chiaveEsercizio(e.id));
        if (!pz || (!pz.nome && !pz.gruppo)) return e;
        return {
          ...e,
          nome: pz.nome || e.nome,
          gruppo: pz.gruppo || e.gruppo,
          nomeOriginale: e.nome,
          gruppoOriginale: e.gruppo,
          personalizzato: true,
        };
      }),
    })),
  };
}

/* --- cibo: pasti, colazione, spuntini ---------------------- */

function applicaCibo(cibo) {
  const idPiano = cibo.id;

  const settimana = (cibo.settimana || []).map((g) => ({
    ...g,
    pranzo: pastoPersonalizzato(idPiano, g.giorno, 'pranzo', g.pranzo),
    cena: pastoPersonalizzato(idPiano, g.giorno, 'cena', g.cena),
  }));

  const gruppo = (quale) => {
    const base = cibo[quale];
    if (!base) return null;
    const chiave = chiaveAlimenti(idPiano, quale);
    const originali = base.alimenti || [];
    const spenti = base.spenti || [];
    return {
      ...base, chiave, originali, spenti, alimenti: alimenti(chiave, originali, spenti),
    };
  };

  return {
    ...cibo, settimana, colazione: gruppo('colazione'), spuntino: gruppo('spuntino'),
  };
}

function pastoPersonalizzato(idPiano, giorno, quale, pasto) {
  if (!pasto) return pasto;
  const chiave = chiavePasto(idPiano, giorno, quale);
  const pz = leggi(chiave) || {};
  const originali = pasto.ingredienti || [];
  const spenti = pasto.spenti || [];
  const elenco = alimenti(chiave, originali, spenti);
  return {
    ...pasto,
    chiave,
    nomeOriginale: pasto.nome,
    testoOriginale: pasto.testo,
    ingredientiOriginali: originali,
    notaOriginale: pasto.nota || '',
    nome: pz.nome || pasto.nome,
    testo: pz.testo || pasto.testo,
    ingredienti: elenco.map((a) => a.nome),
    alimenti: elenco,
    spenti,
    nota: pz.nota || pasto.nota,
    personalizzato: !!(pz.nome || pz.testo || pz.ingredienti || pz.nota),
  };
}
