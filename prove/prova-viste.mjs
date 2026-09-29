import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installa as installaIdb } from './stub-idb.mjs';
import { installa as installaDom, radice } from './stub-dom.mjs';

installaIdb();
installaDom();

const RADICE = fileURLToPath(new URL('..', import.meta.url));

globalThis.fetch = async (percorso) => {
  const f = path.join(RADICE, String(percorso));
  if (!fs.existsSync(f)) return { ok: false, status: 404 };
  return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(f, 'utf8')) };
};

const MOD = new URL('../js/', import.meta.url).href;
const store = await import(`${MOD}store.js`);
const personalizza = await import(`${MOD}personalizza.js`);

// Un profilo e una data di inizio, altrimenti le viste mostrano gli avvisi.
await store.scrivi('profilo', 'giuseppe');
await store.scrivi('pesoCorporeo', 80);
await store.scrivi('dataInizio', '2026-09-21');
// Le prove di prima sono di una persona sola; quelle in due stanno in fondo.
await store.scrivi('partecipanti', ['giuseppe']);

const oggi = await import(`${MOD}viste/oggi.js`);
const scheda = await import(`${MOD}viste/scheda.js`);
const cibo = await import(`${MOD}viste/cibo.js`);
const progressi = await import(`${MOD}viste/progressi.js`);

let fatte = 0;
const prova = async (nome, fn) => { await fn(); fatte += 1; console.log('  ok —', nome); };

/** Cerca il primo nodo che soddisfa il predicato. */
function trova(nodo, ok) {
  if (ok(nodo)) return nodo;
  for (const c of nodo.childNodes) {
    const t = trova(c, ok);
    if (t) return t;
  }
  return null;
}

function tutti(nodo, ok, fuori = []) {
  if (ok(nodo)) fuori.push(nodo);
  nodo.childNodes.forEach((c) => tutti(c, ok, fuori));
  return fuori;
}

const conTesto = (nodo, testo) => trova(nodo, (n) => n.childNodes.length === 0
  && String(n.textContent).includes(testo));

/* ---------- Oggi ------------------------------------------ */

await prova('Oggi si monta e non nomina più allergie o vincoli', async () => {
  const app = radice();
  await oggi.monta(app);
  const testo = app.textContent;
  assert.ok(testo.length > 100, 'la schermata è vuota');
  assert.ok(!/olive|allergi|lattosio.*fuori/i.test(testo), 'compare ancora il banner dei vincoli');
});

/* ---------- Scheda ---------------------------------------- */

await prova('Scheda mostra i tag di gruppo e il 12-10-8', async () => {
  const app = radice();
  await scheda.monta(app, []);
  const testo = app.textContent;
  assert.ok(testo.includes('3 × 12-10-8'), 'le serie non sono 3 × 12-10-8');
  assert.ok(testo.includes('PETTO E SPALLE') || testo.includes('Petto e spalle'), 'manca il tag di gruppo');
  const tag = tutti(app, (n) => n.classList && n.classList.contains('tag'));
  assert.ok(tag.length >= 20, `tag di gruppo trovati: ${tag.length}`);
  assert.ok(!/ellittica|cyclette|rowing/i.test(testo), 'il riscaldamento nomina ancora il cardio');
  assert.ok(testo.includes('serie a vuoto'), 'manca il riscaldamento nuovo');
});

await prova('Scheda: si modifica lì dentro, e Fine mostra la scheda cambiata', async () => {
  const app = radice();
  await scheda.monta(app, []);
  const nuovo = tutti(app, (n) => n.tagName === 'A' && n.getAttribute('href') === '#/modifica/nuovo');
  assert.ok(nuovo.length, 'manca Crea un piano nuovo');

  const btn = tutti(app, (n) => n.tagName === 'BUTTON' && n.textContent === 'Modifica')[0];
  assert.ok(btn, 'manca il pulsante Modifica in Scheda');
  await btn.scatena('click');
  const matita = tutti(app, (n) => n.classList && n.classList.contains('mod-apri') && n.textContent === '✎')[0];
  assert.ok(matita, 'in Scheda non compare l’editor');
  const riga = matita.parentNode;
  await matita.scatena('click');
  tutti(riga, (n) => n.tagName === 'INPUT')[0].value = 'Panca in Scheda';
  await conTesto(riga, 'Salva').parentNode.scatena('click');

  const fine = tutti(app, (n) => n.tagName === 'BUTTON' && n.textContent === 'Fine')[0];
  await fine.scatena('click');
  assert.ok(app.textContent.includes('Panca in Scheda'), 'dopo Fine la scheda non mostra il nome nuovo');
  const pianiMod = await import(`${MOD}piani.js`);
  assert.equal(await pianiMod.quanteCopie(), 0, 'cambiare solo il nome ha creato una copia del piano');
  assert.ok(tutti(app, (n) => n.tagName === 'BUTTON' && n.textContent === 'Modifica').length, 'dopo Fine non si torna alla lettura');
  await personalizza.azzeraTutte();
});

const modifica = await import(`${MOD}viste/modifica.js`);
const matite = (nodo) => tutti(nodo, (n) => n.classList && n.classList.contains('mod-apri') && n.textContent === '✎');

await prova('Modifica: nome, gruppo e serie di un esercizio, dall’interfaccia', async () => {
  const app = radice();
  await modifica.monta(app, ['2026-fase1']);
  const matita = matite(app)[0];
  const riga = matita.parentNode;
  await matita.scatena('click');

  const campi = tutti(riga, (n) => n.tagName === 'INPUT');
  const select = tutti(riga, (n) => n.tagName === 'SELECT');
  campi[0].value = 'Panca, la mia';            // nome
  select[0].value = 'braccia';                  // gruppo
  campi[1].value = '4';                         // serie
  campi[2].value = '10-12';                     // ripetizioni
  await conTesto(riga, 'Salva').parentNode.scatena('click');

  assert.ok(app.textContent.includes('Panca, la mia'), 'il nome nuovo non compare');
  const p = await (await import(`${MOD}piani.js`)).piano({ id: '2026-fase1', file: 'dati/allenamento/2026-fase1.json' });
  const e = p.sedute[0].esercizi[0];
  assert.equal(e.id, 'panca-piana-manubri', 'l’id è cambiato');
  assert.equal(e.nome, 'Panca, la mia');
  assert.equal(e.gruppo, 'braccia');
  assert.equal(e.serie, 4);
  assert.equal(e.rip, '10-12');
  assert.equal(e.ripSerie, undefined, 'la scala 12-10-8 è rimasta');
});

await prova('Modifica: un esercizio nuovo con il nome di uno noto riusa il suo id', async () => {
  const app = radice();
  await modifica.monta(app, ['2026-fase1']);
  const aggiungi = tutti(app, (n) => n.tagName === 'BUTTON' && n.textContent === '+ Aggiungi un esercizio')[0];
  await aggiungi.scatena('click');
  const zona = trova(aggiungi.parentNode, (n) => n.classList && n.classList.contains('mdf-modulo'));
  const campi = tutti(zona, (n) => n.tagName === 'INPUT');
  campi[0].value = 'Leg curl';
  await conTesto(zona, 'Aggiungi').parentNode.scatena('click');

  const piani = await import(`${MOD}piani.js`);
  const p = await piani.pianoGrezzo({ id: '2026-fase1', file: 'dati/allenamento/2026-fase1.json' });
  const ultimi = p.sedute[0].esercizi.map((x) => x.id);
  assert.equal(ultimi[ultimi.length - 1], 'leg-curl', `id sbagliato: ${ultimi}`);

  await piani.ripristinaPiano({ id: '2026-fase1', file: 'dati/allenamento/2026-fase1.json' });
  await personalizza.azzeraTutte();
});

/* ---------- Cibo ------------------------------------------ */

await prova('Cibo: la settimana ha i pasti nuovi e nessun vincolo', async () => {
  const app = radice();
  await cibo.monta(app, []);
  const testo = app.textContent;
  assert.ok(testo.includes('Frittata e patate al forno'));
  assert.ok(testo.includes('Minestrone e omelette'));
  assert.ok(testo.includes('Salmone al forno'));
  assert.ok(!/olive|noci pecan|buste singole/i.test(testo), 'compaiono ancora i vincoli');
});

await prova('Cibo: la spesa è una lista sola e le voci sono spuntabili', async () => {
  const app = radice();
  await cibo.monta(app, ['spesa']);
  const testo = app.textContent;
  assert.ok(testo.includes('Lista della spesa'));
  assert.ok(!/Lista A|Lista B/.test(testo), 'ci sono ancora le due liste');
  assert.ok(testo.includes('Cereali proteici'));
  assert.ok(testo.includes('Barrette proteiche'));
  assert.ok(!testo.includes('Ceci'), 'i ceci sono ancora nella spesa');
  const caselle = tutti(app, (n) => n.getAttribute && n.getAttribute('type') === 'checkbox');
  assert.ok(caselle.length > 40, `caselle trovate: ${caselle.length}`);
});

await prova('Cibo: la sotto-scheda Base si chiama Regole', async () => {
  const app = radice();
  await cibo.monta(app, ['regole']);
  const schede = tutti(app, (n) => n.tagName === 'BUTTON' && n.getAttribute('aria-selected') != null).map((n) => n.textContent);
  assert.deepEqual(schede, ['Settimana', 'Spesa', 'Regole']);
  assert.ok(app.textContent.includes('Le 3 regole'));
});

await prova('Cibo: un tocco su un alimento lo toglie dalla spesa', async () => {
  const app = radice();
  await cibo.monta(app, []);
  const tonno = tutti(app, (n) => n.classList && n.classList.contains('cib-alim') && n.textContent === 'Tonno')[0];
  assert.equal(tonno.getAttribute('aria-pressed'), 'true');
  await tonno.scatena('click');
  const dopo = tutti(app, (n) => n.classList && n.classList.contains('cib-alim') && n.textContent === 'Tonno')[0];
  assert.equal(dopo.getAttribute('aria-pressed'), 'false');

  const vistaSpesa = radice();
  await cibo.monta(vistaSpesa, ['spesa']);
  assert.ok(!conTesto(vistaSpesa, 'Tonno'), 'il tonno spento è ancora in lista');
  await personalizza.azzeraTutte();
});

await prova('Cibo: un alimento nuovo dalla colazione arriva nella spesa', async () => {
  const app = radice();
  await cibo.monta(app, []);
  await conTesto(app, 'Modifica').parentNode.scatena('click');
  const campi = tutti(app, (n) => n.tagName === 'INPUT' && n.getAttribute('aria-label') === 'Alimento nuovo');
  // L'ultimo campo è quello degli spuntini, il penultimo quello della colazione.
  const campo = campi[campi.length - 2];
  campo.value = 'Riso integrale';
  await conTesto(campo.parentNode, '+ Aggiungi').parentNode.scatena('click');
  assert.ok(tutti(app, (n) => n.classList && n.classList.contains('cib-alim') && n.textContent === 'Riso integrale').length === 1);

  const vistaSpesa = radice();
  await cibo.monta(vistaSpesa, ['spesa']);
  assert.ok(conTesto(vistaSpesa, 'Riso integrale'), 'il riso integrale non è in lista');
  await personalizza.azzeraTutte();
});

await prova('Cibo: ✕ toglie un alimento', async () => {
  const app = radice();
  await cibo.monta(app, []);
  await conTesto(app, 'Modifica').parentNode.scatena('click');
  const via = tutti(app, (n) => n.classList && n.classList.contains('cib-alim-via')
    && n.getAttribute('aria-label') === 'Togli Cannella')[0];
  assert.ok(via, 'manca il ✕');
  await via.scatena('click');
  assert.ok(!tutti(app, (n) => n.classList && n.classList.contains('cib-alim') && n.textContent === 'Cannella').length);
  assert.equal(personalizza.quante(), 1);
  await personalizza.azzeraTutte();
});

/* ---------- Progressi ------------------------------------- */

await prova('Progressi: il blocco per gruppo muscolare compare e filtra', async () => {
  const base = {
    pianoId: '2026-fase2', sedutaId: 'upper-a', monitorata: true, indice: 0,
  };
  const serie = [
    { ...base, sessioneId: 's1', id: 'a', esercizioId: 'panca-piana-manubri', data: '2026-11-02', carico: 40, ripetizioni: 8 },
    { ...base, sessioneId: 's2', id: 'b', esercizioId: 'panca-piana-manubri', data: '2026-11-09', carico: 50, ripetizioni: 8 },
    { ...base, sessioneId: 's1', id: 'c', esercizioId: 'curl-manubri', data: '2026-11-02', carico: 10, ripetizioni: 10 },
    { ...base, sessioneId: 's2', id: 'd', esercizioId: 'curl-manubri', data: '2026-11-09', carico: 12, ripetizioni: 10 },
  ];
  await store.salvaSerieMulte(serie);

  const app = radice();
  await progressi.corpoCarichi(app);
  const testo = app.textContent;
  assert.ok(testo.includes('Per gruppo muscolare'), 'manca il blocco per gruppo');
  assert.ok(testo.includes('Braccia') && testo.includes('Petto e spalle'));
  assert.ok(testo.includes('+25,0%') && testo.includes('+20,0%'), `percentuali mancanti: ${testo}`);

  // Tocco "Braccia": resta solo il curl nell'elenco degli esercizi.
  const riga = tutti(app, (n) => n.classList && n.classList.contains('pro-riga'))
    .find((n) => n.textContent.includes('Braccia'));
  assert.ok(riga, 'nessuna riga di gruppo cliccabile per Braccia');
  await riga.scatena('click');
  const dopo = app.textContent;
  assert.ok(dopo.includes('Solo braccia'), 'il filtro non si applica');
  assert.ok(dopo.includes('Curl con manubri'));
  assert.ok(!dopo.includes('Panca piana con manubri'), 'la panca è rimasta nell’elenco filtrato');
});


/* ---------- Sessione: la schermata della palestra ------------ */

const sessione = await import(`${MOD}viste/sessione.js`);

await prova('Sessione: le tre serie arrivano già compilate 12, 10, 8', async () => {
  const app = radice();
  await sessione.monta(app, ['upper-a']);
  const testo = app.textContent;
  assert.ok(testo.includes('3 serie × 12-10-8'), `intestazione sbagliata: ${testo.slice(0, 200)}`);
  assert.ok(testo.includes('Rip · 12-10-8'), 'la colonna non dice la scala');

  // C'e' gia' uno storico su questo esercizio (8 rip, 50 kg, dalla prova prima):
  // le ripetizioni devono restare quelle prescritte, il carico venire dallo storico.
  const campi = tutti(app, (n) => n.classList && n.classList.contains('ses-campo'));
  const rip = campi.filter((_, i) => i % 2 === 1).map((n) => n.textContent);
  const carichi = campi.filter((_, i) => i % 2 === 0).map((n) => n.textContent);
  assert.deepEqual(rip, ['12', '10', '8'], 'le ripetizioni prescritte non sono precompilate');
  assert.deepEqual(carichi, ['50', '50', '50'], 'il carico non viene dall’ultima volta');
});

await prova('Sessione: sotto la serie c’è l’ultima volta, e salire mostra la differenza', async () => {
  const app = radice();
  await sessione.monta(app, ['upper-a']);
  const prime = tutti(app, (n) => n.classList && n.classList.contains('ses-prima'));
  assert.equal(prime.length, 3, 'manca il riferimento sotto le serie');
  assert.equal(prime[0].textContent, 'ultima volta 50 kg × 8');

  // Si alza il carico della prima serie a 52,5 dal tastierino.
  const campi = tutti(app, (n) => n.classList && n.classList.contains('ses-campo'));
  await campi[0].scatena('click');
  const tasti = new Map(tutti(app, (n) => n.classList && n.classList.contains('ses-tasto'))
    .map((n) => [n.textContent, n]));
  for (const t of ['⌫', '⌫', '5', '2', ',', '5']) await tasti.get(t).scatena('click');
  assert.equal(campi[0].textContent, '52,5');
  assert.equal(prime[0].textContent, 'ultima volta 50 kg × 8 · +2,5 kg');
  assert.ok(prime[0].classList.contains('verde'));
});

const piani = await import(`${MOD}piani.js`);
const { iso } = await import(`${MOD}ui.js`);

await prova('Oggi: le sedute non hanno giorno, si sceglie tra tutte', async () => {
  const app = radice();
  await oggi.monta(app);
  const link = tutti(app, (n) => n.tagName === 'A' && String(n.getAttribute('href')).startsWith('#/sessione/'))
    .map((n) => n.getAttribute('href').replace('#/sessione/', ''));
  ['upper-a', 'lower-a', 'upper-b', 'lower-b'].forEach((id) => {
    assert.ok(link.includes(id), `manca la scelta di ${id}: ${link}`);
  });
  const testo = app.textContent;
  // Dalle prove prima può esserci una sessione aperta oggi: allora la scelta è "Oppure un altro".
  const aperta = testo.includes('Riprendi allenamento');
  assert.ok(testo.includes(aperta ? 'Oppure un altro' : 'Scegli l’allenamento'), 'manca la scelta');
  assert.ok(!/Riposo|si riposa|lunedì · oggi/.test(testo), 'Oggi lega ancora le sedute ai giorni');
  if (!aperta) assert.ok(testo.includes('La prossima da fare'), 'manca la seduta suggerita');

  const sch = radice();
  await scheda.monta(sch, []);
  assert.ok(!/(lunedì|martedì|giovedì|venerdì)(?! ·)/i.test(tutti(sch, (n) => n.tagName === 'SUMMARY').map((n) => n.textContent).join(' ')),
    'Scheda mostra ancora i giorni sulle sedute');
});

await prova('Oggi e Sessione: una seduta già fatta questa settimana si segnala', async () => {
  await store.salvaSerie({
    id: 'ser-lb', sessioneId: 'ses-lb', data: iso(), pianoId: '2026-fase1', sedutaId: 'lower-b',
    esercizioId: 'leg-curl', indice: 0, carico: 30, ripetizioni: 12, monitorata: true, note: '',
  });
  const st = await piani.stato();
  const previsti = piani.allenamentiPrevisti(st.piano, st.settimanaNellaFase);

  const app = radice();
  await oggi.monta(app);
  const testo = app.textContent;
  assert.ok(testo.includes(`fatti 1 di ${previsti}`), `conteggio della settimana sbagliato: ${testo}`);
  assert.ok(/fatta · (lun|mar|mer|gio|ven|sab|dom) \d+/.test(testo),
    'la seduta fatta non è segnata nell’elenco');

  const ses = radice();
  await sessione.monta(ses, ['lower-b']);
  assert.ok(ses.textContent.includes('Lower B l’hai già fatto questa settimana'),
    'la sessione non avvisa che Lower B è già stato fatto');
});

await prova('Sessione: saltare un esercizio, e chiudendo si salvano anche le serie scritte', async () => {
  const app = radice();
  await sessione.monta(app, ['lower-a']);
  const titolo = trova(app, (n) => n.classList && n.classList.contains('titolo')).textContent;

  // Prima serie confermata con Fatta.
  const fatta = tutti(app, (n) => n.classList && n.classList.contains('ses-fatta'));
  await fatta[0].scatena('click');

  // Seconda serie: si scrive il carico ma non si preme Fatta.
  const campi = tutti(app, (n) => n.classList && n.classList.contains('ses-campo'));
  await campi[2].scatena('click');
  const tasti = new Map(tutti(app, (n) => n.classList && n.classList.contains('ses-tasto'))
    .map((n) => [n.textContent, n]));
  for (const t of ['⌫', '⌫', '⌫', '4', '0']) await tasti.get(t).scatena('click');

  // Il secondo esercizio si salta per oggi.
  await conTesto(app, 'Avanti').parentNode.scatena('click');
  await conTesto(app, 'Modifica').parentNode.scatena('click');
  await conTesto(app, 'Salta oggi').parentNode.scatena('click');
  assert.ok(app.textContent.includes('Saltato per oggi'), 'l’esercizio saltato non lo dice');

  await conTesto(app, 'Chiudi allenamento').parentNode.scatena('click');
  assert.ok(!app.textContent.includes('Chiudi come ridotto'), 'c’è ancora Chiudi come ridotto');
  assert.ok(conTesto(app, 'Annulla l’allenamento'), 'manca Annulla l’allenamento');
  await conTesto(app, 'Salta quello che manca e chiudi').parentNode.scatena('click');
  const testo = app.textContent;
  assert.ok(testo.includes('esercizi saltati'), `il riepilogo non dice i salti: ${testo.slice(0, 300)}`);
  assert.ok(testo.includes('senza premere Fatta: salvate lo stesso'), 'la serie scritta non è stata salvata');

  const ses = (await store.sessioni()).find((s) => s.sedutaId === 'lower-a');
  assert.equal(ses.ridotto, false);
  assert.ok(Object.values(ses.variazioni).some((v) => v.serie === 0), 'il salto non è sulla sessione');
  const serie = await store.serieDiSessione(ses.id);
  assert.equal(serie.length, 2, `serie salvate: ${serie.length}`);
  assert.equal(serie[1].carico, 40, 'il carico scritto senza Fatta non è quello');
  assert.ok(titolo, 'manca il titolo dell’esercizio');

  const oggiApp = radice();
  await oggi.monta(oggiApp);
  assert.ok(/✓ fatta · \d+ saltati/.test(oggiApp.textContent), 'Oggi non segna la seduta fatta');
});

await prova('Sessione: Annulla l’allenamento lo cancella, come se non fosse mai cominciato', async () => {
  const app = radice();
  await sessione.monta(app, ['lower-a']);          // 12-10-8: "Fatta" registra subito
  const primaId = (await store.sessioneAperta()).id;
  await tutti(app, (n) => n.classList && n.classList.contains('ses-fatta'))[0].scatena('click');
  assert.equal((await store.serieDiSessione(primaId)).length, 1);

  await conTesto(app, 'Chiudi allenamento').parentNode.scatena('click');
  await conTesto(app, 'Annulla l’allenamento').parentNode.scatena('click');
  assert.equal(await store.leggiSessione(primaId), undefined, 'la sessione è rimasta');
  assert.equal((await store.serieDiSessione(primaId)).length, 0, 'le serie sono rimaste');

  // Aperto e lasciato vuoto: Esci non lascia niente in giro.
  const app2 = radice();
  await sessione.monta(app2, ['lower-b']);
  const vuotaId = (await store.sessioneAperta()).id;
  await conTesto(app2, 'Esci').parentNode.scatena('click');
  assert.equal(await store.leggiSessione(vuotaId), undefined, 'la sessione vuota è rimasta aperta');
});

await prova('Sessione: Salta sugli ultimi esercizi, e l’allenamento risulta fatto', async () => {
  const app = radice();
  await sessione.monta(app, ['upper-b']);
  // Il primo esercizio si fa tutto.
  for (let i = 0; i < 3; i += 1) {
    const fatta = tutti(app, (n) => n.classList && n.classList.contains('ses-fatta') && n.textContent === 'Fatta')[0];
    await fatta.scatena('click');
  }
  // Il secondo si comincia: una serie, poi Salta il resto.
  await conTesto(app, 'Avanti').parentNode.scatena('click');
  await tutti(app, (n) => n.classList && n.classList.contains('ses-fatta'))[0].scatena('click');
  const saltaResto = conTesto(app, 'Salta il resto');
  assert.ok(saltaResto, 'manca Salta il resto su un esercizio cominciato');
  await (saltaResto.tagName === 'BUTTON' ? saltaResto : saltaResto.parentNode).scatena('click');
  // Sul terzo c'è Salta, e porta avanti.
  assert.ok(app.textContent.includes('esercizio 3 di'), 'Salta non è passato al successivo: ' + app.textContent.slice(0, 120));
  await conTesto(app, 'Salta').parentNode.scatena('click');

  // Chiudendo si saltano gli altri che mancano.
  await conTesto(app, 'Chiudi allenamento').parentNode.scatena('click');
  await conTesto(app, 'Salta quello che manca e chiudi').parentNode.scatena('click');
  const testo = app.textContent;
  assert.ok(/Allenamento fatto · \d+ esercizi saltati/.test(testo), `riepilogo: ${testo.slice(0, 300)}`);
  assert.ok(testo.includes('resto saltato'));

  const ses = (await store.sessioni()).find((s) => s.sedutaId === 'upper-b');
  assert.equal(ses.ridotto, false);
  assert.equal(ses.serieFatte, 4);
  assert.equal(ses.seriePreviste, 4);

  const oggiApp = radice();
  await oggi.monta(oggiApp);
  assert.ok(/✓ fatta · \d+ saltati/.test(oggiApp.textContent), 'Oggi non segna la seduta fatta con salti');
});

await prova('Cibo: una voce nuova nella spesa', async () => {
  const app = radice();
  await cibo.monta(app, ['spesa']);
  await conTesto(app, 'Modifica').parentNode.scatena('click');
  const apri = tutti(app, (n) => n.tagName === 'BUTTON' && n.textContent === '+ Aggiungi una voce')[0];
  const zona = apri.parentNode;
  await apri.scatena('click');
  trova(zona, (n) => n.tagName === 'INPUT').value = 'Carta da forno';
  await conTesto(zona, 'Aggiungi').parentNode.scatena('click');
  assert.ok(app.textContent.includes('Carta da forno'), 'la voce nuova non compare');
  await personalizza.azzeraTutte();
});

await prova('Cibo: il reparto di una voce si cambia, e dice da dove viene', async () => {
  const app = radice();
  await cibo.monta(app, ['spesa']);
  await conTesto(app, 'Modifica').parentNode.scatena('click');
  const matita = tutti(app, (n) => n.classList && n.classList.contains('mod-apri')
    && n.getAttribute('aria-label') === 'Modifica Miele')[0];
  const riga = matita.parentNode;
  await matita.scatena('click');
  assert.ok(/Viene dalla dieta/.test(riga.textContent), 'non dice che viene dalla dieta');
  assert.ok(!conTesto(riga, 'Togli dalla lista'), 'una voce della dieta non si toglie dalla spesa');
  trova(riga, (n) => n.tagName === 'SELECT').value = 'Frutta';
  await conTesto(riga, 'Salva').parentNode.scatena('click');
  assert.equal(personalizza.leggi(personalizza.chiaveVoceSpesa('Miele')).reparto, 'Frutta');
  await personalizza.azzeraTutte();
});

/* ---------- In due: Giuseppe segna anche per Corinna ------------ */

const diClasse = (nodo, classe) => tutti(nodo, (n) => n.classList && n.classList.contains(classe));
const riquadro = (app, chi) => tutti(app, (n) => n.tagName === 'SECTION' && n.dataset?.persona === chi)[0];

await prova('In due: Oggi fa scegliere chi si allena, e la scelta resta', async () => {
  const app = radice();
  await oggi.monta(app);
  assert.ok(app.textContent.includes('Chi si allena'), 'manca la scelta di chi si allena');
  await conTesto(app, 'Insieme').parentNode.scatena('click');
  assert.deepEqual(await store.partecipanti(), ['giuseppe', 'corinna']);
});

await prova('In due: la sessione ha un riquadro a testa, ognuno col suo storico', async () => {
  await store.scriviPeso('corinna', 60);
  const app = radice();
  await sessione.monta(app, ['upper-a']);
  const g = riquadro(app, 'giuseppe');
  const c = riquadro(app, 'corinna');
  assert.ok(g && c, 'manca un riquadro');
  assert.ok(g.textContent.includes('Giuseppe') && c.textContent.includes('Corinna'));

  // Giuseppe ha lo storico della panca (50 kg), Corinna no: i suoi carichi partono vuoti.
  const carichiG = diClasse(g, 'ses-campo').filter((_, i) => i % 2 === 0).map((n) => n.textContent);
  const carichiC = diClasse(c, 'ses-campo').filter((_, i) => i % 2 === 0).map((n) => n.textContent);
  assert.ok(carichiG[0] === '50' || carichiG[0] === '52,5', `carico di Giuseppe: ${carichiG}`);
  assert.deepEqual(carichiC, ['kg', 'kg', 'kg'], 'Corinna eredita i carichi di Giuseppe');

  // Corinna: 20 kg sulla prima serie, dal tastierino, poi Fatta.
  await diClasse(c, 'ses-campo')[0].scatena('click');
  assert.ok(app.textContent.includes('Corinna · Carico'), 'il tastierino non dice di chi è il campo');
  const tasti = new Map(diClasse(app, 'ses-tasto').map((n) => [n.textContent, n]));
  for (const t of ['2', '0']) await tasti.get(t).scatena('click');
  await diClasse(c, 'ses-fatta')[0].scatena('click');
  // Giuseppe: la sua prima serie com'è.
  await diClasse(g, 'ses-fatta')[0].scatena('click');

  const serie = (await store.tutteLeSerie(store.TUTTE)).filter((s) => s.data === iso() && s.sedutaId === 'upper-a' && s.indice === 0);
  const suaC = serie.find((s) => s.persona === 'corinna');
  const suaG = serie.find((s) => s.persona === 'giuseppe' && s.sessioneId !== suaC?.sessioneId);
  assert.ok(suaC && suaG, `serie salvate: ${JSON.stringify(serie.map((s) => s.persona))}`);
  assert.equal(suaC.carico, 20);
  assert.notEqual(suaC.sessioneId, suaG.sessioneId, 'le due persone sono nella stessa sessione');
});

await prova('In due: Salta vale per uno, Modifica per tutti e due', async () => {
  const app = radice();
  await sessione.monta(app, ['upper-a']);           // si riprende quella di prima
  const primo = trova(app, (n) => n.tagName === 'H2').textContent;
  const c = riquadro(app, 'corinna');
  const salta = conTesto(c, 'Salta il resto') || conTesto(c, 'Salta');
  await (salta.tagName === 'BUTTON' ? salta : salta.parentNode).scatena('click');
  assert.equal(trova(app, (n) => n.tagName === 'H2').textContent, primo, 'Salta di Corinna ha portato avanti anche Giuseppe');
  assert.ok(riquadro(app, 'corinna').textContent.includes('il resto saltato'), 'il salto di Corinna non si vede');
  assert.ok(diClasse(riquadro(app, 'giuseppe'), 'ses-fatta').length === 3, 'le serie di Giuseppe sono sparite');

  // Modifica: 2 serie per oggi, a tutti e due.
  await conTesto(app, 'Avanti').parentNode.scatena('click');
  await conTesto(app, 'Modifica').parentNode.scatena('click');
  assert.ok(app.textContent.includes('per tutti e due'));
  await conTesto(app, '−').parentNode.scatena('click');
  await conTesto(app, 'Salva').parentNode.scatena('click');
  assert.equal(diClasse(riquadro(app, 'giuseppe'), 'ses-fatta').length, 2);
  assert.equal(diClasse(riquadro(app, 'corinna'), 'ses-fatta').length, 2);
});

await prova('In due: si chiude insieme, e il riepilogo è di tutti e due', async () => {
  const app = radice();
  await sessione.monta(app, ['upper-a']);
  await conTesto(app, 'Chiudi allenamento').parentNode.scatena('click');
  assert.ok(/Mancano \d+ serie \(Giuseppe \d+ · Corinna \d+\)/.test(app.textContent), 'non dice a chi mancano le serie');
  await conTesto(app, 'Salta quello che manca e chiudi').parentNode.scatena('click');
  const testo = app.textContent;
  assert.ok(testo.includes('Giuseppe') && testo.includes('Corinna'), `riepilogo: ${testo.slice(0, 300)}`);

  const [sg] = (await store.sessioni('giuseppe')).filter((s) => s.sedutaId === 'upper-a' && s.data === iso());
  const [sc] = (await store.sessioni('corinna')).filter((s) => s.sedutaId === 'upper-a' && s.data === iso());
  assert.ok(sg?.finita && sc?.finita, 'le sessioni non sono chiuse');
  assert.equal(sc.persona, 'corinna');

  const oggiApp = radice();
  await oggi.monta(oggiApp);
  assert.ok(/Giuseppe · ✓ fatta|✓ fatta/.test(oggiApp.textContent), 'Oggi non segna Upper A');
});

await prova('In due: Progressi mostra i dati della persona scelta', async () => {
  const app = radice();
  await progressi.monta(app, []);
  assert.ok(conTesto(app, 'Corinna'), 'manca la scelta della persona');
  assert.ok(app.textContent.includes('Curl con manubri'), 'Giuseppe non vede i suoi progressi');
  await conTesto(app, 'Corinna').parentNode.scatena('click');
  assert.equal(await store.personaVista(), 'corinna');
  assert.ok(!app.textContent.includes('Curl con manubri'), 'Corinna vede i progressi di Giuseppe');
  await store.scrivi('personaVista', 'giuseppe');
});

console.log(`\n${fatte} prove di vista passate.`);

// Il cronometro della sessione lascia acceso un setInterval: si chiude a mano.
process.exit(0);
