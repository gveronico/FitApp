/* sessione.js — la schermata che si guarda in palestra: un esercizio alla volta,
   una riga per serie, un tastierino grande in fondo. Ogni serie confermata finisce
   subito in IndexedDB: l'app può chiudersi in qualsiasi momento senza perdere niente.

   In due (dal 29/09/2026). Giuseppe e Corinna fanno gli stessi esercizi, e li
   segna tutti Giuseppe dal suo telefono. Ognuno ha la sua sessione, i suoi
   carichi, il suo storico e il suo peso corporeo: sotto ogni esercizio c'è un
   riquadro a testa. In comune restano l'esercizio a schermo, il cronometro, il
   recupero e il tastierino. Chi si allena lo si sceglie in Oggi.

   Rotta a schermo pieno: la barra di navigazione è nascosta dal router, l'uscita
   la fornisce il pulsante Esci in testata. */

import {
  h, metti, durata, peso, iso, daIso, giorni, mesiBrevi, tocco, conferma,
} from '../ui.js';
import * as piani from '../piani.js';
import * as store from '../store.js';

const SOGLIA_GIALLO = 45 * 60;   // secondi — il piano dice 45-50 minuti
const SOGLIA_ROSSA = 50 * 60;    // secondi — oltre qui la seduta è lunga

export async function monta(contenitore, parametri) {
  iniettaStile();

  const sedutaId = parametri && parametri[0] ? parametri[0] : null;
  const [st, profilo] = await Promise.all([piani.stato(), store.leggi('profilo')]);

  const seduta = (st.piano?.sedute || []).find((s) => s.id === sedutaId) || null;
  if (!seduta) {
    mostraVuoto(contenitore, 'Questa seduta non esiste nel piano attivo.');
    return;
  }

  /* Se manca la data di inizio si conta come settimana 1, e lo si dice. */
  const settimana = st.settimanaNellaFase || 1;
  const delPiano = (seduta.esercizi || []).filter((e) => piani.serieDi(e, settimana) > 0);
  if (!delPiano.length) {
    mostraVuoto(contenitore, 'Questa seduta non ha esercizi in questa settimana.');
    return;
  }

  /* ---------- chi si allena ------------------------------ */

  /* Quelli scelti in Oggi, più chi ha già cominciato questa seduta oggi: si
     riprende da dove si era, anche se nel frattempo la scelta è cambiata. */
  const scelti = await store.partecipanti();
  const giaQui = (await store.sessioni(store.TUTTE))
    .filter((x) => !x.finita && x.data === iso() && x.sedutaId === seduta.id)
    .map((x) => x.persona || profilo);
  const chi = store.PERSONE.filter((p) => scelti.includes(p) || giaQui.includes(p));
  const inDue = chi.length > 1;

  /** Tutto quello che è di una persona sola. */
  const P = [];
  for (const persona of chi) P.push(await preparaPersona(persona));

  async function preparaPersona(persona) {
    const pesoCorporeo = await store.pesoDi(persona);
    const sessione = await apriSessione(st, seduta, persona);

    /* Serie e ripetizioni cambiate per oggi: stanno sulla sessione, il piano non
       si tocca. Un esercizio a 0 serie è saltato — resta in elenco, si rimette. */
    if (!sessione.variazioni) sessione.variazioni = {};

    const p = {
      persona,
      nome: store.nomePersona(persona),
      sessione,
      pesoCorporeo,
      pesoValido: Number(pesoCorporeo) > 0,
      esercizi: [],
      /** chiave -> serie salvata. La chiave lega esercizio e indice della serie. */
      registrate: new Map(),
      /** esercizio -> serie della volta precedente, per la precompilazione. */
      storico: new Map(),
      /** esercizio -> testo della nota, vedi fissaNota(). */
      note: new Map(),
      /** esercizio con caricoAlternativo -> modo scelto. Si ricorda tra una seduta e l'altra. */
      modi: new Map(),
      /** chiave -> { carico, rip } come stringhe digitate, non ancora numeri. */
      bozze: new Map(),
      /* Le righe dove si è scritto qualcosa senza premere Fatta. Si tengono in
         IndexedDB, così un'app chiusa a metà non le perde, e alla chiusura
         dell'allenamento si salvano come serie: se hai scritto il peso, l'hai fatta. */
      toccate: new Set(),
      chiaveBozze: `bozze:${sessione.id}`,
      idBozze: null,
      giaFatta: [],
      ui: {},
    };
    p.esercizi = delPiano.map((e) => conVariazioni(p, e));

    if (sessione.seriePreviste !== totaleSerie(p)) {
      sessione.seriePreviste = totaleSerie(p);
      await store.salvaSessione(sessione);
    }

    /** La stessa seduta già fatta questa settimana, in un'altra sessione. */
    p.giaFatta = (await piani.fatteInSettimana(st.dataInizio, new Date(), sessione.id, persona))
      .filter((f) => f.sedutaId === seduta.id);

    (await store.serieDiSessione(sessione.id)).forEach((s) => {
      p.registrate.set(chiave(s.esercizioId, s.indice), s);
    });

    await Promise.all(p.esercizi.map(async (e) => {
      const tutte = await store.serieDiEsercizio(e.id, persona);
      const altre = tutte.filter((s) => s.sessioneId !== sessione.id);
      if (!altre.length) { p.storico.set(e.id, null); return; }
      const ultimaSessione = altre[altre.length - 1].sessioneId;
      p.storico.set(e.id, altre.filter((s) => s.sessioneId === ultimaSessione));
    }));

    /* La nota sta sulla prima serie registrata, qualunque sia il suo indice:
       finché non c'è nessuna serie la nota resta qui, in memoria. */
    p.esercizi.forEach((e) => {
      const conNota = confermate(p, e).find((s) => s.note);
      p.note.set(e.id, conNota ? conNota.note : '');
    });

    // Prima del 29/09/2026 il modo era uno per telefono: vale per il proprietario.
    await Promise.all(p.esercizi.filter((e) => e.caricoAlternativo).map(async (e) => {
      let salvato = await store.leggi(`modoCarico:${persona}:${e.id}`);
      if (salvato == null && (!profilo || profilo === persona)) salvato = await store.leggi(`modoCarico:${e.id}`);
      if (salvato === e.carico || salvato === e.caricoAlternativo) p.modi.set(e.id, salvato);
    }));

    const salvate = (await store.leggi(p.chiaveBozze)) || {};
    for (const [k, v] of Object.entries(salvate)) {
      if (p.registrate.has(k) || !v) continue;
      p.bozze.set(k, { carico: v.carico || '', rip: v.rip || '' });
      p.toccate.add(k);
    }
    return p;
  }

  /** L'esercizio del piano con le variazioni di oggi sopra. */
  function conVariazioni(p, e) {
    const v = p.sessione.variazioni[e.id];
    if (!v) return e;
    const out = { ...e, ...v, variato: true };
    if (v.serie != null) delete out.serieDaSettimana;
    if (v.ripSerie === null) delete out.ripSerie;
    return out;
  }

  /** Serie previste oggi: quelle del piano, con le variazioni. */
  function totaleSerie(p) {
    return p.esercizi.reduce((t, e) => t + piani.serieDi(e, settimana), 0);
  }

  /** Il modo di calcolo attivo per l'esercizio: quello predefinito o l'alternativo. */
  function modoDi(p, e) {
    return p.modi.get(e.id) || e.carico;
  }

  /** Copia dell'esercizio con il modo scelto al posto di `carico`, per piani.js. */
  function perCalcolo(p, e) {
    return p.modi.has(e.id) ? { ...e, carico: p.modi.get(e.id) } : e;
  }

  /** Senza peso corporeo questi carichi non si possono calcolare. */
  function richiedePeso(p, e) {
    const modo = modoDi(p, e);
    return modo === 'assistito' || modo === 'corpoLibero';
  }

  function ricordaBozze(p) {
    clearTimeout(p.idBozze);
    p.idBozze = setTimeout(() => {
      const out = {};
      p.toccate.forEach((k) => { if (!p.registrate.has(k) && p.bozze.has(k)) out[k] = p.bozze.get(k); });
      store.scrivi(p.chiaveBozze, out).catch(() => {});
    }, 300);
  }

  /** L'esercizio a schermo, visto da una persona: con le sue variazioni. */
  function suo(p, i = iEs) {
    return p.esercizi[i];
  }

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

  /** In due il cronometro parte dal primo che ha cominciato. */
  const iniziata = Math.min(...P.map((p) => p.sessione.iniziata));
  const idCrono = setInterval(battitoCrono, 1000);
  battitoCrono();

  function battitoCrono() {
    if (!crono.isConnected) { clearInterval(idCrono); return; }
    const sec = Math.max(0, Math.round((Date.now() - iniziata) / 1000));
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

  let attivo = null;                        // { p, esercizio, indice, tipo }
  const campi = new Map();                  // persona|chiave:tipo -> pulsante
  const righe = new Map();                  // persona|chiave -> { riga, fatta, prima }

  const dom = (p, esercizioId, indice) => `${p.persona}|${chiave(esercizioId, indice)}`;

  function tasto(segno) {
    return h('button.ses-tasto', { type: 'button', onclick: () => premi(segno) }, segno);
  }

  function attiva(p, esercizio, indice, tipo) {
    for (const b of campi.values()) b.classList.remove('ses-campo-attivo');
    attivo = { p, esercizio, indice, tipo };
    const campo = campi.get(`${dom(p, esercizio.id, indice)}:${tipo}`);
    if (campo) campo.classList.add('ses-campo-attivo');

    const cosa = tipo === 'carico'
      ? piani.etichettaCarico(perCalcolo(p, esercizio))
      : (esercizio.carico === 'tempo' ? 'Secondi' : 'Ripetizioni');
    etichettaAttivo.textContent = inDue ? `${p.nome} · ${cosa}` : cosa;
    valoreAttivo.textContent = bozza(p, esercizio, indice)[tipo] || '–';
    tastoVirgola.disabled = tipo !== 'carico';

    tastierino.hidden = false;
    aggiornaFondo();

    const gruppo = righe.get(dom(p, esercizio.id, indice));
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
    const { p } = attivo;
    const dati = bozza(p, attivo.esercizio, attivo.indice);
    let v = dati[attivo.tipo] || '';
    if (segno === '⌫') v = v.slice(0, -1);
    else if (segno === ',') { if (attivo.tipo === 'carico' && !v.includes(',')) v = (v || '0') + ','; }
    else if (v.length < 6) v += segno;
    dati[attivo.tipo] = v;
    p.toccate.add(chiave(attivo.esercizio.id, attivo.indice));
    ricordaBozze(p);
    tocco(8);
    aggiornaCampo(p, attivo.esercizio, attivo.indice, attivo.tipo);
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

  function bozza(p, esercizio, indice) {
    const k = chiave(esercizio.id, indice);
    if (!p.bozze.has(k)) {
      const riferimento = p.registrate.get(k) || precedente(p, esercizio, indice);
      const digitato = riferimento ? aDigitato(p, esercizio, riferimento.carico) : null;
      p.bozze.set(k, {
        // Un digitato negativo vuol dire che quel carico è stato registrato nell'altro
        // modo (assistita contro libera): meglio il campo vuoto di un numero assurdo.
        carico: digitato == null || digitato < 0 ? '' : peso(digitato),
        rip: ripDiPartenza(p, esercizio, indice, riferimento),
      });
    }
    return p.bozze.get(k);
  }

  /**
   * Con cosa parte il campo delle ripetizioni.
   *
   * Dove la scheda prescrive un numero per serie — il 12-10-8 della Fase 1 —
   * vince la prescrizione, non l'ultima volta: le ripetizioni lì sono fisse, e
   * ripescare l'11 di una serie andata storta abbasserebbe il bersaglio in
   * silenzio. Il carico continua a venire dall'ultima volta.
   * Una serie già confermata in questa sessione mostra sempre quello che dice lei.
   */
  function ripDiPartenza(p, esercizio, indice, riferimento) {
    const gia = p.registrate.get(chiave(esercizio.id, indice));
    if (gia && gia.ripetizioni != null) return String(gia.ripetizioni);

    const attese = piani.ripAttese(esercizio, indice);
    if (attese != null) return String(attese);

    return riferimento && riferimento.ripetizioni != null ? String(riferimento.ripetizioni) : '';
  }

  /** La serie di pari indice dell'ultima volta, senza ripieghi: il riferimento della riga. */
  function stessaSerieUltimaVolta(p, esercizio, indice) {
    const ultime = p.storico.get(esercizio.id);
    return ultime ? ultime.find((s) => s.indice === indice) || null : null;
  }

  /** La serie di pari indice dell'ultima volta; se manca, l'ultima disponibile. */
  function precedente(p, esercizio, indice) {
    const ultime = p.storico.get(esercizio.id);
    if (!ultime || !ultime.length) return null;
    return ultime.find((s) => s.indice === indice) || ultime[ultime.length - 1];
  }

  /** Dal numero digitato al carico da registrare, nel modo scelto per l'esercizio. */
  function aReale(p, esercizio, digitato) {
    // A corpo libero il campo vuoto vuol dire nessuna zavorra, cioè zero.
    const n = numero(digitato) ?? (modoDi(p, esercizio) === 'corpoLibero' ? 0 : null);
    if (n == null) return null;
    // Senza peso corporeo il carico reale non esiste: nessun numero è meglio di uno falso.
    if (!p.pesoValido && richiedePeso(p, esercizio)) return null;
    return piani.caricoReale(perCalcolo(p, esercizio), n, p.pesoCorporeo);
  }

  /** L'inverso, per riempire il campo. */
  function aDigitato(p, esercizio, reale) {
    if (reale == null) return null;
    if (!p.pesoValido && richiedePeso(p, esercizio)) return reale;
    return piani.caricoDigitato(perCalcolo(p, esercizio), reale, p.pesoCorporeo);
  }

  function confermate(p, esercizio) {
    const out = [];
    for (const s of p.registrate.values()) if (s.esercizioId === esercizio.id) out.push(s);
    return out.sort((a, b) => a.indice - b.indice);
  }

  function completo(p, esercizio) {
    return confermate(p, esercizio).length >= piani.serieDi(esercizio, settimana);
  }

  /** Righe da mostrare: le serie di oggi, più quelle già registrate oltre (se si è
      ridotto dopo averle fatte, restano lì e restano salvate). */
  function righeDi(p, esercizio) {
    const n = piani.serieDi(esercizio, settimana);
    const oltre = confermate(p, esercizio).reduce((m, s) => Math.max(m, s.indice + 1), 0);
    return Math.max(n, oltre);
  }

  function saltato(esercizio) {
    return piani.serieDi(esercizio, settimana) === 0;
  }

  /** Nessuno ha niente di suo in questa sessione: né serie né righe scritte. */
  function vuota(p) {
    return !p.registrate.size && ![...p.toccate].some((k) => !p.registrate.has(k));
  }

  /* ---------- disegno dell'esercizio ---------------------- */

  const primoDaFare = (i) => P.some((p) => !completo(p, suo(p, i)));
  let iEs = delPiano.findIndex((_, i) => primoDaFare(i));
  if (iEs < 0) iEs = delPiano.length - 1;

  let btnAvanti = null;
  let btnChiudi = null;
  let zonaVariazione = null;
  let zonaChiusura = null;

  /* ---------- serie e ripetizioni di oggi ------------------ */

  /** Il riquadro per cambiare serie e ripetizioni. Vale per oggi e per tutti e due;
      con la spunta anche per la scheda, dalle prossime volte. */
  function apriVariazione() {
    if (!zonaVariazione) return;
    chiudiTastierino();
    const originale = delPiano[iEs];
    const e = riferimentoDiOggi() || originale;
    let serie = piani.serieDi(e, settimana);

    const cifra = h('span.titolo-2.mono.ses-var-n', String(serie));
    const cambia = (d) => { serie = Math.max(0, Math.min(10, serie + d)); cifra.textContent = String(serie); tocco(8); };
    const campoRip = h('input', {
      type: 'text', inputmode: 'text', value: piani.testoRip(e), 'aria-label': 'Ripetizioni',
    });
    const errore = h('p.nota.rosso');
    const spunta = h('input', { type: 'checkbox' });

    const salva = async () => {
      const rip = e.carico === 'tempo' && /^\d+$/.test(campoRip.value.trim())
        ? { rip: campoRip.value.trim(), ripMin: Number(campoRip.value), ripMax: Number(campoRip.value), ripSerie: null }
        : piani.leggiRip(campoRip.value);
      if (!rip) { errore.textContent = 'Scrivi le ripetizioni come 10, 8-10 o 12-10-8.'; return; }
      const cambi = { serie, ...rip };
      const uguale = serie === piani.serieDi(originale, settimana)
        && rip.rip === piani.testoRip(originale).replace(/[–—]/g, '-');
      await variaOggiTutti(originale, uguale ? null : cambi);
      if (spunta.checked && st.riferimento) {
        await piani.aggiornaEsercizio(st.riferimento, seduta.id, originale.id, {
          serie, serieDaSettimana: null, ...rip,
        });
      }
    };

    const variato = P.some((p) => suo(p).variato);
    metti(zonaVariazione, h('div.blocco.ses-var', [
      h('p.occhiello', inDue ? 'Solo per questo allenamento, per tutti e due' : 'Solo per questo allenamento'),
      h('div.ses-var-riga', [
        h('span.cresci', 'Serie'),
        h('button.btn.btn-s', { type: 'button', onclick: () => cambia(-1), 'aria-label': 'Una serie in meno' }, '−'),
        cifra,
        h('button.btn.btn-s', { type: 'button', onclick: () => cambia(1), 'aria-label': 'Una serie in più' }, '+'),
      ]),
      h('label.campo', [h('span.occhiello', e.carico === 'tempo' ? 'Secondi' : 'Ripetizioni'), campoRip]),
      errore,
      h('label.spunta', [spunta, h('span.quadro'), h('span.testo-spunta', 'Anche nella scheda, dalle prossime volte')]),
      h('div.mod-azioni', [
        h('button.btn.btn-s', { type: 'button', onclick: salva }, 'Salva'),
        h('button.btn.btn-s', { type: 'button', onclick: () => variaOggiTutti(originale, { serie: 0 }) }, 'Salta oggi'),
        variato ? h('button.btn.btn-s', { type: 'button', onclick: () => variaOggiTutti(originale, null) }, 'Come nel piano') : null,
        h('button.btn.btn-s', { type: 'button', onclick: () => metti(zonaVariazione) }, 'Annulla'),
      ].filter(Boolean)),
    ]));
  }

  /** L'esercizio a schermo come lo fa oggi chi non l'ha saltato: serve all'intestazione. */
  function riferimentoDiOggi() {
    return P.map((p) => suo(p)).find((x) => !saltato(x) && !x.saltoResto) || null;
  }

  async function variaOggiTutti(e, cambi) {
    for (const p of P) await variaOggi(p, e, cambi, false);
    disegna();
  }

  /** Scrive la variazione di oggi (null la toglie) e ridisegna. */
  async function variaOggi(p, e, cambi, ridisegna = true) {
    const { variazioni } = p.sessione;
    if (cambi) variazioni[e.id] = { ...(variazioni[e.id] || {}), ...cambi };
    else delete variazioni[e.id];
    if (!cambi || !cambi.saltoResto) delete variazioni[e.id]?.saltoResto;
    p.esercizi = delPiano.map((x) => conVariazioni(p, x));
    // Le ripetizioni di partenza dipendono dal piano: le righe non toccate si rifanno.
    for (const k of [...p.bozze.keys()]) {
      if (k.startsWith(`${e.id}#`) && !p.toccate.has(k) && !p.registrate.has(k)) p.bozze.delete(k);
    }
    p.sessione.seriePreviste = totaleSerie(p);
    await store.salvaSessione(p.sessione);
    tocco();
    if (ridisegna) disegna();
  }

  /**
   * Salta l'esercizio per oggi, per una persona. Se qualche serie è già fatta,
   * salta solo quelle che mancano: le fatte restano e contano. Un esercizio
   * saltato non conta come serie mancanti, quindi l'allenamento si chiude
   * completo, con i salti annotati.
   * Si passa al successivo quando non resta più niente da fare a nessuno.
   */
  async function salta(p, e, ridisegna = true) {
    const fatte = confermate(p, e).length;
    for (const k of [...p.toccate]) if (k.startsWith(`${e.id}#`) && !p.registrate.has(k)) p.toccate.delete(k);
    ricordaBozze(p);
    await variaOggi(p, e, fatte ? { serie: fatte, saltoResto: true } : { serie: 0 }, false);
    if (!ridisegna) return;
    const restaQualcosa = P.some((x) => !completo(x, suo(x)));
    if (!restaQualcosa && iEs < delPiano.length - 1) vai(iEs + 1);
    else disegna();
  }

  /** Quanti esercizi oggi sono saltati, del tutto o nelle serie che mancavano. */
  function quantiSaltati(p) {
    return p.esercizi.filter((e) => saltato(e) || e.saltoResto).length;
  }

  function disegna() {
    const originale = delPiano[iEs];
    const aTempo = originale.carico === 'tempo';

    campi.clear();
    righe.clear();
    chiudiTastierino();
    progresso.textContent = `esercizio ${iEs + 1} di ${delPiano.length}`;

    const pezzi = [];

    if (!st.impostato) {
      pezzi.push(h('div.fascia.fascia-avviso', [
        'Manca la data del primo allenamento: conto come settimana 1. ',
        h('a', { href: '#/altro', style: 'color:inherit' }, 'Impostala in Altro →'),
      ]));
    }

    if (iEs === 0) {
      P.filter((p) => p.giaFatta.length).forEach((p) => {
        const quando = p.giaFatta.map((f) => dataBreve(f.data) + (f.completa ? '' : ', in parte')).join(' e ');
        pezzi.push(h('div.fascia.fascia-avviso', inDue
          ? `${p.nome} ha già fatto ${seduta.nome} questa settimana (${quando}). Questa è una sessione nuova: quella resta com’era.`
          : `${seduta.nome} l’hai già fatto questa settimana (${quando}). `
            + 'Questa è una sessione nuova: quella resta com’era.'));
      });
    }

    /* --- intestazione dell'esercizio: in comune --- */

    const rif = riferimentoDiOggi();
    let riassuntoSerie;
    if (rif) {
      const n = piani.serieDi(rif, settimana);
      riassuntoSerie = `${n} serie × ${rif.rip}${rif.variato ? ` · oggi (nel piano ${piani.serieDi(originale, settimana)} × ${originale.rip})` : ''}`;
    } else {
      riassuntoSerie = `Nel piano ${piani.serieDi(originale, settimana)} serie × ${originale.rip}`;
    }

    const testa = [
      h('div.ses-testa-es', [
        h('h2.titolo.cresci', originale.nome),
        h('div.ses-testa-btn', [
          h('button.btn.btn-s', { type: 'button', onclick: apriVariazione }, 'Modifica'),
        ]),
      ]),
      h('p.nota', riassuntoSerie),
    ];
    if (originale.note) testa.push(h('p.nota', originale.note));
    const compagni = delPiano.filter((x) => x !== originale && x.superserie != null && x.superserie === originale.superserie);
    if (compagni.length) {
      testa.push(h('p.nota', `In superserie con ${compagni.map((x) => x.nome).join(' e ')}.`));
    }
    pezzi.push(h('div.pila-s', testa));
    zonaVariazione = h('div');
    pezzi.push(zonaVariazione);

    /* --- un riquadro a testa --- */

    P.forEach((p) => pezzi.push(riquadroPersona(p, aTempo)));

    /* --- navigazione --- */

    btnAvanti = h('button.btn', {
      type: 'button',
      disabled: iEs >= delPiano.length - 1,
      onclick: () => vai(iEs + 1),
    }, 'Avanti');
    btnChiudi = h('button.btn.ses-largo', { type: 'button', onclick: chiudiAllenamento },
      'Chiudi allenamento');

    pezzi.push(h('div.btn-riga', [
      h('button.btn', { type: 'button', disabled: iEs <= 0, onclick: () => vai(iEs - 1) }, 'Indietro'),
      btnAvanti,
    ]));
    pezzi.push(btnChiudi);
    zonaChiusura = h('div');
    pezzi.push(zonaChiusura);

    metti(schermata, pezzi);
    P.forEach((p) => { aggiornaReale(p, suo(p)); aggiornaAvanzamento(p, suo(p)); });
    window.scrollTo(0, 0);
    aggiornaFondo();
  }

  /** Le serie di una persona sull'esercizio a schermo, con il suo storico e la sua nota. */
  function riquadroPersona(p, aTempo) {
    const e = suo(p);
    const n = piani.serieDi(e, settimana);
    const pezzi = [];
    p.ui = {};

    // Salta: tutto l'esercizio se non l'hai cominciato, le serie che mancano se sì.
    const puoSaltare = !saltato(e) && !e.saltoResto;
    p.ui.btnSalta = puoSaltare ? h('button.btn.btn-s', { type: 'button', onclick: () => salta(p, e) }, 'Salta') : null;
    pezzi.push(h('div.ses-persona-testa', [
      h('p.titolo-2.cresci', p.nome),
      p.ui.btnSalta,
    ].filter(Boolean)));

    if (saltato(e)) pezzi.push(h('p.nota', 'Saltato per oggi'));
    else if (e.saltoResto) pezzi.push(h('p.nota', `${n} serie fatte · il resto saltato`));
    if (e.saltoResto) {
      pezzi.push(h('button.btn.btn-s', { type: 'button', onclick: () => variaOggi(p, e, null) }, 'Rimetti le serie saltate'));
    }
    if (p.persona === 'corinna' && e.varianteFacile) {
      pezzi.push(h('p.nota', `Variante: ${e.varianteFacile}`));
    }

    p.ui.rigaBloccoPeso = null;
    if (!p.pesoValido && richiedePeso(p, e)) {
      p.ui.rigaBloccoPeso = h('p.nota.ses-blocco-peso.nascondi', '');
      pezzi.push(h('div.fascia.fascia-avviso', [
        `Manca il peso corporeo${inDue ? ` di ${p.nome}` : ''}: senza quello questo esercizio non si può registrare. `,
        h('a', { href: '#/altro', style: 'color:inherit' }, 'Impostalo in Altro →'),
        p.ui.rigaBloccoPeso,
      ]));
    }

    if (saltato(e) && !righeDi(p, e)) {
      pezzi.push(h('div.blocco.blocco-quieto', [
        h('p.nota', 'Oggi questo esercizio non lo fai. Non conta come serie mancanti.'),
        h('button.btn', { type: 'button', style: 'margin-top:10px;width:100%', onclick: () => variaOggi(p, e, null) },
          'Rimettilo'),
      ]));
    }

    /* --- come si fa l'esercizio, quando ci sono due modi --- */

    if (e.caricoAlternativo && righeDi(p, e)) pezzi.push(interruttoreModo(p, e));

    /* --- una riga per serie --- */

    const elenco = [
      h(aTempo ? 'div.ses-riga.ses-riga-tempo.ses-intest' : 'div.ses-riga.ses-intest', [
        h('span.occhiello', ''),
        aTempo ? null : h('span.occhiello', piani.etichettaCarico(perCalcolo(p, e))),
        h('span.occhiello', etichettaRip(e, aTempo)),
        h('span'),
      ].filter(Boolean)),
    ];
    for (let i = 0; i < righeDi(p, e); i += 1) elenco.push(rigaSerie(p, e, i, aTempo));
    if (righeDi(p, e)) pezzi.push(h('div.blocco', elenco));

    /* --- storico e carico reale --- */

    if (righeDi(p, e)) pezzi.push(h('p.nota.ses-ultima', testoUltimaVolta(p, e)));
    if (!aTempo && richiedePeso(p, e) && p.pesoValido) {
      p.ui.reale = h('p.nota.ses-reale', '');
      pezzi.push(p.ui.reale);
    } else {
      p.ui.reale = null;
    }

    /* --- nota dell'esercizio --- */

    const testoNota = p.note.get(e.id) || '';
    const area = h('textarea', {
      value: testoNota,
      placeholder: 'Sensazioni, tecnica, regolazione della macchina',
      onchange: (ev) => salvaNota(p, e, ev.target.value),
    });
    pezzi.push(h('details.piega', { open: !!testoNota }, [
      h('summary', inDue ? `Nota di ${p.nome}` : 'Nota'),
      h('div.corpo', [area]),
    ]));

    p.ui.notaCompleto = h('p.nota.verde.ses-completo',
      saltato(e) || e.saltoResto ? 'Saltato: non conta come mancante.' : 'Esercizio completo.');
    pezzi.push(p.ui.notaCompleto);

    return h(inDue ? 'section.ses-persona.ses-persona-due' : 'section.ses-persona', { dataset: { persona: p.persona } }, pezzi);
  }

  /** Due stati: il modo predefinito del piano e quello alternativo. Cambia solo come
      si converte il numero digitato — la serie finisce sempre sullo stesso esercizio. */
  function interruttoreModo(p, e) {
    const scelto = modoDi(p, e);
    const bottoni = [e.carico, e.caricoAlternativo].map((m) => {
      const b = h('button.ses-modo-btn', {
        type: 'button',
        'aria-pressed': m === scelto ? 'true' : 'false',
        onclick: () => cambiaModo(p, e, m),
      }, etichettaModo(m));
      if (m === scelto) b.classList.add('ses-modo-attivo');
      return b;
    });
    return h('div.ses-modo', [
      h('p.occhiello', 'Come le fai'),
      h('div.ses-modo-gruppo', bottoni),
    ]);
  }

  async function cambiaModo(p, e, modo) {
    if (modoDi(p, e) === modo) return;
    p.modi.set(e.id, modo);
    // Il numero digitato cambia significato: si ricostruisce dalle serie note.
    for (const k of [...p.bozze.keys()]) {
      if (k.startsWith(`${e.id}#`)) p.bozze.delete(k);
    }
    tocco();
    disegna();
    await store.scrivi(`modoCarico:${p.persona}:${e.id}`, modo);
  }

  function rigaSerie(p, e, i, aTempo) {
    const k = chiave(e.id, i);
    const dati = bozza(p, e, i);

    const campoCarico = aTempo ? null : campo(p, e, i, 'carico', dati.carico);
    const campoRip = campo(p, e, i, 'rip', dati.rip);
    const fatta = h('button.btn.ses-fatta', {
      type: 'button',
      onclick: () => registra(p, e, i),
    }, p.registrate.has(k) ? 'Aggiorna' : 'Fatta');

    const prima = h('span.ses-prima');
    const riga = h(aTempo ? 'div.ses-riga.ses-riga-tempo' : 'div.ses-riga', [
      h('span.ses-n', String(i + 1)),
      campoCarico,
      campoRip,
      fatta,
      prima,
    ].filter(Boolean));

    righe.set(dom(p, e.id, i), { riga, fatta, prima });
    if (p.registrate.has(k)) riga.classList.add('ses-riga-fatta');
    aggiornaPrima(p, e, i);
    return riga;
  }

  /**
   * Sotto ogni serie, la stessa serie dell'ultima volta: il riferimento per salire.
   * Se il carico scritto è diverso lo dice, con la differenza. La serie di oggi
   * si salva come serie nuova: quella dell'ultima volta resta nello storico, ed
   * è il confronto tra le due che fa la percentuale in Progressi.
   */
  function aggiornaPrima(p, e, i) {
    const g = righe.get(dom(p, e.id, i));
    if (!g || !g.prima) return;
    const rif = stessaSerieUltimaVolta(p, e, i);
    if (!rif) { g.prima.textContent = ''; g.prima.className = 'ses-prima'; return; }

    const aTempo = e.carico === 'tempo';
    let testo = aTempo || rif.carico == null
      ? `ultima volta ${rif.ripetizioni ?? '–'} ${aTempo ? 's' : 'rip'}`
      : `ultima volta ${peso(rif.carico)} kg × ${rif.ripetizioni ?? '–'}`;
    let classe = '';
    if (!aTempo && rif.carico != null) {
      const ora = aReale(p, e, bozza(p, e, i).carico);
      const diff = ora == null ? 0 : +(ora - rif.carico).toFixed(2);
      if (diff > 0) { testo += ` · +${peso(diff)} kg`; classe = ' verde'; }
      else if (diff < 0) { testo += ` · −${peso(-diff)} kg`; classe = ' rosso'; }
    }
    g.prima.textContent = testo;
    g.prima.className = `ses-prima${classe}`;
  }

  function campo(p, e, i, tipo, testo) {
    const b = h('button.ses-campo', {
      type: 'button',
      onclick: () => attiva(p, e, i, tipo),
    }, testo || segnaposto(e, tipo, i));
    if (!testo) b.classList.add('ses-campo-vuoto');
    campi.set(`${dom(p, e.id, i)}:${tipo}`, b);
    return b;
  }

  function aggiornaCampo(p, e, i, tipo) {
    const b = campi.get(`${dom(p, e.id, i)}:${tipo}`);
    if (!b) return;
    const v = bozza(p, e, i)[tipo];
    b.textContent = v || segnaposto(e, tipo, i);
    b.classList.toggle('ses-campo-vuoto', !v);
    if (tipo === 'carico') { aggiornaReale(p, e); aggiornaPrima(p, e, i); }
  }

  /** "carico reale: 58 kg" — solo per assistito e corpo libero, sull'ultima riga toccata. */
  function aggiornaReale(p, e) {
    const el = p.ui.reale;
    if (!el) return;
    const i = attivo && attivo.p === p && attivo.esercizio === e ? attivo.indice : 0;
    const reale = aReale(p, e, bozza(p, e, i).carico);
    el.textContent = reale == null ? '' : `carico reale: ${peso(reale)} kg`;
  }

  /* ---------- registrazione di una serie ------------------ */

  async function registra(p, e, i) {
    const k = chiave(e.id, i);
    const dati = bozza(p, e, i);
    const rip = numero(dati.rip);
    if (rip == null || rip <= 0) { tocco(); attiva(p, e, i, 'rip'); return; }

    // Senza peso corporeo qui si registrerebbe un numero che poi esplode: meglio fermarsi.
    if (!p.pesoValido && richiedePeso(p, e)) { spiegaBloccoPeso(p, e); return; }

    const gia = p.registrate.get(k);
    const serie = nuovaSerie(p, e, i, dati, rip);

    p.registrate.set(k, serie);
    p.toccate.delete(k);
    ricordaBozze(p);
    await store.salvaSerie(serie);
    await fissaNota(p, e);

    tocco();
    chiudiTastierino();
    const gruppo = righe.get(dom(p, e.id, i));
    if (gruppo) {
      gruppo.riga.classList.add('ses-riga-fatta');
      gruppo.fatta.textContent = 'Aggiorna';
    }
    if (!gia) avviaRecupero(e.recuperoSec);
    aggiornaAvanzamento(p, e);
  }

  /** La serie da salvare, dalla bozza della riga. */
  function nuovaSerie(p, e, i, dati, rip) {
    const gia = p.registrate.get(chiave(e.id, i));
    const { sessione } = p;
    return {
      id: gia ? gia.id : store.nuovoId('ser'),
      persona: p.persona,
      sessioneId: sessione.id,
      data: sessione.data,
      pianoId: sessione.pianoId,
      sedutaId: sessione.sedutaId,
      esercizioId: e.id,
      indice: i,
      carico: e.carico === 'tempo' ? null : aReale(p, e, dati.carico),
      ripetizioni: Math.round(rip),
      monitorata: sessione.monitorata,
      note: gia ? (gia.note || '') : '',
    };
  }

  /** Le righe scritte e non confermate: se c'è un numero di ripetizioni valido,
      diventano serie. Restituisce quante ne ha salvate. */
  async function salvaToccate(p) {
    const nuove = [];
    for (const k of p.toccate) {
      if (p.registrate.has(k)) continue;
      const [id, indice] = k.split('#');
      const e = p.esercizi.find((x) => x.id === id);
      const dati = p.bozze.get(k);
      if (!e || !dati) continue;
      const rip = numero(dati.rip);
      if (rip == null || rip <= 0) continue;
      if (!p.pesoValido && richiedePeso(p, e)) continue;
      const serie = nuovaSerie(p, e, Number(indice), dati, rip);
      p.registrate.set(k, serie);
      nuove.push(serie);
    }
    if (nuove.length) await store.salvaSerieMulte(nuove);
    clearTimeout(p.idBozze);
    p.toccate.clear();
    await store.cancella(p.chiaveBozze);
    for (const e of p.esercizi) await fissaNota(p, e);
    return nuove.length;
  }

  /** Spiega perché la serie non parte e manda dove si risolve. */
  function spiegaBloccoPeso(p, e) {
    tocco();
    const riga = p.ui.rigaBloccoPeso;
    if (!riga) return;
    riga.textContent = modoDi(p, e) === 'assistito'
      ? 'Non registro: il carico è peso corporeo meno assistenza, e il peso corporeo manca.'
      : 'Non registro: il carico è peso corporeo più zavorra, e il peso corporeo manca.';
    riga.classList.remove('nascondi');
    riga.scrollIntoView({ block: 'center' });
  }

  /** La nota dell'esercizio sta sulla prima serie registrata, qualunque sia il suo indice:
      così non si perde se la serie 1 non viene mai confermata. Finché non c'è nessuna serie
      resta in memoria e ci riproviamo alla prossima registrazione. */
  async function fissaNota(p, e) {
    const fatte = confermate(p, e);
    if (!fatte.length) return;
    const testo = p.note.get(e.id) || '';
    const daSalvare = [];
    fatte.forEach((s, i) => {
      const atteso = i === 0 ? testo : '';
      if ((s.note || '') !== atteso) { s.note = atteso; daSalvare.push(s); }
    });
    if (daSalvare.length) await store.salvaSerieMulte(daSalvare);
  }

  async function salvaNota(p, e, testo) {
    p.note.set(e.id, testo);
    await fissaNota(p, e);
  }

  /** Note scritte ma senza nessuna serie su cui posarsi: non si buttano in silenzio. */
  function noteOrfane(p) {
    return p.esercizi.filter((e) => (p.note.get(e.id) || '').trim() && !confermate(p, e).length);
  }

  /** Niente salti automatici: si evidenzia il passo successivo e basta. In due,
      quando l'esercizio è finito per tutti e due. */
  function aggiornaAvanzamento(p, e) {
    const finito = completo(p, e);
    if (p.ui.btnSalta) {
      p.ui.btnSalta.textContent = confermate(p, e).length ? 'Salta il resto' : 'Salta';
      p.ui.btnSalta.classList.toggle('nascondi', finito);
    }
    if (p.ui.notaCompleto) p.ui.notaCompleto.classList.toggle('nascondi', !finito);
    const tutti = P.every((x) => completo(x, suo(x)));
    const ultimo = iEs >= delPiano.length - 1;
    if (btnAvanti) btnAvanti.classList.toggle('ses-evidenzia', tutti && !ultimo);
    if (btnChiudi) btnChiudi.classList.toggle('ses-evidenzia', tutti && ultimo);
  }

  function vai(i) {
    if (i < 0 || i >= delPiano.length) return;
    fermaRecupero();
    iEs = i;
    disegna();
  }

  /* ---------- uscita e chiusura --------------------------- */

  /** Serie previste oggi e non ancora registrate, per una persona. Le righe
      scritte senza Fatta contano come fatte: alla chiusura si salvano. */
  function mancanti(p) {
    return p.esercizi.reduce((t, e) => {
      const fatte = confermate(p, e).length + [...p.toccate].filter((k) => k.startsWith(`${e.id}#`) && !p.registrate.has(k)).length;
      return t + Math.max(0, piani.serieDi(e, settimana) - fatte);
    }, 0);
  }

  async function esci() {
    // Niente da chiedere: le serie fatte sono già salvate, quelle scritte senza
    // Fatta si salvano adesso, e l'allenamento resta aperto — da Oggi si riprende.
    // Aperto e lasciato vuoto non è un allenamento: si toglie e basta.
    fermaRecupero();
    for (const p of P) {
      await salvaToccate(p);
      if (!p.registrate.size) await store.eliminaSessione(p.sessione.id);
    }
    location.hash = '#/oggi';
  }

  /**
   * Con serie ancora da fare si sceglie:
   * - Salta quello che manca e chiudi: fatto, con i salti annotati;
   * - Annulla l'allenamento: non l'hai fatto. Sessione e serie si cancellano;
   * - Continua: si torna ad allenarsi.
   * Se non hai fatto niente, saltare non ha senso: resta solo Annulla.
   * In due vale per tutti e due insieme.
   */
  function chiudiAllenamento() {
    const m = P.reduce((t, p) => t + mancanti(p), 0);
    if (!m || !zonaChiusura) { chiudi(); return; }
    chiudiTastierino();
    const qualcosa = P.some((p) => !vuota(p));
    const dettaglio = inDue ? ` (${P.map((p) => `${p.nome} ${mancanti(p)}`).join(' · ')})` : '';
    metti(zonaChiusura, h('div.blocco.pila', [
      h('p.occhiello', `Mancano ${m} serie${dettaglio}`),
      qualcosa
        ? h('button.btn.btn-primo', { type: 'button', onclick: saltaIlRestoEChiudi }, 'Salta quello che manca e chiudi')
        : null,
      qualcosa ? h('p.nota', 'L’allenamento risulta fatto, con gli esercizi saltati annotati.') : null,
      h(qualcosa ? 'button.btn.btn-rosso' : 'button.btn.btn-primo', { type: 'button', onclick: annullaAllenamento },
        'Annulla l’allenamento'),
      h('p.nota', qualcosa
        ? `Non l’${inDue ? 'avete' : 'hai'} fatto: le serie di oggi si cancellano e non conta nella settimana.`
        : 'Non hai registrato niente: l’allenamento sparisce e non conta nella settimana.'),
      h('button.btn', { type: 'button', onclick: () => metti(zonaChiusura) }, 'Continua l’allenamento'),
    ].filter(Boolean)));
    requestAnimationFrame(() => zonaChiusura.scrollIntoView({ block: 'center' }));
  }

  /** Come se l'allenamento non fosse mai cominciato. */
  async function annullaAllenamento() {
    const n = P.reduce((t, p) => t + p.registrate.size, 0);
    if (n && !conferma(`Annullo l’allenamento? Le ${n} serie registrate oggi su ${seduta.nome} si cancellano.`)) return;
    fermaRecupero();
    for (const p of P) {
      clearTimeout(p.idBozze);
      p.toccate.clear();
      await store.cancella(p.chiaveBozze);
      await store.eliminaSessione(p.sessione.id);
    }
    location.hash = '#/oggi';
  }

  /** Le serie scritte si salvano, poi tutto quel che manca si salta. */
  async function saltaIlRestoEChiudi() {
    const scritte = new Map();
    for (const p of P) {
      scritte.set(p, await salvaToccate(p));
      for (const e of p.esercizi.filter((x) => !completo(p, x))) await salta(p, e, false);
    }
    await chiudi(scritte);
  }

  /** Chiude la sessione di ognuno. Chi non ha registrato niente non si è allenato:
      la sua sessione si toglie. */
  async function chiudi(giaSalvate = new Map()) {
    fermaRecupero();
    const finita = Date.now();
    for (const p of P) {
      const { sessione } = p;
      sessione.salvateSenzaFatta = (giaSalvate.get(p) || 0) + await salvaToccate(p);
      if (!p.registrate.size) {
        await store.eliminaSessione(sessione.id);
        p.assente = true;
        continue;
      }
      sessione.finita = finita;
      sessione.durataSec = Math.max(0, Math.round((sessione.finita - sessione.iniziata) / 1000));
      sessione.seriePreviste = totaleSerie(p);
      sessione.serieFatte = p.esercizi.reduce((t, e) => t + Math.min(confermate(p, e).length, piani.serieDi(e, settimana)), 0);
      sessione.ridotto = sessione.serieFatte < sessione.seriePreviste;
      sessione.saltati = quantiSaltati(p);
      await store.salvaSessione(sessione);
    }
    mostraRiepilogo(finita);
  }

  /** Sostituisce tutta la schermata: così crono e recupero escono dal DOM e si fermano. */
  function mostraRiepilogo(finita) {
    const sec = Math.max(0, Math.round((finita - iniziata) / 1000));
    const oltre = sec > SOGLIA_ROSSA;

    const pezzi = [
      h('div.blocco', [
        h('p.occhiello', 'Durata'),
        h('div', { class: oltre ? 'cifra rosso mono' : 'cifra mono' }, durata(sec)),
        oltre ? h('p.nota.rosso', 'Oltre i 50 minuti del piano.') : null,
      ].filter(Boolean)),
    ];

    P.forEach((p) => {
      if (inDue) pezzi.push(h('h2.titolo.ses-riep-nome', p.nome));
      pezzi.push(...riepilogoPersona(p));
    });

    pezzi.push(h('a.btn.btn-primo', { href: '#/oggi' }, 'Torna a oggi'));

    contenitore.replaceChildren(
      h('header.testata', [h('div', [
        h('p.occhiello', 'Allenamento chiuso'),
        h('h1.titolo', seduta.nome),
      ])]),
      h('div.schermata', pezzi),
    );
  }

  function riepilogoPersona(p) {
    const { sessione } = p;
    if (p.assente) {
      return [h('div.blocco.blocco-quieto', [
        h('p.nota', 'Nessuna serie registrata: per oggi non conta come allenamento.'),
      ])];
    }

    const pezzi = [
      h('div.blocco.blocco-quieto', [
        h('p.occhiello', etichettaEsito(sessione)),
        sessione.saltati && !sessione.ridotto
          ? h('div.cifra-s.mono', `${sessione.serieFatte} serie`)
          : h('div.cifra-s.mono', `${sessione.serieFatte} di ${sessione.seriePreviste}`),
        sessione.saltati && !sessione.ridotto
          ? h('p.nota', `Nel piano erano ${delPiano.reduce((t, e) => t + piani.serieDi(e, settimana), 0)}: le altre ${inDue ? 'sono saltate' : 'le hai saltate'}.`)
          : null,
        sessione.salvateSenzaFatta
          ? h('p.nota', `${sessione.salvateSenzaFatta} ${sessione.salvateSenzaFatta === 1 ? 'serie scritta' : 'serie scritte'} senza premere Fatta: salvate lo stesso.`)
          : null,
        sessione.ridotto
          ? h('p.nota', 'In Oggi e in Scheda la seduta risulta fatta in parte. I carichi di quello che è stato fatto contano nei progressi.')
          : null,
      ].filter(Boolean)),
    ];

    const progressi = bloccoProgressione(p);
    if (progressi) pezzi.push(progressi);
    else if (!sessione.monitorata) {
      pezzi.push(h('div.blocco.blocco-quieto', [
        h('p.nota', 'Fase di avvicinamento: i carichi sono annotati, non conteggiati.'),
      ]));
    }

    const orfane = noteOrfane(p);
    if (orfane.length) {
      pezzi.push(h('div.blocco', [
        h('p.occhiello', 'Note non salvate'),
        h('p.nota', 'Una nota si attacca alla prima serie registrata. Qui non c\'è nessuna serie, quindi questo testo resta solo a schermo:'),
        h('ul.lista', orfane.map((e) => h('li', [
          h('span.cresci', e.nome),
          h('span.nota', p.note.get(e.id)),
        ]))),
      ]));
    }

    pezzi.push(h('div.blocco', [
      h('p.occhiello', 'Esercizi'),
      h('ul.lista', p.esercizi.map((e) => {
        const fatte = confermate(p, e);
        return h(fatte.length ? 'li' : 'li.spento', [
          h('span.cresci', e.nome),
          h('span.nota.mono', riassunto(p, e, fatte)),
        ]);
      })),
    ]));
    return pezzi;
  }

  function etichettaEsito(sessione) {
    if (sessione.ridotto) return 'Allenamento ridotto · salvato';
    if (sessione.saltati) {
      return `Allenamento fatto · ${sessione.saltati} ${sessione.saltati === 1 ? 'esercizio saltato' : 'esercizi saltati'}`;
    }
    return 'Serie registrate';
  }

  /** Doppia progressione: si sale solo dove tutte le serie hanno chiuso al numero alto. */
  function bloccoProgressione(p) {
    if (!p.sessione.monitorata || !st.piano?.progressione) return null;

    const righeTesto = [];
    p.esercizi.forEach((e) => {
      if (e.carico === 'tempo' || e.ripMax == null) return;
      const fatte = confermate(p, e);
      // Un esercizio lasciato a metà non dice niente sul carico: non si sale.
      if (!fatte.length || saltato(e) || e.saltoResto || !completo(p, e)) return;
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

  function riassunto(p, e, fatte) {
    if (saltato(e) && !fatte.length) return 'saltato';
    const coda = e.saltoResto ? ' · resto saltato' : '';
    if (!fatte.length) return 'non svolto';
    if (e.carico === 'tempo') {
      return `${fatte.length} serie · ${Math.max(...fatte.map((s) => s.ripetizioni || 0))} s${coda}`;
    }
    const carichi = fatte.map((s) => s.carico).filter((c) => c != null && Number.isFinite(c));
    if (!carichi.length) return `${fatte.length} serie${coda}`;
    const oggiMax = Math.max(...carichi);
    const prima = (p.storico.get(e.id) || []).map((s) => s.carico).filter((c) => c != null && Number.isFinite(c));
    let diff = '';
    if (prima.length) {
      const d = +(oggiMax - Math.max(...prima)).toFixed(2);
      if (d > 0) diff = ` (+${peso(d)})`;
      else if (d < 0) diff = ` (−${peso(-d)})`;
    }
    return `${fatte.length} serie · ${peso(oggiMax)} kg${diff}${coda}`;
  }

  /** Da quando viene il riferimento sotto le serie. In due, corto: si ripete. */
  function testoUltimaVolta(p, e) {
    const rif = precedente(p, e, 0);
    if (!rif) return 'primo allenamento su questo esercizio';
    if (inDue) return `sotto ogni serie, quella dell’ultima volta (${dataBreve(rif.data)})`;
    return `sotto ogni serie, quella dell’ultima volta (${dataBreve(rif.data)}). `
      + 'Se sali, la serie di oggi si aggiunge: l’ultima volta resta nello storico.';
  }

  disegna();
}

/* ---------- apertura e ripresa della sessione ------------- */

/** Riprende quella aperta della persona se è della stessa seduta e dello stesso
    giorno, altrimenti la chiude e ne apre una nuova. */
async function apriSessione(st, seduta, persona) {
  const oggi = iso();
  let aperta = await store.sessioneAperta(persona);

  if (aperta && (aperta.sedutaId !== seduta.id || aperta.data !== oggi)) {
    // Quella rimasta aperta si chiude; se era vuota, si toglie.
    if (!(await store.serieDiSessione(aperta.id)).length) {
      await store.eliminaSessione(aperta.id);
    } else {
      aperta.finita = Date.now();
      aperta.durataSec = Math.max(0, Math.round((aperta.finita - aperta.iniziata) / 1000));
      await store.salvaSessione(aperta);
    }
    aperta = null;
  }
  if (aperta) {
    if (!aperta.persona) { aperta.persona = persona; await store.salvaSessione(aperta); }
    return aperta;
  }

  const nuova = {
    id: store.nuovoId('ses'),
    persona,
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

/** 'lun 21 set' */
function dataBreve(dataIso) {
  const d = daIso(dataIso);
  return `${giorni[d.getDay()].slice(0, 3)} ${d.getDate()} ${mesiBrevi[d.getMonth()]}`;
}

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

/** Intestazione della colonna: dove la scheda sale a scalare, lo dice. */
function etichettaRip(esercizio, aTempo) {
  if (aTempo) return 'Secondi';
  const scala = esercizio.ripSerie;
  return Array.isArray(scala) && scala.length ? `Rip · ${scala.join('-')}` : 'Ripetizioni';
}

function segnaposto(esercizio, tipo, indice = 0) {
  if (tipo !== 'rip') return 'kg';
  if (esercizio.carico === 'tempo') return 'sec';
  // Dove la scheda chiede un numero preciso per questa serie, il campo vuoto
  // mostra quello: si vede cosa fare senza tornare alla scheda.
  const attese = piani.ripAttese(esercizio, indice);
  return attese == null ? 'rip' : String(attese);
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
.ses-prima { grid-column: 2 / -1; margin-top: -4px; font-size: 13px; color: var(--ink-2); }
.ses-prima:empty { display: none; }
.ses-prima.verde { color: var(--verde); font-weight: 700; }
.ses-prima.rosso { color: var(--rosso); font-weight: 700; }
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

.ses-testa-es { display: flex; align-items: flex-start; gap: 10px; }
.ses-testa-btn { display: flex; gap: 6px; flex: none; }
.ses-var { display: grid; gap: 10px; }
.ses-var-riga { display: flex; align-items: center; gap: 10px; }
.ses-var-n { min-width: 34px; text-align: center; }

.ses-ultima, .ses-reale { margin-top: -6px; }

.ses-persona { display: grid; gap: 10px; }
.ses-persona-due { padding-top: 12px; border-top: var(--bordo-xl) solid var(--linea); }
.ses-persona-testa { display: flex; align-items: center; gap: 10px; }
.ses-riep-nome { margin-top: 10px; }
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
