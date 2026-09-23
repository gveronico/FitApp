/* oggi.js — la schermata d'apertura: cosa alleno, cosa mangio.

   La seduta del giorno è quella del calendario, ma non è un obbligo: sotto c'è
   l'elenco di tutte le sedute del piano, e se ne può fare un'altra — anche in un
   giorno di riposo. Una sessione aperta oggi vince sul calendario: si torna
   sulla seduta che si stava facendo. */

import { h, dataLunga, iso, daIso, giorni } from '../ui.js';
import * as piani from '../piani.js';
import * as store from '../store.js';

export async function monta(app) {
  iniettaStile();
  const st = await piani.stato();
  const oggi = new Date();

  const [aperta, fatte] = await Promise.all([
    store.sessioneAperta(),
    piani.fatteInSettimana(st.dataInizio, oggi),
  ]);
  const sedute = st.piano?.sedute || [];
  const inCorso = aperta && aperta.data === iso(oggi)
    ? sedute.find((s) => s.id === aperta.sedutaId) || null
    : null;
  const seduta = inCorso || st.seduta;

  const testata = h('header.testata', [
    h('div', [
      h('p.occhiello', dataLunga(oggi)),
      h('h1.titolo', seduta ? seduta.nome : 'Riposo'),
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

  if (seduta) {
    const gia = fatte.filter((f) => f.sedutaId === seduta.id && f.sessioneId !== aperta?.id);
    if (gia.length) schermata.append(avvisoGiaFatta(seduta, gia));
    schermata.append(bloccoSeduta(st, seduta, !!inCorso));
  } else {
    schermata.append(h('div.blocco.blocco-quieto', [
      h('p.occhiello', 'Allenamento'),
      h('p.titolo-2', 'Oggi si riposa.'),
      h('p.nota', prossimaSeduta(st, oggi)),
    ]));
  }

  if (st.piano) {
    schermata.append(bloccoSettimana(st, fatte));
    const altre = sedute.filter((s) => s !== seduta);
    if (altre.length) schermata.append(sceltaSeduta(altre, fatte, !seduta));
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

    schermata.append(rotazione('Colazione', cibo.colazioni?.map((c) => c.testo || c.nome) || []));
    schermata.append(rotazione('Spuntino', (cibo.spuntini || []).map((s) => s.testo)));
  }
}

/* ---------- pezzi --------------------------------------- */

function bloccoSeduta(st, seduta, inCorso) {
  const settimana = st.settimanaNellaFase;
  // Come in scheda.js: un esercizio a 0 serie questa settimana non è ancora
  // entrato nel programma (serieDaSettimana) — qui, riepilogo, si salta.
  const esercizi = (seduta.esercizi || []).filter((e) => piani.serieDi(e, settimana) > 0);

  return h('div.blocco.blocco-pieno', [
    h('div.riga-sp', [
      h('p.occhiello', seduta.sottotitolo || 'Allenamento'),
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
      href: `#/sessione/${seduta.id}`,
      style: 'background:var(--paper);color:var(--ink);border-color:var(--paper)',
    }, inCorso ? 'Riprendi allenamento' : 'Inizia allenamento'),
  ]);
}

/** La seduta risulta già fatta questa settimana: lo si dice, non lo si impedisce. */
function avvisoGiaFatta(seduta, gia) {
  const quando = gia.map((f) => giornoData(f.data)).join(' e ');
  return h('div.fascia.fascia-avviso',
    `${seduta.nome} l’hai già fatto questa settimana (${quando}). `
    + 'Se lo rifai, si registra come allenamento a parte.');
}

/** Quanti allenamenti fatti su quanti previsti, e quali. */
function bloccoSettimana(st, fatte) {
  const previsti = piani.allenamentiPrevisti(st.piano, st.settimanaNellaFase);
  const nomi = new Map((st.piano.sedute || []).map((s) => [s.id, s.nome]));
  const completa = fatte.length >= previsti;

  return h('div.blocco.blocco-quieto', [
    h('div.riga-sp', [
      h('p.occhiello', 'Questa settimana'),
      h('p.occhiello', `${fatte.length} di ${previsti}`),
    ]),
    fatte.length
      ? h('ul.lista', { style: 'margin-top:6px' }, fatte.map((f) => h('li', [
        h('span.cresci', nomi.get(f.sedutaId) || f.sedutaId),
        h('span.nota', giornoData(f.data)),
      ])))
      : h('p.nota', { style: 'margin-top:6px' }, 'Nessun allenamento registrato.'),
    completa
      ? h('p.nota', { style: 'margin-top:8px' },
        `Hai già fatto ${previsti === 1 ? 'l’allenamento previsto' : `i ${previsti} allenamenti previsti`}.`)
      : null,
  ]);
}

/** Tutte le altre sedute del piano, da fare quando si vuole. */
function sceltaSeduta(sedute, fatte, riposo) {
  return h('div.blocco', [
    h('p.occhiello', riposo ? 'Allenati lo stesso' : 'Fai un altro allenamento'),
    h('ul.lista', { style: 'margin-top:4px' }, sedute.map((s) => {
      const gia = fatte.filter((f) => f.sedutaId === s.id);
      return h('li', [h('a.ogg-riga', { href: `#/sessione/${s.id}` }, [
        h('span.cresci', [
          h('div', s.nome),
          s.sottotitolo ? h('p.nota', s.sottotitolo) : null,
        ]),
        gia.length
          ? h('span.nota', `fatto ${gia.map((f) => giornoData(f.data)).join(', ')}`)
          : h('span.nota', '›'),
      ])]);
    })),
  ]);
}

/** 'lunedì 21' */
function giornoData(dataIso) {
  const d = daIso(dataIso);
  return `${giorni[d.getDay()]} ${d.getDate()}`;
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
      pasto.nota ? h('p.nota', { style: 'margin-top:8px' }, pasto.nota) : null,
    ]),
  ]);
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

/* ---------- stile locale --------------------------------- */
/* app.css non si tocca: quel che manca vive qui, con classi ogg-. */

const STILE = `
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
