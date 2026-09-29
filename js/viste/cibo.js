/* cibo.js — il piano alimentare: settimana, spesa, regole.

   Tre sotto-schede. Nella Settimana ogni pasto, la colazione e gli spuntini
   hanno i loro alimenti come pulsanti: acceso (nero) va nella spesa, spento
   no. Farro o orzo, martedì? Si accende quello che si prende. Con "Modifica"
   gli alimenti si tolgono (✕) e se ne aggiungono di nuovi, e di un pasto si
   cambiano nome, piatto e nota.

   La Spesa non ha voci sue: è una lista sola, divisa per reparto, composta
   da quello che è acceso nella settimana (spesa.js). Più le poche cose fisse
   (olio, sale, integratori) e quello che si aggiunge a mano.

   Le modifiche restano sul telefono (personalizza.js), il piano nel repo non
   si tocca: si può sempre tornare indietro. */

import {
  h, metti, giornoIso, conferma, modifica, bottoneModifica, tocco,
} from '../ui.js';
import * as piani from '../piani.js';
import * as store from '../store.js';
import * as personalizza from '../personalizza.js';
import * as spesa from '../spesa.js';

const GIORNI_SETT = ['', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì'];

export async function monta(contenitore, parametri) {
  iniettaStile();

  const richiesto = parametri && parametri[0];
  // "base" era il nome di prima di "regole": i vecchi link continuano ad aprirla.
  let attiva = richiesto === 'spesa' ? 'spesa'
    : (richiesto === 'regole' || richiesto === 'base') ? 'regole' : 'settimana';
  let inModifica = false;

  let st = await piani.stato();
  let spunte = await store.spunte('');

  const testata = h('header.testata', [
    h('div', [
      h('p.occhiello', 'Alimentazione'),
      h('h1.titolo', 'Cibo'),
    ]),
  ]);
  const schermata = h('div.schermata');
  contenitore.append(testata, schermata);

  if (!st.cibo) {
    metti(schermata, h('div.vuoto', [h('p.nota', 'Il piano alimentare non è disponibile.')]));
    return;
  }

  const barraSchede = h('div.schede');
  const barraModifica = h('div.riga-sp.cib-barra');
  const corpo = h('div.pila');
  schermata.append(barraSchede, barraModifica, corpo);

  /** Rilegge piano e spunte: dopo ogni modifica le personalizzazioni vanno riapplicate. */
  async function ricarica() {
    st = await piani.stato();
    spunte = await store.spunte('');
    ridisegna();
  }

  const strumenti = { inModifica, ricarica };

  function ridisegna() {
    strumenti.inModifica = inModifica;

    metti(barraSchede, [
      tabBtn('settimana', 'Settimana'),
      tabBtn('spesa', 'Spesa'),
      tabBtn('regole', 'Regole'),
    ]);

    metti(barraModifica, attiva === 'regole' ? [] : [
      h('p.occhiello', inModifica ? etichettaModifica() : etichettaScheda()),
      h('button.btn.btn-s', {
        type: 'button',
        onclick: async () => {
          inModifica = !inModifica;
          // All'uscita si rilegge: i pulsanti degli alimenti scrivono senza ridisegnare.
          if (inModifica) ridisegna(); else await ricarica();
        },
      }, inModifica ? 'Fine' : 'Modifica'),
    ]);

    if (attiva === 'settimana') metti(corpo, vistaSettimana(st.cibo, strumenti));
    else if (attiva === 'spesa') metti(corpo, vistaSpesa(st.spesa, st.cibo, spunte, strumenti));
    else metti(corpo, vistaRegole(st.cibo));
  }

  function etichettaModifica() {
    return attiva === 'spesa' ? '✎ reparto o togli · + voce nuova' : '✕ toglie · + aggiunge · ✎ il pasto';
  }

  function etichettaScheda() {
    return attiva === 'spesa' ? 'Dalla dieta · si spunta quel che c’è' : 'Acceso va nella spesa';
  }

  function tabBtn(id, etichetta) {
    return h('button', {
      'aria-selected': attiva === id ? 'true' : 'false',
      onclick: async () => {
        attiva = id;
        inModifica = false;
        await ricarica();
      },
    }, etichetta);
  }

  ridisegna();
}

/* ========== Settimana ==================================== */

function vistaSettimana(cibo, strumenti) {
  const oggiGiorno = giornoIso();

  const blocchiGiorni = (cibo.settimana || []).map((g) => blocGiorno(g, oggiGiorno, cibo, strumenti));

  const weekend = h('div.blocco.blocco-quieto', [
    h('p.titolo-2', 'Sabato e domenica liberi'),
    h('p.nota', { style: 'margin-top:6px' }, 'Tieni le proteine in almeno un pasto al giorno.'),
  ]);

  return h('div.pila', [
    ...blocchiGiorni,
    weekend,
    bloccoGruppo('Colazione', cibo.colazione, strumenti),
    bloccoGruppo('Spuntini', cibo.spuntino, strumenti),
  ].filter(Boolean));
}

function blocGiorno(giorno, oggiGiorno, cibo, strumenti) {
  const eOggi = giorno.giorno === oggiGiorno;
  const nome = GIORNI_SETT[giorno.giorno] || '';

  return h(eOggi ? 'details.piega.cib-oggi' : 'details.piega', { open: eOggi || strumenti.inModifica }, [
    h('summary', [
      h('div', [
        h('p.occhiello', nome + (eOggi ? ' · oggi' : '')),
        h('p.nota', { style: 'margin-top:2px' }, [giorno.pranzo, giorno.cena]
          .filter(Boolean).map((p) => (p.libero ? 'libera' : p.nome)).join(' · ')),
      ]),
    ]),
    h('div.corpo.pila', [
      bloccoPasto('Pranzo', giorno.pranzo, strumenti),
      bloccoPasto('Cena', giorno.cena, strumenti),
    ].filter(Boolean)),
  ]);
}

function bloccoPasto(quale, pasto, strumenti) {
  if (!pasto) return null;

  if (pasto.libero) {
    return h('div.riga', [
      h('span.occhiello', quale),
      h('span.spento', 'Libera'),
    ]);
  }

  const zonaModifica = h('div', { style: 'margin-top:10px' });
  if (strumenti.inModifica) {
    zonaModifica.append(h('button.btn.btn-s', {
      type: 'button',
      onclick: () => apriModificaPasto(zonaModifica, pasto, strumenti),
    }, 'Cambia nome, piatto e nota'));
  }

  return h('div.cib-pasto', [
    h('p.occhiello', quale),
    h('p.titolo-2', pasto.nome),
    h('p.nota', { style: 'margin-top:4px' }, pasto.testo),
    pasto.personalizzato ? h('p.mod-segno', 'cambiato da voi') : null,
    listaAlimenti({
      chiave: pasto.chiave,
      originali: pasto.ingredientiOriginali || [],
      spenti: pasto.spenti || [],
      strumenti,
    }),
    pasto.nota ? h('p.nota', { style: 'margin-top:8px' }, pasto.nota) : null,
    strumenti.inModifica ? zonaModifica : null,
  ].filter(Boolean));
}

/** Colazione e spuntini: un elenco di alimenti, niente ricette. */
function bloccoGruppo(titolo, gruppo, strumenti) {
  if (!gruppo) return null;
  return h('details.piega', { open: true }, [
    h('summary', titolo),
    h('div.corpo', [
      gruppo.nota ? h('p.nota', { style: 'margin-bottom:10px' }, gruppo.nota) : null,
      listaAlimenti({
        chiave: gruppo.chiave,
        originali: gruppo.originali || [],
        spenti: gruppo.spenti || [],
        strumenti,
      }),
    ].filter(Boolean)),
  ]);
}

/**
 * Gli alimenti come pulsanti. Tocco = acceso/spento, e la spesa segue.
 * In modifica ognuno ha il suo ✕, e in fondo si aggiunge un alimento nuovo.
 * Si ridisegna da solo, leggendo le personalizzazioni: così i pasti aperti
 * restano aperti.
 */
function listaAlimenti({
  chiave, originali, spenti, strumenti,
}) {
  const zona = h('div.cib-alimenti');

  const disegna = () => {
    const voci = personalizza.alimenti(chiave, originali, spenti);
    const pulsanti = voci.map((a) => {
      const bottone = h('button.cib-alim', {
        type: 'button',
        'aria-pressed': a.scelto ? 'true' : 'false',
        title: a.scelto ? 'Nella spesa: tocca per toglierlo' : 'Fuori dalla spesa: tocca per metterlo',
        onclick: async () => {
          await personalizza.scegliAlimento(chiave, a.nome, !a.scelto, a.predefinito);
          tocco();
          disegna();
        },
      }, a.nome);
      if (!strumenti.inModifica) return bottone;
      return h('span.cib-alim-mod', [
        bottone,
        h('button.cib-alim-via', {
          type: 'button',
          'aria-label': `Togli ${a.nome}`,
          title: `Togli ${a.nome}`,
          onclick: async () => {
            await personalizza.togliAlimento(chiave, a.nome, originali);
            disegna();
          },
        }, '✕'),
      ]);
    });

    metti(zona, [
      h('div.cib-chips', pulsanti.length ? pulsanti : [h('p.nota', 'Nessun alimento.')]),
      strumenti.inModifica ? campoNuovoAlimento() : null,
    ].filter(Boolean));
  };

  function campoNuovoAlimento() {
    const testo = h('input', { type: 'text', 'aria-label': 'Alimento nuovo', placeholder: 'es. Riso integrale' });
    const aggiungi = async () => {
      const t = testo.value.trim();
      if (!t) { testo.focus(); return; }
      await personalizza.aggiungiAlimento(chiave, t, originali, spenti);
      disegna();
    };
    testo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); aggiungi(); } });
    return h('div.cib-nuovo', [
      testo,
      h('button.btn.btn-s', { type: 'button', onclick: aggiungi }, '+ Aggiungi'),
    ]);
  }

  disegna();
  return zona;
}

function apriModificaPasto(dove, pasto, strumenti) {
  const comEra = [...dove.childNodes];
  const chiudi = () => dove.replaceChildren(...comEra);

  const salva = async (valori) => {
    const pz = personalizza.leggi(pasto.chiave) || {};
    await personalizza.scrivi(pasto.chiave, {
      ...pz,
      nome: valori.nome === pasto.nomeOriginale ? null : valori.nome,
      testo: valori.testo === pasto.testoOriginale ? null : valori.testo,
      nota: valori.nota === (pasto.notaOriginale || '') ? null : valori.nota,
    });
    await strumenti.ricarica();
  };

  const azioni = pasto.personalizzato
    ? [{
      etichetta: 'Rimetti quello del piano',
      onClick: async () => {
        await personalizza.scrivi(pasto.chiave, null);
        await strumenti.ricarica();
      },
    }]
    : [];

  dove.replaceChildren(modifica({
    campi: [
      { chiave: 'nome', etichetta: 'Nome del pasto', valore: pasto.nome },
      { chiave: 'testo', etichetta: 'Cosa c’è nel piatto', valore: pasto.testo, lungo: true },
      { chiave: 'nota', etichetta: 'Nota', valore: pasto.nota || '' },
    ],
    nota: pasto.personalizzato ? `Nel piano: ${pasto.testoOriginale}` : 'Gli alimenti si cambiano qui sopra: ✕ per toglierli, + per aggiungerli.',
    azioni,
    onSalva: salva,
    onAnnulla: chiudi,
  }));
}

/* ========== Spesa ========================================= */

function vistaSpesa(catalogo, cibo, spunte, strumenti) {
  if (!catalogo) {
    return h('div.vuoto', [h('p.nota', 'La lista della spesa non è disponibile.')]);
  }

  const lista = spesa.componi(cibo, catalogo);
  const tutte = lista.reparti.flatMap((r) => r.voci);

  const contatore = h('p.nota');
  const aggiorna = () => {
    const fatte = tutte.filter((v) => spunte[v.spunta]).length;
    contatore.textContent = `${fatte} di ${tutte.length}`;
  };
  aggiorna();

  const reparti = lista.reparti.map((rep) => h('div', { style: 'margin-top:12px' }, [
    h('p.occhiello', rep.nome),
    h('div', rep.voci.map((voce) => rigaVoceSpesa(voce, lista, spunte, aggiorna, strumenti))),
  ]));

  return h('div.pila', [
    h('div.blocco', [
      h('div.riga-sp', [
        h('p.titolo-2', 'Lista della spesa'),
        contatore,
      ]),
      h('p.nota', { style: 'margin-top:2px' }, 'Quello che è acceso nella dieta, più le cose fisse.'),
      ...reparti,
      strumenti.inModifica ? aggiungiVoce(lista, strumenti) : null,
    ].filter(Boolean)),
    bottoniSpesa(lista, spunte, strumenti),
    cibo?.domenica ? bloccoDomenica(cibo.domenica, spunte) : null,
  ].filter(Boolean));
}

/** Una voce nuova, che nella dieta non c'è: nel reparto scelto. */
function aggiungiVoce(lista, strumenti) {
  const zona = h('div', { style: 'margin-top:12px' });

  const chiudi = () => metti(zona, h('button.btn.btn-s', {
    type: 'button', style: 'width:100%', onclick: apri,
  }, '+ Aggiungi una voce'));

  function apri() {
    const testo = h('input', { type: 'text', 'aria-label': 'Voce nuova', placeholder: 'es. Carta da forno' });
    const reparto = selettoreReparto(lista, null);
    const salva = async () => {
      const t = testo.value.trim();
      if (!t) { testo.focus(); return; }
      await personalizza.aggiungiVoceSpesa({ testo: t, reparto: reparto.value });
      await strumenti.ricarica();
    };
    testo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); salva(); } });
    metti(zona, h('div.mod', [
      h('label.campo.mod-campo', [h('span.occhiello', 'Voce nuova'), testo]),
      h('label.campo.mod-campo', [h('span.occhiello', 'Reparto'), reparto]),
      h('p.nota', 'Un alimento da mangiare va messo nella dieta: in lista arriva da solo.'),
      h('div.mod-azioni', [
        h('button.btn.btn-s', { type: 'button', onclick: salva }, 'Aggiungi'),
        h('button.btn.btn-s', { type: 'button', onclick: chiudi }, 'Annulla'),
      ]),
    ]));
    requestAnimationFrame(() => testo.focus());
  }

  chiudi();
  return zona;
}

function selettoreReparto(lista, attuale) {
  const nomi = lista.nomiReparti;
  const scelto = attuale && nomi.includes(attuale) ? attuale : nomi[0];
  return h('select', { 'aria-label': 'Reparto' }, nomi.map((n) => h('option', { value: n, selected: n === scelto }, n)));
}

/** La riga della spesa: una spunta quando si compra, un ✎ quando si sistema. */
function rigaVoceSpesa(voce, lista, spunte, aggiorna, strumenti) {
  const riga = h('div.cib-voce', [
    h('label.spunta.cresci', [
      h('input', {
        type: 'checkbox',
        checked: !!spunte[voce.spunta],
        disabled: strumenti.inModifica,
        onchange: (e) => {
          spunte[voce.spunta] = e.target.checked;
          store.segnaSpunta(voce.spunta, e.target.checked);
          aggiorna();
        },
      }),
      h('span.quadro'),
      h('span.testo-spunta.cresci', [
        h('span', voce.testo),
        voce.usi.length ? h('span.cib-usi', voce.usi.join(' · ')) : null,
      ].filter(Boolean)),
    ]),
  ]);

  if (strumenti.inModifica) {
    riga.append(bottoneModifica(
      () => apriModificaVoceSpesa(riga, voce, lista, strumenti),
      `Modifica ${voce.testo}`,
    ));
  }

  return riga;
}

function apriModificaVoceSpesa(riga, voce, lista, strumenti) {
  const comEra = [...riga.childNodes];
  const chiudi = () => riga.replaceChildren(...comEra);
  const pz = personalizza.leggi(voce.chiave) || {};

  const reparto = selettoreReparto(lista, voce.reparto);
  const testo = voce.origine === 'aggiunta'
    ? h('input', { type: 'text', 'aria-label': 'Voce', value: voce.testo })
    : null;

  const salva = async () => {
    if (voce.origine === 'aggiunta') {
      const t = testo.value.trim();
      if (!t) { testo.focus(); return; }
      await personalizza.scrivi(voce.chiave, { ...pz, testo: t, reparto: reparto.value });
    } else {
      // Il reparto del catalogo non è una personalizzazione: non si salva.
      await personalizza.scrivi(voce.chiave, {
        ...pz, reparto: reparto.value === voce.repartoCatalogo ? null : reparto.value,
      });
    }
    await strumenti.ricarica();
  };

  const togli = voce.origine === 'dieta' ? null : h('button.btn.btn-s.btn-rosso', {
    type: 'button',
    onclick: async () => {
      if (!conferma(`Tolgo “${voce.testo}” dalla spesa?`)) return;
      await personalizza.scrivi(voce.chiave, voce.origine === 'aggiunta' ? null : { ...pz, nascosto: true });
      await strumenti.ricarica();
    },
  }, 'Togli dalla lista');

  const spiegazione = voce.origine === 'dieta'
    ? `Viene dalla dieta (${voce.usi.join(', ')}). Per toglierla, spegnila lì.`
    : voce.origine === 'sempre' ? 'Sta sempre in lista: non dipende dalla dieta.' : null;

  riga.replaceChildren(h('div.cresci', [h('div.mod', [
    testo ? h('label.campo.mod-campo', [h('span.occhiello', 'Voce'), testo]) : h('p.titolo-2', voce.testo),
    h('label.campo.mod-campo', [h('span.occhiello', 'Reparto'), reparto]),
    spiegazione ? h('p.nota', spiegazione) : null,
    h('div.mod-azioni', [
      h('button.btn.btn-s', { type: 'button', onclick: salva }, 'Salva'),
      togli,
      h('button.btn.btn-s', { type: 'button', onclick: chiudi }, 'Annulla'),
    ].filter(Boolean)),
  ].filter(Boolean))]));
}

function bottoniSpesa(lista, spunte, strumenti) {
  const stato = h('p.nota', { style: 'margin-top:8px;min-height:18px' });

  const azzera = h('button.btn.btn-rosso', {
    onclick: async () => {
      if (!conferma('Tolgo tutte le spunte della spesa?')) return;
      await store.azzeraSpunte('spesa:');
      await strumenti.ricarica();
    },
  }, 'Azzera');

  const condividi = h('button.btn', {
    onclick: async () => {
      const testo = spesa.testoDaCondividere(lista, spunte);
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

/* ========== Regole ========================================= */

function vistaRegole(cibo) {
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

/* ========== stile locale =================================== */
/* app.css non si tocca: quel che manca vive qui, con classi cib-. */

const STILE = `
.cib-oggi { border-width: var(--bordo-xl); }
.cib-oggi > summary { background: var(--ink); color: var(--paper); }
.cib-oggi > summary .nota { color: inherit; opacity: .75; }
.cib-porzioni { display: grid; gap: 10px; }
.cib-porzione-riga { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.cib-quanto { color: var(--ink-2); text-align: right; }
.cib-barra { min-height: 38px; }
.cib-pasto + .cib-pasto { border-top: 1px solid var(--linea-2); padding-top: 14px; }
.cib-alimenti { margin-top: 10px; }
.cib-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.cib-alim {
  appearance: none;
  min-height: 40px;
  padding: 0 12px;
  border: var(--bordo) solid var(--linea-2);
  background: var(--paper);
  color: var(--ink-2);
  font-family: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.cib-alim[aria-pressed="true"] { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.cib-alim-mod { display: inline-flex; }
.cib-alim-mod .cib-alim { border-right: 0; }
.cib-alim-via {
  appearance: none;
  min-width: 40px;
  min-height: 40px;
  border: var(--bordo) solid var(--rosso);
  background: var(--paper);
  color: var(--rosso);
  font-family: inherit;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
}
.cib-nuovo { display: flex; gap: 8px; margin-top: 10px; }
.cib-nuovo input { flex: 1; min-width: 0; }
.cib-voce { display: flex; align-items: center; gap: 10px; }
.cib-voce .spunta { border-bottom: 0; }
.cib-voce { border-bottom: 1px solid var(--linea-2); }
.cib-voce:last-child { border-bottom: 0; }
.cib-usi { display: block; font-size: 13px; color: var(--ink-2); margin-top: 2px; }
`;

function iniettaStile() {
  if (document.getElementById('stile-cibo')) return;
  const s = document.createElement('style');
  s.id = 'stile-cibo';
  s.textContent = STILE;
  document.head.append(s);
}
