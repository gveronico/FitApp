/* personalizza.js — le modifiche che si fanno dall'app, sopra ai piani.

   I file in dati/ restano di sola lettura: li scrive Claude. Qui sopra c'è uno
   strato sottile di sovrascritture — un nome cambiato, una voce tolta, una voce
   spostata da una lista della spesa all'altra — che vive in IndexedDB insieme a
   tutto il resto: entra nel backup e resta sul telefono di chi l'ha fatta.

   Chiavi, tutte nell'archivio `impostazioni`, tutte con prefisso `pz:`
     pz:esercizio:<idEsercizio>               { nome }
     pz:pasto:<idPiano>:<giorno>:<quale>      { nome, testo }
     pz:colazione:<idPiano>:<slug>            { nome, testo, nascosto }
     pz:spuntino:<idPiano>:<slug>             { testo, nascosto }
     pz:spesa:<idLista>:<voce>                { testo, lista, nascosto }

   Due scelte da sapere:

   1. Gli `id` degli esercizi non si toccano mai — si cambia solo il nome
      mostrato. Lo storico dei carichi continua a funzionare.
   2. Le voci di cibo non hanno un id nel piano, quindi la chiave è il loro
      testo. Se Claude riscrive quel testo la personalizzazione resta orfana.
      È accettabile: il piano nuovo arriva già scritto come lo si voleva.
*/

import * as store from './store.js';

const PREFISSO = 'pz:';

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
    if (k.startsWith(PREFISSO) && v && typeof v === 'object') nuova.set(k, v);
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
    out[k] = typeof v === 'string' ? v.trim() : v;
    if (out[k] === '') delete out[k];
  }
  return Object.keys(out).length ? out : null;
}

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
export const chiaveColazione = (idPiano, testo) => `${PREFISSO}colazione:${idPiano}:${slug(testo)}`;
export const chiaveSpuntino = (idPiano, testo) => `${PREFISSO}spuntino:${idPiano}:${slug(testo)}`;
export const chiaveVoceSpesa = (idLista, voce) => `${PREFISSO}spesa:${idLista}:${voce}`;

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
  if (Array.isArray(dati.liste)) return applicaSpesa(dati);
  if (Array.isArray(dati.settimana)) return applicaCibo(dati);
  return dati;
}

/* --- allenamento: solo il nome dell'esercizio ------------- */

function applicaAllenamento(piano) {
  return {
    ...piano,
    sedute: piano.sedute.map((seduta) => ({
      ...seduta,
      esercizi: (seduta.esercizi || []).map((e) => {
        const pz = leggi(chiaveEsercizio(e.id));
        if (!pz || !pz.nome) return e;
        return { ...e, nome: pz.nome, nomeOriginale: e.nome, personalizzato: true };
      }),
    })),
  };
}

/* --- cibo: pasti, colazioni, spuntini --------------------- */

function applicaCibo(cibo) {
  const idPiano = cibo.id;

  const settimana = (cibo.settimana || []).map((g) => ({
    ...g,
    pranzo: pastoPersonalizzato(idPiano, g.giorno, 'pranzo', g.pranzo),
    cena: pastoPersonalizzato(idPiano, g.giorno, 'cena', g.cena),
  }));

  const colazioni = (cibo.colazioni || [])
    .map((c) => {
      const chiave = chiaveColazione(idPiano, c.nome || c.testo);
      const pz = leggi(chiave) || {};
      return {
        ...c,
        chiave,
        originale: c,
        nome: pz.nome || c.nome,
        testo: pz.testo || c.testo,
        nascosto: !!pz.nascosto,
        personalizzato: !!(pz.nome || pz.testo),
      };
    })
    .filter((c) => !c.nascosto);

  // Gli spuntini nel piano sono stringhe: qui diventano righe con una chiave,
  // perché senza chiave non si possono né rinominare né togliere.
  const spuntini = (cibo.spuntini || [])
    .map((testo) => {
      const chiave = chiaveSpuntino(idPiano, testo);
      const pz = leggi(chiave) || {};
      return {
        chiave,
        originale: testo,
        testo: pz.testo || testo,
        nascosto: !!pz.nascosto,
        personalizzato: !!pz.testo,
      };
    })
    .filter((s) => !s.nascosto);

  return { ...cibo, settimana, colazioni, spuntini };
}

function pastoPersonalizzato(idPiano, giorno, quale, pasto) {
  if (!pasto) return pasto;
  const chiave = chiavePasto(idPiano, giorno, quale);
  const pz = leggi(chiave) || {};
  return {
    ...pasto,
    chiave,
    nomeOriginale: pasto.nome,
    testoOriginale: pasto.testo,
    nome: pz.nome || pasto.nome,
    testo: pz.testo || pasto.testo,
    personalizzato: !!(pz.nome || pz.testo),
  };
}

/* --- spesa: rinomina, nasconde, sposta di lista ------------ */

/**
 * Le voci diventano oggetti { chiave, originale, testo, listaOrigine, spostata }.
 * `chiave` resta quella della lista di partenza anche dopo lo spostamento: così
 * la spunta già messa non si perde e non si duplica.
 */
function applicaSpesa(spesa) {
  const liste = (spesa.liste || []).map((l) => ({
    ...l,
    reparti: (l.reparti || []).map((r) => ({ ...r, voci: [] })),
  }));
  const perId = new Map(liste.map((l) => [l.id, l]));

  (spesa.liste || []).forEach((lista) => {
    (lista.reparti || []).forEach((reparto) => {
      (reparto.voci || []).forEach((voce) => {
        const chiave = chiaveVoceSpesa(lista.id, voce);
        const pz = leggi(chiave) || {};
        if (pz.nascosto) return;

        const destinazioneId = pz.lista && perId.has(pz.lista) ? pz.lista : lista.id;
        const destinazione = perId.get(destinazioneId);
        const riga = {
          chiave,
          originale: voce,
          testo: pz.testo || voce,
          listaOrigine: lista.id,
          spostata: destinazioneId !== lista.id,
          personalizzata: !!pz.testo,
        };
        repartoDi(destinazione, reparto.nome, reparto.nota).voci.push(riga);
      });
    });
  });

  // Un reparto rimasto senza voci (tutte tolte o spostate) non si mostra.
  liste.forEach((l) => { l.reparti = l.reparti.filter((r) => r.voci.length); });

  return { ...spesa, liste };
}

/** Il reparto con quel nome nella lista, creandolo in fondo se non c'è. */
function repartoDi(lista, nome, nota) {
  let r = lista.reparti.find((x) => x.nome === nome);
  if (!r) {
    r = { nome, nota, voci: [] };
    lista.reparti.push(r);
  }
  return r;
}
