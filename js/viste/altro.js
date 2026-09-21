/* altro.js — impostazioni. Chi sei, da quando, che piano, e il backup.
   È l'unico posto dove si può perdere qualcosa: ogni azione che distrugge
   chiede conferma e dice cosa se ne va. */

import { h, metti, iso, daIso, conferma, mesi } from '../ui.js';
import * as store from '../store.js';
import * as piani from '../piani.js';
import * as backup from '../backup.js';
import * as personalizza from '../personalizza.js';
import { applicaTema } from '../app.js';

const VERSIONE_APP = '1.1';
const GIORNI_BACKUP = 30;

export async function monta(contenitore) {
  iniettaStile();

  const testata = h('header.testata', [
    h('div', [
      h('p.occhiello', 'FitApp'),
      h('h1.titolo', 'Altro'),
    ]),
  ]);

  const schermata = h('div.schermata');
  contenitore.append(testata, schermata);

  await disegna(schermata);
}

async function disegna(schermata) {
  const [imp, st, elenco, mb, serie] = await Promise.all([
    store.leggiTutte(),
    piani.stato(),
    piani.elencoPiani(),
    store.spazio(),
    store.tutteLeSerie(),
  ]);
  await personalizza.carica(true);

  const ridisegna = () => disegna(schermata);

  metti(schermata,
    sezioneProfilo(imp, ridisegna),
    sezionePeso(imp),
    sezioneData(imp, st, ridisegna),
    sezionePiano(imp, elenco, ridisegna),
    sezioneModifiche(personalizza.quante(), ridisegna),
    sezioneBackup(imp, { mb, conDati: serie.length > 0 }),
    sezioneTema(imp, ridisegna),
    sezioneCancella(),
    h('hr.sep'),
    h('p.nota', 'FitApp — allenamento e alimentazione di Giuseppe e Corinna.'),
    h('p.nota', `Versione ${VERSIONE_APP}`),
  );
}

/* ---------- profilo ------------------------------------- */

function nomeProfilo(chi) {
  if (chi === 'corinna') return 'Corinna';
  if (chi === 'giuseppe') return 'Giuseppe';
  return 'Nessuno';
}

function sezioneProfilo(imp, ridisegna) {
  const cambia = async () => {
    if (!conferma('Cambio profilo. I dati registrati restano come sono.')) return;
    await store.scrivi('profilo', imp.profilo === 'corinna' ? 'giuseppe' : 'corinna');
    ridisegna();
  };

  return h('div.blocco', [
    h('p.occhiello', 'Profilo'),
    h('div.riga-sp', [
      h('p.titolo-2', nomeProfilo(imp.profilo)),
      h('button.btn.btn-s', { onclick: cambia }, 'Cambia profilo'),
    ]),
  ]);
}

/* ---------- peso corporeo -------------------------------- */

function sezionePeso(imp) {
  const campo = h('input', {
    type: 'number',
    inputmode: 'decimal',
    step: '0.5',
    placeholder: 'kg',
    value: imp.pesoCorporeo == null ? '' : String(imp.pesoCorporeo),
    'aria-label': 'Peso corporeo in chilogrammi',
  });

  const avviso = h('div');
  const esito = h('p.nota.alt-esito');

  const mostraAvviso = (vuoto) => {
    metti(avviso, vuoto
      ? h('div.fascia.fascia-avviso',
        'Senza peso corporeo non posso calcolare il carico di trazioni e assistite.')
      : []);
  };
  mostraAvviso(imp.pesoCorporeo == null);

  let ultimo = imp.pesoCorporeo == null ? '' : String(imp.pesoCorporeo);

  const salva = async () => {
    const grezzo = String(campo.value).trim();
    if (grezzo === ultimo) return;
    const n = parseFloat(grezzo.replace(',', '.'));

    if (grezzo === '') {
      await store.scrivi('pesoCorporeo', null);
      ultimo = '';
      mostraAvviso(true);
      esito.textContent = 'Peso cancellato.';
      return;
    }
    if (Number.isNaN(n) || n <= 0) {
      esito.textContent = 'Scrivi un numero di chili, per esempio 78.';
      return;
    }
    await store.scrivi('pesoCorporeo', n);
    ultimo = grezzo;
    mostraAvviso(false);
    esito.textContent = 'Peso salvato.';
  };

  campo.addEventListener('blur', salva);

  return h('div.blocco', [
    h('p.occhiello', 'Peso corporeo'),
    avviso,
    h('div.alt-riga-campo', [
      h('div.cresci', [campo]),
      h('button.btn', { onclick: salva }, 'Salva'),
    ]),
    esito,
    h('p.nota',
      'Serve solo a calcolare il carico di trazioni e assistite. '
      + 'Non viene tracciato nel tempo e non è una misura del piano.'),
  ]);
}

/* ---------- data di inizio ------------------------------- */

function sezioneData(imp, st, ridisegna) {
  const campo = h('input', {
    type: 'date',
    value: imp.dataInizio || '',
    'aria-label': 'Data del primo allenamento',
  });

  const cambia = async () => {
    const nuova = campo.value;
    if (!nuova) { campo.value = imp.dataInizio || ''; return; }
    if (nuova === imp.dataInizio) return;
    if (!conferma(
      'Cambio la data di inizio. Da qui l’app calcola fase, settimana e progressione: '
      + 'cambia tutto quello che vedi. Gli allenamenti registrati restano come sono.',
    )) {
      campo.value = imp.dataInizio || '';
      return;
    }
    await store.scrivi('dataInizio', nuova);
    ridisegna();
  };

  campo.addEventListener('change', cambia);

  let riga;
  if (st.settimana == null) {
    riga = imp.dataInizio
      ? 'La data di inizio è nel futuro: il programma non è ancora cominciato.'
      : 'Senza data di inizio non so in che settimana sei.';
  } else {
    riga = `Oggi sei alla settimana ${st.settimana} — ${st.riferimento?.nome || 'nessun piano'}`;
  }

  return h('div.blocco', [
    h('p.occhiello', 'Data di inizio'),
    !imp.dataInizio ? h('div.fascia.fascia-avviso', 'Manca la data del primo allenamento.') : null,
    campo,
    h('p.titolo-2', { style: 'margin-top:10px' }, riga),
    h('p.nota', 'È il giorno del primo allenamento della settimana 1.'),
  ]);
}

/* ---------- piano attivo --------------------------------- */

function etichettaPiano(p) {
  if (p.attivo) return 'attivo';
  if (p.passato) return 'passato';
  if (p.futuro) return 'in arrivo';
  return '';
}

function sezionePiano(imp, elenco, ridisegna) {
  const forza = async (id) => {
    await store.scrivi('pianoAttivo', id);
    ridisegna();
  };

  const automatico = async () => {
    await store.scrivi('pianoAttivo', null);
    ridisegna();
  };

  const righe = elenco.map((p) => {
    const forzato = imp.pianoAttivo === p.id;
    return h('div.alt-riga-piano', [
      h('div.cresci', [
        h('a.alt-nome-piano', { href: `#/scheda/${p.id}` }, p.nome),
        h('p.nota', `Settimane ${p.settimanaDa}–${p.settimanaA} · ${etichettaPiano(p)}`),
      ]),
      forzato
        ? h('span.occhiello.alt-marchio', 'forzato')
        : h('button.btn.btn-s', { onclick: () => forza(p.id) }, 'Forza'),
    ]);
  });

  return h('div.blocco', [
    h('p.occhiello', 'Piano attivo'),
    imp.pianoAttivo
      ? h('div.fascia.fascia-avviso', 'Piano forzato a mano. L’app non segue più il calendario.')
      : null,
    h('div.alt-piani', righe),
    imp.pianoAttivo
      ? h('button.btn', { onclick: automatico, style: 'margin-top:10px;width:100%' },
        'Torna al calcolo automatico')
      : null,
    h('p.nota', { style: 'margin-top:10px' },
      'Normalmente il piano lo sceglie la data di inizio. Tocca un nome per leggerlo.'),
  ]);
}

/* ---------- backup --------------------------------------- */

function dataItaliana(isoBreve) {
  const d = daIso(isoBreve);
  return `${d.getDate()} ${mesi[d.getMonth()]} ${d.getFullYear()}`;
}

function dataDaIsoLungo(testo) {
  const d = new Date(testo);
  if (Number.isNaN(d.getTime())) return testo;
  return `${d.getDate()} ${mesi[d.getMonth()]} ${d.getFullYear()}`;
}

/* ---------- modifiche fatte a mano sui piani -------------- */

/** Nomi cambiati, voci tolte, voci spostate di lista. Stanno sopra ai piani
    del repo e si possono togliere tutte insieme, senza toccare i carichi. */
function sezioneModifiche(quante, ridisegna) {
  const azzera = h('button.btn.btn-rosso', {
    disabled: !quante,
    onclick: async () => {
      const testo = `Tolgo ${quante === 1 ? 'la modifica' : `tutte e ${quante} le modifiche`} `
        + 'e rimetto i piani come sono scritti? Carichi, foto e spunte non si toccano.';
      if (!conferma(testo)) return;
      await personalizza.azzeraTutte();
      ridisegna();
    },
  }, 'Azzera');

  return h('div.blocco', [
    h('p.occhiello', 'Modifiche ai piani'),
    h('div.riga-sp', [
      h('p.titolo-2', quante
        ? `${quante} ${quante === 1 ? 'modifica' : 'modifiche'}`
        : 'Nessuna'),
      azzera,
    ]),
    h('p.nota', { style: 'margin-top:8px' },
      'Nomi di esercizi e di pietanze cambiati, voci tolte, voci spostate da una lista '
      + 'della spesa all’altra. Si fanno da Scheda e da Cibo, col pulsante Modifica. '
      + 'Restano su questo telefono ed entrano nel backup.'),
  ]);
}

function sezioneBackup(imp, { mb, conDati }) {
  const ultimo = imp.ultimoBackup;
  const giorni = ultimo ? Math.floor((daIso(iso()) - daIso(ultimo)) / 86400000) : null;

  const rigaUltimo = h('p.cifra-s', ultimo ? dataItaliana(ultimo) : 'Mai');
  if (!ultimo) rigaUltimo.classList.add('rosso');

  const avviso = h('div');
  if (giorni == null && conDati) {
    avviso.append(h('div.fascia.fascia-avviso',
      'Non hai mai fatto un backup e ci sono allenamenti registrati.'));
  } else if (giorni != null && giorni > GIORNI_BACKUP) {
    avviso.append(h('div.fascia.fascia-avviso', `Ultimo backup ${giorni} giorni fa.`));
  }

  const esito = h('div.alt-esito-box');
  const dice = (testo) => metti(esito, h('p.nota', testo));
  const sbaglia = (testo) => metti(esito, h('div.fascia.alt-fascia-rossa', testo));

  /* --- esporta ---------------------------------------- */

  const btnEsporta = h('button.btn.btn-primo', 'Esporta backup');
  btnEsporta.addEventListener('click', async () => {
    const etichetta = btnEsporta.textContent;
    btnEsporta.disabled = true;
    btnEsporta.textContent = 'Preparo il file…';
    metti(esito);
    try {
      const r = await backup.esporta();
      rigaUltimo.textContent = dataItaliana(iso());
      rigaUltimo.classList.remove('rosso');
      metti(avviso);
      dice(`Fatto: ${r.nomeFile} — ${r.nSessioni} allenamenti, ${r.nSerie} serie, ${r.nFoto} foto.`);
    } catch (e) {
      sbaglia(String(e?.message || e));
    } finally {
      btnEsporta.disabled = false;
      btnEsporta.textContent = etichetta;
    }
  });

  /* --- importa ---------------------------------------- */

  const campoFile = h('input', {
    type: 'file',
    accept: '.zip,application/zip',
    class: 'nascondi',
    'aria-hidden': 'true',
  });

  const btnImporta = h('button.btn', { onclick: () => campoFile.click() }, 'Importa backup');

  campoFile.addEventListener('change', async () => {
    const file = campoFile.files && campoFile.files[0];
    campoFile.value = '';
    if (!file) return;

    btnEsporta.disabled = true;
    btnImporta.disabled = true;
    metti(esito);

    try {
      dice('Leggo il file…');
      const a = await backup.anteprima(file);

      const pezzi = [
        `Il file contiene ${a.nSessioni} allenamenti, ${a.nSerie} serie e ${a.nFoto} foto.`,
        a.profilo ? `Profilo: ${nomeProfilo(a.profilo)}.` : null,
        a.creato ? `Creato il ${dataDaIsoLungo(a.creato)}.` : null,
        '',
        'I dati con lo stesso identificativo vengono sostituiti da quelli del file. '
        + 'Tutto il resto resta dov’è. Le impostazioni vengono riscritte.',
        '',
        'Procedo?',
      ].filter((x) => x !== null);

      if (!conferma(pezzi.join('\n'))) {
        dice('Ripristino annullato. Non ho toccato niente.');
        return;
      }

      dice('Ripristino in corso…');
      const r = await backup.importa(file);
      const coda = r.nSaltate ? ` ${r.nSaltate} foto non erano dentro il file.` : '';
      dice(`Ripristinati ${r.nSessioni} allenamenti, ${r.nSerie} serie e ${r.nFoto} foto.${coda} Ricarico l’app…`);
      setTimeout(() => location.reload(), 1800);
    } catch (e) {
      sbaglia(String(e?.message || e));
    } finally {
      btnEsporta.disabled = false;
      btnImporta.disabled = false;
    }
  });

  return h('div.blocco', [
    h('p.occhiello', 'Backup'),
    avviso,
    h('p.nota', 'Ultimo backup'),
    rigaUltimo,
    h('div.pila', { style: 'margin-top:12px' }, [btnEsporta, btnImporta, campoFile]),
    esito,
    h('p.nota', { style: 'margin-top:12px' },
      mb == null ? 'Spazio occupato: non lo so dire.' : `Spazio occupato: ${mb.toFixed(1)} MB.`),
    h('p.nota',
      'I dati stanno solo su questo telefono. Se lo cambi, o cancelli l’app, '
      + 'senza backup se ne vanno.'),
  ]);
}

/* ---------- tema ----------------------------------------- */

function sezioneTema(imp, ridisegna) {
  const attuale = imp.tema || 'auto';

  const scelta = (chiave, etichetta) => {
    const b = h('button.btn', {
      'aria-pressed': attuale === chiave ? 'true' : 'false',
      onclick: async () => {
        applicaTema(chiave);
        await store.scrivi('tema', chiave);
        ridisegna();
      },
    }, etichetta);
    if (attuale === chiave) b.classList.add('alt-attivo');
    return b;
  };

  return h('div.blocco', [
    h('p.occhiello', 'Tema'),
    h('div.btn-riga', [
      scelta('auto', 'Automatico'),
      scelta('chiaro', 'Chiaro'),
      scelta('scuro', 'Scuro'),
    ]),
  ]);
}

/* ---------- cancella tutto -------------------------------- */

function sezioneCancella() {
  const blocco = h('div.blocco');

  function primoPasso() {
    metti(blocco,
      h('p.occhiello', 'Cancella tutto'),
      h('p.nota', { style: 'margin:8px 0 12px' },
        'Cancella allenamenti, serie, foto e impostazioni di questo telefono. '
        + 'Il piano in sé non si tocca.'),
      h('button.btn.btn-rosso', { style: 'width:100%', onclick: chiedi }, 'Cancella tutto'),
    );
  }

  function chiedi() {
    if (!conferma(
      'Cancello tutto: allenamenti, serie registrate, foto e impostazioni. '
      + 'Se non hai un backup, non tornano più. Vuoi continuare?',
    )) return;
    secondoPasso();
  }

  function secondoPasso() {
    const campo = h('input', {
      type: 'text',
      autocapitalize: 'none',
      autocorrect: 'off',
      spellcheck: 'false',
      placeholder: 'cancella',
      'aria-label': 'Scrivi cancella per confermare',
    });

    const btn = h('button.btn.btn-rosso', { style: 'width:100%', disabled: true },
      'Cancella definitivamente');

    campo.addEventListener('input', () => {
      btn.disabled = campo.value.trim().toLowerCase() !== 'cancella';
    });

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Cancello…';
      try {
        await store.svuotaTutto();
        location.reload();
      } catch (e) {
        metti(blocco,
          h('p.occhiello', 'Cancella tutto'),
          h('div.fascia.alt-fascia-rossa', String(e?.message || e)),
          h('button.btn', { style: 'width:100%;margin-top:10px', onclick: primoPasso }, 'Torna indietro'),
        );
      }
    });

    metti(blocco,
      h('p.occhiello', 'Cancella tutto'),
      h('p.nota', { style: 'margin:8px 0 10px' }, 'Scrivi la parola cancella per confermare.'),
      campo,
      h('div', { style: 'height:10px' }),
      btn,
      h('button.btn', { style: 'width:100%;margin-top:10px', onclick: primoPasso }, 'Lascia stare'),
    );
    campo.focus();
  }

  primoPasso();
  return blocco;
}

/* ---------- stile locale ---------------------------------- */
/* app.css non si tocca: quel che manca vive qui, con classi alt-. */

const STILE = `
.alt-fascia-rossa { border-color: var(--rosso); color: var(--rosso); }
.alt-riga-campo { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.alt-esito { margin-top: 8px; min-height: 20px; }
.alt-esito-box { margin-top: 10px; }
.alt-piani { margin-top: 8px; }
.alt-riga-piano {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  min-height: var(--tap); padding: 10px 0; border-bottom: 1px solid var(--linea-2);
}
.alt-riga-piano:last-child { border-bottom: 0; }
.alt-nome-piano { color: inherit; font-weight: 700; text-decoration: underline; }
.alt-marchio { color: var(--ink); white-space: nowrap; }
.alt-attivo { background: var(--ink); color: var(--paper); border-color: var(--ink); }
`;

function iniettaStile() {
  if (document.getElementById('stile-altro')) return;
  const s = document.createElement('style');
  s.id = 'stile-altro';
  s.textContent = STILE;
  document.head.append(s);
}
