/* progressi.js — quanto si è saliti di carico, a ripetizioni fisse.
   Due sotto-schede: Carichi (qui) e Foto (in foto.js, montata a parte). */

import { h, metti, peso, percento, daIso, mesiBrevi } from '../ui.js';
import * as piani from '../piani.js';
import * as store from '../store.js';

export async function monta(contenitore, parametri) {
  iniettaStile();

  const vistaIniziale = parametri && parametri[0] === 'foto' ? 'foto' : 'carichi';

  const elenco = await piani.elencoPiani();
  const pianoMonitorato = elenco.find((p) => p.monitorata) || null;

  const testata = h('header.testata', [
    h('div', [
      h('p.occhiello', pianoMonitorato ? pianoMonitorato.nome : 'Progressi'),
      h('h1.titolo', 'Progressi'),
    ]),
  ]);

  const schede = h('div.schede', { role: 'tablist' });
  const corpo = h('div');
  contenitore.append(testata, schede, corpo);

  const btnCarichi = h('button', {
    role: 'tab', 'aria-selected': String(vistaIniziale === 'carichi'), onclick: () => cambia('carichi'),
  }, 'Carichi');
  const btnFoto = h('button', {
    role: 'tab', 'aria-selected': String(vistaIniziale === 'foto'), onclick: () => cambia('foto'),
  }, 'Foto');
  schede.append(btnCarichi, btnFoto);

  async function cambia(nome) {
    btnCarichi.setAttribute('aria-selected', String(nome === 'carichi'));
    btnFoto.setAttribute('aria-selected', String(nome === 'foto'));
    corpo.replaceChildren();
    if (nome === 'carichi') await corpoCarichi(corpo);
    else await montaFoto(corpo);
  }

  await cambia(vistaIniziale);
}

async function montaFoto(dove) {
  try {
    const m = await import('./foto.js');
    await m.corpo(dove);
  } catch (e) {
    console.error(e);
    metti(dove, h('div.schermata', [
      h('div.vuoto', [h('p.nota', 'Le foto non sono disponibili.')]),
    ]));
  }
}

/** Disegna solo il contenuto "Carichi", senza testata. Riusabile da fuori. */
export async function corpoCarichi(contenitore) {
  iniettaStile();
  contenitore.classList.add('schermata');

  const [serieGrezze, elenco, st] = await Promise.all([
    store.tutteLeSerie(), piani.elencoPiani(), piani.stato(),
  ]);

  if (!serieGrezze.length) {
    metti(contenitore, vistaVuota());
    return;
  }

  const { nomiEsercizi, nomiSedute } = await costruisciMappe();
  const calcolo = calcolaIncrementi(serieGrezze);

  let selezionato = null;

  const disegna = () => {
    if (selezionato) {
      const e = calcolo.esercizi.find((x) => x.esercizioId === selezionato);
      metti(contenitore, vistaDettaglio(e, serieGrezze, nomiEsercizi, () => {
        selezionato = null;
        disegna();
      }));
    } else {
      metti(contenitore, vistaElenco(calcolo, nomiEsercizi, nomiSedute, elenco, st, (id) => {
        selezionato = id;
        disegna();
      }));
    }
  };

  disegna();
}

/* ================================================================
   IL CALCOLO — l'aumento percentuale del carico a ripetizioni fisse.
   Esportata e testabile da sola, senza toccare il DOM.
   ================================================================ */

/**
 * Da tutte le serie registrate, calcola l'incremento per esercizio.
 *   - Solo serie monitorata === true, carico finito > 0, ripetizioni finite > 0.
 *   - Per ogni data, il carico di riferimento è il massimo carico di quella
 *     giornata; le ripetizioni associate sono il massimo tra le serie che
 *     hanno quel carico massimo.
 *   - Incremento = (attuale - iniziale) / iniziale * 100, tra prima e ultima data.
 *   - Se le rip dell'ultima data sono minori di quelle della prima, il
 *     progresso non si conteggia (conteggiato: false) ma resta calcolato.
 *   - Un esercizio con una sola data è "in attesa": nessun incremento ancora.
 *
 * Ritorna { esercizi, media, inAttesa }.
 *   esercizi: [{ esercizioId, punti, iniziale, attuale, incrementoPercento,
 *                conteggiato, inAttesa, sedutaId }]
 *   punti: [{ data, carico, ripetizioni, sedutaId }] ordinati per data
 *   media: media semplice degli incrementi conteggiabili, o null se nessuno
 *   inAttesa: quanti esercizi hanno una sola data
 */
export function calcolaIncrementi(serie) {
  const valide = (serie || []).filter((s) => (
    s && s.monitorata === true
    && Number.isFinite(s.carico) && s.carico > 0
    && Number.isFinite(s.ripetizioni) && s.ripetizioni > 0
  ));

  const perEsercizio = new Map();
  valide.forEach((s) => {
    if (!perEsercizio.has(s.esercizioId)) perEsercizio.set(s.esercizioId, new Map());
    const perData = perEsercizio.get(s.esercizioId);
    if (!perData.has(s.data)) perData.set(s.data, []);
    perData.get(s.data).push(s);
  });

  const esercizi = [];
  perEsercizio.forEach((perData, esercizioId) => {
    const date = [...perData.keys()].sort();
    const punti = date.map((data) => {
      const delGiorno = perData.get(data);
      const caricoMax = Math.max(...delGiorno.map((s) => s.carico));
      const ripMax = Math.max(...delGiorno.filter((s) => s.carico === caricoMax).map((s) => s.ripetizioni));
      return { data, carico: caricoMax, ripetizioni: ripMax, sedutaId: delGiorno[0].sedutaId };
    });

    const iniziale = punti[0];
    const attuale = punti[punti.length - 1];
    const inAttesa = punti.length < 2;

    let incrementoPercento = null;
    let conteggiato = false;
    if (!inAttesa) {
      incrementoPercento = ((attuale.carico - iniziale.carico) / iniziale.carico) * 100;
      conteggiato = attuale.ripetizioni >= iniziale.ripetizioni;
    }

    esercizi.push({
      esercizioId, punti, iniziale, attuale, incrementoPercento, conteggiato, inAttesa,
      sedutaId: attuale.sedutaId,
    });
  });

  const conteggiabili = esercizi.filter((e) => !e.inAttesa && e.conteggiato);
  const media = conteggiabili.length
    ? conteggiabili.reduce((acc, e) => acc + e.incrementoPercento, 0) / conteggiabili.length
    : null;

  return { esercizi, media, inAttesa: esercizi.filter((e) => e.inAttesa).length };
}

/* ---------- risoluzione nomi (esercizio, seduta) dai piani -------- */

async function costruisciMappe() {
  const idx = await piani.indice();
  const tuttiIPiani = await Promise.all(idx.allenamento.map((r) => piani.piano(r)));
  const nomiEsercizi = new Map();
  const nomiSedute = new Map();
  tuttiIPiani.forEach((p) => {
    (p.sedute || []).forEach((sed) => {
      if (!nomiSedute.has(sed.id)) nomiSedute.set(sed.id, sed.nome);
      (sed.esercizi || []).forEach((es) => {
        if (!nomiEsercizi.has(es.id)) nomiEsercizi.set(es.id, es.nome);
      });
    });
  });
  return { nomiEsercizi, nomiSedute };
}

/* ---------- vista: elenco (media + esercizi + aggregati) ---------- */

function vistaVuota() {
  return h('div.vuoto', [
    h('p.nota', 'Qui compaiono i carichi appena registri il primo allenamento.'),
    h('a.btn', { href: '#/oggi' }, 'Vai a oggi'),
  ]);
}

function vistaElenco({ esercizi, media }, nomiEsercizi, nomiSedute, elenco, st, onSeleziona) {
  const nodi = [bloccoMedia(media, elenco, st)];
  if (esercizi.length) {
    nodi.push(listaEsercizi(esercizi, nomiEsercizi, onSeleziona));
    const aggregati = bloccoPerSeduta(esercizi, nomiSedute);
    if (aggregati) nodi.push(aggregati);
  }
  return nodi;
}

function bloccoMedia(media, elenco, st) {
  if (media == null) {
    const pianoMon = elenco.find((p) => p.monitorata);
    const righe = [h('p.nota', 'I numeri di progresso partono dalla Fase 2.')];
    if (pianoMon && !(st.riferimento && st.riferimento.monitorata)) {
      righe.push(h('p.nota', `Comincia alla settimana ${pianoMon.settimanaDa}.`));
    }
    return h('div.vuoto', righe);
  }
  return h('div.blocco.blocco-pieno', [
    h('p.cifra.cifra-xl', percento(media)),
    h('p.occhiello', { style: 'margin-top:4px' }, "dall'inizio della fase monitorata"),
  ]);
}

function listaEsercizi(esercizi, nomiEsercizi, onSeleziona) {
  const ordinati = [...esercizi].sort((a, b) => {
    if (a.inAttesa && b.inAttesa) return 0;
    if (a.inAttesa) return 1;
    if (b.inAttesa) return -1;
    return b.incrementoPercento - a.incrementoPercento;
  });

  return h('ul.lista', ordinati.map((e) => {
    const nome = nomiEsercizi.get(e.esercizioId) || e.esercizioId;

    if (e.inAttesa) {
      return h('li', [h('button.pro-riga', { onclick: () => onSeleziona(e.esercizioId) }, [
        h('span.cresci', [
          h('div', nome),
          h('p.nota', `${peso(e.iniziale.carico)} kg`),
        ]),
        h('span.spento', 'in attesa'),
      ])]);
    }

    let classeColore = 'spento';
    if (e.conteggiato) {
      if (e.incrementoPercento > 0) classeColore = 'verde';
      else if (e.incrementoPercento < 0) classeColore = 'rosso';
    }

    return h('li', [h('button.pro-riga', { onclick: () => onSeleziona(e.esercizioId) }, [
      h('span.cresci', [
        h('div', nome),
        h('p.nota', `${peso(e.iniziale.carico)} → ${peso(e.attuale.carico)} kg`),
        !e.conteggiato
          ? h('p.nota', `non a pari ripetizioni · ${e.iniziale.ripetizioni} → ${e.attuale.ripetizioni} rip`)
          : null,
      ]),
      h(`span.${classeColore}`, percento(e.incrementoPercento)),
    ])]);
  }));
}

function bloccoPerSeduta(esercizi, nomiSedute) {
  const conteggiabili = esercizi.filter((e) => !e.inAttesa && e.conteggiato);
  if (!conteggiabili.length) return null;

  const gruppi = new Map();
  conteggiabili.forEach((e) => {
    if (!gruppi.has(e.sedutaId)) gruppi.set(e.sedutaId, []);
    gruppi.get(e.sedutaId).push(e.incrementoPercento);
  });

  const righe = [...gruppi.entries()].map(([sedutaId, valori]) => {
    const media = valori.reduce((a, b) => a + b, 0) / valori.length;
    return h('li', [
      h('span.cresci', nomiSedute.get(sedutaId) || sedutaId),
      h('span.mono', percento(media)),
    ]);
  });

  return h('details.piega', [
    h('summary', 'Per seduta'),
    h('div.corpo', [h('ul.lista', righe)]),
  ]);
}

/* ---------- vista: dettaglio esercizio ---------------------------- */

function vistaDettaglio(e, serieGrezze, nomiEsercizi, onIndietro) {
  const nome = nomiEsercizi.get(e.esercizioId) || e.esercizioId;

  const righeIncremento = e.inAttesa
    ? [h('p.nota', 'In attesa di una seconda registrazione.')]
    : [h(`p.cifra.cifra-s.${e.conteggiato ? (e.incrementoPercento > 0 ? 'verde' : e.incrementoPercento < 0 ? 'rosso' : 'spento') : 'spento'}`,
      percento(e.incrementoPercento)),
    !e.conteggiato
      ? h('p.nota', `Non a pari ripetizioni: ${e.iniziale.ripetizioni} → ${e.attuale.ripetizioni} rip.`)
      : null];

  const blocco = h('div.blocco', [
    h('div.riga-sp', [
      h('div', [
        h('p.occhiello', 'Iniziale'),
        h('p.titolo-2', `${peso(e.iniziale.carico)} kg`),
        h('p.nota', `${e.iniziale.ripetizioni} rip · ${formattaDataBreve(e.iniziale.data)}`),
      ]),
      h('div', { style: 'text-align:right' }, [
        h('p.occhiello', 'Attuale'),
        h('p.titolo-2', `${peso(e.attuale.carico)} kg`),
        h('p.nota', `${e.attuale.ripetizioni} rip · ${formattaDataBreve(e.attuale.data)}`),
      ]),
    ]),
    h('hr.sep', { style: 'margin:12px 0' }),
    ...righeIncremento,
  ]);

  return [
    h('button.btn.btn-s', { onclick: onIndietro }, '← Indietro'),
    h('h2.titolo-2', { style: 'margin-top:12px' }, nome),
    blocco,
    graficoSvg(e.punti),
    storicoEsercizio(e.esercizioId, serieGrezze),
  ];
}

function graficoSvg(punti) {
  if (punti.length < 2) {
    const p = punti[0];
    return h('p.nota', { style: 'margin-top:4px' },
      `Un solo punto: ${peso(p.carico)} kg il ${formattaDataBreve(p.data)}.`);
  }

  const W = 320;
  const H = 120;
  const PAD_S = 30; // sinistra, per le etichette del carico
  const PAD_D = 8;
  const PAD_A = 12;
  const PAD_B = 12;
  const RIGA_DATE = 20; // striscia sotto per le etichette delle date

  const carichi = punti.map((p) => p.carico);
  const min = Math.min(...carichi);
  const max = Math.max(...carichi);
  const scala = max === min ? 0 : (H - PAD_A - PAD_B) / (max - min);

  const coordX = (i) => PAD_S + (i * (W - PAD_S - PAD_D)) / (punti.length - 1);
  const coordY = (v) => (max === min ? H - PAD_B - (H - PAD_A - PAD_B) / 2 : H - PAD_B - (v - min) * scala);

  const percorso = punti.map((p, i) => `${i === 0 ? 'M' : 'L'} ${coordX(i).toFixed(1)} ${coordY(p.carico).toFixed(1)}`).join(' ');

  const lato = 6;
  const quadrati = punti.map((p, i) => {
    const x = coordX(i);
    const y = coordY(p.carico);
    return `<rect x="${(x - lato / 2).toFixed(1)}" y="${(y - lato / 2).toFixed(1)}" width="${lato}" height="${lato}" fill="currentColor" />`;
  }).join('');

  const svg = `<svg viewBox="0 0 ${W} ${H + RIGA_DATE}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:160px">
    <text x="0" y="${(coordY(max) + 3).toFixed(1)}" font-size="10" fill="currentColor">${peso(max)}</text>
    <text x="0" y="${(coordY(min) + 3).toFixed(1)}" font-size="10" fill="currentColor">${peso(min)}</text>
    <path d="${percorso}" stroke="currentColor" fill="none" stroke-width="2" />
    ${quadrati}
    <text x="${PAD_S}" y="${H + 15}" font-size="10" fill="currentColor">${formattaDataBreve(punti[0].data)}</text>
    <text x="${W - PAD_D}" y="${H + 15}" font-size="10" text-anchor="end" fill="currentColor">${formattaDataBreve(punti[punti.length - 1].data)}</text>
  </svg>`;

  return h('div', { html: svg });
}

function storicoEsercizio(esercizioId, serieGrezze) {
  const serieEs = serieGrezze.filter((s) => s.esercizioId === esercizioId);
  const perData = new Map();
  serieEs.forEach((s) => {
    if (!perData.has(s.data)) perData.set(s.data, []);
    perData.get(s.data).push(s);
  });
  const date = [...perData.keys()].sort().reverse();

  return h('div', { style: 'margin-top:14px' }, [
    h('p.occhiello', { style: 'margin-bottom:6px' }, 'Storico'),
    ...date.map((data) => {
      const voci = [...perData.get(data)].sort((a, b) => (a.indice ?? 0) - (b.indice ?? 0));
      return h('div.pila-s', { style: 'margin-bottom:12px' }, [
        h('p.nota', formattaDataBreve(data)),
        h('ul.lista', voci.map((s) => h('li', { class: s.monitorata ? null : 'spento' }, [
          h('span.cresci', `${peso(s.carico)} × ${s.ripetizioni ?? '–'}`),
          !s.monitorata ? h('span.nota', 'avvicinamento') : null,
        ]))),
      ]);
    }),
  ]);
}

function formattaDataBreve(dataIso) {
  const d = daIso(dataIso);
  return `${d.getDate()} ${mesiBrevi[d.getMonth()]}`;
}

/* ---------- stile locale --------------------------------- */
/* app.css non si tocca: quel che manca vive qui, con classi pro-. */

const STILE = `
.pro-riga {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  width: 100%; min-height: var(--tap);
  background: none; border: 0; margin: 0; padding: 0;
  font: inherit; color: inherit; text-align: left; cursor: pointer;
}
`;

function iniettaStile() {
  if (document.getElementById('stile-progressi')) return;
  const s = document.createElement('style');
  s.id = 'stile-progressi';
  s.textContent = STILE;
  document.head.append(s);
}
