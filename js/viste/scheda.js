/* scheda.js — la scheda di allenamento in lettura: si consulta a casa o tra
   una serie e l'altra. Non registra niente — la registrazione è in sessione.js. */

import { h, metti, durata, modifica, bottoneModifica } from '../ui.js';
import * as piani from '../piani.js';
import * as store from '../store.js';
import * as personalizza from '../personalizza.js';

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

  /* Quali fisarmoniche sono aperte: si ridisegna a ogni rinomina e senza
     questo insieme si richiuderebbe tutto sotto le mani. */
  const aperte = new Set(
    (piano.sedute || [])
      .filter((s) => !archiviato && s.giorno === st.giorno)
      .map((s) => s.id),
  );

  const barraModifica = h('div.riga-sp.sch-barra');
  const contenitoreSedute = h('div.pila');
  schermata.append(barraModifica, contenitoreSedute);

  let inModifica = false;

  function disegnaSedute() {
    metti(barraModifica, archiviato ? [] : [
      h('p.occhiello', inModifica ? 'Tocca ✎ per cambiare un nome' : 'Sedute della settimana'),
      h('button.btn.btn-s', {
        type: 'button',
        onclick: () => { inModifica = !inModifica; disegnaSedute(); },
      }, inModifica ? 'Fine' : 'Modifica nomi'),
    ]);

    metti(contenitoreSedute, (piano.sedute || []).map((seduta) => bloccoSeduta(seduta, {
      oggi: !archiviato && seduta.giorno === st.giorno,
      aperta: aperte.has(seduta.id),
      onApri: (apri) => { if (apri) aperte.add(seduta.id); else aperte.delete(seduta.id); },
      settimanaFase,
      profilo,
      mostraInizio: !archiviato,
      inModifica: inModifica && !archiviato,
      onRinomina: rinomina,
    })));
  }

  /** Cambia solo il nome mostrato: l'id dell'esercizio, e con lui tutto lo
      storico dei carichi, non si tocca mai. */
  async function rinomina(esercizio, nuovoNome) {
    const originale = esercizio.nomeOriginale || esercizio.nome;
    const nome = String(nuovoNome || '').trim();
    await personalizza.scrivi(
      personalizza.chiaveEsercizio(esercizio.id),
      nome && nome !== originale ? { nome } : null,
    );
    piano = await piani.piano(riferimento);
    disegnaSedute();
  }

  disegnaSedute();

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

function bloccoSeduta(seduta, opzioni) {
  const {
    oggi, aperta, onApri, settimanaFase, profilo, mostraInizio,
  } = opzioni;
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
    elencoEsercizi(seduta.esercizi, settimanaFase, profilo, opzioni),
    bloccoFase('Scarico', seduta.scarico),
    mostraInizio ? h('a.btn.btn-primo', { href: `#/sessione/${seduta.id}`, style: 'margin-top:8px' },
      oggi ? 'Inizia allenamento' : 'Inizia questa seduta') : null,
  ].filter(Boolean));

  return h(oggi ? 'details.piega.sch-oggi' : 'details.piega', {
    open: aperta ?? oggi,
    ontoggle: (ev) => onApri?.(ev.target.open),
  }, [summary, corpo]);
}

function bloccoFase(etichetta, fase) {
  if (!fase) return null;
  return h('div', { style: 'margin-bottom:14px' }, [
    h('p.occhiello', `${etichetta} · ${fase.minuti} minuti`),
    h('ul.sch-punti', { style: 'margin-top:6px' }, (fase.voci || []).map((v) => h('li', v))),
  ]);
}

/** L'ol degli esercizi, con le superserie raggruppate visivamente. */
function elencoEsercizi(esercizi, settimanaFase, profilo, opzioni) {
  const gruppi = raggruppaSuperserie(esercizi || []);
  const voci = [];
  gruppi.forEach((gruppo) => {
    const inSuperserie = gruppo.length > 1;
    gruppo.forEach((e, i) => {
      voci.push(elementoEsercizio(
        e, settimanaFase, profilo, inSuperserie, i === 0, i === gruppo.length - 1, opzioni,
      ));
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

function elementoEsercizio(e, settimanaFase, profilo, inSuperserie, primo, ultimo, opzioni = {}) {
  const n = piani.serieDi(e, settimanaFase);
  const vuoto = n === 0;

  const corpo = [];
  if (inSuperserie && primo) corpo.push(h('p.occhiello', 'Superserie'));
  corpo.push(h('div.sch-nome', [
    h('span', e.nome),
    e.gruppo ? h('span.tag', piani.nomeGruppo(e.gruppo)) : null,
  ].filter(Boolean)));
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

  const li = h(sel, [h('span.cresci', corpo)]);
  if (opzioni.inModifica && opzioni.onRinomina) {
    li.append(bottoneModifica(
      () => apriModificaEsercizio(li, e, opzioni.onRinomina),
      `Cambia il nome di ${e.nome}`,
    ));
  }
  return li;
}

/** Sostituisce il contenuto della riga con il riquadro di modifica, e lo
    rimette com'era se si annulla. */
function apriModificaEsercizio(li, e, onRinomina) {
  const originale = e.nomeOriginale || e.nome;
  const comEra = [...li.childNodes];
  const chiudi = () => li.replaceChildren(...comEra);

  const azioni = e.personalizzato
    ? [{ etichetta: 'Rimetti quello del piano', onClick: () => onRinomina(e, originale) }]
    : [];

  li.replaceChildren(h('span.cresci', [modifica({
    campi: [{ chiave: 'nome', etichetta: 'Nome dell’esercizio', valore: e.nome }],
    nota: e.personalizzato ? `Nel piano si chiama “${originale}”.` : null,
    azioni,
    onSalva: (v) => onRinomina(e, v.nome),
    onAnnulla: chiudi,
  })]));
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
