/* oggi.js — la schermata d'apertura: cosa alleno, cosa mangio.

   Le sedute non hanno un giorno (dal 29/09/2026): sono quattro allenamenti da
   fare nella settimana, e quale fare lo sceglie chi apre l'app. Qui c'è l'elenco,
   ognuna con il suo stato — "fatta" se completa, "in parte · 9/14" se ridotta —
   e la prima ancora da fare, nell'ordine del piano, in evidenza. Una sessione
   aperta oggi sta in cima: si riprende da lì.

   Sopra le sedute, chi si allena: tutti e due (il solito), o uno solo. Lo
   stato di ogni seduta è di chi si allena: uno solo se è andata uguale, uno a
   testa se no (dal 29/09/2026). */

import {
  h, dataLunga, iso, daIso, segniFatta, scelta,
} from '../ui.js';
import * as piani from '../piani.js';
import * as store from '../store.js';

export async function monta(app) {
  iniettaStile();
  const st = await piani.stato();
  const oggi = new Date();

  const chi = await store.partecipanti();
  const [aperte, ...fatteDi] = await Promise.all([
    store.sessioni(store.TUTTE).then((t) => t.filter((x) => !x.finita && x.data === iso(oggi))),
    ...chi.map((p) => piani.fatteInSettimana(st.dataInizio, oggi, null, p)),
  ]);
  const fatte = new Map(chi.map((p, i) => [p, fatteDi[i]]));
  const sedute = st.piano?.sedute || [];
  // Aperta ma senza nessuna serie non è un allenamento in corso: si sceglie da capo.
  // In due le sessioni aperte sono due: basta che una abbia serie.
  let aperta = null;
  for (const x of aperte) {
    if ((await store.serieDiSessione(x.id)).length) { aperta = x; break; }
  }
  const inCorso = aperta ? sedute.find((s) => s.id === aperta.sedutaId) || null : null;

  const testata = h('header.testata', [
    h('div', [
      h('p.occhiello', dataLunga(oggi)),
      h('h1.titolo', inCorso ? inCorso.nome : 'Oggi'),
    ]),
    h('a.btn.btn-s', { href: '#/altro', 'aria-label': 'Impostazioni' }, '⚙'),
  ]);

  const schermata = h('div.schermata');
  app.append(testata, schermata);

  /* --- avvisi in cima ---------------------------------- */

  if (!st.impostato) {
    schermata.append(h('div.fascia.fascia-avviso',
      'Manca la data del primo allenamento: senza, non so in che settimana sei. Impostala in Altro.'));
  }

  if (st.fineProgramma) {
    schermata.append(h('div.fascia.fascia-avviso',
      'Il programma è finito. Serve una scheda nuova.'));
  } else if (st.settimana && st.riferimento && st.settimana >= st.riferimento.settimanaA - 1) {
    const mancano = st.riferimento.settimanaA - st.settimana + 1;
    const etichetta = mancano === 1 ? 'Ultima settimana' : `Ultime ${mancano} settimane`;
    schermata.append(h('div.fascia.fascia-avviso', `${etichetta} di ${st.riferimento.nome}.`));
  }

  await avvisoBackup(schermata);

  /* --- allenamento -------------------------------------- */

  if (inCorso) schermata.append(bloccoInCorso(inCorso));

  if (st.piano && sedute.length) {
    schermata.append(sceltaChi(chi, () => { app.replaceChildren(); monta(app); }));
    schermata.append(sceltaSeduta(st, sedute, fatte, inCorso));
  }

  /* --- pasti -------------------------------------------- */

  const cibo = st.cibo;
  if (cibo) {
    const giornoCibo = cibo.settimana?.find((g) => g.giorno === st.giorno);
    schermata.append(h('p.occhiello', { style: 'margin-top:6px' }, 'Da mangiare'));

    if (!giornoCibo) {
      schermata.append(h('div.blocco.blocco-quieto', [
        h('p.titolo-2', 'Giornata libera'),
        h('p.nota', 'Tieni le proteine in almeno un pasto.'),
      ]));
    } else {
      schermata.append(bloccoPasto('Pranzo', giornoCibo.pranzo));
      schermata.append(bloccoPasto('Cena', giornoCibo.cena));
    }

  }
}

/* ---------- pezzi --------------------------------------- */

function eserciziDi(seduta) {
  return (seduta.esercizi || []).filter((e) => e.serie > 0);
}

/** L'allenamento aperto oggi: si riprende. */
function bloccoInCorso(seduta) {
  return h('div.blocco.blocco-pieno', [
    h('div.riga-sp', [
      h('p.occhiello', 'In corso'),
      h('p.occhiello', seduta.sottotitolo || ''),
    ]),
    h('ol.lista.lista-num', { style: 'margin:10px 0 14px' },
      eserciziDi(seduta).map((e) => h('li', [
        h('span.cresci', [
          h('div', e.nome),
          h('div.nota', { style: 'color:inherit;opacity:.7' }, `${e.serie} × ${e.rip}`),
        ]),
      ]))),
    h('a.btn.btn-primo', {
      href: `#/sessione/${seduta.id}`,
      style: 'background:var(--paper);color:var(--ink);border-color:var(--paper)',
    }, 'Riprendi allenamento'),
  ]);
}

/** Chi si allena: tutti e due o uno solo. La scelta resta per le prossime volte. */
function sceltaChi(chi, ridisegna) {
  const valore = chi.length > 1 ? 'insieme' : chi[0];
  const opzioni = [
    { valore: 'insieme', etichetta: 'Insieme' },
    ...store.PERSONE.map((p) => ({ valore: p, etichetta: store.nomePersona(p) })),
  ];
  return h('div.pila-s', [
    h('p.occhiello', 'Chi si allena'),
    scelta(opzioni, valore, async (v) => {
      await store.scrivi('partecipanti', v === 'insieme' ? [...store.PERSONE] : [v]);
      ridisegna();
    }, 'Chi si allena'),
  ]);
}

/**
 * Tutte le sedute del piano, da scegliere. Ognuna dice se è già fatta questa
 * settimana; la prima ancora da fare è in evidenza, ma è solo un suggerimento.
 * `fatte` è persona -> allenamenti della settimana: una seduta è fatta quando
 * l'ha finita chiunque si alleni.
 */
function sceltaSeduta(st, sedute, fatte, inCorso) {
  const previsti = piani.allenamentiPrevisti(st.piano, st.settimanaNellaFase);
  const chi = [...fatte.keys()];
  const stati = new Map(sedute.map((s) => [s.id,
    chi.map((p) => [store.nomePersona(p), piani.statoSeduta(fatte.get(p), s.id)])]));
  const completaPerTutti = (s) => stati.get(s.id).every(([, x]) => x?.completa);
  const prossima = inCorso ? null : sedute.find((s) => !completaPerTutti(s)) || null;
  const conti = chi.map((p) => fatte.get(p).length);
  const nFatte = Math.min(...conti);
  const testoConti = conti.every((n) => n === conti[0])
    ? `fatti ${conti[0]} di ${previsti}`
    : `${chi.map((p, i) => `${store.nomePersona(p)} ${conti[i]}`).join(' · ')} di ${previsti}`;

  const testa = h('div.riga-sp', [
    h('p.occhiello', inCorso ? 'Oppure un altro' : 'Scegli l’allenamento'),
    h('p.occhiello', st.settimana
      ? `Sett. ${st.settimanaNellaFase} di ${st.settimaneFase} · ${testoConti}`
      : testoConti.charAt(0).toUpperCase() + testoConti.slice(1)),
  ]);

  const schede = sedute.filter((s) => s !== inCorso).map((s) => {
    const segno = segniFatta(stati.get(s.id));
    const stato = !!segno;
    const evidenza = s === prossima;
    const esercizi = eserciziDi(s);
    return h(evidenza ? 'a.blocco.blocco-pieno.ogg-scelta' : (stato ? 'a.blocco.blocco-quieto.ogg-scelta' : 'a.blocco.ogg-scelta'), {
      href: `#/sessione/${s.id}`,
    }, [
      evidenza ? h('p.occhiello', 'La prossima da fare') : null,
      h('div.riga-sp', [
        h('p.titolo-2', s.nome),
        h('span.ogg-freccia', '›'),
      ]),
      s.sottotitolo ? h('p.nota', s.sottotitolo) : null,
      h('p.nota.ogg-esercizi', esercizi.map((e) => e.nome).join(' · ')),
      segno,
    ].filter(Boolean));
  });

  const pezzi = [testa, ...schede];
  if (nFatte >= previsti) {
    pezzi.push(h('p.nota',
      `Hai già fatto ${previsti === 1 ? 'l’allenamento previsto' : `i ${previsti} allenamenti previsti`} questa settimana.`));
  }
  return h('div.pila', pezzi);
}

function bloccoPasto(quale, pasto) {
  if (!pasto) return h('div.nascondi');
  if (pasto.libero) {
    return h('div.blocco.blocco-quieto', [
      h('p.occhiello', quale),
      h('p.titolo-2', 'Libera'),
    ]);
  }
  return h('details.piega', [
    h('summary', [h('span', [h('span.occhiello', quale + ' · '), pasto.nome])]),
    h('div.corpo', [
      h('p', { style: 'margin:0' }, pasto.testo),
      (pasto.alimenti || []).some((x) => x.scelto)
        ? h('p.nota', { style: 'margin-top:6px' }, pasto.alimenti.filter((x) => x.scelto).map((x) => x.nome).join(' · '))
        : null,
      pasto.nota ? h('p.nota', { style: 'margin-top:8px' }, pasto.nota) : null,
    ]),
  ]);
}

async function avvisoBackup(dove) {
  const ultimo = await store.leggi('ultimoBackup');
  const serie = await store.tutteLeSerie(store.TUTTE);
  if (!serie.length) return;
  const giorni = ultimo ? Math.floor((daIso(iso()) - daIso(ultimo)) / 86400000) : Infinity;
  if (giorni < 30) return;
  dove.append(h('div.fascia.fascia-avviso', [
    ultimo ? `Ultimo backup ${giorni} giorni fa. ` : 'Non hai mai fatto un backup. ',
    h('a', { href: '#/altro', style: 'color:inherit' }, 'Fallo ora →'),
  ]));
}

/* ---------- stile locale --------------------------------- */
/* app.css non si tocca: quel che manca vive qui, con classi ogg-. */

const STILE = `
.ogg-scelta { display: grid; gap: 4px; text-decoration: none; color: inherit; }
.ogg-scelta.blocco-pieno { color: var(--paper); }
.ogg-scelta .segno { justify-self: start; }
.ogg-freccia { font-size: 26px; line-height: 1; font-weight: 400; }
.ogg-esercizi { font-size: 13px; }
.ogg-riga {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  width: 100%; min-height: var(--tap); text-decoration: none; color: inherit;
}
`;

function iniettaStile() {
  if (document.getElementById('stile-oggi')) return;
  const s = document.createElement('style');
  s.id = 'stile-oggi';
  s.textContent = STILE;
  document.head.append(s);
}
