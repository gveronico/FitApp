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

await prova('Scheda: il pulsante Modifica nomi fa comparire i ✎', async () => {
  const app = radice();
  await scheda.monta(app, []);

  const conta = () => tutti(app, (n) => n.classList && n.classList.contains('mod-apri')).length;
  assert.equal(conta(), 0, 'i ✎ si vedono anche senza modifica');

  const btn = conTesto(app, 'Modifica nomi');
  assert.ok(btn, 'manca il pulsante Modifica nomi');
  await btn.parentNode.scatena('click');
  assert.ok(conta() > 0, 'dopo Modifica nomi non compare nessun ✎');
});

await prova('Scheda: rinominare un esercizio si vede subito', async () => {
  const app = radice();
  await scheda.monta(app, []);
  await conTesto(app, 'Modifica nomi').parentNode.scatena('click');

  const matita = tutti(app, (n) => n.classList && n.classList.contains('mod-apri'))[0];
  const riga = matita.parentNode;      // il click svuota la riga: la teniamo da parte
  await matita.scatena('click');

  const campo = trova(riga, (n) => n.tagName === 'INPUT');
  assert.ok(campo, 'il riquadro di modifica non ha un campo');
  campo.value = 'Panca, la mia';

  const salva = conTesto(riga, 'Salva');
  await salva.parentNode.scatena('click');

  assert.ok(app.textContent.includes('Panca, la mia'), 'il nuovo nome non compare');
  assert.equal(personalizza.quante(), 1);
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

await prova('Cibo: la spesa si disegna e le voci sono spuntabili', async () => {
  const app = radice();
  await cibo.monta(app, ['spesa']);
  const testo = app.textContent;
  assert.ok(testo.includes('Lista A — spesa comune'));
  assert.ok(testo.includes('Lista B — spesa nostra'));
  assert.ok(testo.includes('Cereali proteici'));
  assert.ok(testo.includes('Barrette proteiche'));
  assert.ok(!testo.includes('Ceci in barattolo'), 'i ceci sono ancora nella spesa');
  const caselle = tutti(app, (n) => n.getAttribute && n.getAttribute('type') === 'checkbox');
  assert.ok(caselle.length > 40, `caselle trovate: ${caselle.length}`);
});

await prova('Cibo: spostare una voce da Lista A a Lista B, dall’interfaccia', async () => {
  const app = radice();
  await cibo.monta(app, ['spesa']);
  await conTesto(app, 'Modifica').parentNode.scatena('click');

  const matita = tutti(app, (n) => n.classList && n.classList.contains('mod-apri'))[0];
  const riga = matita.parentNode;
  await matita.scatena('click');

  const sposta = conTesto(riga, 'Sposta in Lista B');
  assert.ok(sposta, 'manca il pulsante per spostare');
  await sposta.parentNode.scatena('click');

  assert.equal(personalizza.quante(), 1);
  const spesa = await (await import(`${MOD}piani.js`)).piano({ file: 'dati/cibo/2026-spesa.json' });
  const inB = spesa.liste.find((l) => l.id === 'B').reparti
    .flatMap((r) => r.voci).filter((v) => v.spostata);
  assert.equal(inB.length, 1);
  assert.equal(inB[0].originale, 'Zucchine');
  await personalizza.azzeraTutte();
});

await prova('Cibo: togliere uno spuntino dall’interfaccia', async () => {
  const app = radice();
  await cibo.monta(app, []);
  await conTesto(app, 'Modifica').parentNode.scatena('click');

  const matite = tutti(app, (n) => n.classList && n.classList.contains('mod-apri'));
  const ultima = matite[matite.length - 1];
  const riga = ultima.parentNode;
  await ultima.scatena('click');

  const togli = conTesto(riga, 'Togli questo spuntino');
  assert.ok(togli, 'manca il pulsante per togliere lo spuntino');
  await togli.parentNode.scatena('click');

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

await prova('Oggi: tutte le sedute si possono scegliere, qualunque sia il giorno', async () => {
  const app = radice();
  await oggi.monta(app);
  const link = tutti(app, (n) => n.tagName === 'A' && String(n.getAttribute('href')).startsWith('#/sessione/'))
    .map((n) => n.getAttribute('href').replace('#/sessione/', ''));
  ['upper-a', 'lower-a', 'upper-b', 'lower-b'].forEach((id) => {
    assert.ok(link.includes(id), `manca la scelta di ${id}: ${link}`);
  });
  assert.ok(app.textContent.includes('Questa settimana'));
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
  assert.ok(testo.includes(`1 di ${previsti}`), `conteggio della settimana sbagliato: ${testo}`);
  assert.ok(/fatto (lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)/.test(testo),
    'la seduta fatta non è segnata nell’elenco');

  const ses = radice();
  await sessione.monta(ses, ['lower-b']);
  assert.ok(ses.textContent.includes('Lower B l’hai già fatto questa settimana'),
    'la sessione non avvisa che Lower B è già stato fatto');
});

console.log(`\n${fatte} prove di vista passate.`);

// Il cronometro della sessione lascia acceso un setInterval: si chiude a mano.
process.exit(0);
