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
const spesa = await import(`${MOD}spesa.js`);

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

await prova('petto e spalle sono due gruppi: le spinte su panca vanno al petto', () => {
  const gruppo = (id) => tuttiEsercizi.find((e) => e.id === id).gruppo;
  ['panca-piana-manubri', 'croci-panca-piana', 'panca-inclinata-manubri', 'panca-inclinata-bilanciere']
    .forEach((id) => assert.equal(gruppo(id), 'petto', id));
  ['military-press-manubri', 'military-press-bilanciere', 'alzate-laterali', 'face-pull-cavi', 'alzate-posteriori-cavi']
    .forEach((id) => assert.equal(gruppo(id), 'spalle', id));
  assert.ok(!tuttiEsercizi.some((e) => e.gruppo === 'petto-spalle'));
});

await prova('una copia sul telefono con petto-spalle si smista dal nome', async () => {
  const copia = {
    id: 'vecchia',
    nome: 'Copia vecchia',
    sedute: [{
      id: 's',
      nome: 'S',
      esercizi: [
        { id: 'a', nome: 'Panca inclinata 45° con bilanciere', gruppo: 'petto-spalle', serie: 3, rip: '8' },
        { id: 'b', nome: 'Military press con manubri', gruppo: 'petto-spalle', serie: 3, rip: '8' },
        { id: 'c', nome: 'Alzate laterali', gruppo: 'petto-spalle', serie: 3, rip: '8' },
      ],
    }],
  };
  const { leggi, scrivi, cancella } = await import(`${MOD}store.js`);
  await scrivi('piano:vecchia', { piano: copia, base: null, locale: true, meta: null });
  const p = await piani.piano({ id: 'vecchia' });
  assert.deepEqual(p.sedute[0].esercizi.map((e) => e.gruppo), ['petto', 'spalle', 'spalle']);
  assert.equal((await leggi('piano:vecchia')).piano.sedute[0].esercizi[0].gruppo, 'petto-spalle',
    'la lettura non deve riscrivere la copia');
  await cancella('piano:vecchia');
});

await prova('niente superserie, incrementi, tipi di carico né progressione automatica', () => {
  [fase1, fase2].forEach((p) => assert.equal(p.progressione, undefined, `${p.id}: progressione`));
  tuttiEsercizi.forEach((e) => {
    ['superserie', 'incrementoKg', 'carico', 'caricoAlternativo', 'serieDaSettimana']
      .forEach((k) => assert.equal(e[k], undefined, `${e.id}: ${k}`));
    assert.ok(e.recuperoSec > 0, `${e.id}: senza recupero`);
    assert.ok(!/superserie|incremento|tacca|assistit|zavorra/i.test(e.note || ''), `${e.id}: nota da togliere`);
  });
  assert.ok(!tuttiEsercizi.some((e) => e.id === 'plank' || e.id === 'trazioni'));
});

await prova('in Fase 1 le serie sono 3 e le ripetizioni 12-10-8', () => {
  const scalati = fase1.sedute.flatMap((s) => s.esercizi)
    .filter((e) => e.id !== 'stacco-rialzo-bilanciere');
  assert.ok(scalati.length >= 19, 'pochi esercizi controllati');
  scalati.forEach((e) => {
    assert.deepEqual(e.ripSerie, [12, 10, 8], `${e.id}: ripSerie sbagliate`);
    assert.equal(e.serie, 3, `${e.id}: non fa 3 serie`);
  });
});

await prova('ripAttese dà il numero della serie giusta', () => {
  const panca = fase1.sedute[0].esercizi[0];
  assert.equal(piani.ripAttese(panca, 0), 12);
  assert.equal(piani.ripAttese(panca, 1), 10);
  assert.equal(piani.ripAttese(panca, 2), 8);
  assert.equal(piani.ripAttese(panca, 9), 8, 'oltre la fine resta l’ultima');
  const stacco = fase1.sedute[3].esercizi.find((e) => e.id === 'stacco-rialzo-bilanciere');
  assert.equal(piani.ripAttese(stacco, 0), null, 'a ripetizioni fisse non c’è una scala');
});

/* ---------- Fase 1 v5.0 (23/09/2026) ----------------------- */

const sedutaF1 = (id) => fase1.sedute.find((s) => s.id === id);
const idsF1 = (id) => sedutaF1(id).esercizi.map((e) => e.id);

await prova('Fase 1: le sei settimane sono uguali, niente entra a metà', () => {
  fase1.sedute.flatMap((s) => s.esercizi).forEach((e) => {
    assert.equal(e.serieDaSettimana, undefined, `${e.id}: cambia ancora a metà fase`);
    assert.ok(!/settimana \d/i.test(e.note || ''), `${e.id}: la nota parla ancora di settimane`);
  });
});

await prova('Fase 1: Upper A con le croci al 2 e la lat machine al 3', () => {
  assert.deepEqual(idsF1('upper-a').slice(0, 3),
    ['panca-piana-manubri', 'croci-panca-piana', 'lat-machine-triangolo']);
});

await prova('Fase 1: squat con bilanciere al posto del goblet, stesso id della Fase 2', () => {
  assert.equal(idsF1('lower-a')[0], 'squat-bilanciere');
  assert.ok(!idsF1('lower-a').includes('goblet-squat-manubrio'));
  assert.ok(fase2.sedute.some((s) => s.esercizi.some((e) => e.id === 'squat-bilanciere')));
});

await prova('Fase 1: lat machine presa larga al posto delle trazioni assistite', () => {
  const primo = sedutaF1('upper-b').esercizi[0];
  assert.equal(primo.id, 'lat-machine-presa-larga');
});

await prova('Upper B: sit up col disco al posto del plank, stesso id in Fase 1 e 2', () => {
  assert.ok(idsF1('upper-b').includes('situp-disco-petto'));
  assert.ok(fase2.sedute.find((s) => s.id === 'upper-b').esercizi.some((e) => e.id === 'situp-disco-petto'));
});

await prova('Fase 2: lat machine presa larga al posto delle trazioni, stesso storico della Fase 1', () => {
  const primo = fase2.sedute.find((s) => s.id === 'upper-b').esercizi[0];
  assert.equal(primo.id, 'lat-machine-presa-larga');
  assert.equal(primo.gruppo, 'dorso');
});

await prova('Fase 1: Lower B senza hip thrust, stacco da rialzo dalla settimana 1', () => {
  assert.ok(!idsF1('lower-b').includes('hip-thrust-bilanciere'));
  const stacco = sedutaF1('lower-b').esercizi[0];
  assert.equal(stacco.id, 'stacco-rialzo-bilanciere');
  assert.equal(stacco.serie, 3);
});

await prova('Fase 1: due allenamenti nelle settimane 1-2, poi quattro', () => {
  assert.equal(piani.allenamentiPrevisti(fase1, 1), 2);
  assert.equal(piani.allenamentiPrevisti(fase1, 2), 2);
  assert.equal(piani.allenamentiPrevisti(fase1, 3), 4);
  assert.equal(piani.allenamentiPrevisti(fase1, 6), 4);
  assert.equal(piani.allenamentiPrevisti(fase2, 1), 4, 'senza scala: uno per seduta');
});

await prova('Fase 1 è monitorata, e le sue serie vecchie contano lo stesso', async () => {
  const idx = await piani.indice();
  assert.equal(idx.allenamento.find((r) => r.id === '2026-fase1').monitorata, true);
  assert.equal(fase1.monitorata, true);

  const monitorati = await piani.pianiMonitorati();
  // Registrate prima del 23/09, quando la Fase 1 non contava: portano monitorata:false.
  const serie = [
    { esercizioId: 'squat-bilanciere', data: '2026-09-22', carico: 40, ripetizioni: 8, indice: 2, monitorata: false, pianoId: '2026-fase1' },
    { esercizioId: 'squat-bilanciere', data: '2026-09-29', carico: 50, ripetizioni: 8, indice: 2, monitorata: true, pianoId: '2026-fase1' },
  ];
  const e = progressi.calcolaIncrementi(serie, monitorati).esercizi[0];
  assert.ok(e, 'lo squat non entra nel calcolo');
  assert.equal(e.incrementoPercento, 25);
  assert.deepEqual(e.massimo, { carico: 50, ripetizioni: 8, data: '2026-09-29' });
  assert.equal(progressi.calcolaIncrementi(serie).esercizi[0].inAttesa, true,
    'senza l’elenco dei piani vale ancora il flag della serie');
});

/* ---------- settimana in corso --------------------------------- */

await prova('inizioSettimana: settimana del programma, o da lunedì senza data', () => {
  // Inizio lunedì 21/09: mercoledì 30/09 sta nella settimana 2, che parte il 28.
  assert.equal(piani.inizioSettimana('2026-09-21', new Date(2026, 8, 30)), '2026-09-28');
  // Inizio di giovedì: le settimane vanno da giovedì a mercoledì.
  assert.equal(piani.inizioSettimana('2026-09-24', new Date(2026, 9, 6)), '2026-10-01');
  // Senza data: il lunedì della settimana di calendario.
  assert.equal(piani.inizioSettimana(null, new Date(2026, 8, 27)), '2026-09-21');
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

await prova('colazione e spuntini sono alimenti, non ricette, e ci sono tutti', () => {
  assert.equal(cibo.colazioni, undefined);
  assert.equal(cibo.spuntini, undefined);
  const col = cibo.colazione.alimenti.map((a) => a.nome);
  const spu = cibo.spuntino.alimenti.map((a) => a.nome);
  for (const x of ['Cereali proteici', 'Latte proteico', 'Fiocchi d\'avena', 'Skyr senza lattosio', 'Frutti di bosco', 'Cacao amaro', 'Bresaola']) {
    assert.ok(col.includes(x), `manca ${x} nella colazione`);
  }
  for (const x of ['Barrette proteiche', 'Muesli', 'Mandorle', 'Semi di zucca', 'Gallette integrali', 'Cannella']) {
    assert.ok(spu.includes(x), `manca ${x} negli spuntini`);
  }
  assert.ok([...cibo.colazione.alimenti, ...cibo.spuntino.alimenti].every((a) => a.scelto), 'partono tutti accesi');
});

await prova('martedì a pranzo il farro è acceso e l’orzo no', () => {
  const al = giorno(2).pranzo.alimenti;
  assert.deepEqual(al.map((a) => a.nome), ['Farro', 'Orzo', 'Tonno', 'Pomodorini', 'Zucchine']);
  assert.deepEqual(al.filter((a) => !a.scelto).map((a) => a.nome), ['Orzo']);
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

await prova('uno spuntino si spegne e torna acceso', async () => {
  const chiave = personalizza.chiaveAlimenti('2026-base', 'spuntino');
  await personalizza.scegliAlimento(chiave, 'Barrette proteiche', false);
  let al = (await piani.piano(rifCibo)).spuntino.alimenti;
  assert.equal(al.find((a) => a.nome === 'Barrette proteiche').scelto, false);
  await personalizza.scegliAlimento(chiave, 'Barrette proteiche', true);
  al = (await piani.piano(rifCibo)).spuntino.alimenti;
  assert.equal(al.find((a) => a.nome === 'Barrette proteiche').scelto, true);
  assert.equal(personalizza.quante(), 0, 'tornato com’era, non è una modifica');
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
const lista = async () => spesa.componi(await piani.piano(rifCibo), await piani.piano(rifSpesa));
const voci = (l) => l.reparti.flatMap((r) => r.voci);
const cerca = (l, testo) => voci(l).find((v) => v.testo === testo);

await prova('la spesa è una lista sola, fatta dalla dieta, senza Lista A e B', async () => {
  const l = await lista();
  assert.equal((await piani.piano(rifSpesa)).liste, undefined);
  assert.ok(l.totale > 40, `voci: ${l.totale}`);
  // Ogni alimento acceso della dieta è in lista, e una volta sola.
  const cibo2 = await piani.piano(rifCibo);
  const accesi = spesa.accesi(cibo2);
  for (const a of accesi) assert.ok(cerca(l, a.nome), `${a.nome} non è nella spesa`);
  const testi = voci(l).map((v) => personalizza.slug(v.testo));
  assert.equal(new Set(testi).size, testi.length, 'ci sono voci doppie');
  // E niente che la dieta non chieda, a parte le cose fisse.
  const daDieta = new Set(accesi.map((a) => personalizza.slug(a.nome)));
  const estranee = voci(l).filter((v) => v.origine === 'dieta' && !daDieta.has(personalizza.slug(v.testo)));
  assert.deepEqual(estranee, []);
  assert.ok(!cerca(l, 'Orzo'), 'l’orzo è spento ma è in lista');
  assert.ok(!cerca(l, 'Sgombro in scatola'), 'lo sgombro non è nella dieta');
});

await prova('una voce dice dove si usa e sta nel suo reparto', async () => {
  const l = await lista();
  const pane = cerca(l, 'Pane integrale');
  assert.deepEqual(pane.usi, ['lun', 'mar', 'mer', 'gio', 'colazione']);
  assert.equal(pane.reparto, 'Pane, pasta e cereali');
  assert.equal(cerca(l, 'Tonno').reparto, 'Dispensa');
  assert.equal(cerca(l, 'Creatina monoidrato').origine, 'sempre');
  assert.equal(pane.spunta, 'spesa:pane-integrale');
  assert.equal(l.reparti[0].nome, 'Verdura');
});

await prova('farro spento e orzo acceso: in lista c’è l’orzo', async () => {
  const chiave = personalizza.chiavePasto('2026-base', 2, 'pranzo');
  await personalizza.scegliAlimento(chiave, 'Farro', false, true);
  await personalizza.scegliAlimento(chiave, 'Orzo', true, false);
  const l = await lista();
  assert.ok(cerca(l, 'Orzo'), 'l’orzo acceso non è arrivato');
  assert.ok(!cerca(l, 'Farro'), 'il farro spento è rimasto');
  await personalizza.azzeraTutte();
});

await prova('tonno spento: esce, e resta quello che serve altrove', async () => {
  const chiave = personalizza.chiavePasto('2026-base', 2, 'pranzo');
  await personalizza.scegliAlimento(chiave, 'Tonno', false);
  await personalizza.scegliAlimento(chiave, 'Zucchine', false);
  const l = await lista();
  assert.ok(!cerca(l, 'Tonno'));
  assert.ok(cerca(l, 'Zucchine'), 'le zucchine servono anche lunedì e giovedì');
  assert.ok(!cerca(l, 'Zucchine').usi.includes('mar'));
  await personalizza.azzeraTutte();
});

await prova('riso integrale aggiunto a un pasto: arriva in lista, nel reparto giusto', async () => {
  const cibo2 = await piani.piano(rifCibo);
  const pasto = cibo2.settimana.find((g) => g.giorno === 3).cena;
  await personalizza.aggiungiAlimento(pasto.chiave, 'Riso integrale', pasto.ingredientiOriginali);
  const riso = cerca(await lista(), 'Riso integrale');
  assert.ok(riso, 'il riso integrale non è in lista');
  assert.equal(riso.reparto, 'Pane, pasta e cereali');
  assert.deepEqual(riso.usi, ['mer']);
  // Un alimento sconosciuto va in Altro; e toglierlo lo toglie anche dalla lista.
  await personalizza.aggiungiAlimento(pasto.chiave, 'Tahina', pasto.ingredientiOriginali);
  assert.equal(cerca(await lista(), 'Tahina').reparto, 'Altro');
  await personalizza.togliAlimento(pasto.chiave, 'Riso integrale', pasto.ingredientiOriginali);
  await personalizza.togliAlimento(pasto.chiave, 'Tahina', pasto.ingredientiOriginali);
  assert.ok(!cerca(await lista(), 'Riso integrale'));
  assert.equal(personalizza.quante(), 0, 'tolti i due aggiunti, l’elenco è quello del piano');
});

await prova('un alimento della colazione tolto esce dalla spesa', async () => {
  const chiave = personalizza.chiaveAlimenti('2026-base', 'colazione');
  const originali = (await piani.piano(rifCibo)).colazione.originali;
  await personalizza.togliAlimento(chiave, 'Skyr senza lattosio', originali);
  assert.ok(!cerca(await lista(), 'Skyr senza lattosio'));
  await personalizza.azzeraTutte();
});

await prova('reparto cambiato, voce fissa tolta, voce nuova aggiunta', async () => {
  await personalizza.scrivi(personalizza.chiaveVoceSpesa('Miele'), { reparto: 'Frutta' });
  await personalizza.scrivi(personalizza.chiaveVoceSpesa('Omega 3'), { nascosto: true });
  await personalizza.aggiungiVoceSpesa({ testo: 'Carta da forno', reparto: 'Dispensa' });
  const l = await lista();
  assert.equal(cerca(l, 'Miele').reparto, 'Frutta');
  assert.ok(!cerca(l, 'Omega 3'));
  const carta = cerca(l, 'Carta da forno');
  assert.equal(carta.origine, 'aggiunta');
  assert.ok(carta.spunta.startsWith('spesa:'), 'la spunta non si azzera con le altre');
  await personalizza.azzeraTutte();
});

await prova('le modifiche di prima (Lista A/B, colazioni come ricette) non si contano più', async () => {
  const store = await import(`${MOD}store.js`);
  await store.scrivi('pz:spesa:A:Zucchine', { lista: 'B' });
  await store.scrivi('pz:colazione:2026-base:yogurt-e-avena', { nascosto: true });
  await personalizza.carica(true);
  assert.equal(personalizza.quante(), 0);
  await store.cancella('pz:spesa:A:Zucchine');
  await store.cancella('pz:colazione:2026-base:yogurt-e-avena');
});

/* ---------- progressi per gruppo ----------------------------- */

await prova('gli incrementi si aggregano per gruppo muscolare', () => {
  const s = (esercizioId, data, carico, ripetizioni, indice = 0) => ({
    esercizioId, data, carico, ripetizioni, indice, monitorata: true, sedutaId: 'upper-a',
  });
  const serie = [
    s('panca-piana-manubri', '2026-10-01', 40, 8),   // petto   +25%
    s('panca-piana-manubri', '2026-11-01', 50, 8),
    s('croci-panca-piana', '2026-10-01', 10, 10),    // petto   +50%
    s('croci-panca-piana', '2026-11-01', 15, 10),
    s('alzate-laterali', '2026-10-01', 8, 12),       // spalle  +25%
    s('alzate-laterali', '2026-11-01', 10, 12),
    s('curl-manubri', '2026-10-01', 10, 10),         // braccia       +20%
    s('curl-manubri', '2026-11-01', 12, 10),
    s('leg-curl', '2026-10-01', 30, 12),             // gambe: più carico, meno volume
    s('leg-curl', '2026-11-01', 40, 8),              // 360 -> 320
  ];

  const calcolo = progressi.calcolaIncrementi(serie);
  const gruppi = new Map(tuttiEsercizi.map((e) => [e.id, e.gruppo]));
  const righe = progressi.aggregaPerGruppo(calcolo.esercizi, gruppi);

  assert.deepEqual(righe.map((r) => r.gruppo), ['braccia', 'gambe', 'petto', 'spalle'],
    'ordine dei gruppi o filtro sbagliati');
  assert.equal(righe.find((r) => r.gruppo === 'braccia').media, 20);
  assert.equal(righe.find((r) => r.gruppo === 'petto').media, 37.5);
  assert.equal(righe.find((r) => r.gruppo === 'petto').quanti, 2);
  assert.equal(righe.find((r) => r.gruppo === 'spalle').media, 25);
  assert.ok(Math.abs(righe.find((r) => r.gruppo === 'gambe').media - (-100 / 9)) < 1e-9,
    'il leg curl: più carico ma meno volume, quindi scende');
});

await prova('progressi: volume di tutte le serie, e in parallelo il carico massimo', () => {
  const s = (data, carico, ripetizioni, indice) => ({
    esercizioId: 'panca-piana-manubri', data, carico, ripetizioni, indice, monitorata: true, sedutaId: 'upper-a',
  });
  const serie = [
    s('2026-10-01', 20, 12, 0), s('2026-10-01', 22, 10, 1), s('2026-10-01', 24, 8, 2),  // 240+220+192 = 652
    s('2026-10-08', 24, 12, 0), s('2026-10-08', 24, 10, 1), s('2026-10-08', 24, 8, 2),  // 288+240+192 = 720
  ];
  let e = progressi.calcolaIncrementi(serie).esercizi[0];
  assert.equal(e.iniziale.volume, 652);
  assert.equal(e.attuale.volume, 720);
  assert.equal(e.attuale.serie, 3);
  assert.ok(Math.abs(e.incrementoPercento - (68 / 652) * 100) < 1e-9);
  // Stesso carico più alto, ma 12 ripetizioni invece di 8: è un massimo nuovo.
  assert.deepEqual(e.massimo, { carico: 24, ripetizioni: 12, data: '2026-10-08' });
  assert.equal(e.massimoNuovo, true);
  // Rifatto uguale: non è più nuovo.
  assert.equal(progressi.calcolaIncrementi([...serie, s('2026-10-09', 24, 12, 0)]).esercizi[0].massimoNuovo, false);

  // Una serie in meno abbassa il volume anche col carico più alto, ma il massimo sale.
  serie.push(s('2026-10-15', 26, 10, 0), s('2026-10-15', 26, 8, 1));                  // 260+208 = 468
  e = progressi.calcolaIncrementi(serie).esercizi[0];
  assert.equal(e.attuale.volume, 468);
  assert.ok(e.incrementoPercento < 0);
  assert.deepEqual(e.massimo, { carico: 26, ripetizioni: 10, data: '2026-10-15' });
  assert.equal(e.massimoNuovo, true);
  assert.equal(progressi.volume(1080), '1.080');
  assert.equal(progressi.volume(652.4), '652');
});


/* ---------- modifiche dall'app: schede, piani nuovi ---------- */

const store = await import(`${MOD}store.js`);
const RIF1 = { id: '2026-fase1', file: 'dati/allenamento/2026-fase1.json' };

await prova('leggiRip: fisse, range e una per serie', () => {
  assert.deepEqual(piani.leggiRip('10'), { rip: '10', ripMin: 10, ripMax: 10, ripSerie: null });
  assert.deepEqual(piani.leggiRip('8-10'), { rip: '8-10', ripMin: 8, ripMax: 10, ripSerie: null });
  assert.deepEqual(piani.leggiRip('12 – 10 – 8'), { rip: '12-10-8', ripMin: 8, ripMax: 12, ripSerie: [12, 10, 8] });
  assert.deepEqual(piani.leggiRip('10-8').ripSerie, [10, 8], 'due numeri che scendono sono una scala');
  assert.equal(piani.leggiRip('dieci'), null);
  assert.equal(piani.leggiRip(''), null);
});

await prova('il gruppo si cambia dall’app e vale per i progressi', async () => {
  await personalizza.scrivi(personalizza.chiaveEsercizio('panca-piana-manubri'), { gruppo: 'braccia' });
  const p = await piani.piano(RIF1);
  const e = p.sedute[0].esercizi[0];
  assert.equal(e.gruppo, 'braccia');
  assert.equal(e.gruppoOriginale, 'petto');
  assert.equal(e.nome, 'Panca piana con manubri', 'il nome non doveva cambiare');
  await personalizza.azzeraTutte();
});

await prova('un piano modificato è una copia sul telefono; il repo resta com’è', async () => {
  const p = await piani.pianoGrezzo(RIF1);
  p.sedute[0].esercizi[0].serie = 5;
  p.sedute[0].giorno = 3;
  await piani.salvaPiano(RIF1, p);

  const letto = await piani.piano(RIF1);
  assert.equal(letto.sedute[0].esercizi[0].serie, 5);
  assert.equal(letto.sedute[0].giorno, 3);
  assert.equal((await store.leggi('piano:2026-fase1')).base, undefined, 'la copia tiene ancora la firma del repo');

  const repo = await piani.piano({ file: RIF1.file });
  assert.equal(repo.sedute[0].esercizi[0].serie, 3, 'il file del repo è stato toccato');

  await piani.eliminaPiano(RIF1);
  assert.equal((await piani.piano(RIF1)).sedute[0].esercizi[0].serie, 3);
});

await prova('una copia di prima del 05/10: superserie, carichi e petto-spalle si sistemano da soli', async () => {
  const vecchio = {
    id: '2026-fase1',
    nome: 'Fase 1 mia',
    progressione: { tipo: 'doppia', descrizione: '…' },
    sedute: [{
      id: 'upper-b',
      nome: 'Upper B',
      esercizi: [
        { id: 'curl-manubri', nome: 'Curl', gruppo: 'braccia', serie: 3, rip: '10', recuperoSec: 0, superserie: '4', carico: 'esterno', incrementoKg: 1.25 },
        { id: 'face-pull-cavi', nome: 'Face pull ai cavi', gruppo: 'petto-spalle', serie: 3, rip: '10', recuperoSec: 75, superserie: '4', carico: 'esterno' },
        { id: 'trazioni', nome: 'Trazioni', gruppo: 'dorso', serie: 3, rip: '8', recuperoSec: 120, carico: 'corpoLibero', caricoAlternativo: 'assistito' },
      ],
    }],
  };
  await store.scrivi('piano:2026-fase1', { piano: vecchio, base: 'firma-vecchia', locale: false });
  const p = await piani.piano(RIF1);
  const [curl, face, traz] = p.sedute[0].esercizi;
  assert.equal(p.nome, 'Fase 1 mia', 'la copia del telefono non vince sul repo');
  assert.equal(p.progressione, undefined);
  assert.equal(curl.recuperoSec, 75, 'il primo della superserie è rimasto senza recupero');
  assert.equal(face.gruppo, 'spalle');
  [curl, face, traz].forEach((e) => ['superserie', 'carico', 'caricoAlternativo', 'incrementoKg']
    .forEach((k) => assert.equal(e[k], undefined, `${e.id}: ${k}`)));
  await piani.eliminaPiano(RIF1);
});

await prova('un piano creato dall’app: in elenco, fuori dal calendario, attivo se forzato', async () => {
  const rif = await piani.creaPiano({ nome: 'Scheda mia', da: RIF1, settimanaDa: 2, settimane: 4 });
  const idx = await piani.indice();
  const voce = idx.allenamento.find((r) => r.id === rif.id);
  assert.ok(voce && voce.locale, 'il piano nuovo non è nell’indice');
  assert.equal(voce.settimanaA, 5);

  await store.scrivi('dataInizio', '2026-09-21');
  const primo = await piani.stato(new Date(2026, 8, 30));
  assert.equal(primo.riferimento.id, '2026-fase1', 'il calendario ha scelto il piano dell’app');

  await store.scrivi('pianoAttivo', rif.id);
  const forzato = await piani.stato(new Date(2026, 8, 30));
  assert.equal(forzato.riferimento.id, rif.id);
  assert.equal(forzato.piano.sedute.length, 4, 'la copia non ha le sedute del piano di partenza');

  await piani.eliminaPiano(voce);
  assert.equal(await store.leggi('pianoAttivo'), null, 'eliminato il piano, è rimasto forzato');
  assert.ok(!(await piani.indice()).allenamento.some((r) => r.id === rif.id));
  await store.scrivi('dataInizio', null);
});

await prova('un piano vuoto nasce con una seduta senza esercizi', async () => {
  const rif = await piani.creaPiano({ nome: 'Da zero' });
  const p = await piani.pianoGrezzo(rif);
  assert.equal(p.sedute.length, 1);
  assert.deepEqual(p.sedute[0].esercizi, []);
  await piani.eliminaPiano(rif);
});

await prova('una sessione ridotta risulta fatta in parte nella settimana', async () => {
  await store.salvaSessione({ id: 'ses-rid', data: '2026-09-22', iniziata: 1, finita: 2, sedutaId: 'upper-a', seriePreviste: 15, ridotto: true });
  await store.salvaSerie({ id: 'ser-rid-1', sessioneId: 'ses-rid', data: '2026-09-22', sedutaId: 'upper-a', esercizioId: 'x', indice: 0, carico: 10, ripetizioni: 10 });
  await store.salvaSerie({ id: 'ser-rid-2', sessioneId: 'ses-rid', data: '2026-09-22', sedutaId: 'upper-a', esercizioId: 'x', indice: 1, carico: 10, ripetizioni: 10 });
  const fatte = await piani.fatteInSettimana('2026-09-21', new Date(2026, 8, 23));
  const f = fatte.find((x) => x.sessioneId === 'ses-rid');
  assert.deepEqual([f.nSerie, f.previste, f.completa], [2, 15, false]);
  const stato = piani.statoSeduta(fatte, 'upper-a');
  assert.equal(stato.completa, false);
  await store.eliminaSerie('ser-rid-1');
  await store.eliminaSerie('ser-rid-2');
});

/* ---------- cibo e spesa aggiunti dall'app ------------------- */

await prova('pasti: si cambiano anche ingredienti e nota', async () => {
  const cibo = await piani.piano({ file: 'dati/cibo/2026-base.json' });
  const pasto = cibo.settimana[0].pranzo;
  await personalizza.scrivi(pasto.chiave, { ingredienti: ['Uova', 'Zucchine'], nota: 'Con calma' });
  const dopo = (await piani.piano({ file: 'dati/cibo/2026-base.json' })).settimana[0].pranzo;
  assert.deepEqual(dopo.ingredienti, ['Uova', 'Zucchine']);
  assert.equal(dopo.nota, 'Con calma');
  assert.equal(dopo.personalizzato, true);
  await personalizza.azzeraTutte();
});

/* ---------- due persone, un telefono ------------------------- */

await prova('catalogo: gli esercizi di tutti i piani, più quelli creati dal telefono', async () => {
  const prima = await piani.catalogoEsercizi();
  assert.ok(prima.some((e) => e.id === 'panca-piana-manubri' && e.gruppo === 'petto'));
  assert.equal(new Set(prima.map((e) => e.id)).size, prima.length, 'un esercizio compare due volte');

  const nuovo = await piani.creaEsercizio({ nome: 'Hip thrust', gruppo: 'gambe' });
  assert.ok(/^app-hip-thrust-[a-z0-9]+$/.test(nuovo.id), nuovo.id);
  assert.equal((await store.leggi(`esercizio:${nuovo.id}`)).locale, true);
  const dopo = await piani.catalogoEsercizi();
  assert.ok(dopo.some((e) => e.id === nuovo.id && e.gruppo === 'gambe' && e.nome === 'Hip thrust'));

  // Stesso nome, scritto in un altro modo: si riusa, niente doppioni.
  assert.equal((await piani.creaEsercizio({ nome: ' hip THRUST ', gruppo: 'gambe' })).id, nuovo.id);
  assert.equal((await piani.creaEsercizio({ nome: 'Panca piana con manubri', gruppo: 'petto' })).id, 'panca-piana-manubri');
  assert.equal(await piani.creaEsercizio({ nome: '  ', gruppo: 'petto' }), null);

  // Sta in impostazioni senza `pz:`: entra nel backup e Azzera modifiche non lo tocca.
  await personalizza.carica(true);
  await personalizza.azzeraTutte();
  assert.ok(await store.leggi(`esercizio:${nuovo.id}`), 'Azzera modifiche ha cancellato un esercizio');
  await store.cancella(`esercizio:${nuovo.id}`);
});

await prova('in due: ogni lettura dà i dati di una persona, TUTTE li dà tutti', async () => {
  await store.scrivi('profilo', 'giuseppe');
  await store.salvaSerie({ id: 'p-g', persona: 'giuseppe', sessioneId: 'sg', data: '2026-09-22', esercizioId: 'panca', indice: 0, carico: 30, ripetizioni: 12 });
  await store.salvaSerie({ id: 'p-c', persona: 'corinna', sessioneId: 'sc', data: '2026-09-22', esercizioId: 'panca', indice: 0, carico: 12, ripetizioni: 12 });
  await store.salvaSerie({ id: 'p-vecchia', sessioneId: 'sv', data: '2026-09-21', esercizioId: 'panca', indice: 0, carico: 28, ripetizioni: 12 });

  const ids = (l) => l.map((s) => s.id).sort();
  // Senza persona in vista si vede il proprietario, e le serie di prima sono sue.
  assert.deepEqual(ids(await store.serieDiEsercizio('panca')), ['p-g', 'p-vecchia']);
  assert.deepEqual(ids(await store.serieDiEsercizio('panca', 'corinna')), ['p-c']);
  await store.scrivi('personaVista', 'corinna');
  assert.deepEqual(ids(await store.serieDiEsercizio('panca')), ['p-c']);
  assert.equal((await store.serieDiEsercizio('panca', store.TUTTE)).length, 3);
  await store.scrivi('personaVista', null);

  // La migrazione scrive la persona sui dati di prima.
  await store.migra();
  const tutte = await store.tutteLeSerie(store.TUTTE);
  assert.equal(tutte.find((s) => s.id === 'p-vecchia').persona, 'giuseppe');

  for (const id of ['p-g', 'p-c', 'p-vecchia']) await store.eliminaSerie(id);
  await store.scrivi('versioneDati', null);
  await store.scrivi('profilo', null);
});

await prova('in due: il backup del telefono di Corinna si aggiunge, non riscrive', async () => {
  const backup = await import(`${MOD}backup.js`);
  await store.scrivi('profilo', 'giuseppe');
  await store.scrivi('dataInizio', '2026-09-21');
  await store.segnaSpunta('spesa:uova', true);

  // Un backup di prima (versione 1), dal telefono di Corinna: niente persona sui record.
  const suo = {
    app: 'fitapp', versione: 1, creato: '2026-09-28T10:00:00Z',
    impostazioni: { profilo: 'corinna', pesoCorporeo: 58, dataInizio: '2026-10-05', 'modoCarico:trazioni': 'assistito' },
    sessioni: [{ id: 'ses-cor', data: '2026-09-28', iniziata: 1, finita: 2, sedutaId: 'upper-a' }],
    serie: [{ id: 'ser-cor', sessioneId: 'ses-cor', data: '2026-09-28', esercizioId: 'panca', indice: 0, carico: 10, ripetizioni: 12 }],
    spunte: { 'spesa:uova': false },
    foto: [],
  };
  const zip = backup.costruisciZip([{ nome: 'dati.json', dati: JSON.stringify(suo) }]);
  const file = { arrayBuffer: async () => zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) };

  const a = await backup.anteprima(file);
  assert.equal(a.daAltri, true);
  await backup.importa(file);

  assert.equal(await store.leggi('profilo'), 'giuseppe', 'il proprietario è cambiato');
  assert.equal(await store.leggi('dataInizio'), '2026-09-21', 'la data di inizio è stata riscritta');
  assert.equal((await store.spunte('spesa:'))['spesa:uova'], true, 'la spesa è stata riscritta');
  const serie = (await store.tutteLeSerie(store.TUTTE)).find((s) => s.id === 'ser-cor');
  assert.equal(serie.persona, 'corinna');
  assert.equal((await store.sessioni('corinna')).length, 1);
  assert.equal((await store.sessioni('giuseppe')).filter((s) => s.id === 'ses-cor').length, 0);

  await store.eliminaSessione('ses-cor');
  await store.azzeraSpunte('spesa:');
  for (const k of ['dataInizio', 'profilo']) await store.cancella(k);
});

console.log(`\n${fatte} prove passate.`);
