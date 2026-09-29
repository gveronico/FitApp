/* spesa.js — la lista della spesa, composta dalla dieta.

   Non ci sono voci scritte a mano: in lista va quello che è acceso nella
   settimana (pranzi e cene), nella colazione e negli spuntini. Si spegne il
   farro e si accende l'orzo nel pranzo di martedì, e in lista c'è l'orzo. Si
   aggiunge "Riso integrale" a un pasto, e in lista c'è il riso integrale.

   Il catalogo (dati/cibo/*-spesa.json) dice solo in che reparto sta ogni
   alimento, più le poche cose che servono sempre (olio, sale, integratori).
   Un alimento che il catalogo non conosce cerca un reparto per la prima parola
   ("Riso integrale" → "Riso"), altrimenti finisce in "Altro".

   Sopra, dall'app: il reparto di una voce si cambia, una voce fissa si toglie,
   una voce che non sta nella dieta (il detersivo) si aggiunge.

   Una voce è una sola anche se sta in cinque pasti: "Pane integrale" una volta,
   con sotto dove si usa. La spunta è `spesa:<slug>`, uguale in ogni settimana. */

import * as personalizza from './personalizza.js';

const { slug } = personalizza;

const GIORNI = ['', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];

/** Tutti gli alimenti accesi, con dove si usano: [{ nome, usi: ['lun', 'colazione'] }]. */
export function accesi(cibo) {
  const perSlug = new Map();
  const segna = (nome, uso) => {
    const s = slug(nome);
    if (!s) return;
    if (!perSlug.has(s)) perSlug.set(s, { nome, usi: [] });
    const voce = perSlug.get(s);
    if (!voce.usi.includes(uso)) voce.usi.push(uso);
  };

  (cibo?.settimana || []).forEach((g) => {
    ['pranzo', 'cena'].forEach((quale) => {
      const pasto = g[quale];
      if (!pasto || pasto.libero) return;
      (pasto.alimenti || []).filter((a) => a.scelto).forEach((a) => segna(a.nome, GIORNI[g.giorno] || ''));
    });
  });
  [['colazione', 'colazione'], ['spuntino', 'spuntini']].forEach(([quale, uso]) => {
    (cibo?.[quale]?.alimenti || []).filter((a) => a.scelto).forEach((a) => segna(a.nome, uso));
  });

  return [...perSlug.values()];
}

/** Il reparto di un alimento secondo il catalogo, con l'indice per l'ordinamento. */
export function repartoDi(catalogo, nome) {
  const s = slug(nome);
  let migliore = null;
  (catalogo?.reparti || []).forEach((r, ir) => {
    (r.alimenti || []).forEach((a, ia) => {
      const sa = slug(a);
      const esatto = sa === s;
      const prefisso = !esatto && s.startsWith(`${sa}-`);
      if (!esatto && !prefisso) return;
      const peso = esatto ? Infinity : sa.length;
      if (!migliore || peso > migliore.peso) migliore = { reparto: r.nome, ordine: ir * 1000 + ia, peso };
    });
  });
  return migliore || { reparto: catalogo?.altro || 'Altro', ordine: 1e8 };
}

/**
 * La lista intera, divisa per reparto:
 *   { reparti: [{ nome, voci: [{ chiave, spunta, testo, usi, origine }] }], totale }
 * `origine` è 'dieta', 'sempre' o 'aggiunta'. L'ordine dei reparti è quello del
 * catalogo; "Altro" e i reparti nuovi in fondo.
 */
export function componi(cibo, catalogo) {
  const nomiReparti = (catalogo?.reparti || []).map((r) => r.nome);
  const altro = catalogo?.altro || 'Altro';
  const reparti = new Map();
  const visti = new Set();

  const metti = (voce, repartoCatalogo, ordine) => {
    const pz = personalizza.leggi(voce.chiave) || {};
    if (pz.nascosto) return;
    const nome = pz.reparto || repartoCatalogo;
    if (!reparti.has(nome)) reparti.set(nome, []);
    reparti.get(nome).push({
      ...voce,
      spunta: personalizza.spuntaDaChiave(voce.chiave),
      reparto: nome,
      repartoCatalogo,
      ordine,
    });
  };

  accesi(cibo).forEach((a) => {
    const s = slug(a.nome);
    visti.add(s);
    const { reparto, ordine } = repartoDi(catalogo, a.nome);
    metti({
      chiave: personalizza.chiaveVoceSpesa(a.nome), testo: a.nome, usi: a.usi, origine: 'dieta',
    }, reparto, ordine);
  });

  (catalogo?.reparti || []).forEach((r, ir) => {
    (r.sempre || []).forEach((testo, i) => {
      if (visti.has(slug(testo))) return;
      visti.add(slug(testo));
      metti({
        chiave: personalizza.chiaveVoceSpesa(testo), testo, usi: [], origine: 'sempre',
      }, r.nome, ir * 1000 + 900 + i);
    });
  });

  // Le voci aggiunte dall'app, in fondo al loro reparto, in ordine di aggiunta.
  voceAggiunte().forEach(({ chiave, valore }, i) => {
    if (!valore.testo) return;
    metti({
      chiave, testo: valore.testo, usi: [], origine: 'aggiunta',
    }, valore.reparto || altro, 1e9 + i);
  });

  const ordineReparto = (n) => {
    const i = nomiReparti.indexOf(n);
    if (i >= 0) return i;
    return n === altro ? 10000 : 5000;
  };

  const elenco = [...reparti.entries()]
    .sort((a, b) => ordineReparto(a[0]) - ordineReparto(b[0]))
    .map(([nome, voci]) => ({ nome, voci: voci.sort((x, y) => x.ordine - y.ordine) }));

  return {
    reparti: elenco,
    totale: elenco.reduce((n, r) => n + r.voci.length, 0),
    nomiReparti: [...new Set([...nomiReparti, ...elenco.map((r) => r.nome), altro])],
  };
}

function voceAggiunte() {
  return personalizza.conPrefisso('pz:spesa:+').map((chiave) => ({ chiave, valore: personalizza.leggi(chiave) || {} }));
}

/** Il testo di quel che manca, per mandarlo su WhatsApp. */
export function testoDaCondividere(lista, spunte) {
  const blocchi = lista.reparti
    .map((r) => {
      const mancanti = r.voci.filter((v) => !spunte[v.spunta]);
      if (!mancanti.length) return null;
      return `${r.nome}:\n${mancanti.map((v) => `- ${v.testo}`).join('\n')}`;
    })
    .filter(Boolean);
  return blocchi.length ? `Spesa\n\n${blocchi.join('\n\n')}` : 'Spesa: c’è tutto.';
}
