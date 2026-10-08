/* progressi.js — quanto si è cresciuti, esercizio per esercizio: il volume
   (carico × ripetizioni, tutte le serie) e il carico massimo sollevato.
   Due sotto-schede: Carichi (qui) e Foto (in foto.js, montata a parte).
   In cima, di chi: Giuseppe o Corinna. Tutte e due le sotto-schede leggono i
   dati della persona in vista (store.personaVista), e la scelta resta. */

import {
  h, metti, peso, percento, daIso, mesiBrevi, conferma, scelta,
} from '../ui.js';
import * as piani from '../piani.js';
import * as store from '../store.js';

export async function monta(contenitore, parametri) {
  iniettaStile();

  const vistaIniziale = parametri && parametri[0] === 'foto' ? 'foto' : 'carichi';

  const elenco = await piani.elencoPiani();
  const pianoAttivo = elenco.find((p) => p.attivo) || null;

  const testata = h('header.testata', [
    h('div', [
      h('p.occhiello', pianoAttivo ? pianoAttivo.nome : 'Progressi'),
      h('h1.titolo', 'Progressi'),
    ]),
  ]);

  // Sotto-schede e corpo vivono in .schermata, come ogni altra vista (16px
  // di margine): prima toccavano i bordi perché erano appesi a #app.
  const schermata = h('div.schermata');
  const zonaChi = h('div', { style: 'margin-bottom:12px' });
  const schede = h('div.schede', { role: 'tablist' });
  const corpo = h('div');
  schermata.append(zonaChi, schede, corpo);
  contenitore.append(testata, schermata);

  async function disegnaChi() {
    const chi = await store.personaVista();
    metti(zonaChi, h('p.occhiello', { style: 'margin-bottom:6px' }, 'Di chi'), scelta(
      store.PERSONE.map((p) => ({ valore: p, etichetta: store.nomePersona(p) })),
      chi,
      async (v) => {
        await store.scrivi('personaVista', v);
        await disegnaChi();
        const ora = attivo;
        if (ora === 'foto' && typeof smontaFoto === 'function') smontaFoto();
        smontaFoto = null;
        attivo = null;
        await cambia(ora || 'carichi');
      },
      'Di chi sono i progressi',
    ));
  }
  await disegnaChi();

  const btnCarichi = h('button', {
    role: 'tab', 'aria-selected': String(vistaIniziale === 'carichi'), onclick: () => cambia('carichi'),
  }, 'Carichi');
  const btnFoto = h('button', {
    role: 'tab', 'aria-selected': String(vistaIniziale === 'foto'), onclick: () => cambia('foto'),
  }, 'Foto');
  schede.append(btnCarichi, btnFoto);

  let attivo = null;
  let smontaFoto = null;

  async function cambia(nome) {
    if (nome === attivo) return;
    if (attivo === 'foto' && typeof smontaFoto === 'function') smontaFoto();
    smontaFoto = null;
    attivo = nome;

    btnCarichi.setAttribute('aria-selected', String(nome === 'carichi'));
    btnFoto.setAttribute('aria-selected', String(nome === 'foto'));
    corpo.replaceChildren();

    // La rotta #/progressi/foto esiste già: si tiene l'hash allineato alla
    // sotto-scheda mostrata (pushState, non tocca il router) così il tasto
    // Indietro e un ricaricamento restano dentro Progressi.
    const percorso = nome === 'foto' ? '#/progressi/foto' : '#/progressi';
    if (location.hash !== percorso) history.pushState(null, '', percorso);

    if (nome === 'carichi') await corpoCarichi(corpo);
    else smontaFoto = await montaFoto(corpo);
  }

  function alPopstate() {
    const parti = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    if (parti[0] !== 'progressi') return; // si è navigato altrove, non tocca a noi
    cambia(parti[1] === 'foto' ? 'foto' : 'carichi');
  }
  window.addEventListener('popstate', alPopstate);
  osservaSmontaggio(contenitore, () => {
    window.removeEventListener('popstate', alPopstate);
    if (attivo === 'foto' && typeof smontaFoto === 'function') smontaFoto();
  });

  await cambia(vistaIniziale);
}

async function montaFoto(dove) {
  try {
    const m = await import('./foto.js');
    // foto.js sta imparando a restituire una funzione di smontaggio (per
    // liberare gli ObjectURL delle foto): finché non ce l'ha, torna undefined.
    return await m.corpo(dove);
  } catch (e) {
    console.error(e);
    metti(dove, h('div.vuoto', [h('p.nota', 'Le foto non sono disponibili.')]));
    return null;
  }
}

/** Osserva la disconnessione dal DOM di un contenitore, per liberare
    ascoltatori quando si esce da Progressi (stesso schema di foto.js). */
function osservaSmontaggio(contenitore, alSmontaggio) {
  const oss = new MutationObserver(() => {
    if (!contenitore.isConnected) {
      oss.disconnect();
      alSmontaggio();
    }
  });
  oss.observe(document.body, { childList: true, subtree: true });
  return oss;
}

/** Disegna solo il contenuto "Carichi", senza testata. Il contenitore deve
    già stare dentro una .schermata (lo fa monta()). Riusabile da fuori. */
export async function corpoCarichi(contenitore) {
  iniettaStile();

  let [serieGrezze, elenco, st, monitorati] = await Promise.all([
    store.tutteLeSerie(), piani.elencoPiani(), piani.stato(), piani.pianiMonitorati(),
  ]);
  const conta = (s) => contaNeiCalcoli(s, monitorati);

  if (!serieGrezze.length) {
    metti(contenitore, vistaVuota());
    return;
  }

  const { nomiEsercizi, nomiSedute, gruppiEsercizi } = await costruisciMappe();
  let calcolo = calcolaIncrementi(serieGrezze, monitorati);

  let selezionato = null;
  let gruppoScelto = null;

  async function ricarica() {
    serieGrezze = await store.tutteLeSerie();
    calcolo = calcolaIncrementi(serieGrezze, monitorati);
  }

  /** Cancellazione definitiva di una serie sbagliata: l'unico modo, prima
      di questa correzione, era "Cancella tutto" in Altro. */
  async function eliminaSerieRiga(s) {
    const testo = `Eliminare la serie del ${formattaDataBreve(s.data)} `
      + `(${peso(s.carico)} × ${s.ripetizioni ?? '–'})? Non si può recuperare.`;
    if (!conferma(testo)) return;
    await store.eliminaSerie(s.id);
    await ricarica();
    disegna();
  }

  const disegna = () => {
    if (!serieGrezze.length) {
      metti(contenitore, vistaVuota());
      return;
    }
    if (selezionato) {
      const e = calcolo.esercizi.find((x) => x.esercizioId === selezionato);
      if (!e) { selezionato = null; disegna(); return; }
      metti(contenitore, vistaDettaglio(e, serieGrezze, nomiEsercizi, () => {
        selezionato = null;
        disegna();
      }, eliminaSerieRiga, conta));
    } else {
      metti(contenitore, vistaElenco(calcolo, {
        nomiEsercizi,
        nomiSedute,
        gruppiEsercizi,
        elenco,
        st,
        gruppoScelto,
        onSeleziona: (id) => { selezionato = id; disegna(); },
        onGruppo: (g) => { gruppoScelto = g; disegna(); },
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
 * Da tutte le serie registrate, i progressi per esercizio. Dal 08/10/2026 si
 * misurano in **volume**, non più col carico a ripetizioni fisse.
 *   - Solo serie che contano (vedi contaNeiCalcoli), carico finito > 0,
 *     ripetizioni finite > 0.
 *   - `monitorati` è l'insieme degli id dei piani monitorati: senza, decide il
 *     flag `monitorata` scritto sulla serie.
 *   - Per ogni data, il volume è la somma di carico × ripetizioni di tutte le
 *     serie di quel giorno su quell'esercizio: 24 kg × 12 + 26 kg × 10 = 548.
 *     Più carico, più ripetizioni o più serie: il volume sale.
 *   - Incremento = (volume attuale - volume iniziale) / volume iniziale * 100,
 *     tra prima e ultima data.
 *   - In parallelo il **massimo**: il carico più alto mai sollevato, con le sue
 *     ripetizioni e il giorno della prima volta. A pari carico vince chi ha
 *     fatto più ripetizioni.
 *   - Un esercizio con una sola data è "in attesa": nessun incremento ancora.
 *
 * Ritorna { esercizi, media, inAttesa }.
 *   esercizi: [{ esercizioId, punti, iniziale, attuale, incrementoPercento,
 *                massimo, massimoNuovo, inAttesa, sedutaId }]
 *   punti: [{ data, volume, serie, carico, ripetizioni, sedutaId }] ordinati per
 *          data; `carico` e `ripetizioni` sono quelli della serie più pesante
 *   massimo: { carico, ripetizioni, data }
 *   massimoNuovo: il massimo è stato superato l'ultima volta
 *   media: media semplice degli incrementi, o null se nessuno
 *   inAttesa: quanti esercizi hanno una sola data
 */
export function calcolaIncrementi(serie, monitorati = null) {
  const valide = (serie || []).filter((s) => (
    s && contaNeiCalcoli(s, monitorati)
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
      const volume = +delGiorno.reduce((t, s) => t + s.carico * s.ripetizioni, 0).toFixed(2);
      return {
        data, volume, serie: delGiorno.length, carico: caricoMax, ripetizioni: ripMax, sedutaId: delGiorno[0].sedutaId,
      };
    });

    const iniziale = punti[0];
    const attuale = punti[punti.length - 1];
    const inAttesa = punti.length < 2;
    const incrementoPercento = inAttesa ? null : ((attuale.volume - iniziale.volume) / iniziale.volume) * 100;

    // Il primo giorno in cui si è arrivati al carico più alto, con più ripetizioni.
    const meglio = (a, b) => b.carico > a.carico || (b.carico === a.carico && b.ripetizioni > a.ripetizioni);
    const massimo = punti.reduce((m, p) => (meglio(m, p) ? p : m), punti[0]);
    const primaDiOggi = punti.slice(0, -1).reduce((m, p) => (!m || meglio(m, p) ? p : m), null);

    esercizi.push({
      esercizioId,
      punti,
      iniziale,
      attuale,
      incrementoPercento,
      massimo: { carico: massimo.carico, ripetizioni: massimo.ripetizioni, data: massimo.data },
      massimoNuovo: !inAttesa && massimo === attuale && meglio(primaDiOggi, attuale),
      inAttesa,
      sedutaId: attuale.sedutaId,
    });
  });

  const contati = esercizi.filter((e) => !e.inAttesa);
  const media = contati.length
    ? contati.reduce((acc, e) => acc + e.incrementoPercento, 0) / contati.length
    : null;

  return { esercizi, media, inAttesa: esercizi.filter((e) => e.inAttesa).length };
}

/** 1080 -> '1.080'. Il volume si legge a numeri interi. */
export function volume(kg) {
  if (kg == null || Number.isNaN(kg)) return '–';
  return String(Math.round(kg)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Una serie entra nei calcoli se il suo piano è monitorato. Il flag sulla serie
 * vale solo come ripiego: le serie della Fase 1 registrate quando la fase non era
 * monitorata (fino al 23/09/2026) portano `monitorata: false`, ma contano.
 */
export function contaNeiCalcoli(s, monitorati = null) {
  if (monitorati && s.pianoId && monitorati.has(s.pianoId)) return true;
  return s.monitorata === true;
}

/**
 * Media degli incrementi di volume per gruppo muscolare — braccia, gambe, dorso,
 * petto, spalle, addome. È la divisione con cui si guardano i progressi.
 * Entrano gli esercizi fatti almeno due volte, come nella media generale.
 */
export function aggregaPerGruppo(esercizi, gruppi) {
  const conteggiabili = (esercizi || []).filter((e) => !e.inAttesa);

  const per = new Map();
  conteggiabili.forEach((e) => {
    const g = gruppi.get(e.esercizioId) || null;
    if (!per.has(g)) per.set(g, []);
    per.get(g).push(e.incrementoPercento);
  });

  return [...per.entries()]
    .map(([gruppo, valori]) => ({
      gruppo,
      quanti: valori.length,
      media: valori.reduce((a, b) => a + b, 0) / valori.length,
    }))
    .sort((a, b) => piani.ordineGruppo(a.gruppo) - piani.ordineGruppo(b.gruppo));
}

/* ---------- risoluzione nomi e gruppi dai piani ------------------- */

async function costruisciMappe() {
  const idx = await piani.indice();
  const tuttiIPiani = await Promise.all(idx.allenamento.map((r) => piani.piano(r)));
  const nomiEsercizi = new Map();
  const nomiSedute = new Map();
  const gruppiEsercizi = new Map();
  tuttiIPiani.forEach((p) => {
    (p.sedute || []).forEach((sed) => {
      if (!nomiSedute.has(sed.id)) nomiSedute.set(sed.id, sed.nome);
      (sed.esercizi || []).forEach((es) => {
        if (!nomiEsercizi.has(es.id)) nomiEsercizi.set(es.id, es.nome);
        if (es.gruppo && !gruppiEsercizi.has(es.id)) gruppiEsercizi.set(es.id, es.gruppo);
      });
    });
  });
  // Gli esercizi creati dal telefono con Cambia non stanno in nessun piano.
  (await piani.catalogoEsercizi()).forEach((es) => {
    if (!nomiEsercizi.has(es.id)) nomiEsercizi.set(es.id, es.nome);
    if (es.gruppo && !gruppiEsercizi.has(es.id)) gruppiEsercizi.set(es.id, es.gruppo);
  });
  return { nomiEsercizi, nomiSedute, gruppiEsercizi };
}

/* ---------- vista: elenco (media + esercizi + aggregati) ---------- */

function vistaVuota() {
  return h('div.vuoto', [
    h('p.nota', 'Qui compaiono i carichi appena registri il primo allenamento.'),
    h('a.btn', { href: '#/oggi' }, 'Vai a oggi'),
  ]);
}

function vistaElenco({ esercizi, media }, {
  nomiEsercizi, nomiSedute, gruppiEsercizi, elenco, st, gruppoScelto, onSeleziona, onGruppo,
}) {
  const nodi = [bloccoMedia(media, elenco, st)];
  if (!esercizi.length) return nodi;

  const perGruppo = aggregaPerGruppo(esercizi, gruppiEsercizi);
  const bloccoGruppi = bloccoPerGruppo(perGruppo, gruppoScelto, onGruppo);
  if (bloccoGruppi) nodi.push(bloccoGruppi);

  const filtrati = gruppoScelto
    ? esercizi.filter((e) => (gruppiEsercizi.get(e.esercizioId) || null) === gruppoScelto)
    : esercizi;

  if (gruppoScelto) {
    nodi.push(h('p.occhiello', `Solo ${piani.nomeGruppo(gruppoScelto).toLowerCase()}`));
  }
  nodi.push(listaEsercizi(filtrati, nomiEsercizi, onSeleziona));

  const aggregati = bloccoPerSeduta(esercizi, nomiSedute);
  if (aggregati) nodi.push(aggregati);
  return nodi;
}

/** Un gruppo per riga, toccabile: filtra l'elenco degli esercizi sotto. */
function bloccoPerGruppo(righe, gruppoScelto, onGruppo) {
  if (!righe.length) return null;

  return h('div.blocco', [
    h('p.occhiello', 'Per gruppo muscolare'),
    h('ul.lista', { style: 'margin-top:4px' }, righe.map((r) => {
      const scelto = gruppoScelto === r.gruppo;
      let colore = 'spento';
      if (r.media > 0) colore = 'verde';
      else if (r.media < 0) colore = 'rosso';

      return h(scelto ? 'li.pro-gruppo-scelto' : 'li', [
        h('button.pro-riga', {
          onclick: () => onGruppo(scelto ? null : r.gruppo),
          'aria-pressed': String(scelto),
        }, [
          h('span.cresci', [
            h('div', piani.nomeGruppo(r.gruppo)),
            h('p.nota', `${r.quanti} ${r.quanti === 1 ? 'esercizio' : 'esercizi'}`),
          ]),
          h(`span.${colore}`, percento(r.media)),
        ]),
      ]);
    })),
    h('p.nota', { style: 'margin-top:8px' }, gruppoScelto
      ? 'Tocca di nuovo il gruppo per rivedere tutti gli esercizi.'
      : 'Tocca un gruppo per vedere solo i suoi esercizi.'),
  ]);
}

function bloccoMedia(media, elenco, st) {
  if (media == null) {
    const pianoMon = elenco.find((p) => p.monitorata);
    const righe = [h('p.nota', 'La percentuale compare dalla seconda volta che registri un esercizio.')];
    if (pianoMon && !(st.riferimento && st.riferimento.monitorata)) {
      righe.push(h('p.nota', `Comincia alla settimana ${pianoMon.settimanaDa}.`));
    }
    return h('div.vuoto', righe);
  }
  return h('div.blocco.blocco-pieno', [
    h('p.cifra.cifra-xl', percento(media)),
    h('p.occhiello', { style: 'margin-top:4px' }, 'di volume dal primo allenamento'),
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

    const max = h(e.massimoNuovo ? 'p.nota.verde' : 'p.nota',
      `max ${peso(e.massimo.carico)} kg × ${e.massimo.ripetizioni}${e.massimoNuovo ? ' · nuovo' : ''}`);

    if (e.inAttesa) {
      return h('li', [h('button.pro-riga', { onclick: () => onSeleziona(e.esercizioId) }, [
        h('span.cresci', [
          h('div', nome),
          h('p.nota', `volume ${volume(e.iniziale.volume)}`),
          max,
        ]),
        h('span.spento', 'in attesa'),
      ])]);
    }

    let classeColore = 'spento';
    if (e.incrementoPercento > 0) classeColore = 'verde';
    else if (e.incrementoPercento < 0) classeColore = 'rosso';

    return h('li', [h('button.pro-riga', { onclick: () => onSeleziona(e.esercizioId) }, [
      h('span.cresci', [
        h('div', nome),
        h('p.nota', `volume ${volume(e.iniziale.volume)} → ${volume(e.attuale.volume)}`),
        max,
      ]),
      h(`span.${classeColore}`, percento(e.incrementoPercento)),
    ])]);
  }));
}

function bloccoPerSeduta(esercizi, nomiSedute) {
  const conteggiabili = esercizi.filter((e) => !e.inAttesa);
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

function vistaDettaglio(e, serieGrezze, nomiEsercizi, onIndietro, onElimina, conta) {
  const nome = nomiEsercizi.get(e.esercizioId) || e.esercizioId;

  const colore = e.incrementoPercento > 0 ? 'verde' : e.incrementoPercento < 0 ? 'rosso' : 'spento';
  const righeIncremento = e.inAttesa
    ? [h('p.nota', 'In attesa di una seconda registrazione.')]
    : [h(`p.cifra.cifra-s.${colore}`, percento(e.incrementoPercento)), h('p.nota', 'di volume dal primo allenamento')];

  const giorno = (p) => `${p.serie} serie · ${formattaDataBreve(p.data)}`;
  const blocco = h('div.blocco', [
    h('div.riga-sp', [
      h('div', [
        h('p.occhiello', 'Volume iniziale'),
        h('p.titolo-2', volume(e.iniziale.volume)),
        h('p.nota', giorno(e.iniziale)),
      ]),
      h('div', { style: 'text-align:right' }, [
        h('p.occhiello', 'Volume attuale'),
        h('p.titolo-2', volume(e.attuale.volume)),
        h('p.nota', giorno(e.attuale)),
      ]),
    ]),
    h('hr.sep', { style: 'margin:12px 0' }),
    ...righeIncremento,
    h('hr.sep', { style: 'margin:12px 0' }),
    h('p.occhiello', 'Carico massimo'),
    h(e.massimoNuovo ? 'p.titolo-2.verde' : 'p.titolo-2', `${peso(e.massimo.carico)} kg × ${e.massimo.ripetizioni}`),
    h('p.nota', e.massimoNuovo
      ? `Nuovo massimo, ${formattaDataBreve(e.massimo.data)}.`
      : `La prima volta il ${formattaDataBreve(e.massimo.data)}.`),
  ]);

  return [
    h('button.btn.btn-s', { onclick: onIndietro }, '← Indietro'),
    h('h2.titolo-2', { style: 'margin-top:12px' }, nome),
    blocco,
    graficoSvg(e.punti),
    storicoEsercizio(e.esercizioId, serieGrezze, onElimina, conta),
  ];
}

function graficoSvg(punti) {
  if (punti.length < 2) {
    const p = punti[0];
    return h('p.nota', { style: 'margin-top:4px' },
      `Un solo punto: volume ${volume(p.volume)} il ${formattaDataBreve(p.data)}.`);
  }

  const W = 320;
  const H = 120;
  const PAD_S = 34; // sinistra, per le etichette del volume
  const PAD_D = 8;
  const PAD_A = 12;
  const PAD_B = 12;
  const RIGA_DATE = 20; // striscia sotto per le etichette delle date

  const carichi = punti.map((p) => p.volume);
  const min = Math.min(...carichi);
  const max = Math.max(...carichi);
  const scala = max === min ? 0 : (H - PAD_A - PAD_B) / (max - min);

  const coordX = (i) => PAD_S + (i * (W - PAD_S - PAD_D)) / (punti.length - 1);
  const coordY = (v) => (max === min ? H - PAD_B - (H - PAD_A - PAD_B) / 2 : H - PAD_B - (v - min) * scala);

  const percorso = punti.map((p, i) => `${i === 0 ? 'M' : 'L'} ${coordX(i).toFixed(1)} ${coordY(p.volume).toFixed(1)}`).join(' ');

  const lato = 6;
  const quadrati = punti.map((p, i) => {
    const x = coordX(i);
    const y = coordY(p.volume);
    return `<rect x="${(x - lato / 2).toFixed(1)}" y="${(y - lato / 2).toFixed(1)}" width="${lato}" height="${lato}" fill="currentColor" />`;
  }).join('');

  const svg = `<svg viewBox="0 0 ${W} ${H + RIGA_DATE}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:160px">
    <text x="0" y="${(coordY(max) + 3).toFixed(1)}" font-size="10" fill="currentColor">${volume(max)}</text>
    <text x="0" y="${(coordY(min) + 3).toFixed(1)}" font-size="10" fill="currentColor">${volume(min)}</text>
    <path d="${percorso}" stroke="currentColor" fill="none" stroke-width="2" />
    ${quadrati}
    <text x="${PAD_S}" y="${H + 15}" font-size="10" fill="currentColor">${formattaDataBreve(punti[0].data)}</text>
    <text x="${W - PAD_D}" y="${H + 15}" font-size="10" text-anchor="end" fill="currentColor">${formattaDataBreve(punti[punti.length - 1].data)}</text>
  </svg>`;

  return h('div', { html: svg });
}

function storicoEsercizio(esercizioId, serieGrezze, onElimina, conta) {
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
        h('p.nota', `${formattaDataBreve(data)} · volume ${volume(voci
          .filter((s) => conta(s) && s.carico > 0 && s.ripetizioni > 0)
          .reduce((t, s) => t + s.carico * s.ripetizioni, 0))}`),
        h('ul.lista', voci.map((s) => h('li', { class: conta(s) ? null : 'spento' }, [
          h('span.cresci', [
            h('div', `${peso(s.carico)} × ${s.ripetizioni ?? '–'}`),
            s.note ? h('p.nota', s.note) : null,
          ]),
          !conta(s) ? h('span.nota', 'non conteggiata') : null,
          h('button.btn.btn-s.btn-rosso', {
            onclick: () => onElimina(s), 'aria-label': 'Elimina questa serie',
          }, 'Elimina'),
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
.pro-gruppo-scelto { border-left: var(--bordo-xl) solid var(--linea); padding-left: 10px; }
`;

function iniettaStile() {
  if (document.getElementById('stile-progressi')) return;
  const s = document.createElement('style');
  s.id = 'stile-progressi';
  s.textContent = STILE;
  document.head.append(s);
}
