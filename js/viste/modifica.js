/* modifica.js — il piano di allenamento, da cambiare dall'app.

   Tutto si salva al tocco di Salva, su questo telefono (piani.js, copie).
   Quello che si cambia qui vale quanto il piano del repo: da lì in poi la
   scheda è questa, senza avvisi e senza confronti.

   Due cose vivono in posti diversi, e non per caso:
   - nome e gruppo sono dell'esercizio (personalizza.js, legati all'id): valgono
     in ogni piano, ed è sul gruppo che si sommano i progressi;
   - serie, ripetizioni, recupero e note sono del piano.
   Un esercizio si sceglie anche per gruppo, come Cambia in sessione: per
   aggiungerne uno, o per metterne un altro al posto di uno che c'è (dal 08/10/2026).

   Rotte
     #/modifica/<idPiano>   modifica quel piano
     #/modifica/nuovo       crea un piano nuovo, vuoto o copiato
   E editor(), che la Scheda monta al suo interno quando si preme Modifica. */

import { h, metti, conferma, durata, tocco } from '../ui.js';
import * as piani from '../piani.js';
import * as store from '../store.js';
import * as personalizza from '../personalizza.js';

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
    const imp = await store.leggiTutte();
    onTitolo?.(piano.nome || riferimento.nome);
    const pezzi = [];

    pezzi.push(bloccoPiano(imp));
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

  function bloccoPiano(imp) {
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
          await piani.eliminaPiano(riferimento);
          location.hash = '#/scheda';
        },
      }, 'Elimina questo piano'));
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
      serie: 3, rip: '8-10', ripMin: 8, ripMax: 10, recuperoSec: 90, note: '',
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
    const campoSerie = h('input', { type: 'number', inputmode: 'numeric', min: '1', max: '10', value: String(base.serie ?? 3) });
    const campoRip = h('input', { type: 'text', value: piani.testoRip(base), 'aria-label': 'Ripetizioni' });
    const campoRec = h('input', { type: 'number', inputmode: 'numeric', min: '0', step: '15', value: String(base.recuperoSec ?? 90) });
    const campoNote = h('textarea', { value: base.note || '', placeholder: 'Una riga sotto il nome, facoltativa' });
    const errore = h('p.nota.rosso');

    /* Quel che il modulo dice del piano, esclusi nome e gruppo. Se non cambia,
       il piano non si tocca: rinominare un esercizio non crea una copia. */
    const delPiano = () => JSON.stringify([campoSerie, campoRip, campoRec, campoNote]
      .map((c) => String(c.value).trim()));
    const comEraNelPiano = delPiano();

    // Scegliendo un esercizio noto si riprendono i suoi dati, come partenza.
    if (nuovo) {
      campoNome.addEventListener('change', () => {
        const noto = trovaNoto(campoNome.value);
        if (!noto) return;
        if (!campoGruppo.value && noto.gruppo) campoGruppo.value = noto.gruppo;
      });
    }

    /* Scelta per gruppo, come Cambia in sessione. Per un esercizio nuovo riempie
       nome e gruppo; per uno che c'è già ne mette un altro al posto suo, e Salva
       lo scrive nel piano. Gli esercizi già in questa seduta non si offrono. */
    const nellaSeduta = new Set((seduta.esercizi || []).map((x) => x.id));
    let alPosto = false;
    const zonaCambio = h('div.pila-s');
    const prendi = ({ nome, gruppo }) => {
      campoNome.value = nome;
      campoGruppo.value = gruppo || '';
      errore.textContent = '';
      tocco(8);
      if (nuovo) return;
      alPosto = true;
      metti(zonaCambio, [
        h('p.nota.mdf-al-posto', `${nome} al posto di ${pz.nome || e.nome}. Lo storico dei carichi di ognuno resta suo.`),
        h('button.btn.btn-s', {
          type: 'button',
          onclick: () => {
            alPosto = false;
            campoNome.value = pz.nome || e.nome;
            campoGruppo.value = gruppoAttuale;
            metti(zonaCambio, bottoneCambia);
          },
        }, `Tieni ${pz.nome || e.nome}`),
      ]);
    };
    const bottoneCambia = h('button.btn.btn-s', {
      type: 'button',
      onclick: () => metti(zonaCambio, [
        h('p.occhiello', 'Al posto di questo · scegli il gruppo'),
        sceltaPerGruppo({ iniziale: gruppoAttuale, escludi: nellaSeduta, scriviNuovo: true, onScelta: prendi }),
      ]),
    }, 'Cambia con un altro esercizio');
    if (!nuovo) metti(zonaCambio, bottoneCambia);

    const salvaModulo = async () => {
      const nome = campoNome.value.trim();
      if (!nome) { errore.textContent = 'Serve un nome.'; return; }
      const rip = piani.leggiRip(campoRip.value);
      if (!rip) { errore.textContent = 'Ripetizioni: scrivi 10, 8-10 oppure 12-10-8.'; return; }
      const cambi = {
        serie: Math.max(1, Math.min(10, parseInt(campoSerie.value, 10) || 1)),
        ...rip,
        recuperoSec: Math.max(0, parseInt(campoRec.value, 10) || 0),
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
        seduta.esercizi = [...(seduta.esercizi || []), es];
        await scriviNomeGruppo(es, nome, gruppo);
      } else if (alPosto && (trovaNoto(nome)?.id ?? null) !== e.id) {
        // Un altro esercizio al posto di questo: id nuovo, serie e ripetizioni dal modulo.
        const noto = trovaNoto(nome);
        const id = noto ? noto.id : idNuovo(nome);
        if (seduta.esercizi.some((x) => x !== e && x.id === id)) {
          errore.textContent = 'Questo esercizio c’è già in questa seduta.';
          return;
        }
        e.id = id;
        e.nome = noto ? noto.nomePiano : nome;
        e.gruppo = noto ? noto.gruppoPiano : gruppo;
        piani.applicaCambi(e, cambi);
        await scriviNomeGruppo(e, nome, gruppo);
      } else {
        await scriviNomeGruppo(e, nome, gruppo);
        if (delPiano() === comEraNelPiano) { chiudi(); await ricarica(); return; }
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
      nuovo ? h('p.occhiello', 'Scegli il gruppo') : null,
      nuovo ? sceltaPerGruppo({
        escludi: nellaSeduta,
        onGruppo: (g) => { campoGruppo.value = g; },
        onScelta: prendi,
      }) : null,
      h('label.campo.mod-campo', [h('span.occhiello', nuovo ? 'Nome · o scrivilo tu' : 'Nome'), campoNome, lista]),
      nuovo ? h('p.nota', 'Se scegli un esercizio che hai già fatto, lo storico dei carichi continua.') : null,
      nuovo ? null : zonaCambio,
      h('label.campo.mod-campo', [h('span.occhiello', 'Gruppo · conta nei progressi'), campoGruppo]),
      h('div.mdf-due', [
        h('label.campo.mod-campo', [h('span.occhiello', 'Serie'), campoSerie]),
        h('label.campo.mod-campo', [h('span.occhiello', 'Ripetizioni'), campoRip]),
      ]),
      h('p.nota', '10 fisse · 8-10 per salire di carico · 12-10-8 una per serie.'),
      h('label.campo.mod-campo', [h('span.occhiello', 'Recupero (secondi)'), campoRec]),
      h('label.campo.mod-campo', [h('span.occhiello', 'Note'), campoNote]),
      !nuovo ? h('p.nota', 'Nome e gruppo cambiano l’esercizio in tutti i piani.') : null,
      errore,
      h('div.mod-azioni', azioni),
    ].filter(Boolean));
    requestAnimationFrame(() => { if (nuovo) campoNome.focus(); });
    return modulo;
  }

  /**
   * I bottoni dei gruppi e, sotto, gli esercizi noti del gruppo scelto. Con
   * `scriviNuovo` c'è anche il campo per uno che non c'è ancora. Dal 08/10/2026.
   */
  function sceltaPerGruppo({
    iniziale = null, escludi, scriviNuovo = false, onGruppo, onScelta,
  }) {
    let gruppo = iniziale || null;
    const zona = h('div.pila-s');

    const disegnaElenco = () => {
      if (!gruppo) { metti(zona); return; }
      const nomeG = piani.nomeGruppo(gruppo).toLowerCase();
      const elenco = [...noti.values()]
        .filter((x) => x.gruppo === gruppo && !escludi.has(x.id))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
      const pezzi = [elenco.length
        ? h('ul.lista.mdf-elenco', elenco.map((x) => h('li', [
          h('button.mdf-scegli', { type: 'button', onclick: () => onScelta({ nome: x.nome, gruppo: x.gruppo }) }, x.nome),
        ])))
        : h('p.nota', `Nessun altro esercizio di ${nomeG}: ${scriviNuovo ? 'scrivilo qui sotto' : 'scrivi il nome qui sotto'}.`)];
      if (scriviNuovo) {
        const campoNuovo = h('input', {
          type: 'text', placeholder: 'Nome del nuovo esercizio', 'aria-label': 'Nome del nuovo esercizio',
        });
        const errore = h('p.nota.rosso');
        pezzi.push(
          h('label.campo', [h('span.occhiello', `Non c’è? Nuovo esercizio di ${nomeG}`), campoNuovo]),
          errore,
          h('button.btn.btn-s', {
            type: 'button',
            onclick: () => {
              const nome = campoNuovo.value.trim();
              if (!nome) { errore.textContent = 'Scrivi il nome.'; return; }
              onScelta({ nome, gruppo });
            },
          }, 'Usa questo'),
        );
      }
      metti(zona, pezzi);
    };

    const bottoni = piani.GRUPPI.map((g) => h('button.scelta-btn', {
      type: 'button',
      'aria-pressed': 'false',
      onclick: () => {
        gruppo = g.id;
        accendi();
        tocco(8);
        onGruppo?.(g.id);
        disegnaElenco();
      },
    }, g.nome));
    const accendi = () => bottoni.forEach((b, i) => {
      const acceso = piani.GRUPPI[i].id === gruppo;
      b.classList.toggle('scelta-attiva', acceso);
      b.setAttribute('aria-pressed', acceso ? 'true' : 'false');
    });
    accendi();
    disegnaElenco();

    return h('div.pila-s', [
      h('div.scelta.mdf-gruppi', { role: 'group', 'aria-label': 'Gruppo muscolare' }, bottoni),
      zona,
    ]);
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
      });
    }));
  }
  // Quelli creati dal telefono con Cambia, in sessione.
  (await piani.catalogoEsercizi()).forEach((e) => {
    if (out.has(e.id)) return;
    out.set(e.id, {
      id: e.id, nome: e.nome, nomePiano: e.nome, gruppo: e.gruppo, gruppoPiano: e.gruppo,
    });
  });
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
      'Il piano resta su questo telefono ed entra nel backup. Per tornare al piano del calendario: '
      + 'Altro → Piano attivo → Torna al calcolo automatico.'),
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
.mdf-gruppi { grid-auto-flow: row; grid-template-columns: repeat(3, 1fr); }
.mdf-elenco > li { padding: 0; }
.mdf-scegli {
  appearance: none; width: 100%; min-height: var(--tap); padding: 0; border: 0;
  background: none; color: inherit; font: inherit; font-weight: 700; text-align: left; cursor: pointer;
}
.mdf-scegli:active { background: var(--ink); color: var(--paper); }
.mdf-al-posto { font-weight: 700; color: var(--ink); }
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
