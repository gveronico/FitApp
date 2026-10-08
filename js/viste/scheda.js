/* scheda.js — la scheda di allenamento: si consulta a casa o tra una serie e
   l'altra, e si modifica qui stesso. Modifica apre l'editor (modifica.js) al
   posto dell'elenco delle sedute; Fine ridisegna la scheda con le modifiche.
   Non registra niente — la registrazione è in sessione.js. */

import { h, durata, segniFatta } from '../ui.js';
import * as piani from '../piani.js';
import * as store from '../store.js';
import { editor } from './modifica.js';

export async function monta(contenitore, parametri) {
  iniettaStile();

  const idRichiesto = parametri && parametri[0] ? parametri[0] : null;
  const [st, chi, idx] = await Promise.all([
    piani.stato(), store.partecipanti(), piani.indice(),
  ]);
  // La variante facile è di Corinna: si vede quando si allena anche lei.
  const profilo = chi.includes('corinna') ? 'corinna' : chi[0];

  let riferimento = st.riferimento;
  let piano = st.piano;
  let archiviato = false;

  if (idRichiesto) {
    const rif = idx.allenamento.find((r) => r.id === idRichiesto);
    if (rif) {
      riferimento = rif;
      piano = await piani.piano(rif);
      archiviato = true;
    }
  }

  const testata = h('header.testata', [
    h('div', [
      h('p.occhiello', riferimento ? riferimento.nome : 'Scheda'),
      h('h1.titolo', 'Scheda'),
    ]),
    (!archiviato && st.settimana != null)
      ? h('p.occhiello.sch-badge', `S${st.settimanaNellaFase}/${st.settimaneFase}`)
      : null,
  ]);

  const schermata = h(archiviato ? 'div.schermata.solo-lettore' : 'div.schermata');
  contenitore.append(testata, schermata);

  /* --- avvisi in cima -------------------------------------- */

  if (archiviato) {
    schermata.append(h('div.fascia.fascia-avviso', [
      'Piano non in uso, qui in sola lettura. ',
      h('a', { href: '#/scheda', style: 'color:inherit' }, 'Torna alla scheda attiva →'),
    ]));
  }

  if (!st.impostato) {
    schermata.append(h('div.fascia.fascia-avviso', [
      'Manca la data del primo allenamento: i calcoli usano la settimana 1. ',
      h('a', { href: '#/altro', style: 'color:inherit' }, 'Impostala in Altro →'),
    ]));
  }

  if (!riferimento || !piano) {
    schermata.append(h('div.vuoto', [h('p.nota', 'Nessuna scheda disponibile.')]));
    return;
  }

  /* --- stato del piano e regole ----------------------------- */

  schermata.append(rigaStato(riferimento, piano));

  const regole = bloccoRegole(piano);
  if (regole) schermata.append(regole);

  /* --- le quattro sedute ------------------------------------ */

  const fatte = archiviato ? [] : await Promise.all(chi.map(async (p) => [
    store.nomePersona(p), await piani.fatteInSettimana(st.dataInizio, new Date(), null, p),
  ]));

  const zonaSedute = h('div.pila', (piano.sedute || []).map((seduta, i) => bloccoSeduta(seduta, {
    numero: i + 1,
    profilo,
    mostraInizio: !archiviato,
    fatta: segniFatta(fatte.map(([nome, f]) => [nome, piani.statoSeduta(f, seduta.id)])),
  })));

  /* Modifica: l'editor prende il posto delle sedute, nella stessa schermata.
     Fine rimonta la scheda, così si rilegge il piano con le modifiche. */
  const btnModifica = h('button.btn.btn-s', {
    type: 'button',
    onclick: async () => {
      if (btnModifica.textContent === 'Fine') {
        contenitore.replaceChildren();
        await monta(contenitore, parametri);
        return;
      }
      btnModifica.textContent = 'Fine';
      schermata.classList.remove('solo-lettore');
      etichetta.textContent = 'Modifica · si salva a ogni Salva';
      await editor(zonaSedute, riferimento);
    },
  }, 'Modifica');
  const etichetta = h('p.occhiello', archiviato ? 'Sedute' : 'Sedute della settimana');

  schermata.append(h('div.riga-sp.sch-barra', [etichetta, btnModifica]));
  schermata.append(zonaSedute);

  /* --- altri piani -------------------------------------------- */

  schermata.append(await bloccoAltriPiani());
}

/* ---------- pezzi --------------------------------------- */

function rigaStato(riferimento, piano) {
  return h('div.blocco.blocco-quieto', [
    h('div.riga-sp', [
      h('p.titolo-2', riferimento.nome),
      h('p.nota', `Settimane ${riferimento.settimanaDa}–${riferimento.settimanaA}`),
    ]),
    h('p.nota', { style: 'margin-top:6px' },
      riferimento.monitorata
        ? 'I carichi registrati entrano nei calcoli dei progressi.'
        : 'I carichi si annotano ma non entrano nei calcoli.'),
    piano?.allenamentiDaSettimana
      ? h('p.nota', { style: 'margin-top:4px' }, testoFrequenza(piano.allenamentiDaSettimana))
      : null,
  ]);
}

/** { "1": 2, "3": 4 } -> 'Allenamenti a settimana: 2 dalla settimana 1, 4 dalla 3.' */
function testoFrequenza(scala) {
  const voci = Object.entries(scala).sort((a, b) => Number(a[0]) - Number(b[0]));
  return `Allenamenti a settimana: ${voci.map(([da, n], i) => `${n} dalla ${i ? '' : 'settimana '}${da}`).join(', ')}.`;
}

function bloccoRegole(piano) {
  const regole = piano.regole || [];
  if (!regole.length) return null;

  return h('details.piega', [
    h('summary', 'Regole della fase'),
    h('div.corpo', [h('ul.sch-punti', regole.map((r) => h('li', r)))]),
  ]);
}

function bloccoSeduta(seduta, opzioni) {
  const {
    numero, profilo, mostraInizio, fatta,
  } = opzioni;

  const summary = h('summary', [
    h('div', [
      h('p.occhiello', `Allenamento ${numero}`),
      h('p.titolo-2', seduta.nome),
      seduta.sottotitolo ? h('p.nota', { style: 'margin-top:2px' }, seduta.sottotitolo) : null,
      fatta,
    ]),
  ]);

  const corpo = h('div.corpo', [
    bloccoFase('Riscaldamento', seduta.riscaldamento),
    h('ol.lista.lista-num', { style: 'margin:10px 0' },
      (seduta.esercizi || []).map((e) => elementoEsercizio(e, profilo))),
    bloccoFase('Scarico', seduta.scarico),
    mostraInizio ? h('a.btn.btn-primo', { href: `#/sessione/${seduta.id}`, style: 'margin-top:8px' },
      'Inizia questo allenamento') : null,
  ].filter(Boolean));

  return h('details.piega', [summary, corpo]);
}

function bloccoFase(etichetta, fase) {
  if (!fase) return null;
  return h('div', { style: 'margin-bottom:14px' }, [
    h('p.occhiello', `${etichetta} · ${fase.minuti} minuti`),
    h('ul.sch-punti', { style: 'margin-top:6px' }, (fase.voci || []).map((v) => h('li', v))),
  ]);
}

function elementoEsercizio(e, profilo) {
  let nota = `${e.serie} × ${e.rip}`;
  if (e.recuperoSec) nota += ` · rec ${durata(e.recuperoSec)}`;

  return h('li', [h('span.cresci', [
    h('div.sch-nome', [
      h('span', e.nome),
      e.gruppo ? h('span.tag', piani.nomeGruppo(e.gruppo)) : null,
    ].filter(Boolean)),
    e.varianteFacile && profilo === 'corinna'
      ? h('p.sch-variante', `Variante per Corinna: ${e.varianteFacile}`)
      : null,
    h('p.nota', nota),
    e.note ? h('p.nota', e.note) : null,
  ].filter(Boolean))]);
}

async function bloccoAltriPiani() {
  const elenco = await piani.elencoPiani();
  const altri = elenco.filter((p) => !p.attivo);

  return h('details.piega', [
    h('summary', 'Altri piani'),
    h('div.corpo', [
      ...altri.map((p) => h('a.sch-riga-piano', { href: `#/scheda/${p.id}` }, [
        h('span.cresci', [
          h('div', p.nome),
          h('p.nota', `Settimane ${p.settimanaDa}–${p.settimanaA}`),
        ]),
        h('span.nota', p.passato ? 'passato' : (p.futuro ? 'in arrivo' : '')),
      ])),
      h('a.btn', { href: '#/modifica/nuovo', style: 'margin-top:10px;width:100%' }, '+ Crea un piano nuovo'),
    ]),
  ]);
}

/* ---------- stile locale --------------------------------- */
/* app.css non si tocca: quel che manca vive qui, con classi sch-. */

const STILE = `
.sch-badge { border: var(--bordo) solid var(--linea); padding: 4px 10px; white-space: nowrap; }
.sch-punti { list-style: disc; margin: 0; padding-left: 20px; display: grid; gap: 6px; font-size: 15px; }
.sch-punti > li { padding: 0; }
.sch-variante { font-size: 13px; color: var(--ink-2); margin: 2px 0 0; }
.sch-nome { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.sch-barra { min-height: 38px; }
.sch-riga-piano {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  min-height: var(--tap); padding: 10px 0; border-bottom: 1px solid var(--linea-2);
  text-decoration: none; color: inherit;
}
.sch-riga-piano:last-child { border-bottom: 0; }
`;

function iniettaStile() {
  if (document.getElementById('stile-scheda')) return;
  const s = document.createElement('style');
  s.id = 'stile-scheda';
  s.textContent = STILE;
  document.head.append(s);
}
