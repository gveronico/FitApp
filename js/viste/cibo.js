/* cibo.js — il piano alimentare: settimana, spesa, regole di base.

   Tre sotto-schede. Ognuna ha un interruttore "Modifica": acceso, ogni riga
   si può rinominare, togliere e — nella spesa — spostare da una lista all'altra.
   Le modifiche restano sul telefono (personalizza.js), il piano nel repo non
   si tocca: si può sempre tornare indietro. */

import { h, metti, giornoIso, conferma, modifica, bottoneModifica } from '../ui.js';
import * as piani from '../piani.js';
import * as store from '../store.js';
import * as personalizza from '../personalizza.js';

const GIORNI_SETT = ['', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì'];

export async function monta(contenitore, parametri) {
  iniettaStile();

  const richiesto = parametri && parametri[0];
  let attiva = (richiesto === 'spesa' || richiesto === 'base') ? richiesto : 'settimana';
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
      tabBtn('base', 'Base'),
    ]);

    metti(barraModifica, attiva === 'base' ? [] : [
      h('p.occhiello', inModifica ? 'Tocca ✎ per cambiare o togliere' : etichettaScheda()),
      h('button.btn.btn-s', {
        type: 'button',
        onclick: () => { inModifica = !inModifica; ridisegna(); },
      }, inModifica ? 'Fine' : 'Modifica'),
    ]);

    if (attiva === 'settimana') metti(corpo, vistaSettimana(st.cibo, strumenti));
    else if (attiva === 'spesa') metti(corpo, vistaSpesa(st.spesa, st.cibo, spunte, strumenti));
    else metti(corpo, vistaBase(st.cibo));
  }

  function etichettaScheda() {
    return attiva === 'spesa' ? 'Due liste, si spunta quel che c’è' : 'Pranzo e cena, lun-ven';
  }

  function tabBtn(id, etichetta) {
    return h('button', {
      'aria-selected': attiva === id ? 'true' : 'false',
      onclick: () => { attiva = id; inModifica = false; ridisegna(); },
    }, etichetta);
  }

  ridisegna();
}

/* ========== Settimana ==================================== */

function vistaSettimana(cibo, strumenti) {
  const oggiGiorno = giornoIso();

  const blocchiGiorni = (cibo.settimana || []).map((g) => blocGiorno(g, oggiGiorno, strumenti));

  const weekend = h('div.blocco.blocco-quieto', [
    h('p.titolo-2', 'Sabato e domenica liberi'),
    h('p.nota', { style: 'margin-top:6px' }, 'Tieni le proteine in almeno un pasto al giorno.'),
  ]);

  const colazioni = h('details.piega', [
    h('summary', 'Colazioni'),
    h('div.corpo', [
      h('ul.lista', (cibo.colazioni || []).map((c) => rigaColazione(c, strumenti))),
    ]),
  ]);

  const spuntini = h('details.piega', [
    h('summary', 'Spuntini'),
    h('div.corpo', [
      h('ul.lista', (cibo.spuntini || []).map((s) => rigaSpuntino(s, strumenti))),
    ]),
  ]);

  return h('div.pila', [...blocchiGiorni, weekend, colazioni, spuntini]);
}

function blocGiorno(giorno, oggiGiorno, strumenti) {
  const eOggi = giorno.giorno === oggiGiorno;
  const nome = GIORNI_SETT[giorno.giorno] || '';

  return h(eOggi ? 'details.piega.cib-oggi' : 'details.piega', { open: eOggi }, [
    h('summary', [
      h('div', [
        h('p.occhiello', nome + (eOggi ? ' · oggi' : '')),
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
    }, 'Cambia questo pasto'));
  }

  const corpo = h('div.corpo', [
    (pasto.ingredienti || []).length
      ? h('ul.lista', pasto.ingredienti.map((i) => h('li', i)))
      : null,
    pasto.nota ? h('p.nota', { style: 'margin-top:8px' }, pasto.nota) : null,
    strumenti.inModifica ? zonaModifica : null,
  ].filter(Boolean));

  return h('details.piega', [
    h('summary', [
      h('div', [
        h('p.occhiello', quale),
        h('p.titolo-2', pasto.nome),
        h('p.nota', { style: 'margin-top:4px' }, pasto.testo),
        pasto.personalizzato ? h('p.mod-segno', 'cambiato da voi') : null,
      ].filter(Boolean)),
    ]),
    corpo,
  ]);
}

function apriModificaPasto(dove, pasto, strumenti) {
  const comEra = [...dove.childNodes];
  const chiudi = () => dove.replaceChildren(...comEra);

  const salva = async (valori) => {
    const nome = valori.nome === pasto.nomeOriginale ? null : valori.nome;
    const testo = valori.testo === pasto.testoOriginale ? null : valori.testo;
    await personalizza.scrivi(pasto.chiave, { nome, testo });
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
    ],
    nota: pasto.personalizzato ? `Nel piano: ${pasto.testoOriginale}` : null,
    azioni,
    onSalva: salva,
    onAnnulla: chiudi,
  }));
}

/* --- colazioni e spuntini: righe rinominabili e togliibili --- */

function rigaColazione(c, strumenti) {
  const li = h('li', [
    h('span.cresci', [
      h('div', c.nome),
      h('p.nota', c.testo),
      c.personalizzato ? h('p.mod-segno', 'cambiata da voi') : null,
    ].filter(Boolean)),
  ]);

  if (!strumenti.inModifica) return li;

  li.append(bottoneModifica(() => apriModificaRiga(li, {
    chiave: c.chiave,
    personalizzata: c.personalizzato,
    campi: [
      { chiave: 'nome', etichetta: 'Nome', valore: c.nome },
      { chiave: 'testo', etichetta: 'Com’è fatta', valore: c.testo, lungo: true },
    ],
    originali: { nome: c.originale?.nome, testo: c.originale?.testo },
    etichettaVia: 'Togli questa colazione',
    strumenti,
  }), `Modifica ${c.nome}`));

  return li;
}

function rigaSpuntino(s, strumenti) {
  const li = h('li', [
    h('span.cresci', [
      h('div', s.testo),
      s.personalizzato ? h('p.mod-segno', 'cambiato da voi') : null,
    ].filter(Boolean)),
  ]);

  if (!strumenti.inModifica) return li;

  li.append(bottoneModifica(() => apriModificaRiga(li, {
    chiave: s.chiave,
    personalizzata: s.personalizzato,
    campi: [{ chiave: 'testo', etichetta: 'Spuntino', valore: s.testo, lungo: true }],
    originali: { testo: s.originale },
    etichettaVia: 'Togli questo spuntino',
    strumenti,
  }), 'Modifica lo spuntino'));

  return li;
}

/**
 * Riquadro di modifica di una riga di cibo: salva, toglie, o rimette quella
 * del piano. Vale per colazioni e spuntini, che hanno la stessa forma.
 */
function apriModificaRiga(li, {
  chiave, personalizzata, campi, originali = {}, etichettaVia, strumenti,
}) {
  const comEra = [...li.childNodes];
  const chiudi = () => li.replaceChildren(...comEra);

  const azioni = [{
    etichetta: etichettaVia,
    classe: 'btn-rosso',
    onClick: async () => {
      if (!conferma(`${etichettaVia}? Si può rimettere da Altro, azzerando le modifiche.`)) return;
      await personalizza.scrivi(chiave, { nascosto: true });
      await strumenti.ricarica();
    },
  }];

  if (personalizzata) {
    azioni.push({
      etichetta: 'Rimetti quella del piano',
      onClick: async () => { await personalizza.scrivi(chiave, null); await strumenti.ricarica(); },
    });
  }

  li.replaceChildren(h('span.cresci', [modifica({
    campi,
    azioni,
    onSalva: async (valori) => {
      // Un campo rimasto uguale al piano non è una personalizzazione: non si salva.
      const da = {};
      for (const [k, v] of Object.entries(valori)) da[k] = v === originali[k] ? null : v;
      await personalizza.scrivi(chiave, da);
      await strumenti.ricarica();
    },
    onAnnulla: chiudi,
  })]));
}

/* ========== Spesa ========================================= */

function vistaSpesa(spesaPiano, cibo, spunte, strumenti) {
  if (!spesaPiano) {
    return h('div.vuoto', [h('p.nota', 'La lista della spesa non è disponibile.')]);
  }

  const blocco = (spesaPiano.liste || []).map(
    (lista) => bloccoLista(lista, spesaPiano, spunte, strumenti),
  );

  blocco.push(bottoniSpesa(spesaPiano, spunte, strumenti));
  if (cibo?.domenica) blocco.push(bloccoDomenica(cibo.domenica, spunte));

  return h('div.pila', blocco.filter(Boolean));
}

function bloccoLista(lista, spesaPiano, spunte, strumenti) {
  const tutte = (lista.reparti || []).flatMap((r) => r.voci || []);

  const contatore = h('p.nota');
  const aggiorna = () => {
    const fatte = tutte.filter((v) => spunte[personalizza.spuntaDaChiave(v.chiave)]).length;
    contatore.textContent = `${fatte} di ${tutte.length}`;
  };
  aggiorna();

  const reparti = (lista.reparti || []).map((rep) => h('div', { style: 'margin-top:12px' }, [
    h('p.occhiello', rep.nome),
    rep.nota ? h('p.nota', { style: 'margin:4px 0 8px' }, rep.nota) : null,
    h('div', (rep.voci || []).map(
      (voce) => rigaVoceSpesa(voce, lista, spesaPiano, spunte, aggiorna, strumenti),
    )),
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

/** La riga della spesa: una spunta quando si compra, un ✎ quando si sistema. */
function rigaVoceSpesa(voce, lista, spesaPiano, spunte, aggiorna, strumenti) {
  const idSpunta = personalizza.spuntaDaChiave(voce.chiave);

  const riga = h('div.cib-voce', [
    h('label.spunta.cresci', [
      h('input', {
        type: 'checkbox',
        checked: !!spunte[idSpunta],
        disabled: strumenti.inModifica,
        onchange: (e) => {
          spunte[idSpunta] = e.target.checked;
          store.segnaSpunta(idSpunta, e.target.checked);
          aggiorna();
        },
      }),
      h('span.quadro'),
      h('span.testo-spunta.cresci', [
        voce.testo,
        voce.spostata ? h('span.mod-segno', ` · da ${voce.listaOrigine}`) : null,
      ].filter(Boolean)),
    ]),
  ]);

  if (strumenti.inModifica) {
    riga.append(bottoneModifica(
      () => apriModificaVoceSpesa(riga, voce, lista, spesaPiano, strumenti),
      `Modifica ${voce.testo}`,
    ));
  }

  return riga;
}

function apriModificaVoceSpesa(riga, voce, lista, spesaPiano, strumenti) {
  const comEra = [...riga.childNodes];
  const chiudi = () => riga.replaceChildren(...comEra);

  const pz = personalizza.leggi(voce.chiave) || {};

  /** Scrive tenendo i campi che non si stanno cambiando. */
  const salva = async (cambi) => {
    const testo = 'testo' in cambi ? cambi.testo : pz.testo;
    await personalizza.scrivi(voce.chiave, {
      testo: testo && testo !== voce.originale ? testo : null,
      lista: 'lista' in cambi ? cambi.lista : pz.lista,
      nascosto: 'nascosto' in cambi ? cambi.nascosto : pz.nascosto,
    });
    await strumenti.ricarica();
  };

  const azioni = [];

  // Spostare significa scrivere la lista di destinazione; tornare indietro
  // vuol dire cancellarla, perché la lista di partenza sta già nel piano.
  const altra = (spesaPiano.liste || []).find((l) => l.id !== lista.id);
  if (voce.spostata) {
    const origine = (spesaPiano.liste || []).find((l) => l.id === voce.listaOrigine);
    azioni.push({
      etichetta: `Rimetti in ${origine ? origine.nome : `lista ${voce.listaOrigine}`}`,
      onClick: () => salva({ lista: null }),
    });
  } else if (altra) {
    azioni.push({
      etichetta: `Sposta in ${altra.nome}`,
      onClick: () => salva({ lista: altra.id }),
    });
  }

  azioni.push({
    etichetta: 'Togli dalla lista',
    classe: 'btn-rosso',
    onClick: async () => {
      if (!conferma(`Tolgo “${voce.testo}” dalla spesa?`)) return;
      await salva({ nascosto: true });
    },
  });

  riga.replaceChildren(h('div.cresci', [modifica({
    campi: [{ chiave: 'testo', etichetta: 'Voce della spesa', valore: voce.testo }],
    nota: voce.personalizzata ? `Nel piano: ${voce.originale}` : null,
    azioni,
    onSalva: (v) => salva({ testo: v.testo }),
    onAnnulla: chiudi,
  })]));
}

function bottoniSpesa(spesaPiano, spunte, strumenti) {
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
        const mancanti = (rep.voci || [])
          .filter((v) => !spunte[personalizza.spuntaDaChiave(v.chiave)]);
        if (!mancanti.length) return null;
        return `${rep.nome}:\n${mancanti.map((v) => `- ${v.testo}`).join('\n')}`;
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

/* ========== stile locale =================================== */
/* app.css non si tocca: quel che manca vive qui, con classi cib-. */

const STILE = `
.cib-oggi { border-width: var(--bordo-xl); }
.cib-oggi > summary { background: var(--ink); color: var(--paper); }
.cib-porzioni { display: grid; gap: 10px; }
.cib-porzione-riga { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.cib-quanto { color: var(--ink-2); text-align: right; }
.cib-barra { min-height: 38px; }
.cib-voce { display: flex; align-items: center; gap: 10px; }
.cib-voce .spunta { border-bottom: 0; }
.cib-voce { border-bottom: 1px solid var(--linea-2); }
.cib-voce:last-child { border-bottom: 0; }
`;

function iniettaStile() {
  if (document.getElementById('stile-cibo')) return;
  const s = document.createElement('style');
  s.id = 'stile-cibo';
  s.textContent = STILE;
  document.head.append(s);
}
