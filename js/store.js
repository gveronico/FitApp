/* store.js — tutto quello che l'utente inserisce vive qui, in IndexedDB,
   sul telefono. Niente rete, niente account.

   Archivi
     impostazioni  chiave/valore        profilo, pesoCorporeo, tema, dataInizio…
     sessioni      { id, ... }          una per allenamento svolto
     serie         { id, ... }          una per serie registrata
     foto          { id, ... }          una per scatto, con il blob dentro
     spunte        { id, spuntato }     spesa e preparazione della domenica
*/

const DB_NOME = 'scheda';
const DB_VERSIONE = 1;

let _db = null;

function apri() {
  if (_db) return Promise.resolve(_db);
  return new Promise((risolvi, rifiuta) => {
    const req = indexedDB.open(DB_NOME, DB_VERSIONE);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('impostazioni')) {
        db.createObjectStore('impostazioni');
      }
      if (!db.objectStoreNames.contains('sessioni')) {
        const s = db.createObjectStore('sessioni', { keyPath: 'id' });
        s.createIndex('data', 'data');
      }
      if (!db.objectStoreNames.contains('serie')) {
        const s = db.createObjectStore('serie', { keyPath: 'id' });
        s.createIndex('sessioneId', 'sessioneId');
        s.createIndex('esercizioId', 'esercizioId');
        s.createIndex('data', 'data');
      }
      if (!db.objectStoreNames.contains('foto')) {
        const s = db.createObjectStore('foto', { keyPath: 'id' });
        s.createIndex('mese', 'mese');
      }
      if (!db.objectStoreNames.contains('spunte')) {
        db.createObjectStore('spunte', { keyPath: 'id' });
      }
    };

    req.onsuccess = () => { _db = req.result; risolvi(_db); };
    req.onerror = () => rifiuta(req.error);
  });
}

function tx(archivio, modo = 'readonly') {
  return apri().then((db) => db.transaction(archivio, modo).objectStore(archivio));
}

function attesa(req) {
  return new Promise((risolvi, rifiuta) => {
    req.onsuccess = () => risolvi(req.result);
    req.onerror = () => rifiuta(req.error);
  });
}

/** Identificativo univoco e ordinabile nel tempo. */
export function nuovoId(prefisso = 'x') {
  return `${prefisso}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/* ---------- impostazioni -------------------------------- */

const PREDEFINITE = {
  profilo: null,          // 'giuseppe' | 'corinna' — scelto al primo avvio
  pesoCorporeo: null,     // kg, serve solo al calcolo delle trazioni
  tema: 'auto',           // 'auto' | 'chiaro' | 'scuro'
  dataInizio: null,       // 'YYYY-MM-DD' del primo allenamento della settimana 1
  pianoAttivo: null,      // id del piano scelto a mano; se null lo calcola la data
  ultimoBackup: null,     // 'YYYY-MM-DD'
};

export async function leggiTutte() {
  const s = await tx('impostazioni');
  const chiavi = await attesa(s.getAllKeys());
  const valori = await attesa(s.getAll());
  const out = { ...PREDEFINITE };
  chiavi.forEach((k, i) => { out[k] = valori[i]; });
  return out;
}

export async function leggi(chiave) {
  const s = await tx('impostazioni');
  const v = await attesa(s.get(chiave));
  return v === undefined ? PREDEFINITE[chiave] ?? null : v;
}

export async function scrivi(chiave, valore) {
  const s = await tx('impostazioni', 'readwrite');
  await attesa(s.put(valore, chiave));
  return valore;
}

/* ---------- sessioni ------------------------------------ */

/**
 * sessione = {
 *   id, data:'YYYY-MM-DD', iniziata:ms, finita:ms|null, durataSec:int|null,
 *   pianoId, sedutaId, monitorata:bool
 * }
 */
export async function salvaSessione(sessione) {
  const s = await tx('sessioni', 'readwrite');
  await attesa(s.put(sessione));
  return sessione;
}

export async function leggiSessione(id) {
  const s = await tx('sessioni');
  return attesa(s.get(id));
}

export async function sessioni() {
  const s = await tx('sessioni');
  const tutte = await attesa(s.getAll());
  return tutte.sort((a, b) => (a.data < b.data ? 1 : -1));
}

/** L'ultima sessione non ancora chiusa, se esiste. */
export async function sessioneAperta() {
  const tutte = await sessioni();
  return tutte.find((s) => !s.finita) || null;
}

/* ---------- serie --------------------------------------- */

/**
 * serie = {
 *   id, sessioneId, data:'YYYY-MM-DD', pianoId, sedutaId, esercizioId,
 *   indice:int (0-based), carico:number|null, ripetizioni:int|null,
 *   monitorata:bool, note:string
 * }
 * Su trazioni e assistite `carico` è già il carico reale
 * (peso corporeo ± zavorra/assistenza), non il numero letto sulla macchina.
 */
export async function salvaSerie(serie) {
  const s = await tx('serie', 'readwrite');
  await attesa(s.put(serie));
  return serie;
}

export async function salvaSerieMulte(elenco) {
  const st = await tx('serie', 'readwrite');
  await Promise.all(elenco.map((x) => attesa(st.put(x))));
  return elenco;
}

export async function serieDiSessione(sessioneId) {
  const s = await tx('serie');
  const out = await attesa(s.index('sessioneId').getAll(sessioneId));
  return out.sort((a, b) => a.indice - b.indice);
}

export async function serieDiEsercizio(esercizioId) {
  const s = await tx('serie');
  const out = await attesa(s.index('esercizioId').getAll(esercizioId));
  return out.sort((a, b) => (a.data === b.data ? a.indice - b.indice : a.data < b.data ? -1 : 1));
}

export async function tutteLeSerie() {
  const s = await tx('serie');
  return attesa(s.getAll());
}

export async function eliminaSerie(id) {
  const s = await tx('serie', 'readwrite');
  return attesa(s.delete(id));
}

/* ---------- foto ---------------------------------------- */

/** foto = { id, mese:'YYYY-MM', posa:'fronte'|'lato'|'retro', blob, creata:ms } */
export async function salvaFoto(foto) {
  const s = await tx('foto', 'readwrite');
  await attesa(s.put(foto));
  return foto;
}

export async function fotoDelMese(mese) {
  const s = await tx('foto');
  return attesa(s.index('mese').getAll(mese));
}

export async function tutteLeFoto() {
  const s = await tx('foto');
  const out = await attesa(s.getAll());
  return out.sort((a, b) => (a.mese === b.mese ? a.creata - b.creata : a.mese < b.mese ? 1 : -1));
}

export async function eliminaFoto(id) {
  const s = await tx('foto', 'readwrite');
  return attesa(s.delete(id));
}

/* ---------- spunte (spesa, preparazione) ---------------- */

/** id convenzionale: 'spesa:A:Zucchine' · 'domenica:uova' */
export async function spunte(prefisso = '') {
  const s = await tx('spunte');
  const tutte = await attesa(s.getAll());
  const out = {};
  tutte.forEach((x) => { if (x.id.startsWith(prefisso)) out[x.id] = !!x.spuntato; });
  return out;
}

export async function segnaSpunta(id, spuntato) {
  const s = await tx('spunte', 'readwrite');
  await attesa(s.put({ id, spuntato: !!spuntato }));
}

export async function azzeraSpunte(prefisso) {
  const s = await tx('spunte', 'readwrite');
  const tutte = await attesa(s.getAll());
  await Promise.all(
    tutte.filter((x) => x.id.startsWith(prefisso)).map((x) => attesa(s.delete(x.id))),
  );
}

/* ---------- manutenzione (serve al backup) -------------- */

export async function esportaTutto() {
  const [imp, ses, ser, spu] = await Promise.all([
    leggiTutte(), sessioni(), tutteLeSerie(), spunte(),
  ]);
  return { impostazioni: imp, sessioni: ses, serie: ser, spunte: spu };
}

export async function importaDati({ impostazioni, sessioni: ses, serie: ser, spunte: spu }) {
  if (impostazioni) {
    for (const [k, v] of Object.entries(impostazioni)) await scrivi(k, v);
  }
  if (ses?.length) {
    const s = await tx('sessioni', 'readwrite');
    await Promise.all(ses.map((x) => attesa(s.put(x))));
  }
  if (ser?.length) {
    const s = await tx('serie', 'readwrite');
    await Promise.all(ser.map((x) => attesa(s.put(x))));
  }
  if (spu) {
    const s = await tx('spunte', 'readwrite');
    await Promise.all(Object.entries(spu).map(([id, v]) => attesa(s.put({ id, spuntato: !!v }))));
  }
}

export async function svuotaTutto() {
  const db = await apri();
  const nomi = ['impostazioni', 'sessioni', 'serie', 'foto', 'spunte'];
  const t = db.transaction(nomi, 'readwrite');
  nomi.forEach((n) => t.objectStore(n).clear());
  return new Promise((ok, ko) => { t.oncomplete = ok; t.onerror = () => ko(t.error); });
}

/** Spazio occupato, in MB, quando il browser lo dichiara. */
export async function spazio() {
  try {
    const { usage } = await navigator.storage.estimate();
    return usage ? usage / 1048576 : null;
  } catch { return null; }
}
