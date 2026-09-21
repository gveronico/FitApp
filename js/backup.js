/* backup.js — esporta e importa tutto quello che c'è su questo telefono.

   I dati vivono solo qui: il backup è l'unica rete di sicurezza. Se sbaglia,
   le foto se ne vanno. Per questo ogni errore viene detto, mai inghiottito.

   Il file è uno ZIP senza compressione (metodo 0, "store"), costruito a mano:
   le foto sono già JPEG, comprimerle non guadagna niente e costerebbe una
   libreria. Il vantaggio rispetto a un JSON con base64 è che lo zip si apre da
   qualsiasi computer e le foto si estraggono una per una.

     dati.json                     tutto store.esportaTutto() + versione, creato, app
     foto/<mese>-<posa>-<id>.jpg   uno per scatto

   costruisciZip() e leggiZip() non toccano il DOM: si possono provare a parte.
*/

import { iso } from './ui.js';
import * as store from './store.js';

export const VERSIONE_FORMATO = 1;

/* ---------- CRC32 --------------------------------------- */

let TABELLA = null;

/** La tabella si calcola una volta sola, alla prima chiamata. */
function tabella() {
  if (TABELLA) return TABELLA;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  TABELLA = t;
  return t;
}

/** CRC32 come lo vuole lo zip. */
export function crc32(bytes) {
  const t = tabella();
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i += 1) c = t[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* ---------- zip: scrittura ------------------------------ */

const FIRMA_LOCALE = 0x04034b50;
const FIRMA_CENTRALE = 0x02014b50;
const FIRMA_FINE = 0x06054b50;
const TESTA_LOCALE = 30;
const TESTA_CENTRALE = 46;
const CODA = 22;

/** Ora e data in formato MS-DOS, come le vuole l'intestazione. */
function dataDos(d) {
  const ora = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() >> 1) & 31);
  const anno = Math.max(1980, d.getFullYear());
  const data = (((anno - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { ora, data };
}

function inByte(x) {
  if (x instanceof Uint8Array) return x;
  if (x instanceof ArrayBuffer) return new Uint8Array(x);
  if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
  return new TextEncoder().encode(String(x));
}

/** I nomi restano ASCII: così niente grane di codifica, né qui né altrove. */
export function nomeSicuro(nome) {
  return String(nome).replace(/[^A-Za-z0-9._/-]/g, '_');
}

/**
 * Costruisce lo zip. `voci` è un elenco di { nome, dati }, con `dati`
 * Uint8Array o stringa. Restituisce un Uint8Array pronto da scaricare.
 */
export function costruisciZip(voci) {
  if (!Array.isArray(voci) || !voci.length) {
    throw new Error('Non c’è niente da mettere nel backup.');
  }

  const quando = dataDos(new Date());
  const codificatore = new TextEncoder();

  const preparate = voci.map((v) => {
    const nome = codificatore.encode(nomeSicuro(v.nome));
    const dati = inByte(v.dati);
    return { nome, dati, crc: crc32(dati), posizione: 0 };
  });

  let totale = 0;
  let centrale = 0;
  preparate.forEach((p) => {
    totale += TESTA_LOCALE + p.nome.length + p.dati.length;
    centrale += TESTA_CENTRALE + p.nome.length;
  });

  const out = new Uint8Array(totale + centrale + CODA);
  const dv = new DataView(out.buffer);
  let p = 0;

  // intestazioni locali, ciascuna seguita dai byte del file
  preparate.forEach((v) => {
    v.posizione = p;
    dv.setUint32(p, FIRMA_LOCALE, true);
    dv.setUint16(p + 4, 20, true);            // versione necessaria
    dv.setUint16(p + 6, 0, true);             // nessun flag
    dv.setUint16(p + 8, 0, true);             // metodo 0: store
    dv.setUint16(p + 10, quando.ora, true);
    dv.setUint16(p + 12, quando.data, true);
    dv.setUint32(p + 14, v.crc, true);
    dv.setUint32(p + 18, v.dati.length, true);
    dv.setUint32(p + 22, v.dati.length, true);
    dv.setUint16(p + 26, v.nome.length, true);
    dv.setUint16(p + 28, 0, true);            // niente campo extra
    out.set(v.nome, p + TESTA_LOCALE);
    out.set(v.dati, p + TESTA_LOCALE + v.nome.length);
    p += TESTA_LOCALE + v.nome.length + v.dati.length;
  });

  // directory centrale
  const inizioCentrale = p;
  preparate.forEach((v) => {
    dv.setUint32(p, FIRMA_CENTRALE, true);
    dv.setUint16(p + 4, 20, true);            // versione di chi ha scritto
    dv.setUint16(p + 6, 20, true);            // versione necessaria
    dv.setUint16(p + 8, 0, true);
    dv.setUint16(p + 10, 0, true);
    dv.setUint16(p + 12, quando.ora, true);
    dv.setUint16(p + 14, quando.data, true);
    dv.setUint32(p + 16, v.crc, true);
    dv.setUint32(p + 20, v.dati.length, true);
    dv.setUint32(p + 24, v.dati.length, true);
    dv.setUint16(p + 28, v.nome.length, true);
    dv.setUint16(p + 30, 0, true);            // extra
    dv.setUint16(p + 32, 0, true);            // commento
    dv.setUint16(p + 34, 0, true);            // disco
    dv.setUint16(p + 36, 0, true);            // attributi interni
    dv.setUint32(p + 38, 0, true);            // attributi esterni
    dv.setUint32(p + 42, v.posizione, true);
    out.set(v.nome, p + TESTA_CENTRALE);
    p += TESTA_CENTRALE + v.nome.length;
  });

  // coda
  dv.setUint32(p, FIRMA_FINE, true);
  dv.setUint16(p + 4, 0, true);
  dv.setUint16(p + 6, 0, true);
  dv.setUint16(p + 8, preparate.length, true);
  dv.setUint16(p + 10, preparate.length, true);
  dv.setUint32(p + 12, p - inizioCentrale, true);
  dv.setUint32(p + 16, inizioCentrale, true);
  dv.setUint16(p + 20, 0, true);

  return out;
}

/* ---------- zip: lettura -------------------------------- */

/**
 * Legge uno zip scorrendo le sole intestazioni locali: basta e avanza, e
 * funziona anche su file scritti da altri programmi, purché senza compressione.
 * Restituisce un elenco di { nome, dati }.
 */
export function leggiZip(bytes) {
  const b = inByte(bytes);
  if (b.length < CODA) throw new Error('Il file è troppo piccolo per essere uno zip.');

  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const voci = [];
  let p = 0;

  while (p + 4 <= b.length && dv.getUint32(p, true) === FIRMA_LOCALE) {
    if (p + TESTA_LOCALE > b.length) throw new Error('Il file zip si interrompe a metà.');

    const flag = dv.getUint16(p + 6, true);
    const metodo = dv.getUint16(p + 8, true);
    const dimensione = dv.getUint32(p + 18, true);
    const lungNome = dv.getUint16(p + 26, true);
    const lungExtra = dv.getUint16(p + 28, true);

    if (metodo !== 0) {
      throw new Error(`Lo zip è compresso (metodo ${metodo}). Scheda legge solo i backup che ha creato lei.`);
    }
    if (flag & 0x08) {
      throw new Error('Lo zip usa i descrittori di dati e non si può leggere. Serve un backup creato da Scheda.');
    }

    const nome = new TextDecoder().decode(b.subarray(p + TESTA_LOCALE, p + TESTA_LOCALE + lungNome));
    const inizio = p + TESTA_LOCALE + lungNome + lungExtra;
    const fine = inizio + dimensione;
    if (fine > b.length) throw new Error(`Il file «${nome}» dentro lo zip è tagliato.`);

    voci.push({ nome, dati: b.subarray(inizio, fine) });
    p = fine;
  }

  if (!voci.length) throw new Error('Non sembra uno zip: non trovo nessun file dentro.');
  return voci;
}

/* ---------- export -------------------------------------- */

function nomeFoto(f) {
  return nomeSicuro(`foto/${f.mese}-${f.posa}-${f.id}.jpg`);
}

/** Legge un blob e ne restituisce i byte. */
async function byteDiBlob(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Costruisce il file di backup e lo fa scaricare.
 * Restituisce cosa c'è dentro: { nomeFile, nSessioni, nSerie, nFoto, byte }.
 */
export async function esporta() {
  let dati;
  let scatti;
  try {
    [dati, scatti] = await Promise.all([store.esportaTutto(), store.tutteLeFoto()]);
  } catch (e) {
    throw new Error(`Non riesco a leggere i dati da salvare: ${e?.message || e}`);
  }

  const voci = [];
  const metaFoto = [];

  for (const f of scatti) {
    if (!f.blob) continue;               // scatto senza immagine: niente da salvare
    const file = nomeFoto(f);
    let byte;
    try {
      byte = await byteDiBlob(f.blob);
    } catch (e) {
      throw new Error(`Non riesco a leggere la foto di ${f.mese} (${f.posa}): ${e?.message || e}`);
    }
    voci.push({ nome: file, dati: byte });
    metaFoto.push({ id: f.id, mese: f.mese, posa: f.posa, creata: f.creata, file });
  }

  const contenuto = {
    ...dati,
    foto: metaFoto,
    versione: VERSIONE_FORMATO,
    creato: new Date().toISOString(),
    app: 'scheda',
  };

  voci.unshift({ nome: 'dati.json', dati: JSON.stringify(contenuto, null, 2) });

  let zip;
  try {
    zip = costruisciZip(voci);
  } catch (e) {
    throw new Error(`Non riesco a costruire il file di backup: ${e?.message || e}`);
  }

  const profilo = dati.impostazioni?.profilo || 'scheda';
  const nomeFile = `scheda-${nomeSicuro(profilo)}-${iso()}.zip`;

  try {
    scarica(zip, nomeFile);
  } catch (e) {
    throw new Error(`Il file è pronto ma il telefono non lo scarica: ${e?.message || e}`);
  }

  try {
    await store.scrivi('ultimoBackup', iso());
  } catch {
    // il file è già sul telefono: la data mancata non è un motivo per allarmare
  }

  return {
    nomeFile,
    nSessioni: dati.sessioni?.length || 0,
    nSerie: dati.serie?.length || 0,
    nFoto: metaFoto.length,
    byte: zip.length,
  };
}

function scarica(bytes, nomeFile) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeFile;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/* ---------- import -------------------------------------- */

/** Apre il file e ne tira fuori le voci dello zip e il dati.json già letto. */
async function apriFile(file) {
  if (!file) throw new Error('Nessun file scelto.');

  let bytes;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch (e) {
    throw new Error(`Non riesco a leggere il file scelto: ${e?.message || e}`);
  }

  const voci = leggiZip(bytes);
  const json = voci.find((v) => v.nome === 'dati.json');
  if (!json) throw new Error('Dentro lo zip non c’è dati.json: non è un backup di Scheda.');

  let dati;
  try {
    dati = JSON.parse(new TextDecoder().decode(json.dati));
  } catch (e) {
    throw new Error(`dati.json è rovinato e non si legge: ${e?.message || e}`);
  }

  if (dati.app && dati.app !== 'scheda') {
    throw new Error(`Questo backup è dell’app «${dati.app}», non di Scheda.`);
  }
  if (dati.versione && dati.versione > VERSIONE_FORMATO) {
    throw new Error(`Il backup è in versione ${dati.versione}, questa app arriva alla ${VERSIONE_FORMATO}. Aggiorna l’app.`);
  }

  return { voci, dati };
}

/**
 * Dice cosa c'è dentro un file senza scrivere niente:
 * { profilo, creato, nSessioni, nSerie, nFoto }.
 */
export async function anteprima(file) {
  const { dati } = await apriFile(file);
  return {
    profilo: dati.impostazioni?.profilo || null,
    creato: dati.creato || null,
    nSessioni: dati.sessioni?.length || 0,
    nSerie: dati.serie?.length || 0,
    nFoto: dati.foto?.length || 0,
  };
}

/**
 * Ripristina. Non azzera: fonde. I record con lo stesso identificativo
 * vengono sostituiti, gli altri restano dov'erano.
 * Restituisce { nSessioni, nSerie, nFoto, nSaltate }.
 */
export async function importa(file) {
  const { voci, dati } = await apriFile(file);

  try {
    await store.importaDati(dati);
  } catch (e) {
    throw new Error(`Il ripristino dei dati si è fermato: ${e?.message || e}`);
  }

  const dentro = new Map(voci.map((v) => [v.nome, v.dati]));
  let nFoto = 0;
  let nSaltate = 0;

  for (const f of dati.foto || []) {
    const byte = dentro.get(f.file);
    if (!byte) { nSaltate += 1; continue; }
    try {
      await store.salvaFoto({
        id: f.id,
        mese: f.mese,
        posa: f.posa,
        creata: f.creata,
        blob: new Blob([byte], { type: 'image/jpeg' }),
      });
      nFoto += 1;
    } catch (e) {
      throw new Error(`Foto di ${f.mese} (${f.posa}) non ripristinata: ${e?.message || e}`);
    }
  }

  return {
    nSessioni: dati.sessioni?.length || 0,
    nSerie: dati.serie?.length || 0,
    nFoto,
    nSaltate,
  };
}
