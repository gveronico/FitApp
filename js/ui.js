/* ui.js — costruzione DOM e formattazione.
   Nessuna dipendenza. Tutte le viste usano h() per creare elementi. */

/**
 * Crea un elemento.
 *   h('div')
 *   h('div.blocco')                        -> <div class="blocco">
 *   h('p.nota', 'testo')
 *   h('button.btn', { onclick: fn }, 'Vai')
 *   h('div', [figlio1, figlio2])
 * Attributi speciali: class, dataset, onclick (e ogni on*), html (innerHTML).
 */
export function h(sel, ...resto) {
  const [tag, ...classi] = String(sel).split('.');
  const el = document.createElement(tag || 'div');
  if (classi.length) el.className = classi.join(' ');

  for (const arg of resto) {
    if (arg == null || arg === false) continue;

    if (Array.isArray(arg)) {
      arg.forEach((f) => aggiungi(el, f));
    } else if (typeof arg === 'object' && !(arg instanceof Node)) {
      applica(el, arg);
    } else {
      aggiungi(el, arg);
    }
  }
  return el;
}

function aggiungi(el, figlio) {
  if (figlio == null || figlio === false) return;
  el.append(figlio instanceof Node ? figlio : document.createTextNode(String(figlio)));
}

function applica(el, attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
}

/** Svuota un elemento e ci mette i figli dati. */
export function metti(contenitore, ...figli) {
  contenitore.replaceChildren();
  figli.flat().forEach((f) => aggiungi(contenitore, f));
  return contenitore;
}

/* ---------- formattazione ------------------------------- */

const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

export const giorni = GIORNI;
export const mesi = MESI;
export const mesiBrevi = MESI_BREVI;

/** 'YYYY-MM-DD' della data data (o di oggi), in ora locale. */
export function iso(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Da 'YYYY-MM-DD' a Date locale a mezzanotte. */
export function daIso(s) {
  const [a, m, g] = String(s).split('-').map(Number);
  return new Date(a, m - 1, g);
}

/** 'lunedì 5 ottobre' */
export function dataLunga(d = new Date()) {
  return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`;
}

/** 'ott 2026' da 'YYYY-MM' */
export function meseBreve(aaaaMm) {
  const [a, m] = String(aaaaMm).split('-').map(Number);
  return `${MESI_BREVI[m - 1]} ${a}`;
}

/** 1 = lunedì … 7 = domenica */
export function giornoIso(d = new Date()) {
  return d.getDay() === 0 ? 7 : d.getDay();
}

/** 32.5 -> '32,5' · 30 -> '30' */
export function peso(kg) {
  if (kg == null || Number.isNaN(kg)) return '–';
  return Number(kg).toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
}

/** 12.4 -> '+12,4%' */
export function percento(n, segno = true) {
  if (n == null || Number.isNaN(n)) return '–';
  const s = Number(n).toFixed(1).replace('.', ',');
  return (segno && n > 0 ? '+' : '') + s + '%';
}

/** 150 -> '2:30' */
export function durata(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* ---------- interazione --------------------------------- */

/** Vibrazione breve, dove supportata. Silenziosa altrove. */
export function tocco(ms = 12) {
  try { navigator.vibrate?.(ms); } catch { /* non supportato */ }
}

/** Conferma bloccante, per le azioni distruttive. */
export function conferma(messaggio) {
  return window.confirm(messaggio);
}
