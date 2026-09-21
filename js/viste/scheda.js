/* scheda.js — la scheda di allenamento in lettura: si consulta a casa o tra
   una serie e l'altra. Non registra niente — la registrazione è in sessione.js. */

import { h, durata } from '../ui.js';
import * as piani from '../piani.js';
import * as store from '../store.js';

const GIORNI = ['', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];

export async function monta(contenitore, parametri) {
  iniettaStile();

  const idRichiesto = parametri && parametri[0] ? parametri[0] : null;
  const [st, profilo, idx] = await Promise.all([
    piani.stato(), store.leggi('profilo'), piani.indice(),
  ]);

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
      'Piano archiviato, in sola lettura. ',
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

  schermata.append(rigaStato(riferimento));

  const regole = bloccoRegole(piano);
  if (regole) schermata.append(regole);

  /* --- le quattro sedute ------------------------------------ */

  const settimanaFase = settimanaNellaFaseEff(riferimento, st.settimana);

  (piano.sedute || []).forEach((seduta) => {
    const oggi = !archiviato && seduta.giorno === st.giorno;
    schermata.append(bloccoSeduta(seduta, { oggi, settimanaFase, profilo }));
  });

  /* --- altri piani -------------------------------------------- */

  const altri = await bloccoAltriPiani();
  if (altri) schermata.append(altri);
}

/* ---------- pezzi --------------------------------------- */

function rigaStato(riferimento) {
  return h('div.blocco.blocco-quieto', [
    h('div.riga-sp', [
      h('p.titolo-2', riferimento.nome),
      h('p.nota', `Settimane ${riferimento.settimanaDa}–${riferimento.settimanaA}`),
    ]),
    h('p.nota', { style: 'margin-top:6px' },
      riferimento.monitorata
        ? 'Fase monitorata: i carichi registrati entrano nei calcoli di progressione.'
        : 'I carichi si annotano ma non entrano nei calcoli.'),
  ]);
}

function bloccoRegole(piano) {
  const regole = piano.regole || [];
  if (!regole.length && !piano.progressione) return null;

  return h('details.piega', [
    h('summary', 'Regole della fase'),
    h('div.corpo', [
      regole.length ? h('ul.sch-punti', regole.map((r) => h('li', r))) : null,
      piano.progressione
        ? h('p.nota', { style: 'margin-top:10px' }, piano.progressione.descrizione)
        : null,
    ].filter(Boolean)),
  ]);
}

function bloccoSeduta(seduta, { oggi, settimanaFase, profilo }) {
  const giornoNome = GIORNI[seduta.giorno] || '';

  const summary = h('summary', [
    h('div', [
      h('p.occhiello', giornoNome + (oggi ? ' · oggi' : '')),
      h('p.titolo-2', seduta.nome),
      seduta.sottotitolo ? h('p.nota', { style: 'margin-top:2px' }, seduta.sottotitolo) : null,
    ]),
  ]);

  const corpo = h('div.corpo', [
    bloccoFase('Riscaldamento', seduta.riscaldamento),
    elencoEsercizi(seduta.esercizi, settimanaFase, profilo),
    bloccoFase('Scarico', seduta.scarico),
    oggi ? h('a.btn.btn-primo', { href: `#/sessione/${seduta.id}`, style: 'margin-top:8px' },
      'Inizia allenamento') : null,
  ].filter(Boolean));

  return h(oggi ? 'details.piega.sch-oggi' : 'details.piega', { open: oggi }, [summary, corpo]);
}

function bloccoFase(etichetta, fase) {
  if (!fase) return null;
  return h('div', { style: 'margin-bottom:14px' }, [
    h('p.occhiello', `${etichetta} · ${fase.minuti} minuti`),
    h('ul.sch-punti', { style: 'margin-top:6px' }, (fase.voci || []).map((v) => h('li', v))),
  ]);
}

/** L'ol degli esercizi, con le superserie raggruppate visivamente. */
function elencoEsercizi(esercizi, settimanaFase, profilo) {
  const gruppi = raggruppaSuperserie(esercizi || []);
  const voci = [];
  gruppi.forEach((gruppo) => {
    const inSuperserie = gruppo.length > 1;
    gruppo.forEach((e, i) => {
      voci.push(elementoEsercizio(e, settimanaFase, profilo, inSuperserie, i === 0, i === gruppo.length - 1));
    });
  });
  return h('ol.lista.lista-num', { style: 'margin:10px 0' }, voci);
}

/** Esercizi consecutivi con lo stesso valore di `superserie` finiscono nello stesso gruppo. */
function raggruppaSuperserie(esercizi) {
  const gruppi = [];
  let i = 0;
  while (i < esercizi.length) {
    const e = esercizi[i];
    if (e.superserie != null) {
      const gruppo = [e];
      let j = i + 1;
      while (j < esercizi.length && esercizi[j].superserie === e.superserie) {
        gruppo.push(esercizi[j]);
        j += 1;
      }
      gruppi.push(gruppo);
      i = j;
    } else {
      gruppi.push([e]);
      i += 1;
    }
  }
  return gruppi;
}

function elementoEsercizio(e, settimanaFase, profilo, inSuperserie, primo, ultimo) {
  const n = piani.serieDi(e, settimanaFase);
  const vuoto = n === 0;

  const corpo = [];
  if (inSuperserie && primo) corpo.push(h('p.occhiello', 'Superserie'));
  corpo.push(h('div', e.nome));
  if (e.varianteFacile && profilo === 'corinna') {
    corpo.push(h('p.sch-variante', `Variante: ${e.varianteFacile}`));
  }

  let nota;
  if (vuoto) {
    const ingresso = settimanaIngresso(e);
    nota = ingresso ? `Entra dalla settimana ${ingresso}` : 'Non prevista questa settimana';
  } else {
    nota = `${n} × ${e.rip}`;
    const mostraRecupero = (!inSuperserie || ultimo) && e.recuperoSec;
    if (mostraRecupero) nota += ` · rec ${durata(e.recuperoSec)}`;
  }
  corpo.push(h('p.nota', nota));
  if (e.note) corpo.push(h('p.nota', e.note));

  let sel = 'li';
  if (vuoto) sel += '.spento';
  if (inSuperserie) {
    sel += '.sch-ss';
    if (primo) sel += '.sch-ss-primo';
    if (ultimo) sel += '.sch-ss-ultimo';
  }

  return h(sel, [h('span.cresci', corpo)]);
}

/** Da quale settimana della fase un esercizio a serie:0 comincia a comparire. */
function settimanaIngresso(esercizio) {
  const scala = esercizio.serieDaSettimana;
  if (!scala) return null;
  const voci = Object.entries(scala)
    .map(([k, v]) => [Number(k), v])
    .sort((a, b) => a[0] - b[0]);
  const trovata = voci.find(([, v]) => v > 0);
  return trovata ? trovata[0] : null;
}

/** Settimana nella fase per il piano mostrato: se manca la data di inizio,
    o si guarda un piano archiviato fuori dal suo intervallo, resta 1. */
function settimanaNellaFaseEff(riferimento, settimanaAssoluta) {
  if (!riferimento) return 1;
  const totale = riferimento.settimanaA - riferimento.settimanaDa + 1;
  if (settimanaAssoluta == null) return 1;
  const n = settimanaAssoluta - riferimento.settimanaDa + 1;
  return Math.min(Math.max(n, 1), totale);
}

async function bloccoAltriPiani() {
  const elenco = await piani.elencoPiani();
  const altri = elenco.filter((p) => !p.attivo);
  if (!altri.length) return null;

  return h('details.piega', [
    h('summary', 'Altri piani'),
    h('div.corpo', altri.map((p) => h('a.sch-riga-piano', { href: `#/scheda/${p.id}` }, [
      h('span.cresci', [
        h('div', p.nome),
        h('p.nota', `Settimane ${p.settimanaDa}–${p.settimanaA}`),
      ]),
      h('span.nota', p.passato ? 'passato' : (p.futuro ? 'in arrivo' : '')),
    ]))),
  ]);
}

/* ---------- stile locale --------------------------------- */
/* app.css non si tocca: quel che manca vive qui, con classi sch-. */

const STILE = `
.sch-badge { border: var(--bordo) solid var(--linea); padding: 4px 10px; white-space: nowrap; }
.sch-punti { list-style: disc; margin: 0; padding-left: 20px; display: grid; gap: 6px; font-size: 15px; }
.sch-punti > li { padding: 0; }
details.piega.sch-oggi { border-width: var(--bordo-xl); }
details.piega.sch-oggi > summary { background: var(--ink); color: var(--paper); }
li.sch-ss { border-left: var(--bordo-xl) solid var(--linea); padding-left: 10px; margin-left: -2px; }
li.sch-ss:not(.sch-ss-ultimo) { border-bottom: 0; padding-bottom: 2px; }
.sch-variante { font-size: 13px; color: var(--ink-2); margin: 2px 0 0; }
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
