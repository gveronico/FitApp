/* cibo.js — il piano alimentare: settimana, spesa, regole di base.
   Tre sotto-schede. Il banner dei vincoli (allergie, intolleranze) è la
   parte più importante: sta in cima alla spesa e in cima a ogni ricetta. */

import { h, metti, giornoIso, conferma } from '../ui.js';
import * as piani from '../piani.js';
import * as store from '../store.js';

const GIORNI_SETT = ['', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì'];

export async function monta(contenitore, parametri) {
  iniettaStile();

  const richiesto = parametri && parametri[0];
  let attiva = (richiesto === 'spesa' || richiesto === 'base') ? richiesto : 'settimana';

  const [st, profilo] = await Promise.all([piani.stato(), store.leggi('profilo')]);
  const cibo = st.cibo;

  const testata = h('header.testata', [
    h('div', [
      h('p.occhiello', 'Alimentazione'),
      h('h1.titolo', 'Cibo'),
    ]),
  ]);
  const schermata = h('div.schermata');
  contenitore.append(testata, schermata);

  if (!cibo) {
    metti(schermata, h('div.vuoto', [h('p.nota', 'Il piano alimentare non è disponibile.')]));
    return;
  }

  let spunte = await store.spunte('');

  const ricaricaSpunte = async () => { spunte = await store.spunte(''); };

  const barraSchede = h('div.schede');
  const corpo = h('div.pila');

  function disegnaSchede() {
    metti(barraSchede, [
      tabBtn('settimana', 'Settimana'),
      tabBtn('spesa', 'Spesa'),
      tabBtn('base', 'Base'),
    ]);
  }

  function tabBtn(id, etichetta) {
    return h('button', {
      'aria-selected': attiva === id ? 'true' : 'false',
      onclick: () => { attiva = id; ridisegna(); },
    }, etichetta);
  }

  async function ridisegnaSpesa() {
    await ricaricaSpunte();
    ridisegna();
  }

  function ridisegna() {
    disegnaSchede();
    if (attiva === 'settimana') metti(corpo, vistaSettimana(cibo, profilo));
    else if (attiva === 'spesa') metti(corpo, vistaSpesa(st.spesa, cibo, profilo, spunte, ridisegnaSpesa));
    else metti(corpo, vistaBase(cibo));
  }

  schermata.append(barraSchede, corpo);
  ridisegna();
}

/* ========== Settimana ==================================== */

function vistaSettimana(cibo, profilo) {
  const oggiGiorno = giornoIso();
  const giorniPiano = cibo.settimana || [];

  const blocchiGiorni = giorniPiano.map((g) => blocGiorno(g, oggiGiorno, cibo.vincoli || [], profilo));

  const weekend = h('div.blocco.blocco-quieto', [
    h('p.titolo-2', 'Sabato e domenica liberi'),
    h('p.nota', { style: 'margin-top:6px' }, 'Tieni le proteine in almeno un pasto al giorno.'),
  ]);

  const colazioni = h('details.piega', [
    h('summary', 'Colazioni'),
    h('div.corpo', [
      h('ul.lista', (cibo.colazioni || []).map((c) => h('li', [
        h('span.cresci', [
          h('div', c.nome),
          h('p.nota', c.testo),
        ]),
      ]))),
    ]),
  ]);

  const spuntini = h('details.piega', [
    h('summary', 'Spuntini'),
    h('div.corpo', [
      h('ul.lista', (cibo.spuntini || []).map((s) => h('li', s))),
    ]),
  ]);

  return h('div.pila', [...blocchiGiorni, weekend, colazioni, spuntini]);
}

function blocGiorno(giorno, oggiGiorno, vincoli, profilo) {
  const eOggi = giorno.giorno === oggiGiorno;
  const nome = GIORNI_SETT[giorno.giorno] || '';

  return h(eOggi ? 'details.piega.cib-oggi' : 'details.piega', { open: eOggi }, [
    h('summary', [
      h('div', [
        h('p.occhiello', nome + (eOggi ? ' · oggi' : '')),
      ]),
    ]),
    h('div.corpo.pila', [
      bloccoPasto('Pranzo', giorno.pranzo, vincoli, profilo),
      bloccoPasto('Cena', giorno.cena, vincoli, profilo),
    ].filter(Boolean)),
  ]);
}

function bloccoPasto(quale, pasto, vincoli, profilo) {
  if (!pasto) return null;

  if (pasto.libero) {
    return h('div.riga', [
      h('span.occhiello', quale),
      h('span.spento', 'Libera'),
    ]);
  }

  return h('details.piega', [
    h('summary', [
      h('div', [
        h('p.occhiello', quale),
        h('p.titolo-2', pasto.nome),
        h('p.nota', { style: 'margin-top:4px' }, pasto.testo),
      ]),
    ]),
    h('div.corpo', [
      bannerVincoli(vincoli, profilo),
      (pasto.ingredienti || []).length
        ? h('ul.lista', { style: 'margin-top:10px' }, pasto.ingredienti.map((i) => h('li', i)))
        : null,
      pasto.nota ? h('p.nota', { style: 'margin-top:8px' }, pasto.nota) : null,
    ].filter(Boolean)),
  ]);
}

/* ========== Spesa ========================================= */

function vistaSpesa(spesaPiano, cibo, profilo, spunte, ridisegnaSpesa) {
  if (!spesaPiano) {
    return h('div.vuoto', [h('p.nota', 'La lista della spesa non è disponibile.')]);
  }

  const blocco = [bannerVincoli(cibo?.vincoli || [], profilo)];

  const avvertenze = cibo?.avvertenze || [];
  if (avvertenze.length) {
    blocco.push(h('ul.cib-punti', avvertenze.map((a) => h('li', a))));
  }

  (spesaPiano.liste || []).forEach((lista) => blocco.push(bloccoLista(lista, spunte)));

  blocco.push(bottoniSpesa(spesaPiano, spunte, ridisegnaSpesa));

  if (cibo?.domenica) blocco.push(bloccoDomenica(cibo.domenica, spunte));

  return h('div.pila', blocco.filter(Boolean));
}

function idVoceSpesa(idLista, voce) {
  return `spesa:${idLista}:${voce}`;
}

function bloccoLista(lista, spunte) {
  const tutteVoci = (lista.reparti || []).flatMap((r) => (r.voci || []).map((v) => idVoceSpesa(lista.id, v)));
  const totale = tutteVoci.length;

  const contatore = h('p.nota');
  const aggiorna = () => {
    const fatte = tutteVoci.filter((id) => spunte[id]).length;
    contatore.textContent = `${fatte} di ${totale}`;
  };
  aggiorna();

  const reparti = (lista.reparti || []).map((rep) => h('div', { style: 'margin-top:12px' }, [
    h('p.occhiello', rep.nome),
    rep.nota ? h('p.nota', { style: 'margin:4px 0 8px' }, rep.nota) : null,
    h('div', (rep.voci || []).map((voce) => rigaSpunta(idVoceSpesa(lista.id, voce), voce, spunte, aggiorna))),
  ].filter(Boolean)));

  return h('div.blocco', [
    h('div.riga-sp', [
      h('p.titolo-2', lista.nome),
      contatore,
    ]),
    lista.sottotitolo ? h('p.nota', { style: 'margin-top:2px' }, lista.sottotitolo) : null,
    ...reparti,
  ].filter(Boolean));
}

function rigaSpunta(id, testo, spunte, aggiorna) {
  return h('label.spunta', [
    h('input', {
      type: 'checkbox',
      checked: !!spunte[id],
      onchange: (e) => {
        spunte[id] = e.target.checked;
        store.segnaSpunta(id, e.target.checked);
        aggiorna();
      },
    }),
    h('span.quadro'),
    h('span.testo-spunta', testo),
  ]);
}

function bottoniSpesa(spesaPiano, spunte, ridisegnaSpesa) {
  const stato = h('p.nota', { style: 'margin-top:8px;min-height:18px' });

  const azzera = h('button.btn.btn-rosso', {
    onclick: async () => {
      if (!conferma('Tolgo tutte le spunte della spesa?')) return;
      await store.azzeraSpunte('spesa:');
      await ridisegnaSpesa();
    },
  }, 'Azzera');

  const condividi = h('button.btn', {
    onclick: async () => {
      const testo = componiTesto(spesaPiano, spunte);
      try {
        if (navigator.share) {
          await navigator.share({ text: testo });
        } else {
          await navigator.clipboard.writeText(testo);
          stato.textContent = 'Lista copiata';
          setTimeout(() => { stato.textContent = ''; }, 2500);
        }
      } catch { /* condivisione annullata dall'utente */ }
    },
  }, 'Condividi');

  return h('div.pila', [
    h('div.btn-riga', [azzera, condividi]),
    stato,
  ]);
}

/** Testo delle voci ancora da comprare, per la condivisione. */
function componiTesto(spesaPiano, spunte) {
  const blocchi = (spesaPiano.liste || []).map((lista) => {
    const reparti = (lista.reparti || [])
      .map((rep) => {
        const mancanti = (rep.voci || []).filter((v) => !spunte[idVoceSpesa(lista.id, v)]);
        if (!mancanti.length) return null;
        return `${rep.nome}:\n${mancanti.map((v) => `- ${v}`).join('\n')}`;
      })
      .filter(Boolean);
    const corpo = reparti.length ? reparti.join('\n\n') : 'Lista completa.';
    return `${lista.nome}\n${corpo}`;
  });
  return blocchi.join('\n\n');
}

function bloccoDomenica(domenica, spunte) {
  const voci = domenica.voci || [];
  return h('details.piega', [
    h('summary', `Preparazione della domenica · ${domenica.minuti} minuti`),
    h('div.corpo', voci.map((v) => {
      const id = `domenica:${v}`;
      return h('label.spunta', [
        h('input', {
          type: 'checkbox',
          checked: !!spunte[id],
          onchange: (e) => { spunte[id] = e.target.checked; store.segnaSpunta(id, e.target.checked); },
        }),
        h('span.quadro'),
        h('span.testo-spunta', v),
      ]);
    })),
  ]);
}

/* ========== Base =========================================== */

function vistaBase(cibo) {
  const regole = cibo.regole || [];
  const porzioni = cibo.porzioni || [];
  const integratori = [...(cibo.integratori || [])].sort((a, b) => (a.ordine || 0) - (b.ordine || 0));
  const bevande = cibo.bevande || [];

  return h('div.pila', [
    h('div.blocco', [
      h('p.occhiello', 'Le 3 regole'),
      h('div.pila', { style: 'margin-top:8px' }, regole.map((r) => h('div', [
        h('p.titolo-2', r.titolo),
        h('p.nota', { style: 'margin-top:2px' }, r.testo),
      ]))),
    ]),

    h('div.blocco', [
      h('p.occhiello', 'Porzioni a mano'),
      h('div.cib-porzioni', { style: 'margin-top:8px' }, porzioni.map((p) => h('div', [
        h('div.cib-porzione-riga', [
          h('span', p.cosa),
          h('span.cib-quanto', p.quanto),
        ]),
        p.nota ? h('p.nota', { style: 'margin-top:2px' }, p.nota) : null,
      ].filter(Boolean)))),
    ]),

    h('div.blocco', [
      h('p.occhiello', 'Integratori'),
      h('div.pila', { style: 'margin-top:8px' }, integratori.map((i) => h('div', [
        h('p.titolo-2', i.cosa),
        h('p.nota', { style: 'margin-top:2px' }, i.verdetto),
        h('p.nota', { style: 'margin-top:2px' }, i.dose),
      ]))),
    ]),

    h('div.blocco', [
      h('p.occhiello', 'Bevande'),
      h('ul.lista', { style: 'margin-top:8px' }, bevande.map((b) => h('li', b))),
    ]),
  ]);
}

/* ========== banner dei vincoli ============================= */

/** Ordina i vincoli mettendo per primi quelli del profilo attivo. */
function ordinaVincoli(vincoli, profilo) {
  if (!profilo) return vincoli;
  const p = String(profilo).toLowerCase();
  const miei = vincoli.filter((v) => String(v.chi || '').toLowerCase() === p);
  const altri = vincoli.filter((v) => String(v.chi || '').toLowerCase() !== p);
  return [...miei, ...altri];
}

function bannerVincoli(vincoli, profilo) {
  const lista = ordinaVincoli(vincoli || [], profilo);
  if (!lista.length) return null;
  return h('div.fascia.fascia-vincolo', lista.map((v, i) => h('p', {
    style: i === 0 ? 'margin:0' : 'margin:6px 0 0',
  }, [h('strong', `${v.chi || ''}: `), v.testo])));
}

/* ========== stile locale =================================== */
/* app.css non si tocca: quel che manca vive qui, con classi cib-. */

const STILE = `
.cib-oggi { border-width: var(--bordo-xl); }
.cib-oggi > summary { background: var(--ink); color: var(--paper); }
.cib-punti { list-style: disc; margin: 0; padding-left: 20px; display: grid; gap: 6px; }
.cib-punti > li { font-size: 14px; color: var(--ink-2); }
.cib-porzioni { display: grid; gap: 10px; }
.cib-porzione-riga { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.cib-quanto { color: var(--ink-2); text-align: right; }
`;

function iniettaStile() {
  if (document.getElementById('stile-cibo')) return;
  const s = document.createElement('style');
  s.id = 'stile-cibo';
  s.textContent = STILE;
  document.head.append(s);
}
