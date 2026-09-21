/* oggi.js — la schermata d'apertura: cosa alleno, cosa mangio. */

import { h, dataLunga, iso, daIso } from '../ui.js';
import * as piani from '../piani.js';
import * as store from '../store.js';

export async function monta(app) {
  const st = await piani.stato();
  const oggi = new Date();

  const testata = h('header.testata', [
    h('div', [
      h('p.occhiello', dataLunga(oggi)),
      h('h1.titolo', st.seduta ? st.seduta.nome : 'Riposo'),
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

  if (st.seduta) {
    schermata.append(await bloccoSeduta(st));
  } else {
    schermata.append(h('div.blocco.blocco-quieto', [
      h('p.occhiello', 'Allenamento'),
      h('p.titolo-2', 'Oggi si riposa.'),
      h('p.nota', prossimaSeduta(st, oggi)),
    ]));
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
      const vincoli = cibo.vincoli || [];
      const profilo = st.impostazioni?.profilo || null;
      schermata.append(bloccoPasto('Pranzo', giornoCibo.pranzo, vincoli, profilo));
      schermata.append(bloccoPasto('Cena', giornoCibo.cena, vincoli, profilo));
    }

    schermata.append(rotazione('Colazione', cibo.colazioni?.map((c) => c.testo || c.nome) || []));
    schermata.append(rotazione('Spuntino', cibo.spuntini || []));
  }
}

/* ---------- pezzi --------------------------------------- */

async function bloccoSeduta(st) {
  const settimana = st.settimanaNellaFase;
  const aperta = await store.sessioneAperta();
  // Come in scheda.js: un esercizio a 0 serie questa settimana non è ancora
  // entrato nel programma (serieDaSettimana) — qui, riepilogo, si salta.
  const esercizi = (st.seduta.esercizi || []).filter((e) => piani.serieDi(e, settimana) > 0);

  return h('div.blocco.blocco-pieno', [
    h('div.riga-sp', [
      h('p.occhiello', st.seduta.sottotitolo || 'Allenamento'),
      h('p.occhiello', st.settimana
        ? `Sett. ${settimana} di ${st.settimaneFase}`
        : st.riferimento?.nome || ''),
    ]),
    h('ol.lista.lista-num', { style: 'margin:10px 0 14px' },
      esercizi.map((e) => h('li', [
        h('span.cresci', [
          h('div', e.nome),
          h('div.nota', { style: 'color:inherit;opacity:.7' },
            `${piani.serieDi(e, settimana)} × ${e.rip}`),
        ]),
      ]))),
    h('a.btn.btn-primo', {
      href: `#/sessione/${st.seduta.id}`,
      style: 'background:var(--paper);color:var(--ink);border-color:var(--paper)',
    }, aperta ? 'Riprendi allenamento' : 'Inizia allenamento'),
    st.riferimento && !st.riferimento.monitorata
      ? h('p.nota', { style: 'margin-top:10px;color:inherit;opacity:.7' },
        'Fase di avvicinamento: i carichi si annotano ma non entrano nei calcoli.')
      : null,
  ]);
}

function bloccoPasto(quale, pasto, vincoli, profilo) {
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
      bannerVincoli(vincoli, profilo),
      h('p', { style: 'margin:0' }, pasto.testo),
      pasto.nota ? h('p.nota', { style: 'margin-top:8px' }, pasto.nota) : null,
    ]),
  ]);
}

/* ---------- banner dei vincoli alimentari ----------------
   Stessa resa di cibo.js (classe .fascia.fascia-vincolo, vincolo del
   profilo attivo per primo): sono allergie, contano più dell'ordine. */

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

/** Mostra una voce a rotazione, con le frecce per sfogliare le altre. */
function rotazione(titolo, voci) {
  if (!voci.length) return h('div.nascondi');
  let i = Math.floor(Date.now() / 86400000) % voci.length;

  const testo = h('p', { style: 'margin:0;flex:1' }, voci[i]);
  const avanti = () => { i = (i + 1) % voci.length; testo.textContent = voci[i]; };

  return h('div.blocco.blocco-quieto', [
    h('div.riga-sp', [
      h('p.occhiello', titolo),
      h('button.btn.btn-s', { onclick: avanti, 'aria-label': 'Un’altra idea' }, 'Un’altra'),
    ]),
    h('div.riga', { style: 'margin-top:8px' }, [testo]),
  ]);
}

function prossimaSeduta(st, oggi) {
  if (!st.piano) return '';
  const giorni = st.piano.sedute.map((s) => s.giorno).sort((a, b) => a - b);
  const g = st.giorno;
  const prossimo = giorni.find((x) => x > g) ?? giorni[0];
  const seduta = st.piano.sedute.find((s) => s.giorno === prossimo);
  const nomi = ['', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
  return seduta ? `Prossimo allenamento: ${nomi[prossimo]}, ${seduta.nome}.` : '';
}

async function avvisoBackup(dove) {
  const ultimo = await store.leggi('ultimoBackup');
  const serie = await store.tutteLeSerie();
  if (!serie.length) return;
  const giorni = ultimo ? Math.floor((daIso(iso()) - daIso(ultimo)) / 86400000) : Infinity;
  if (giorni < 30) return;
  dove.append(h('div.fascia.fascia-avviso', [
    ultimo ? `Ultimo backup ${giorni} giorni fa. ` : 'Non hai mai fatto un backup. ',
    h('a', { href: '#/altro', style: 'color:inherit' }, 'Fallo ora →'),
  ]));
}
