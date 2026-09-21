/* foto.js — l'archivio fotografico mensile: uno scatto a inizio mese, stessa
   luce, stessa posizione, per vedere come cambia il corpo. Non è una misura.
   Le foto sono Blob in IndexedDB (vedi store.js) e non escono mai dal
   telefono: nessun upload, nessuna rete, mai. */

import { h, meseBreve, conferma, metti } from '../ui.js';
import * as store from '../store.js';

const LATO_MAX = 1600;
const QUALITA_JPEG = 0.82;
const POSE = ['fronte', 'lato', 'retro'];
const ETICHETTA_POSA = { fronte: 'Fronte', lato: 'Lato', retro: 'Retro' };

/* ---------- monta / corpo -------------------------------- */

export async function monta(contenitore, parametri) {
  const testata = h('header.testata', [
    h('div', [
      h('p.occhiello', 'Progressi'),
      h('h1.titolo', 'Foto'),
    ]),
  ]);
  const schermata = h('div.schermata');
  contenitore.append(testata, schermata);
  await corpo(schermata);
}

export async function corpo(contenitore) {
  iniettaStile();

  /* elenco degli object URL creati nel giro di disegno corrente:
     revocati a inizio di ogni ridisegno e quando il contenitore esce dal DOM */
  let urlAttivi = [];
  const revoca = () => { urlAttivi.splice(0).forEach((u) => URL.revokeObjectURL(u)); };
  const creaUrl = (blob) => { const u = URL.createObjectURL(blob); urlAttivi.push(u); return u; };

  /* input file nascosto, condiviso: vive nel body perché ridisegna() sostituisce
     il contenuto del contenitore e lo porterebbe via */
  const input = h('input.nascondi', { type: 'file', accept: 'image/*' });
  document.body.append(input);
  let bersaglio = null; // { mese, posa } in attesa dello scatto scelto

  osservaSmontaggio(contenitore, () => { revoca(); input.remove(); });

  let tutte = [];
  let perMese = {};

  async function ricarica() {
    tutte = await store.tutteLeFoto();
    perMese = {};
    tutte.forEach((f) => {
      if (!perMese[f.mese]) perMese[f.mese] = [];
      perMese[f.mese].push(f);
    });
  }
  await ricarica();

  let vista = { nome: 'griglia' };
  function vai(v) { vista = v; ridisegna(); }

  async function ridisegna() {
    if (!contenitore.isConnected) { revoca(); return; }
    revoca();
    let contenuto;
    if (vista.nome === 'mese') contenuto = await disegnaMese(vista.mese);
    else if (vista.nome === 'confronto') contenuto = await disegnaConfronto();
    else contenuto = await disegnaGriglia();
    if (!contenitore.isConnected) { revoca(); return; }
    metti(contenitore, contenuto);
  }

  /* ---------- griglia dei mesi ---------------------------- */

  async function disegnaGriglia() {
    const pezzi = [];

    if (!tutte.length) {
      pezzi.push(h('div.vuoto', [
        h('p', 'Una serie di scatti a inizio mese, stessa luce e stessa posizione.'),
        h('button.btn.btn-primo', {
          onclick: () => vai({ nome: 'mese', mese: meseAttuale() }),
        }, 'Fai il primo scatto'),
      ]));
    } else {
      pezzi.push(h('div.riga-sp', [
        h('p.occhiello', 'Archivio mensile'),
        h('button.btn.btn-s', { onclick: () => vai({ nome: 'confronto' }) }, 'Confronta'),
      ]));
      const corrente = meseAttuale();
      const mesi = generaMesi(perMese, corrente);
      pezzi.push(h('div.fot-griglia', mesi.map((m) => cellaMese(m, perMese[m], corrente))));
    }

    pezzi.push(await disegnaNota());
    return h('div.pila', pezzi);
  }

  function cellaMese(mese, foto, corrente) {
    const onclick = () => vai({ nome: 'mese', mese });

    if (foto && foto.length) {
      const url = creaUrl(foto[0].blob);
      return h('button.fot-cella', { onclick }, [
        h('div.fot-cella-img', { style: `background-image:url(${url})` }),
        h('div.fot-cella-info', [
          h('span.fot-cella-mese', meseBreve(mese)),
          h('span.fot-cella-conteggio', `${foto.length} ${foto.length === 1 ? 'scatto' : 'scatti'}`),
        ]),
      ]);
    }

    const attuale = mese === corrente;
    return h('button.fot-cella.fot-cella-vuota', { onclick }, [
      h('div.fot-cella-piu', attuale ? '+' : ''),
      h('div.fot-cella-info', [
        h('span.fot-cella-mese', meseBreve(mese)),
        h('span.fot-cella-conteggio', attuale ? 'Scatta' : 'Nessuno scatto'),
      ]),
    ]);
  }

  async function disegnaNota() {
    const mb = await store.spazio();
    const spazioTesto = mb != null ? `Spazio occupato: ${mb < 1 ? 'meno di 1' : Math.round(mb)} MB. ` : '';
    return h('p.nota', { style: 'margin-top:2px' },
      `${spazioTesto}Le foto restano su questo telefono. Il backup è in Altro.`);
  }

  /* ---------- mese aperto ---------------------------------- */

  async function disegnaMese(mese) {
    const elenco = perMese[mese] || [];
    const pezzi = [
      h('button.btn.btn-s', { onclick: () => vai({ nome: 'griglia' }) }, '← Indietro'),
      h('p.titolo-2', { style: 'margin-top:10px' }, meseBreve(mese)),
    ];

    if (elenco.length) {
      pezzi.push(h('div.fot-scatti', { style: 'margin-top:10px' },
        elenco.map((f) => cellaScatto(f))));
    } else {
      pezzi.push(h('p.nota', { style: 'margin-top:10px' }, 'Nessuno scatto in questo mese.'));
    }

    pezzi.push(h('div.btn-riga', { style: 'margin-top:14px' }, POSE.map((p) => h('button.btn', {
      onclick: () => aggiungiScatto(mese, p),
    }, ETICHETTA_POSA[p]))));

    return h('div.pila', pezzi);
  }

  function cellaScatto(f) {
    const url = creaUrl(f.blob);
    return h('div.fot-scatto', [
      h('div.fot-scatto-img', { style: `background-image:url(${url})` }),
      h('div.riga-sp', { style: 'margin-top:6px' }, [
        h('p.nota', ETICHETTA_POSA[f.posa]),
        h('button.btn.btn-s.btn-rosso', { onclick: () => eliminaScatto(f) }, 'Elimina'),
      ]),
    ]);
  }

  async function eliminaScatto(f) {
    if (!conferma('Eliminare questo scatto? Non si può recuperare.')) return;
    await store.eliminaFoto(f.id);
    await ricarica();
    ridisegna();
  }

  /* ---------- scatto: sagoma, selezione file, ridimensiona -- */

  async function aggiungiScatto(mese, posa) {
    const precedente = indietroMesi(mese, 1);
    const riferimento = (perMese[precedente] || []).find((f) => f.posa === posa);

    let procedi = true;
    if (riferimento) {
      // tracciato in urlAttivi: se si naviga via mentre l'overlay è aperto,
      // lo revoca comunque il prossimo ridisegno (o lo smontaggio)
      const urlRif = creaUrl(riferimento.blob);
      procedi = await mostraPreparazione(urlRif);
    }
    if (!procedi) return;

    bersaglio = { mese, posa };
    input.click();
  }

  function mostraPreparazione(url) {
    return new Promise((risolvi) => {
      const overlay = h('div.fot-prep', [
        h('img.fot-prep-img', { src: url, alt: '' }),
        h('p.fot-prep-testo', 'Mettiti nella stessa posizione'),
        h('div.fot-prep-azioni', [
          h('button.btn.btn-s', { onclick: () => chiudi(false) }, 'Annulla'),
          h('button.btn.btn-primo', { onclick: () => chiudi(true) }, 'Scatta'),
        ]),
      ]);
      function chiudi(esito) { overlay.remove(); risolvi(esito); }
      contenitore.append(overlay);
    });
  }

  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file || !bersaglio) return;
    const { mese, posa } = bersaglio;
    bersaglio = null;

    const overlay = h('div.fot-elab', [h('p.titolo-2', 'Un momento…')]);
    contenitore.append(overlay);
    try {
      const blob = await ridimensiona(file);
      await store.salvaFoto({ id: store.nuovoId('foto'), mese, posa, blob, creata: Date.now() });
      await ricarica();
    } finally {
      overlay.remove();
    }
    vai({ nome: 'mese', mese });
  });

  /* ---------- confronto ------------------------------------ */

  async function disegnaConfronto() {
    const mesiConFoto = Object.keys(perMese).sort();
    const conteggi = { fronte: 0, lato: 0, retro: 0 };
    tutte.forEach((f) => { conteggi[f.posa] = (conteggi[f.posa] || 0) + 1; });
    let posaSel = POSE.slice().sort((a, b) => conteggi[b] - conteggi[a])[0];

    const mesiDiPosa = (p) => mesiConFoto.filter((m) => (perMese[m] || []).some((f) => f.posa === p));

    let opzioni = mesiDiPosa(posaSel);
    let meseA = opzioni[0] || '';
    let meseB = opzioni[opzioni.length - 1] || '';

    const pannelli = h('div.fot-confronto');

    const selPosa = h('select', {
      onchange: () => {
        posaSel = selPosa.value;
        opzioni = mesiDiPosa(posaSel);
        meseA = opzioni[0] || '';
        meseB = opzioni[opzioni.length - 1] || '';
        riempiSelectMesi();
        aggiornaPannelli();
      },
    }, POSE.map((p) => h('option', { value: p, selected: p === posaSel }, ETICHETTA_POSA[p])));

    const selA = h('select', { onchange: () => { meseA = selA.value; aggiornaPannelli(); } });
    const selB = h('select', { onchange: () => { meseB = selB.value; aggiornaPannelli(); } });

    function riempiSelectMesi() {
      metti(selA, opzioni.map((m) => h('option', { value: m, selected: m === meseA }, meseBreve(m))));
      metti(selB, opzioni.map((m) => h('option', { value: m, selected: m === meseB }, meseBreve(m))));
    }
    riempiSelectMesi();

    function pannello(mese) {
      const f = mese ? (perMese[mese] || []).find((x) => x.posa === posaSel) : null;
      if (!f) return h('div.fot-confronto-vuoto', [h('p.nota', 'Nessuna foto.')]);
      const url = creaUrl(f.blob);
      return h('div.fot-confronto-cella', [
        h('div.fot-confronto-img', { style: `background-image:url(${url})` }),
        h('p.nota', { style: 'text-align:center;margin-top:6px' }, meseBreve(mese)),
      ]);
    }

    function aggiornaPannelli() {
      revoca();
      metti(pannelli, pannello(meseA), pannello(meseB));
    }
    aggiornaPannelli();

    return h('div.pila', [
      h('button.btn.btn-s', { onclick: () => vai({ nome: 'griglia' }) }, '← Indietro'),
      h('p.titolo-2', { style: 'margin-top:10px' }, 'Confronta'),
      h('label.campo', [h('span.occhiello', 'Posa'), selPosa]),
      h('div.fot-confronto-select', [
        h('label.campo', [h('span.occhiello', 'Mese A'), selA]),
        h('label.campo', [h('span.occhiello', 'Mese B'), selB]),
      ]),
      pannelli,
    ]);
  }

  await ridisegna();
}

/* ---------- ridimensionamento immagine -------------------- */

/** Legge il file, lo ridisegna con il lato lungo a 1600px (mai ingrandendo)
    e produce un JPEG allo 0.82. Rilascia ogni ObjectURL che crea. */
async function ridimensiona(file) {
  let bitmap;
  let urlTemporaneo = null;

  if (typeof createImageBitmap === 'function') {
    bitmap = await createImageBitmap(file);
  } else {
    urlTemporaneo = URL.createObjectURL(file);
    bitmap = await caricaImmagine(urlTemporaneo);
  }

  const largo = bitmap.width || bitmap.naturalWidth;
  const alto = bitmap.height || bitmap.naturalHeight;
  const scala = Math.min(1, LATO_MAX / Math.max(largo, alto));
  const w = Math.max(1, Math.round(largo * scala));
  const h2 = Math.max(1, Math.round(alto * scala));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h2;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h2);

  if (typeof bitmap.close === 'function') bitmap.close();
  if (urlTemporaneo) URL.revokeObjectURL(urlTemporaneo);

  return new Promise((risolvi) => canvas.toBlob(risolvi, 'image/jpeg', QUALITA_JPEG));
}

function caricaImmagine(url) {
  return new Promise((risolvi, rifiuta) => {
    const img = new Image();
    img.onload = () => risolvi(img);
    img.onerror = rifiuta;
    img.src = url;
  });
}

/* ---------- mesi ------------------------------------------ */

/** 'YYYY-MM' del mese corrente. */
function meseAttuale() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 'YYYY-MM' di n mesi prima di quello dato. */
function indietroMesi(meseIso, n) {
  const [a, m] = meseIso.split('-').map(Number);
  const d = new Date(a, m - 1 - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function differenzaMesi(meseA, meseB) {
  const [a1, m1] = meseA.split('-').map(Number);
  const [a2, m2] = meseB.split('-').map(Number);
  return (a1 - a2) * 12 + (m1 - m2);
}

/** Dal mese corrente indietro: almeno 12 mesi, di più se serve a coprire
    anche il mese più vecchio con foto. Più recente in testa. */
function generaMesi(perMese, corrente) {
  const chiavi = Object.keys(perMese).sort();
  let totale = 12;
  if (chiavi.length) {
    totale = Math.max(12, differenzaMesi(corrente, chiavi[0]) + 1);
  }
  const elenco = [];
  for (let i = 0; i < totale; i += 1) elenco.push(indietroMesi(corrente, i));
  return elenco;
}

/* ---------- smontaggio -------------------------------------
   Non c'è un ciclo di vita esplicito nelle viste: quando il router
   sostituisce il contenuto di #app, il nostro contenitore esce dal DOM.
   Un MutationObserver sul body ce lo dice, per revocare gli ObjectURL
   e togliere l'input file condiviso. */
function osservaSmontaggio(contenitore, alSmontaggio) {
  const oss = new MutationObserver(() => {
    if (!contenitore.isConnected) {
      oss.disconnect();
      alSmontaggio();
    }
  });
  oss.observe(document.body, { childList: true, subtree: true });
}

/* ---------- stile locale ------------------------------------
   app.css non si tocca: quel che manca vive qui, con classi fot-. */

const STILE = `
.fot-griglia { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }

.fot-cella {
  display: block; width: 100%; padding: 0; text-align: left; cursor: pointer;
  font-family: inherit; border: var(--bordo) solid var(--linea); background: var(--paper); color: var(--ink);
}
.fot-cella-img {
  aspect-ratio: 1 / 1; background-size: cover; background-position: center;
  background-color: var(--velo); border-bottom: var(--bordo) solid var(--linea);
}
.fot-cella-info { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 8px 10px; }
.fot-cella-mese { font-weight: 700; font-size: 14px; }
.fot-cella-conteggio { font-size: 12px; color: var(--ink-2); }

.fot-cella-vuota { border-style: dashed; border-color: var(--linea-2); }
.fot-cella-piu {
  aspect-ratio: 1 / 1; display: grid; place-items: center; font-size: 34px; font-weight: 800;
  color: var(--ink-2); border-bottom: var(--bordo) dashed var(--linea-2);
}

.fot-scatti { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.fot-scatto-img {
  aspect-ratio: 3 / 4; background-size: cover; background-position: center;
  background-color: var(--velo); border: var(--bordo) solid var(--linea);
}

.fot-confronto-select { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.fot-confronto { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
.fot-confronto-img {
  aspect-ratio: 3 / 4; background-size: cover; background-position: center;
  background-color: var(--velo); border: var(--bordo) solid var(--linea);
}
.fot-confronto-vuoto {
  aspect-ratio: 3 / 4; border: var(--bordo) dashed var(--linea-2); display: grid; place-items: center;
}

.fot-prep { position: fixed; inset: 0; z-index: 200; background: var(--paper); overflow: hidden; }
.fot-prep-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.35; }
.fot-prep-testo {
  position: absolute; left: 0; right: 0; top: 42%; text-align: center; padding: 0 24px;
  font-size: 20px; font-weight: 700; color: var(--ink); text-shadow: none;
}
.fot-prep-azioni {
  position: absolute; left: 0; right: 0; bottom: 0; display: grid; grid-auto-flow: column;
  grid-auto-columns: 1fr; gap: 10px; padding: 16px; padding-bottom: calc(16px + env(safe-area-inset-bottom));
  background: var(--paper); border-top: var(--bordo) solid var(--linea);
}

.fot-elab { position: fixed; inset: 0; z-index: 210; background: var(--paper); display: grid; place-items: center; }
`;

function iniettaStile() {
  if (document.getElementById('stile-foto')) return;
  const s = document.createElement('style');
  s.id = 'stile-foto';
  s.textContent = STILE;
  document.head.append(s);
}
