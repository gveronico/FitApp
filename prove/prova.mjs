import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installa } from './stub-idb.mjs';

installa();

const RADICE = fileURLToPath(new URL('..', import.meta.url));

// piani.js fa fetch dei file: qui li serviamo dal disco.
globalThis.fetch = async (percorso) => {
  const f = path.join(RADICE, String(percorso));
  if (!fs.existsSync(f)) return { ok: false, status: 404 };
  return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(f, 'utf8')) };
};

const MOD = new URL('../js/', import.meta.url).href;
const personalizza = await import(`${MOD}personalizza.js`);
const piani = await import(`${MOD}piani.js`);
const progressi = await import(`${MOD}viste/progressi.js`);

let fatte = 0;
const prova = async (nome, fn) => {
  await fn();
  fatte += 1;
  console.log('  ok —', nome);
};

/* ---------- allenamento: tag e ripetizioni ---------------- */

const fase1 = await piani.piano({ file: 'dati/allenamento/2026-fase1.json' });
const fase2 = await piani.piano({ file: 'dati/allenamento/2026-fase2.json' });
const tuttiEsercizi = [...fase1.sedute, ...fase2.sedute].flatMap((s) => s.esercizi);

await prova('ogni esercizio ha un gruppo muscolare noto', () => {
  const noti = new Set(piani.GRUPPI.map((g) => g.id));
  const senza = tuttiEsercizi.filter((e) => !noti.has(e.gruppo));
  assert.deepEqual(senza.map((e) => e.id), []);
});

await prova('in Fase 1 le serie sono 3 e le ripetizioni 12-10-8', () => {
  const conCarico = fase1.sedute.flatMap((s) => s.esercizi)
    .filter((e) => e.carico !== 'tempo' && e.id !== 'stacco-rialzo-bilanciere');
  assert.ok(conCarico.length >= 20, 'pochi esercizi controllati');
  conCarico.forEach((e) => {
    assert.deepEqual(e.ripSerie, [12, 10, 8], `${e.id}: ripSerie sbagliate`);
    assert.equal(piani.serieDi(e, 1), 3, `${e.id}: non fa 3 serie dalla settimana 1`);
  });
});

await prova('ripAttese dà il numero della serie giusta', () => {
  const panca = fase1.sedute[0].esercizi[0];
  assert.equal(piani.ripAttese(panca, 0), 12);
  assert.equal(piani.ripAttese(panca, 1), 10);
  assert.equal(piani.ripAttese(panca, 2), 8);
  assert.equal(piani.ripAttese(panca, 9), 8, 'oltre la fine resta l’ultima');
  const plank = fase1.sedute[2].esercizi.find((e) => e.id === 'plank');
  assert.equal(piani.ripAttese(plank, 0), null, 'a tempo non c’è un numero atteso');
});

await prova('lo stacco da rialzo entra dalla settimana 4', () => {
  const e = fase1.sedute[3].esercizi[0];
  assert.equal(e.id, 'stacco-rialzo-bilanciere');
  assert.equal(piani.serieDi(e, 3), 0);
  assert.equal(piani.serieDi(e, 4), 3);
});

await prova('i riscaldamenti non nominano più macchine da cardio', () => {
  const voci = [...fase1.sedute, ...fase2.sedute]
    .flatMap((s) => s.riscaldamento.voci).join(' ').toLowerCase();
  ['ellittica', 'cyclette', 'rowing', 'tapis'].forEach((parola) => {
    assert.ok(!voci.includes(parola), `il riscaldamento nomina ancora: ${parola}`);
  });
  assert.ok(voci.includes('serie a vuoto'));
});

/* ---------- indice: le due fasi ----------------------------- */

const indice = await piani.indice();

await prova('Fase 1 dura 6 settimane, Fase 2 le 8 successive', () => {
  const [f1, f2] = indice.allenamento;
  assert.deepEqual([f1.settimanaDa, f1.settimanaA], [1, 6]);
  assert.deepEqual([f2.settimanaDa, f2.settimanaA], [7, 14]);
  assert.equal(fase1.settimane, 6);
  assert.equal(fase2.settimane, 8);
});

await prova('la settimana 6 è ancora Fase 1, la 7 è Fase 2', () => {
  assert.equal(piani.riferimentoPer(indice.allenamento, 6).id, '2026-fase1');
  assert.equal(piani.riferimentoPer(indice.allenamento, 7).id, '2026-fase2');
});

/* ---------- cibo: le modifiche chieste ---------------------- */

const cibo = await piani.piano({ file: 'dati/cibo/2026-base.json' });
const giorno = (n) => cibo.settimana.find((g) => g.giorno === n);

await prova('lunedì: frittata a pranzo, pollo senza ceci a cena', () => {
  assert.match(giorno(1).pranzo.testo, /Frittata/);
  assert.match(giorno(1).cena.testo, /Pollo/);
  assert.ok(!/ceci/i.test(JSON.stringify(cibo)), 'i ceci sono ancora nel piano');
});

await prova('mercoledì: polpette a pranzo, salmone al forno senza riso a cena', () => {
  assert.match(giorno(3).pranzo.testo, /Polpette/);
  assert.match(giorno(3).cena.testo, /salmone al forno/i);
  const cena = giorno(3).cena;
  assert.ok(!/riso/i.test(cena.testo + cena.ingredienti.join(' ')), 'il riso è ancora nel piatto');
  assert.match(cena.nota, /Niente riso/i);
});

await prova('il minestrone c’è ed è accompagnato da una proteina', () => {
  const conMinestrone = cibo.settimana.filter(
    (g) => /minestrone/i.test(`${g.pranzo?.testo} ${g.cena?.testo}`),
  );
  assert.equal(conMinestrone.length, 1);
  assert.match(conMinestrone[0].cena.testo, /omelette/i);
});

await prova('colazione con cereali proteici e spuntino con barretta', () => {
  assert.ok(cibo.colazioni.some((c) => /cereali proteici/i.test(c.testo)));
  assert.ok(cibo.spuntini.some((s) => /barretta proteica/i.test(s.testo)));
});

await prova('vincoli e avvertenze non stanno più nel piano', () => {
  assert.equal(cibo.vincoli, undefined);
  assert.equal(cibo.avvertenze, undefined);
  assert.ok(!/buste singole|leggere l.etichetta|allergolog/i.test(JSON.stringify(cibo)));
});

/* ---------- personalizzazioni ------------------------------- */

const rif = { file: 'dati/allenamento/2026-fase1.json' };

await prova('rinominare un esercizio non tocca il suo id', async () => {
  await personalizza.scrivi(personalizza.chiaveEsercizio('panca-piana-manubri'), { nome: 'Panca' });
  const p = await piani.piano(rif);
  const e = p.sedute[0].esercizi[0];
  assert.equal(e.id, 'panca-piana-manubri');
  assert.equal(e.nome, 'Panca');
  assert.equal(e.nomeOriginale, 'Panca piana con manubri');
  assert.equal(e.personalizzato, true);
});

await prova('togliendo la personalizzazione torna il nome del piano', async () => {
  await personalizza.scrivi(personalizza.chiaveEsercizio('panca-piana-manubri'), null);
  const p = await piani.piano(rif);
  assert.equal(p.sedute[0].esercizi[0].nome, 'Panca piana con manubri');
  assert.equal(p.sedute[0].esercizi[0].personalizzato, undefined);
});

await prova('il piano nel repo non viene mai modificato in memoria', async () => {
  await personalizza.scrivi(personalizza.chiaveEsercizio('leg-curl'), { nome: 'Femorali' });
  const a = await piani.piano(rif);
  await personalizza.scrivi(personalizza.chiaveEsercizio('leg-curl'), null);
  const b = await piani.piano(rif);
  const nome = (p) => p.sedute[3].esercizi.find((e) => e.id === 'leg-curl').nome;
  assert.equal(nome(a), 'Femorali');
  assert.equal(nome(b), 'Leg curl');
});

const rifCibo = { file: 'dati/cibo/2026-base.json' };

await prova('uno spuntino si può togliere dalla lista', async () => {
  const prima = (await piani.piano(rifCibo)).spuntini;
  const bersaglio = prima.find((s) => /barretta/i.test(s.testo));
  await personalizza.scrivi(bersaglio.chiave, { nascosto: true });
  const dopo = (await piani.piano(rifCibo)).spuntini;
  assert.equal(dopo.length, prima.length - 1);
  assert.ok(!dopo.some((s) => /barretta/i.test(s.testo)));
  await personalizza.scrivi(bersaglio.chiave, null);
});

await prova('un pasto si può rinominare', async () => {
  const chiave = personalizza.chiavePasto('2026-base', 3, 'cena');
  await personalizza.scrivi(chiave, { nome: 'Salmone e zucca' });
  const p = await piani.piano(rifCibo);
  const cena = p.settimana.find((g) => g.giorno === 3).cena;
  assert.equal(cena.nome, 'Salmone e zucca');
  assert.equal(cena.nomeOriginale, 'Salmone al forno');
  assert.equal(cena.testo, 'Trancio di salmone al forno + zucca e peperoni arrosto + pane integrale.');
  await personalizza.scrivi(chiave, null);
});

const rifSpesa = { file: 'dati/cibo/2026-spesa.json' };

await prova('le voci della spesa arrivano con chiave e testo', async () => {
  const spesa = await piani.piano(rifSpesa);
  const voce = spesa.liste[0].reparti[0].voci[0];
  assert.equal(voce.originale, 'Zucchine');
  assert.equal(voce.testo, 'Zucchine');
  assert.equal(voce.chiave, 'pz:spesa:A:Zucchine');
  assert.equal(personalizza.spuntaDaChiave(voce.chiave), 'spesa:A:Zucchine');
  assert.equal(voce.spostata, false);
});

await prova('una voce si sposta da Lista A a Lista B senza perdere la spunta', async () => {
  const chiave = personalizza.chiaveVoceSpesa('A', 'Zucchine');
  await personalizza.scrivi(chiave, { lista: 'B' });
  const spesa = await piani.piano(rifSpesa);

  const inA = spesa.liste.find((l) => l.id === 'A').reparti
    .flatMap((r) => r.voci).filter((v) => v.originale === 'Zucchine');
  const inB = spesa.liste.find((l) => l.id === 'B').reparti
    .flatMap((r) => r.voci).filter((v) => v.originale === 'Zucchine');

  assert.equal(inA.length, 0, 'è rimasta anche in A');
  assert.equal(inB.length, 1, 'non è arrivata in B');
  assert.equal(inB[0].spostata, true);
  assert.equal(inB[0].listaOrigine, 'A');
  assert.equal(inB[0].chiave, 'pz:spesa:A:Zucchine', 'la chiave della spunta è cambiata');
  await personalizza.scrivi(chiave, null);
});

await prova('una voce si rinomina e una si toglie', async () => {
  await personalizza.scrivi(personalizza.chiaveVoceSpesa('B', 'Muesli'), { testo: 'Muesli semplice' });
  await personalizza.scrivi(personalizza.chiaveVoceSpesa('B', 'Bresaola'), { nascosto: true });
  const spesa = await piani.piano(rifSpesa);
  const voci = spesa.liste.find((l) => l.id === 'B').reparti.flatMap((r) => r.voci);
  assert.ok(voci.some((v) => v.testo === 'Muesli semplice' && v.personalizzata));
  assert.ok(!voci.some((v) => v.originale === 'Bresaola'));
  await personalizza.azzeraTutte();
  assert.equal(personalizza.quante(), 0);
});

await prova('un reparto svuotato non compare', async () => {
  const spesa0 = await piani.piano(rifSpesa);
  const integratori = spesa0.liste.find((l) => l.id === 'B').reparti
    .find((r) => r.nome === 'Integratori');
  await Promise.all(integratori.voci.map(
    (v) => personalizza.scrivi(v.chiave, { nascosto: true }),
  ));
  const spesa = await piani.piano(rifSpesa);
  assert.ok(!spesa.liste.find((l) => l.id === 'B').reparti.some((r) => r.nome === 'Integratori'));
  await personalizza.azzeraTutte();
});

/* ---------- progressi per gruppo ----------------------------- */

await prova('gli incrementi si aggregano per gruppo muscolare', () => {
  const s = (esercizioId, data, carico, ripetizioni, indice = 0) => ({
    esercizioId, data, carico, ripetizioni, indice, monitorata: true, sedutaId: 'upper-a',
  });
  const serie = [
    s('panca-piana-manubri', '2026-10-01', 40, 8),   // petto-spalle  +25%
    s('panca-piana-manubri', '2026-11-01', 50, 8),
    s('croci-panca-piana', '2026-10-01', 10, 10),    // petto-spalle  +50%
    s('croci-panca-piana', '2026-11-01', 15, 10),
    s('curl-manubri', '2026-10-01', 10, 10),         // braccia       +20%
    s('curl-manubri', '2026-11-01', 12, 10),
    s('leg-curl', '2026-10-01', 30, 12),             // gambe, a meno rip: non conta
    s('leg-curl', '2026-11-01', 40, 8),
  ];

  const calcolo = progressi.calcolaIncrementi(serie);
  const gruppi = new Map(tuttiEsercizi.map((e) => [e.id, e.gruppo]));
  const righe = progressi.aggregaPerGruppo(calcolo.esercizi, gruppi);

  assert.deepEqual(righe.map((r) => r.gruppo), ['braccia', 'petto-spalle'],
    'ordine dei gruppi o filtro sbagliati');
  assert.equal(righe.find((r) => r.gruppo === 'braccia').media, 20);
  assert.equal(righe.find((r) => r.gruppo === 'petto-spalle').media, 37.5);
  assert.equal(righe.find((r) => r.gruppo === 'petto-spalle').quanti, 2);
  assert.ok(!righe.some((r) => r.gruppo === 'gambe'), 'il leg curl a meno rip non va contato');
});

console.log(`\n${fatte} prove passate.`);
