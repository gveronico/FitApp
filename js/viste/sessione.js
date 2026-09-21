/* sessione.js — la schermata che si guarda in palestra: un esercizio alla volta,
   una riga per serie, un tastierino grande in fondo. Ogni serie confermata finisce
   subito in IndexedDB: l'app può chiudersi in qualsiasi momento senza perdere niente.

   Rotta a schermo pieno: la barra di navigazione è nascosta dal router, l'uscita
   la fornisce il pulsante Esci in testata. */

import { h, metti, durata, peso, iso, tocco, conferma } from '../ui.js';
import * as piani from '../piani.js';
import * as store from '../store.js';

const SOGLIA_GIALLO = 45 * 60;   // secondi — il piano dice 45-50 minuti
const SOGLIA_ROSSA = 50 * 60;    // secondi — oltre qui la seduta è lunga

export async function monta(contenitore, parametri) {
  iniettaStile();

  const sedutaId = parametri && parametri[0] ? parametri[0] : null;
  const [st, profilo, pesoCorporeo] = await Promise.all([
    piani.stato(), store.leggi('profilo'), store.leggi('pesoCorporeo'),
  ]);

  const seduta = (st.piano?.sedute || []).find((s) => s.id === sedutaId) || null;
  if (!seduta) {
    mostraVuoto(contenitore, 'Questa seduta non esiste nel piano attivo.');
    return;
  }

  /* Se manca la data di inizio si conta come settimana 1, e lo si dice. */
  const settimana = st.settimanaNellaFase || 1;
  const esercizi = (seduta.esercizi || []).filter((e) => piani.serieDi(e, settimana) > 0);
  if (!esercizi.length) {
    mostraVuoto(contenitore, 'Questa seduta non ha esercizi in questa settimana.');
    return;
  }

  const pesoValido = Number(pesoCorporeo) > 0;
  const totaleSerie = esercizi.reduce((t, e) => t + piani.serieDi(e, settimana), 0);

  /* ---------- sessione ----------------------------------- */

  const sessione = await apriSessione(st, seduta);

  /** chiave -> serie salvata. La chiave lega esercizio e indice della serie. */
  const registrate = new Map();
  (await store.serieDiSessione(sessione.id)).forEach((s) => {
    registrate.set(chiave(s.esercizioId, s.indice), s);
  });

  /** esercizio -> serie della volta precedente, per la precompilazione. */
  const storico = new Map();
  await Promise.all(esercizi.map(async (e) => {
    const tutte = await store.serieDiEsercizio(e.id);
    const altre = tutte.filter((s) => s.sessioneId !== sessione.id);
    if (!altre.length) { storico.set(e.id, null); return; }
    const ultimaSessione = altre[altre.length - 1].sessioneId;
    storico.set(e.id, altre.filter((s) => s.sessioneId === ultimaSessione));
  }));

  /** esercizio -> testo della nota. Sta sulla prima serie registrata, qualunque sia il suo
      indice: finché non c'è nessuna serie la nota resta qui, in memoria. */
  const note = new Map();
  esercizi.forEach((e) => {
    const conNota = confermate(e).find((s) => s.note);
    note.set(e.id, conNota ? conNota.note : '');
  });

  /** esercizio con caricoAlternativo -> modo scelto. Si ricorda tra una seduta e l'altra. */
  const modi = new Map();
  await Promise.all(esercizi.filter((e) => e.caricoAlternativo).map(async (e) => {
    const salvato = await store.leggi(`modoCarico:${e.id}`);
    if (salvato === e.carico || salvato === e.caricoAlternativo) modi.set(e.id, salvato);
  }));

  /** Il modo di calcolo attivo per l'esercizio: quello predefinito o l'alternativo. */
  function modoDi(e) {
    return modi.get(e.id) || e.carico;
  }

  /** Copia dell'esercizio con il modo scelto al posto di `carico`, per piani.js. */
  function perCalcolo(e) {
    return modi.has(e.id) ? { ...e, carico: modi.get(e.id) } : e;
  }

  /** Senza peso corporeo questi carichi non si possono calcolare. */
  function richiedePeso(e) {
    const modo = modoDi(e);
    return modo === 'assistito' || modo === 'corpoLibero';
  }

  /** chiave -> { carico, rip } come stringhe digitate, non ancora numeri. */
  const bozze = new Map();

  /* ---------- impalcatura -------------------------------- */

  const crono = h('div.cifra-s.ses-crono.mono', '0:00');
  const progresso = h('p.occhiello.ses-progresso', '');
  const testata = h('header.testata.ses-testata', [
    crono,
    progresso,
    h('button.btn.btn-s', { type: 'button', onclick: esci }, 'Esci'),
  ]);

  const schermata = h('div.schermata');

  const cifraRecupero = h('div.cifra.blu.mono', '0:00');
  const pannelloRecupero = h('div.ses-recupero', { hidden: true }, [
    h('div.cresci', [h('p.occhiello', 'Recupero'), cifraRecupero]),
    h('button.btn', { type: 'button', onclick: () => spostaRecupero(30) }, '+30 s'),
    h('button.btn', { type: 'button', onclick: fermaRecupero }, 'Salta'),
  ]);

  const etichettaAttivo = h('p.occhiello', 'Carico');
  const valoreAttivo = h('p.titolo-2.mono', '–');
  const tastoVirgola = tasto(',');
  const tastierino = h('div.ses-tast', { hidden: true }, [
    h('div.ses-tast-barra', [
      h('div.cresci', [etichettaAttivo, valoreAttivo]),
      h('button.btn', { type: 'button', onclick: chiudiTastierino }, 'Chiudi'),
    ]),
    h('div.ses-tasti', [
      tasto('1'), tasto('2'), tasto('3'),
      tasto('4'), tasto('5'), tasto('6'),
      tasto('7'), tasto('8'), tasto('9'),
      tastoVirgola, tasto('0'), tasto('⌫'),
    ]),
  ]);

  const fondo = h('div.ses-fondo', { hidden: true }, [pannelloRecupero, tastierino]);

  contenitore.append(testata, schermata, fondo);

  /* ---------- cronometro della seduta --------------------- */

  const idCrono = setInterval(battitoCrono, 1000);
  battitoCrono();

  function battitoCrono() {
    if (!crono.isConnected) { clearInterval(idCrono); return; }
    const sec = Math.max(0, Math.round((Date.now() - sessione.iniziata) / 1000));
    crono.textContent = durata(sec);
    crono.classList.toggle('ses-crono-giallo', sec >= SOGLIA_GIALLO && sec < SOGLIA_ROSSA);
    crono.classList.toggle('ses-crono-rosso', sec >= SOGLIA_ROSSA);
  }

  /* ---------- timer di recupero --------------------------- */

  let idRecupero = null;
  let fineRecupero = 0;

  function avviaRecupero(sec) {
    if (!sec || sec <= 0) return;           // primo esercizio di una superserie
    fineRecupero = Date.now() + sec * 1000;
    pannelloRecupero.hidden = false;
    aggiornaFondo();
    battitoRecupero();
    if (!idRecupero) idRecupero = setInterval(battitoRecupero, 250);
  }

  function battitoRecupero() {
    if (!pannelloRecupero.isConnected) { clearInterval(idRecupero); idRecupero = null; return; }
    const restano = Math.ceil((fineRecupero - Date.now()) / 1000);
    if (restano <= 0) {
      fermaRecupero();
      tocco(60);
      segnale();
      return;
    }
    cifraRecupero.textContent = durata(restano);
  }

  function spostaRecupero(sec) {
    fineRecupero += sec * 1000;
    battitoRecupero();
  }

  function fermaRecupero() {
    if (idRecupero) { clearInterval(idRecupero); idRecupero = null; }
    pannelloRecupero.hidden = true;
    aggiornaFondo();
  }

  /* ---------- tastierino --------------------------------- */

  let attivo = null;                        // { esercizio, indice, tipo }
  const campi = new Map();                  // chiave:tipo -> pulsante
  const righe = new Map();                  // chiave -> { riga, fatta }

  function tasto(segno) {
    return h('button.ses-tasto', { type: 'button', onclick: () => premi(segno) }, segno);
  }

  function attiva(esercizio, indice, tipo) {
    for (const b of campi.values()) b.classList.remove('ses-campo-attivo');
    attivo = { esercizio, indice, tipo };
    const campo = campi.get(`${chiave(esercizio.id, indice)}:${tipo}`);
    if (campo) campo.classList.add('ses-campo-attivo');

    etichettaAttivo.textContent = tipo === 'carico'
      ? piani.etichettaCarico(perCalcolo(esercizio))
      : (esercizio.carico === 'tempo' ? 'Secondi' : 'Ripetizioni');
    valoreAttivo.textContent = bozza(esercizio, indice)[tipo] || '–';
    tastoVirgola.disabled = tipo !== 'carico';

    tastierino.hidden = false;
    aggiornaFondo();

    const gruppo = righe.get(chiave(esercizio.id, indice));
    if (gruppo) {
      requestAnimationFrame(() => gruppo.riga.scrollIntoView({ block: 'center' }));
    }
  }

  function chiudiTastierino() {
    for (const b of campi.values()) b.classList.remove('ses-campo-attivo');
    attivo = null;
    tastierino.hidden = true;
    aggiornaFondo();
  }

  function premi(segno) {
    if (!attivo) return;
    const dati = bozza(attivo.esercizio, attivo.indice);
    let v = dati[attivo.tipo] || '';
    if (segno === '⌫') v = v.slice(0, -1);
    else if (segno === ',') { if (attivo.tipo === 'carico' && !v.includes(',')) v = (v || '0') + ','; }
    else if (v.length < 6) v += segno;
    dati[attivo.tipo] = v;
    tocco(8);
    aggiornaCampo(attivo.esercizio, attivo.indice, attivo.tipo);
    valoreAttivo.textContent = v || '–';
  }

  /** Il fondo esiste solo quando ha qualcosa dentro: altrimenti resta una riga vuota. */
  function aggiornaFondo() {
    fondo.hidden = tastierino.hidden && pannelloRecupero.hidden;
    requestAnimationFrame(() => {
      schermata.style.paddingBottom = fondo.hidden ? '' : `${fondo.offsetHeight + 24}px`;
    });
  }

  /* ---------- dati delle righe ---------------------------- */

  function bozza(esercizio, indice) {
    const k = chiave(esercizio.id, indice);
    if (!bozze.has(k)) {
      const riferimento = registrate.get(k) || precedente(esercizio, indice);
      const digitato = riferimento ? aDigitato(esercizio, riferimento.carico) : null;
      bozze.set(k, {
        // Un digitato negativo vuol dire che quel carico è stato registrato nell'altro
        // modo (assistita contro libera): meglio il campo vuoto di un numero assurdo.
        carico: digitato == null || digitato < 0 ? '' : peso(digitato),
        rip: riferimento && riferimento.ripetizioni != null ? String(riferimento.ripetizioni) : '',
      });
    }
    return bozze.get(k);
  }

  /** La serie di pari indice dell'ultima volta; se manca, l'ultima disponibile. */
  function precedente(esercizio, indice) {
    const ultime = storico.get(esercizio.id);
    if (!ultime || !ultime.length) return null;
    return ultime.find((s) => s.indice === indice) || ultime[ultime.length - 1];
  }

  /** Dal numero digitato al carico da registrare, nel modo scelto per l'esercizio. */
  function aReale(esercizio, digitato) {
    // A corpo libero il campo vuoto vuol dire nessuna zavorra, cioè zero.
    const n = numero(digitato) ?? (modoDi(esercizio) === 'corpoLibero' ? 0 : null);
    if (n == null) return null;
    // Senza peso corporeo il carico reale non esiste: nessun numero è meglio di uno falso.
    if (!pesoValido && richiedePeso(esercizio)) return null;
    return piani.caricoReale(perCalcolo(esercizio), n, pesoCorporeo);
  }

  /** L'inverso, per riempire il campo. */
  function aDigitato(esercizio, reale) {
    if (reale == null) return null;
    if (!pesoValido && richiedePeso(esercizio)) return reale;
    return piani.caricoDigitato(perCalcolo(esercizio), reale, pesoCorporeo);
  }

  function confermate(esercizio) {
    const out = [];
    for (const s of registrate.values()) if (s.esercizioId === esercizio.id) out.push(s);
    return out.sort((a, b) => a.indice - b.indice);
  }

  function completo(esercizio) {
    return confermate(esercizio).length >= piani.serieDi(esercizio, settimana);
  }

  /* ---------- disegno dell'esercizio ---------------------- */

  let iEs = esercizi.findIndex((e) => !completo(e));
  if (iEs < 0) iEs = esercizi.length - 1;

  let notaCompleto = null;
  let btnAvanti = null;
  let btnChiudi = null;
  let rigaBloccoPeso = null;

  function disegna() {
    const e = esercizi[iEs];
    const n = piani.serieDi(e, settimana);
    const aTempo = e.carico === 'tempo';

    campi.clear();
    righe.clear();
    chiudiTastierino();
    progresso.textContent = `esercizio ${iEs + 1} di ${esercizi.length}`;

    const pezzi = [];

    if (!st.impostato) {
      pezzi.push(h('div.fascia.fascia-avviso', [
        'Manca la data del primo allenamento: conto come settimana 1. ',
        h('a', { href: '#/altro', style: 'color:inherit' }, 'Impostala in Altro →'),
      ]));
    }

    rigaBloccoPeso = null;
    if (!pesoValido && richiedePeso(e)) {
      rigaBloccoPeso = h('p.nota.ses-blocco-peso.nascondi', '');
      pezzi.push(h('div.fascia.fascia-avviso', [
        'Manca il peso corporeo: senza quello questo esercizio non si può registrare. ',
        h('a', { href: '#/altro', style: 'color:inherit' }, 'Impostalo in Altro →'),
        rigaBloccoPeso,
      ]));
    }

    /* --- intestazione dell'esercizio --- */

    const testa = [h('h2.titolo', e.nome), h('p.nota', `${n} serie × ${e.rip}`)];
    if (e.note) testa.push(h('p.nota', e.note));
    if (profilo === 'corinna' && e.varianteFacile) {
      testa.push(h('p.nota', `Variante: ${e.varianteFacile}`));
    }
    const compagni = esercizi.filter((x) => x !== e && x.superserie != null && x.superserie === e.superserie);
    if (compagni.length) {
      testa.push(h('p.nota', `In superserie con ${compagni.map((x) => x.nome).join(' e ')}.`));
    }
    pezzi.push(h('div.pila-s', testa));

    /* --- come si fa l'esercizio, quando ci sono due modi --- */

    if (e.caricoAlternativo) pezzi.push(interruttoreModo(e));

    /* --- una riga per serie --- */

    const elenco = [
      h(aTempo ? 'div.ses-riga.ses-riga-tempo.ses-intest' : 'div.ses-riga.ses-intest', [
        h('span.occhiello', ''),
        aTempo ? null : h('span.occhiello', piani.etichettaCarico(perCalcolo(e))),
        h('span.occhiello', aTempo ? 'Secondi' : 'Ripetizioni'),
        h('span'),
      ].filter(Boolean)),
    ];
    for (let i = 0; i < n; i += 1) elenco.push(rigaSerie(e, i, aTempo));
    pezzi.push(h('div.blocco', elenco));

    /* --- storico e carico reale --- */

    pezzi.push(h('p.nota.ses-ultima', testoUltimaVolta(e)));
    if (!aTempo && richiedePeso(e) && pesoValido) {
      pezzi.push(h('p.nota.ses-reale', ''));
    }

    /* --- nota dell'esercizio --- */

    const testoNota = note.get(e.id) || '';
    const area = h('textarea', {
      value: testoNota,
      placeholder: 'Sensazioni, tecnica, regolazione della macchina',
      onchange: (ev) => salvaNota(e, ev.target.value),
    });
    pezzi.push(h('details.piega', { open: !!testoNota }, [
      h('summary', 'Nota'),
      h('div.corpo', [area]),
    ]));

    /* --- navigazione --- */

    notaCompleto = h('p.nota.verde.ses-completo', 'Esercizio completo.');
    btnAvanti = h('button.btn', {
      type: 'button',
      disabled: iEs >= esercizi.length - 1,
      onclick: () => vai(iEs + 1),
    }, 'Avanti');
    btnChiudi = h('button.btn.ses-largo', { type: 'button', onclick: chiudiAllenamento },
      'Chiudi allenamento');

    pezzi.push(notaCompleto);
    pezzi.push(h('div.btn-riga', [
      h('button.btn', { type: 'button', disabled: iEs <= 0, onclick: () => vai(iEs - 1) }, 'Indietro'),
      btnAvanti,
    ]));
    pezzi.push(btnChiudi);

    metti(schermata, pezzi);
    aggiornaReale(e);
    aggiornaAvanzamento(e);
    window.scrollTo(0, 0);
    aggiornaFondo();
  }

  /** Due stati: il modo predefinito del piano e quello alternativo. Cambia solo come
      si converte il numero digitato — la serie finisce sempre sullo stesso esercizio. */
  function interruttoreModo(e) {
    const scelto = modoDi(e);
    const bottoni = [e.carico, e.caricoAlternativo].map((m) => {
      const b = h('button.ses-modo-btn', {
        type: 'button',
        'aria-pressed': m === scelto ? 'true' : 'false',
        onclick: () => cambiaModo(e, m),
      }, etichettaModo(m));
      if (m === scelto) b.classList.add('ses-modo-attivo');
      return b;
    });
    return h('div.ses-modo', [
      h('p.occhiello', 'Come le fai'),
      h('div.ses-modo-gruppo', bottoni),
    ]);
  }

  async function cambiaModo(e, modo) {
    if (modoDi(e) === modo) return;
    modi.set(e.id, modo);
    // Il numero digitato cambia significato: si ricostruisce dalle serie note.
    for (const k of [...bozze.keys()]) {
      if (k.startsWith(`${e.id}#`)) bozze.delete(k);
    }
    tocco();
    disegna();
    await store.scrivi(`modoCarico:${e.id}`, modo);
  }

  function rigaSerie(e, i, aTempo) {
    const k = chiave(e.id, i);
    const dati = bozza(e, i);

    const campoCarico = aTempo ? null : campo(e, i, 'carico', dati.carico);
    const campoRip = campo(e, i, 'rip', dati.rip);
    const fatta = h('button.btn.ses-fatta', {
      type: 'button',
      onclick: () => registra(e, i),
    }, registrate.has(k) ? 'Aggiorna' : 'Fatta');

    const riga = h(aTempo ? 'div.ses-riga.ses-riga-tempo' : 'div.ses-riga', [
      h('span.ses-n', String(i + 1)),
      campoCarico,
      campoRip,
      fatta,
    ].filter(Boolean));

    righe.set(k, { riga, fatta });
    if (registrate.has(k)) riga.classList.add('ses-riga-fatta');
    return riga;
  }

  function campo(e, i, tipo, testo) {
    const b = h('button.ses-campo', {
      type: 'button',
      onclick: () => attiva(e, i, tipo),
    }, testo || segnaposto(e, tipo));
    if (!testo) b.classList.add('ses-campo-vuoto');
    campi.set(`${chiave(e.id, i)}:${tipo}`, b);
    return b;
  }

  function aggiornaCampo(e, i, tipo) {
    const b = campi.get(`${chiave(e.id, i)}:${tipo}`);
    if (!b) return;
    const v = bozza(e, i)[tipo];
    b.textContent = v || segnaposto(e, tipo);
    b.classList.toggle('ses-campo-vuoto', !v);
    if (tipo === 'carico') aggiornaReale(e);
  }

  /** "carico reale: 58 kg" — solo per assistito e corpo libero, sull'ultima riga toccata. */
  function aggiornaReale(e) {
    const p = schermata.querySelector('.ses-reale');
    if (!p) return;
    const i = attivo && attivo.esercizio === e ? attivo.indice : 0;
    const reale = aReale(e, bozza(e, i).carico);
    p.textContent = reale == null ? '' : `carico reale: ${peso(reale)} kg`;
  }

  /* ---------- registrazione di una serie ------------------ */

  async function registra(e, i) {
    const k = chiave(e.id, i);
    const dati = bozza(e, i);
    const rip = numero(dati.rip);
    if (rip == null || rip <= 0) { tocco(); attiva(e, i, 'rip'); return; }

    // Senza peso corporeo qui si registrerebbe un numero che poi esplode: meglio fermarsi.
    if (!pesoValido && richiedePeso(e)) { spiegaBloccoPeso(e); return; }

    const gia = registrate.get(k);
    const serie = {
      id: gia ? gia.id : store.nuovoId('ser'),
      sessioneId: sessione.id,
      data: sessione.data,
      pianoId: sessione.pianoId,
      sedutaId: sessione.sedutaId,
      esercizioId: e.id,
      indice: i,
      carico: e.carico === 'tempo' ? null : aReale(e, dati.carico),
      ripetizioni: Math.round(rip),
      monitorata: sessione.monitorata,
      note: gia ? (gia.note || '') : '',
    };

    registrate.set(k, serie);
    await store.salvaSerie(serie);
    await fissaNota(e);

    tocco();
    chiudiTastierino();
    const gruppo = righe.get(k);
    if (gruppo) {
      gruppo.riga.classList.add('ses-riga-fatta');
      gruppo.fatta.textContent = 'Aggiorna';
    }
    if (!gia) avviaRecupero(e.recuperoSec);
    aggiornaAvanzamento(e);
  }

  /** Spiega perché la serie non parte e manda dove si risolve. */
  function spiegaBloccoPeso(e) {
    tocco();
    if (!rigaBloccoPeso) return;
    rigaBloccoPeso.textContent = modoDi(e) === 'assistito'
      ? 'Non registro: il carico è peso corporeo meno assistenza, e il peso corporeo manca.'
      : 'Non registro: il carico è peso corporeo più zavorra, e il peso corporeo manca.';
    rigaBloccoPeso.classList.remove('nascondi');
    rigaBloccoPeso.scrollIntoView({ block: 'center' });
  }

  /** La nota dell'esercizio sta sulla prima serie registrata, qualunque sia il suo indice:
      così non si perde se la serie 1 non viene mai confermata. Finché non c'è nessuna serie
      resta in memoria e ci riproviamo alla prossima registrazione. */
  async function fissaNota(e) {
    const fatte = confermate(e);
    if (!fatte.length) return;
    const testo = note.get(e.id) || '';
    const daSalvare = [];
    fatte.forEach((s, i) => {
      const atteso = i === 0 ? testo : '';
      if ((s.note || '') !== atteso) { s.note = atteso; daSalvare.push(s); }
    });
    if (daSalvare.length) await store.salvaSerieMulte(daSalvare);
  }

  async function salvaNota(e, testo) {
    note.set(e.id, testo);
    await fissaNota(e);
  }

  /** Note scritte ma senza nessuna serie su cui posarsi: non si buttano in silenzio. */
  function noteOrfane() {
    return esercizi.filter((e) => (note.get(e.id) || '').trim() && !confermate(e).length);
  }

  /** Niente salti automatici: si evidenzia il passo successivo e basta. */
  function aggiornaAvanzamento(e) {
    const finito = completo(e);
    if (notaCompleto) notaCompleto.classList.toggle('nascondi', !finito);
    const ultimo = iEs >= esercizi.length - 1;
    if (btnAvanti) btnAvanti.classList.toggle('ses-evidenzia', finito && !ultimo);
    if (btnChiudi) btnChiudi.classList.toggle('ses-evidenzia', finito && ultimo);
  }

  function vai(i) {
    if (i < 0 || i >= esercizi.length) return;
    fermaRecupero();
    iEs = i;
    disegna();
  }

  /* ---------- uscita e chiusura --------------------------- */

  function mancanti() {
    return totaleSerie - registrate.size;
  }

  function esci() {
    if (mancanti() > 0
      && !conferma('Ci sono serie non registrate. Esci lo stesso? La sessione resta aperta e la riprendi dopo.')) return;
    location.hash = '#/oggi';
  }

  async function chiudiAllenamento() {
    if (mancanti() > 0
      && !conferma(`Ci sono ${mancanti()} serie non registrate. Chiudo lo stesso l'allenamento?`)) return;
    fermaRecupero();
    sessione.finita = Date.now();
    sessione.durataSec = Math.max(0, Math.round((sessione.finita - sessione.iniziata) / 1000));
    await store.salvaSessione(sessione);
    mostraRiepilogo();
  }

  /** Sostituisce tutta la schermata: così crono e recupero escono dal DOM e si fermano. */
  function mostraRiepilogo() {
    const sec = sessione.durataSec || 0;
    const oltre = sec > SOGLIA_ROSSA;

    const pezzi = [
      h('div.blocco', [
        h('p.occhiello', 'Durata'),
        h('div', { class: oltre ? 'cifra rosso mono' : 'cifra mono' }, durata(sec)),
        oltre ? h('p.nota.rosso', 'Oltre i 50 minuti del piano.') : null,
      ].filter(Boolean)),
      h('div.blocco.blocco-quieto', [
        h('p.occhiello', 'Serie registrate'),
        h('div.cifra-s.mono', `${registrate.size} di ${totaleSerie}`),
      ]),
    ];

    const progressi = bloccoProgressione();
    if (progressi) pezzi.push(progressi);
    else if (!sessione.monitorata) {
      pezzi.push(h('div.blocco.blocco-quieto', [
        h('p.nota', 'Fase di avvicinamento: i carichi sono annotati, non conteggiati.'),
      ]));
    }

    const orfane = noteOrfane();
    if (orfane.length) {
      pezzi.push(h('div.blocco', [
        h('p.occhiello', 'Note non salvate'),
        h('p.nota', 'Una nota si attacca alla prima serie registrata. Qui non c\'è nessuna serie, quindi questo testo resta solo a schermo:'),
        h('ul.lista', orfane.map((e) => h('li', [
          h('span.cresci', e.nome),
          h('span.nota', note.get(e.id)),
        ]))),
      ]));
    }

    pezzi.push(h('div.blocco', [
      h('p.occhiello', 'Esercizi'),
      h('ul.lista', esercizi.map((e) => {
        const fatte = confermate(e);
        return h(fatte.length ? 'li' : 'li.spento', [
          h('span.cresci', e.nome),
          h('span.nota.mono', riassunto(e, fatte)),
        ]);
      })),
    ]));

    pezzi.push(h('a.btn.btn-primo', { href: '#/oggi' }, 'Torna a oggi'));

    contenitore.replaceChildren(
      h('header.testata', [h('div', [
        h('p.occhiello', 'Allenamento chiuso'),
        h('h1.titolo', seduta.nome),
      ])]),
      h('div.schermata', pezzi),
    );
  }

  /** Doppia progressione: si sale solo dove tutte le serie hanno chiuso al numero alto. */
  function bloccoProgressione() {
    if (!sessione.monitorata || !st.piano?.progressione) return null;

    const righeTesto = [];
    esercizi.forEach((e) => {
      if (e.carico === 'tempo' || e.ripMax == null) return;
      const fatte = confermate(e);
      if (!fatte.length) return;
      if (!fatte.every((s) => s.ripetizioni != null && s.ripetizioni >= e.ripMax)) return;
      if (!fatte.every((s) => s.carico != null && Number.isFinite(s.carico))) return;
      const base = Math.max(...fatte.map((s) => s.carico));
      const nuovo = base + (e.incrementoKg ?? 2.5);
      righeTesto.push(`${e.nome}: la prossima volta sali a ${peso(nuovo)} kg`);
    });

    if (!righeTesto.length) return null;
    return h('div.blocco.blocco-pieno', [
      h('p.occhiello', 'Progressione'),
      h('ul.lista', righeTesto.map((t) => h('li', h('span.cresci', t)))),
    ]);
  }

  function riassunto(e, fatte) {
    if (!fatte.length) return 'non svolto';
    if (e.carico === 'tempo') {
      return `${fatte.length} serie · ${Math.max(...fatte.map((s) => s.ripetizioni || 0))} s`;
    }
    const carichi = fatte.map((s) => s.carico).filter((c) => c != null && Number.isFinite(c));
    if (!carichi.length) return `${fatte.length} serie`;
    return `${fatte.length} serie · ${peso(Math.max(...carichi))} kg`;
  }

  function testoUltimaVolta(e) {
    const rif = precedente(e, 0);
    if (!rif) return 'primo allenamento su questo esercizio';
    if (e.carico === 'tempo') return `ultima volta: ${rif.ripetizioni} s`;
    if (rif.carico == null) return `ultima volta: ${rif.ripetizioni} ripetizioni`;
    return `ultima volta: ${peso(rif.carico)} kg × ${rif.ripetizioni}`;
  }

  disegna();
}

/* ---------- apertura e ripresa della sessione ------------- */

/** Riprende quella aperta se è della stessa seduta e dello stesso giorno, altrimenti
    la chiude e ne apre una nuova. */
async function apriSessione(st, seduta) {
  const oggi = iso();
  let aperta = await store.sessioneAperta();

  if (aperta && (aperta.sedutaId !== seduta.id || aperta.data !== oggi)) {
    aperta.finita = Date.now();
    aperta.durataSec = Math.max(0, Math.round((aperta.finita - aperta.iniziata) / 1000));
    await store.salvaSessione(aperta);
    aperta = null;
  }
  if (aperta) return aperta;

  const nuova = {
    id: store.nuovoId('ses'),
    data: oggi,
    iniziata: Date.now(),
    finita: null,
    durataSec: null,
    pianoId: st.riferimento?.id || null,
    sedutaId: seduta.id,
    monitorata: !!st.riferimento?.monitorata,
  };
  await store.salvaSessione(nuova);
  return nuova;
}

/* ---------- minuterie ------------------------------------- */

function chiave(esercizioId, indice) {
  return `${esercizioId}#${indice}`;
}

function numero(testo) {
  const t = String(testo ?? '').replace(',', '.').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Nome leggibile di un modo di carico, per l'interruttore. */
const ETICHETTE_MODO = {
  corpoLibero: 'Libere',
  assistito: 'Assistite',
  esterno: 'Con carico',
  tempo: 'A tempo',
};

function etichettaModo(modo) {
  return ETICHETTE_MODO[modo] || modo;
}

function segnaposto(esercizio, tipo) {
  if (tipo === 'rip') return esercizio.carico === 'tempo' ? 'sec' : 'rip';
  return 'kg';
}

function mostraVuoto(contenitore, messaggio) {
  contenitore.append(
    h('header.testata', [h('h1.titolo', 'Sessione')]),
    h('div.schermata', [h('div.vuoto', [
      h('p.nota', messaggio),
      h('a.btn', { href: '#/scheda' }, 'Vai alla scheda'),
    ])]),
  );
}

/** Segnale breve a fine recupero. Su iOS può essere bloccato: si tace e basta. */
function segnale() {
  try {
    const Contesto = window.AudioContext || window.webkitAudioContext;
    if (!Contesto) return;
    const ctx = new Contesto();
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 880;
    vol.gain.value = 0.08;
    osc.connect(vol);
    vol.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
    osc.onended = () => { try { ctx.close(); } catch { /* già chiuso */ } };
  } catch { /* audio non disponibile */ }
}

/* ---------- stile locale ---------------------------------- */
/* app.css non si tocca: quel che manca vive qui, con classi ses-. */

const STILE = `
.ses-testata { align-items: center; }
.ses-crono { padding: 2px 8px; font-weight: 800; line-height: 1.1; }
.ses-crono-giallo { background: var(--giallo); color: #000; }
.ses-crono-rosso { background: var(--rosso); color: var(--su-colore); }
.ses-progresso { text-align: center; }

.ses-riga {
  display: grid;
  grid-template-columns: 24px 1fr 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 6px 0 6px 8px;
  border-left: var(--bordo-xl) solid transparent;
  border-bottom: 1px solid var(--linea-2);
}
.ses-riga-tempo { grid-template-columns: 24px 1fr auto; }
.ses-riga:last-child { border-bottom: 0; }
.ses-intest { padding-top: 0; padding-bottom: 4px; border-bottom: var(--bordo) solid var(--linea); }
.ses-n { font-size: 13px; font-weight: 800; color: var(--ink-2); font-variant-numeric: tabular-nums; }

.ses-campo {
  appearance: none;
  min-height: var(--tap);
  padding: 0 8px;
  border: var(--bordo) solid var(--linea);
  background: var(--paper);
  color: var(--ink);
  font-family: inherit;
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
  cursor: pointer;
}
.ses-campo-vuoto { color: var(--ink-2); font-weight: 400; font-size: 15px; }
.ses-campo-attivo { background: var(--ink); color: var(--paper); }
.ses-fatta { padding: 0 12px; font-size: 15px; }

.ses-riga-fatta { border-left-color: var(--verde); }
.ses-riga-fatta .ses-n { color: var(--verde); }
.ses-riga-fatta .ses-campo { border-color: var(--verde); color: var(--verde); }
.ses-riga-fatta .ses-campo-attivo { background: var(--verde); color: var(--su-colore); }
.ses-riga-fatta .ses-fatta { border-color: var(--verde); color: var(--verde); }

.ses-modo { display: grid; gap: 6px; }
.ses-modo-gruppo {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--bordo);
  background: var(--linea);
  border: var(--bordo) solid var(--linea);
}
.ses-modo-btn {
  appearance: none;
  min-height: var(--tap);
  border: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: inherit;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
}
.ses-modo-attivo { background: var(--ink); color: var(--paper); }

.ses-blocco-peso { color: inherit; font-weight: 700; margin-top: 6px; }

.ses-ultima, .ses-reale { margin-top: -6px; }
.ses-completo { font-weight: 700; }
.ses-largo { width: 100%; }
.ses-evidenzia { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.ses-evidenzia:active { background: var(--paper); color: var(--ink); }

.ses-fondo {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  z-index: 40;
  background: var(--paper);
  border-top: var(--bordo) solid var(--linea);
  padding-bottom: env(safe-area-inset-bottom);
}
.ses-fondo[hidden] { display: none; }

.ses-recupero {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px var(--gutter);
  border-bottom: var(--bordo) solid var(--linea);
}
.ses-recupero[hidden] { display: none; }
.ses-recupero .cifra { font-size: 44px; }

.ses-tast[hidden] { display: none; }
.ses-tast-barra { display: flex; align-items: center; gap: 10px; padding: 8px var(--gutter); }
.ses-tasti {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--bordo);
  background: var(--linea);
  border-top: var(--bordo) solid var(--linea);
}
.ses-tasto {
  appearance: none;
  min-height: 56px;
  border: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: inherit;
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  user-select: none;
}
.ses-tasto:active { background: var(--ink); color: var(--paper); }
.ses-tasto[disabled] { color: var(--ink-2); opacity: 0.45; pointer-events: none; }
`;

function iniettaStile() {
  if (document.getElementById('stile-sessione')) return;
  const s = document.createElement('style');
  s.id = 'stile-sessione';
  s.textContent = STILE;
  document.head.append(s);
}
