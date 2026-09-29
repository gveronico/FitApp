/* modifica.js — il piano di allenamento, da cambiare dall'app.

   Tutto si salva al tocco di Salva, su questo telefono (piani.js, copie).
   Il canale principale resta Claude, che scrive i piani nel repo: se Claude
   aggiorna un piano che qui è stato cambiato, in cima compare l'avviso e si
   sceglie quale tenere.

   Due cose vivono in posti diversi, e non per caso:
   - nome e gruppo sono dell'esercizio (personalizza.js, legati all'id): valgono
     in ogni piano, ed è sul gruppo che si sommano i progressi;
   - serie, ripetizioni, recupero e il resto sono del piano.

   Rotte
     #/modifica/<idPiano>   modifica quel piano
     #/modifica/nuovo       crea un piano nuovo, vuoto o copiato
   E editor(), che la Scheda monta al suo interno quando si preme Modifica. */

import { h, metti, conferma, durata, tocco } from '../ui.js';
import * as piani from '../piani.js';
import * as store from '../store.js';
import * as personalizza from '../personalizza.js';

const CARICHI = [
  { id: 'esterno', nome: 'Pesi o macchina' },
  { id: 'assistito', nome: 'Assistito (trazioni alla macchina)' },
  { id: 'corpoLibero', nome: 'Corpo libero, con zavorra' },
  { id: 'tempo', nome: 'A tempo (secondi)' },
];

export async function monta(contenitore, parametri) {
  iniettaStile();
  const richiesto = parametri && parametri[0];
  if (richiesto === 'nuovo') {
    await montaNuovo(contenitore);
    return;
  }

  const idx = await piani.indice();
  const st = await piani.stato();
  const riferimento = idx.allenamento.find((r) => r.id === (richiesto || st.riferimento?.id));
  if (!riferimento) {
    contenitore.append(
      h('header.testata', [h('h1.titolo', 'Modifica')]),
      h('div.schermata', [h('div.vuoto', [
        h('p.nota', 'Questo piano non c’è.'),
        h('a.btn', { href: '#/scheda' }, 'Torna alla scheda'),
      ])]),
    );
    return;
  }

  const titolo = h('h1.titolo', riferimento.nome);
  const testata = h('header.testata', [
    h('div.cresci', [h('p.occhiello', 'Modifica piano'), titolo]),
    h('a.btn.btn-s', { href: st.riferimento?.id === riferimento.id ? '#/scheda' : `#/scheda/${riferimento.id}` }, 'Fine'),
  ]);
  const schermata = h('div.schermata');
  contenitore.append(testata, schermata);
  await editor(schermata, riferimento, { onTitolo: (t) => { titolo.textContent = t; } });
}

/**
 * L'editor del piano, dentro un contenitore qualsiasi: la sua schermata, o la
 * Scheda quando si preme Modifica. Il contenitore è suo: lo riscrive a ogni salvataggio.
 */
export async function editor(schermata, riferimento, { onTitolo } = {}) {
  iniettaStile();

  /** Le sedute aperte: si ridisegna dopo ogni salvataggio e non devono richiudersi. */
  const aperte = new Set();
  let piano = null;
  let noti = new Map();

  async function ricarica() {
    await personalizza.carica();
    piano = await piani.pianoGrezzo(riferimento);
    noti = await eserciziNoti();
    await disegna();
  }

  async function salva() {
    await piani.salvaPiano(riferimento, piano);
    tocco();
    await ricarica();
  }

  async function disegna() {
    const [statoCopia, imp] = await Promise.all([piani.statoCopia(riferimento), store.leggiTutte()]);
    onTitolo?.(piano.nome || riferimento.nome);
    const pezzi = [];

    if (statoCopia.repoCambiato) {
      pezzi.push(h('div.fascia.fascia-avviso', [
        h('p', { style: 'margin:0 0 8px' },
          'Claude ha aggiornato questo piano dopo le tue modifiche. Quale tieni?'),
        h('div.btn-riga', [
          h('button.btn.btn-s', {
            type: 'button',
            onclick: async () => {
              if (!conferma('Uso il piano nuovo di Claude: le modifiche fatte qui a serie, ripetizioni ed esercizi si perdono. Nomi e gruppi restano.')) return;
              await piani.ripristinaPiano(riferimento);
              await ricarica();
            },
          }, 'Quello nuovo'),
          h('button.btn.btn-s', {
            type: 'button',
            onclick: async () => { await piani.tieniCopia(riferimento); await ricarica(); },
          }, 'Il mio'),
        ]),
      ]));
    }

    pezzi.push(bloccoPiano(statoCopia, imp));
    (piano.sedute || []).forEach((seduta, i) => pezzi.push(bloccoSeduta(seduta, i)));
    pezzi.push(h('button.btn', {
      type: 'button',
      onclick: async () => {
        const nuova = piani.nuovaSeduta(piano.sedute || []);
        piano.sedute = [...(piano.sedute || []), nuova];
        aperte.add(nuova.id);
        await salva();
      },
    }, '+ Aggiungi una seduta'));
    pezzi.push(h('p.nota',
      'Si salva su questo telefono ed entra nel backup. Lo storico dei carichi non si tocca: '
      + 'ogni esercizio resta legato al suo nome di sempre.'));

    metti(schermata, pezzi);
  }

  /* ---------- il piano ------------------------------------- */

  function bloccoPiano(statoCopia, imp) {
    const campoNome = h('input', { type: 'text', value: piano.nome || '', 'aria-label': 'Nome del piano' });
    const righe = [
      h('p.occhiello', 'Piano'),
      h('label.campo', [h('span.nota', 'Nome'), campoNome]),
    ];
    campoNome.addEventListener('change', async () => {
      const nome = campoNome.value.trim();
      if (!nome || nome === piano.nome) return;
      piano.nome = nome;
      await salva();
    });

    if (riferimento.locale) {
      const da = h('input', { type: 'number', inputmode: 'numeric', min: '1', value: String(riferimento.settimanaDa) });
      const a = h('input', { type: 'number', inputmode: 'numeric', min: '1', value: String(riferimento.settimanaA) });
      const salvaSettimane = async () => {
        const nDa = Math.max(1, parseInt(da.value, 10) || 1);
        const nA = Math.max(nDa, parseInt(a.value, 10) || nDa);
        await piani.salvaMeta(riferimento, { settimanaDa: nDa, settimanaA: nA });
        riferimento.settimanaDa = nDa;
        riferimento.settimanaA = nA;
        tocco();
      };
      da.addEventListener('change', salvaSettimane);
      a.addEventListener('change', salvaSettimane);
      righe.push(h('div.mdf-due', [
        h('label.campo', [h('span.nota', 'Dalla settimana'), da]),
        h('label.campo', [h('span.nota', 'Alla settimana'), a]),
      ]));
    }

    const inUso = imp.pianoAttivo === riferimento.id;
    if (riferimento.locale) {
      righe.push(inUso
        ? h('p.nota', 'È il piano in uso: Oggi e Scheda mostrano questo.')
        : h('button.btn', {
          type: 'button',
          onclick: async () => { await store.scrivi('pianoAttivo', riferimento.id); await disegna(); },
        }, 'Usa questo piano adesso'));
      righe.push(h('button.btn.btn-rosso', {
        type: 'button',
        onclick: async () => {
          if (!conferma(`Elimino il piano “${piano.nome}”? Gli allenamenti già registrati restano nello storico.`)) return;
          await piani.ripristinaPiano(riferimento);
          location.hash = '#/scheda';
        },
      }, 'Elimina questo piano'));
    } else if (statoCopia.copia) {
      righe.push(h('p.nota', 'Questo piano è stato cambiato dall’app.'));
      righe.push(h('button.btn.btn-rosso', {
        type: 'button',
        onclick: async () => {
          if (!conferma('Rimetto il piano come l’ha scritto Claude? Serie, ripetizioni ed esercizi cambiati qui si perdono. Nomi e gruppi restano.')) return;
          await piani.ripristinaPiano(riferimento);
          await ricarica();
        },
      }, 'Rimetti il piano di Claude'));
    }

    return h('div.blocco.pila', righe);
  }

  /* ---------- una seduta ----------------------------------- */

  function bloccoSeduta(seduta, i) {
    const campoNome = h('input', { type: 'text', value: seduta.nome || '', 'aria-label': 'Nome della seduta' });
    const campoSotto = h('input', { type: 'text', value: seduta.sottotitolo || '', 'aria-label': 'Sottotitolo' });

    const salvaCampi = async () => {
      seduta.nome = campoNome.value.trim() || seduta.nome;
      seduta.sottotitolo = campoSotto.value.trim();
      delete seduta.giorno;
      await salva();
    };
    [campoNome, campoSotto].forEach((c) => c.addEventListener('change', salvaCampi));

    const zonaNuovo = h('div');
    const esercizi = seduta.esercizi || [];

    const corpo = h('div.corpo.pila', [
      h('label.campo', [h('span.nota', 'Nome'), campoNome]),
      h('label.campo', [h('span.nota', 'Sottotitolo'), campoSotto]),
      h('p.nota', 'Le sedute non hanno un giorno: in Oggi scegli tu quale fare. L’ordine qui è quello in cui te le propone.'),
      h('p.occhiello', { style: 'margin-top:6px' }, `Esercizi · ${esercizi.length}`),
      esercizi.length
        ? h('ol.lista.lista-num', esercizi.map((e, j) => rigaEsercizio(seduta, e, j)))
        : h('p.nota', 'Nessun esercizio.'),
      zonaNuovo,
      h('button.btn', {
        type: 'button',
        onclick: () => metti(zonaNuovo, moduloEsercizio(seduta, null, () => metti(zonaNuovo))),
      }, '+ Aggiungi un esercizio'),
      bloccoFasi(seduta),
      h('div.btn-riga', [
        h('button.btn.btn-s', {
          type: 'button',
          disabled: i === 0,
          onclick: async () => { scambia(piano.sedute, i, i - 1); await salva(); },
        }, '↑ Sposta su'),
        h('button.btn.btn-s.btn-rosso', {
          type: 'button',
          onclick: async () => {
            if (!conferma(`Tolgo la seduta “${seduta.nome}” dal piano? Gli allenamenti già fatti restano nello storico.`)) return;
            piano.sedute = piano.sedute.filter((s) => s !== seduta);
            await salva();
          },
        }, 'Togli la seduta'),
      ]),
    ]);

    return h('details.piega', {
      open: aperte.has(seduta.id),
      ontoggle: (ev) => { if (ev.target.open) aperte.add(seduta.id); else aperte.delete(seduta.id); },
    }, [
      h('summary', [h('div', [
        h('p.occhiello', `Allenamento ${i + 1}`),
        h('p.titolo-2', seduta.nome),
        h('p.nota', `${esercizi.length} esercizi`),
      ])]),
      corpo,
    ]);
  }

  /** Riscaldamento e scarico: minuti e una voce per riga. */
  function bloccoFasi(seduta) {
    const fase = (chiave, etichetta) => {
      const f = seduta[chiave] || { minuti: 0, voci: [] };
      const minuti = h('input', { type: 'number', inputmode: 'numeric', min: '0', value: String(f.minuti || 0) });
      const voci = h('textarea', { value: (f.voci || []).join('\n'), placeholder: 'Una voce per riga' });
      const salvaFase = async () => {
        const elenco = voci.value.split('\n').map((x) => x.trim()).filter(Boolean);
        const n = parseInt(minuti.value, 10) || 0;
        seduta[chiave] = elenco.length || n ? { minuti: n, voci: elenco } : null;
        await salva();
      };
      minuti.addEventListener('change', salvaFase);
      voci.addEventListener('change', salvaFase);
      return h('div.pila-s', [
        h('p.occhiello', etichetta),
        h('label.campo', [h('span.nota', 'Minuti'), minuti]),
        voci,
      ]);
    };
    return h('details.piega', [
      h('summary', 'Riscaldamento e scarico'),
      h('div.corpo.pila', [fase('riscaldamento', 'Riscaldamento'), fase('scarico', 'Scarico')]),
    ]);
  }

  /* ---------- un esercizio --------------------------------- */

  function rigaEsercizio(seduta, e, j) {
    const pz = personalizza.leggi(personalizza.chiaveEsercizio(e.id)) || {};
    const nome = pz.nome || e.nome;
    const gruppo = pz.gruppo || e.gruppo;
    const sotto = [`${e.serie} × ${e.rip}`];
    if (e.recuperoSec) sotto.push(`rec ${durata(e.recuperoSec)}`);
    if (e.superserie != null && e.superserie !== '') sotto.push(`superserie ${e.superserie}`);

    const li = h('li', [
      h('span.cresci', [
        h('div.mdf-nome', [h('span', nome), gruppo ? h('span.tag', piani.nomeGruppo(gruppo)) : h('span.tag.rosso', 'senza gruppo')]),
        h('p.nota', sotto.join(' · ')),
      ]),
      h('div.mdf-frecce', [
        h('button.mod-apri', {
          type: 'button', disabled: j === 0, 'aria-label': 'Sposta su',
          onclick: async () => { scambia(seduta.esercizi, j, j - 1); await salva(); },
        }, '↑'),
        h('button.mod-apri', {
          type: 'button', disabled: j === seduta.esercizi.length - 1, 'aria-label': 'Sposta giù',
          onclick: async () => { scambia(seduta.esercizi, j, j + 1); await salva(); },
        }, '↓'),
      ]),
    ]);
    const matita = h('button.mod-apri', {
      type: 'button',
      'aria-label': `Modifica ${nome}`,
      onclick: () => {
        const comEra = [...li.childNodes];
        li.replaceChildren(h('div.cresci', [moduloEsercizio(seduta, e, () => li.replaceChildren(...comEra))]));
      },
    }, '✎');
    li.append(matita);
    return li;
  }

  /**
   * Il modulo di un esercizio. `e` null vuol dire esercizio nuovo.
   * Scrivendo il nome di un esercizio che esiste già in un altro piano, si
   * riusa quello: stesso id, e lo storico dei carichi continua.
   */
  function moduloEsercizio(seduta, e, chiudi) {
    const nuovo = !e;
    const pz = e ? personalizza.leggi(personalizza.chiaveEsercizio(e.id)) || {} : {};
    const base = e || {
      serie: 3, rip: '8-10', ripMin: 8, ripMax: 10, recuperoSec: 90, carico: 'esterno', incrementoKg: 2.5, note: '',
    };

    const idLista = `mdf-noti-${Math.random().toString(36).slice(2, 7)}`;
    const campoNome = h('input', {
      type: 'text', value: pz.nome || base.nome || '', list: idLista, 'aria-label': 'Nome dell’esercizio',
    });
    const lista = h('datalist', { id: idLista }, [...noti.values()].map((x) => h('option', { value: x.nome })));

    const gruppoAttuale = pz.gruppo || base.gruppo || '';
    const campoGruppo = h('select', { 'aria-label': 'Gruppo muscolare' }, [
      h('option', { value: '', selected: !gruppoAttuale }, 'Scegli il gruppo'),
      ...piani.GRUPPI.map((g) => h('option', { value: g.id, selected: g.id === gruppoAttuale }, g.nome)),
    ]);
    const campoSerie = h('input', { type: 'number', inputmode: 'numeric', min: '0', max: '10', value: String(base.serie ?? 3) });
    const campoRip = h('input', { type: 'text', value: piani.testoRip(base), 'aria-label': 'Ripetizioni' });
    const campoRec = h('input', { type: 'number', inputmode: 'numeric', min: '0', step: '15', value: String(base.recuperoSec ?? 90) });
    const campoCarico = h('select', { 'aria-label': 'Come si carica' },
      CARICHI.map((c) => h('option', { value: c.id, selected: c.id === (base.carico || 'esterno') }, c.nome)));
    const campoInc = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: '0.25', value: String(base.incrementoKg ?? 2.5) });
    const campoSs = h('input', { type: 'text', value: base.superserie == null ? '' : String(base.superserie), placeholder: 'es. 4' });
    const campoNote = h('textarea', { value: base.note || '', placeholder: 'Una riga sotto il nome, facoltativa' });
    const errore = h('p.nota.rosso');

    /* Quel che il modulo dice del piano, esclusi nome e gruppo. Se non cambia,
       il piano non si tocca: rinominare un esercizio non crea una copia. */
    const delPiano = () => JSON.stringify([campoSerie, campoRip, campoRec, campoCarico, campoInc, campoSs, campoNote]
      .map((c) => String(c.value).trim()));
    const comEraNelPiano = delPiano();

    // Scegliendo un esercizio noto si riprendono i suoi dati, come partenza.
    if (nuovo) {
      campoNome.addEventListener('change', () => {
        const noto = trovaNoto(campoNome.value);
        if (!noto) return;
        if (!campoGruppo.value && noto.gruppo) campoGruppo.value = noto.gruppo;
        campoCarico.value = noto.carico || 'esterno';
        if (noto.incrementoKg != null) campoInc.value = String(noto.incrementoKg);
      });
    }

    const salvaModulo = async () => {
      const nome = campoNome.value.trim();
      if (!nome) { errore.textContent = 'Serve un nome.'; return; }
      const carico = campoCarico.value;
      const testo = campoRip.value.trim();
      const rip = carico === 'tempo' && /^\d+$/.test(testo)
        ? { rip: testo, ripMin: Number(testo), ripMax: Number(testo), ripSerie: null }
        : piani.leggiRip(testo);
      if (!rip) { errore.textContent = 'Ripetizioni: scrivi 10, 8-10 oppure 12-10-8.'; return; }
      const serie = Math.max(0, Math.min(10, parseInt(campoSerie.value, 10) || 0));
      const cambi = {
        serie,
        ...rip,
        recuperoSec: Math.max(0, parseInt(campoRec.value, 10) || 0),
        carico,
        incrementoKg: Math.max(0, Number(String(campoInc.value).replace(',', '.')) || 0),
        superserie: campoSs.value.trim() || null,
        note: campoNote.value.trim(),
      };
      const gruppo = campoGruppo.value || null;

      if (nuovo) {
        const noto = trovaNoto(nome);
        const id = noto ? noto.id : idNuovo(nome);
        if ((seduta.esercizi || []).some((x) => x.id === id)) {
          errore.textContent = 'Questo esercizio c’è già in questa seduta.';
          return;
        }
        const es = { id, nome: noto ? noto.nomePiano : nome, gruppo: noto ? noto.gruppoPiano : gruppo };
        piani.applicaCambi(es, cambi);
        if (noto?.caricoAlternativo && noto.caricoAlternativo !== es.carico) es.caricoAlternativo = noto.caricoAlternativo;
        seduta.esercizi = [...(seduta.esercizi || []), es];
        await scriviNomeGruppo(es, nome, gruppo);
      } else {
        await scriviNomeGruppo(e, nome, gruppo);
        if (delPiano() === comEraNelPiano) { chiudi(); await ricarica(); return; }
        if (serie !== e.serie) cambi.serieDaSettimana = null;
        if (cambi.carico === e.caricoAlternativo) cambi.caricoAlternativo = null;
        piani.applicaCambi(e, cambi);
      }
      chiudi();
      await salva();
    };

    const azioni = [h('button.btn.btn-s', { type: 'button', onclick: salvaModulo }, nuovo ? 'Aggiungi' : 'Salva')];
    if (!nuovo) {
      azioni.push(h('button.btn.btn-s.btn-rosso', {
        type: 'button',
        onclick: async () => {
          if (!conferma(`Tolgo “${campoNome.value || e.nome}” da questa seduta? Lo storico dei carichi resta.`)) return;
          seduta.esercizi = seduta.esercizi.filter((x) => x !== e);
          await salva();
        },
      }, 'Togli'));
    }
    azioni.push(h('button.btn.btn-s', { type: 'button', onclick: chiudi }, 'Annulla'));

    const modulo = h('div.mod.mdf-modulo', [
      h('label.campo.mod-campo', [h('span.occhiello', 'Nome'), campoNome, lista]),
      nuovo ? h('p.nota', 'Se scegli un esercizio che hai già fatto, lo storico dei carichi continua.') : null,
      h('label.campo.mod-campo', [h('span.occhiello', 'Gruppo · conta nei progressi'), campoGruppo]),
      h('div.mdf-due', [
        h('label.campo.mod-campo', [h('span.occhiello', 'Serie'), campoSerie]),
        h('label.campo.mod-campo', [h('span.occhiello', 'Ripetizioni'), campoRip]),
      ]),
      h('p.nota', '10 fisse · 8-10 per salire di carico · 12-10-8 una per serie. A tempo: i secondi.'),
      h('div.mdf-due', [
        h('label.campo.mod-campo', [h('span.occhiello', 'Recupero (s)'), campoRec]),
        h('label.campo.mod-campo', [h('span.occhiello', 'Si sale di (kg)'), campoInc]),
      ]),
      h('label.campo.mod-campo', [h('span.occhiello', 'Come si carica'), campoCarico]),
      h('label.campo.mod-campo', [h('span.occhiello', 'Superserie · stesso numero, stesso giro'), campoSs]),
      h('label.campo.mod-campo', [h('span.occhiello', 'Note'), campoNote]),
      !nuovo ? h('p.nota', 'Nome e gruppo cambiano l’esercizio in tutti i piani.') : null,
      errore,
      h('div.mod-azioni', azioni),
    ].filter(Boolean));
    requestAnimationFrame(() => { if (nuovo) campoNome.focus(); });
    return modulo;
  }

  /** Nome e gruppo vanno su personalizza, e solo se diversi da quel che dice il piano. */
  async function scriviNomeGruppo(es, nome, gruppo) {
    await personalizza.scrivi(personalizza.chiaveEsercizio(es.id), {
      nome: nome && nome !== es.nome ? nome : null,
      gruppo: gruppo && gruppo !== es.gruppo ? gruppo : null,
    });
  }

  function trovaNoto(nome) {
    const cerca = String(nome || '').trim().toLowerCase();
    if (!cerca) return null;
    for (const x of noti.values()) if (x.nome.toLowerCase() === cerca) return x;
    return null;
  }

  /** Un id nuovo dal nome, che non pesti quello di un altro esercizio. */
  function idNuovo(nome) {
    const radice = personalizza.slug(nome) || 'esercizio';
    const presi = new Set([...noti.keys(), ...(piano.sedute || []).flatMap((s) => (s.esercizi || []).map((x) => x.id))]);
    let id = radice;
    let n = 2;
    while (presi.has(id)) { id = `${radice}-${n}`; n += 1; }
    return id;
  }

  await ricarica();
}

/* ---------- esercizi noti -------------------------------- */

/** Tutti gli esercizi dei piani, per id: nome mostrato, e quel che dice il piano. */
async function eserciziNoti() {
  const idx = await piani.indice();
  const out = new Map();
  for (const r of idx.allenamento) {
    let grezzo;
    try { grezzo = await piani.pianoGrezzo(r); } catch { continue; }
    (grezzo.sedute || []).forEach((s) => (s.esercizi || []).forEach((e) => {
      if (out.has(e.id)) return;
      const pz = personalizza.leggi(personalizza.chiaveEsercizio(e.id)) || {};
      out.set(e.id, {
        id: e.id,
        nome: pz.nome || e.nome,
        nomePiano: e.nome,
        gruppo: pz.gruppo || e.gruppo,
        gruppoPiano: e.gruppo,
        carico: e.carico,
        caricoAlternativo: e.caricoAlternativo,
        incrementoKg: e.incrementoKg,
      });
    }));
  }
  return out;
}

/* ---------- piano nuovo ---------------------------------- */

async function montaNuovo(contenitore) {
  const st = await piani.stato();
  const testata = h('header.testata', [
    h('div.cresci', [h('p.occhiello', 'Scheda'), h('h1.titolo', 'Piano nuovo')]),
    h('a.btn.btn-s', { href: '#/scheda' }, 'Annulla'),
  ]);

  const campoNome = h('input', { type: 'text', placeholder: 'es. Scheda di ottobre', 'aria-label': 'Nome del piano' });
  const campoSettimane = h('input', { type: 'number', inputmode: 'numeric', min: '1', max: '52', value: '8' });
  let partenza = st.riferimento ? 'copia' : 'vuoto';
  const scelte = h('div.pila-s');
  const disegnaScelte = () => metti(scelte, [
    st.riferimento ? sceltaPartenza('copia', `Copia di “${st.riferimento.nome}”`, 'Stesse sedute ed esercizi: cambi solo quel che serve.') : null,
    sceltaPartenza('vuoto', 'Vuoto', 'Una seduta senza esercizi: li aggiungi tu.'),
  ].filter(Boolean));
  function sceltaPartenza(id, nome, nota) {
    const b = h('button.btn.mdf-scelta', {
      type: 'button',
      'aria-pressed': String(partenza === id),
      onclick: () => { partenza = id; disegnaScelte(); },
    }, [h('span.cresci', [h('div', nome), h('p.nota', nota)])]);
    if (partenza === id) b.classList.add('mdf-scelta-attiva');
    return b;
  }
  disegnaScelte();

  const usaSubito = h('input', { type: 'checkbox', checked: true });
  const errore = h('p.nota.rosso');

  const crea = async () => {
    const nome = campoNome.value.trim();
    if (!nome) { errore.textContent = 'Dagli un nome.'; campoNome.focus(); return; }
    const settimane = Math.max(1, Math.min(52, parseInt(campoSettimane.value, 10) || 8));
    const rif = await piani.creaPiano({
      nome,
      da: partenza === 'copia' ? st.riferimento : null,
      settimanaDa: st.settimana || 1,
      settimane,
    });
    if (usaSubito.checked) await store.scrivi('pianoAttivo', rif.id);
    location.hash = `#/modifica/${rif.id}`;
  };

  contenitore.append(testata, h('div.schermata', [
    h('div.blocco.pila', [
      h('label.campo', [h('span.occhiello', 'Nome'), campoNome]),
      h('p.occhiello', 'Da dove parto'),
      scelte,
      h('label.campo', [h('span.occhiello', 'Quante settimane dura'), campoSettimane]),
      h('label.spunta', [usaSubito, h('span.quadro'), h('span.testo-spunta', 'Usalo da subito al posto di quello di adesso')]),
      errore,
      h('button.btn.btn-primo', { type: 'button', onclick: crea }, 'Crea il piano'),
    ]),
    h('p.nota',
      'Il piano resta su questo telefono. Di solito i piani li scrive Claude: questo è per quando '
      + 'serve subito. Per tornare al piano di Claude: Altro → Piano attivo → calcolo automatico.'),
  ]));
}

/* ---------- minuterie ------------------------------------ */

function scambia(elenco, i, j) {
  if (!elenco || j < 0 || j >= elenco.length) return;
  [elenco[i], elenco[j]] = [elenco[j], elenco[i]];
}

/* ---------- stile locale --------------------------------- */

const STILE = `
.mdf-due { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.mdf-nome { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.mdf-frecce { display: flex; gap: 4px; }
.mdf-frecce .mod-apri[disabled] { opacity: 0.3; pointer-events: none; }
.mdf-modulo { border-left: var(--bordo-xl) solid var(--linea); padding-left: 10px; }
.mdf-scelta { justify-content: flex-start; text-align: left; min-height: 60px; padding: 8px 12px; }
.mdf-scelta .nota { font-weight: 400; }
.mdf-scelta-attiva { background: var(--ink); color: var(--paper); }
.mdf-scelta-attiva .nota { color: var(--paper); opacity: 0.75; }
`;

function iniettaStile() {
  if (document.getElementById('stile-modifica')) return;
  const s = document.createElement('style');
  s.id = 'stile-modifica';
  s.textContent = STILE;
  document.head.append(s);
}
