/* Stub DOM minimo: quel tanto che serve a ui.js e alle viste per girare in node.
   Non è un browser — serve a far esplodere gli errori veri (funzioni che non
   esistono, campi letti da oggetti sbagliati) prima di aprire l'app sul telefono. */

class Nodo {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.childNodes = [];
    this.parentNode = null;
    this.attributi = new Map();
    this.dataset = {};
    this.className = '';
    this.value = '';
    this.hidden = false;
    this._testo = '';
    this._html = '';
    this.ascoltatori = new Map();
    this.style = {};
  }

  get isConnected() {
    let n = this;
    while (n.parentNode) n = n.parentNode;
    return n.radice === true;
  }

  get classList() {
    const classi = () => new Set(this.className.split(/\s+/).filter(Boolean));
    const scrivi = (s) => { this.className = [...s].join(' '); };
    return {
      add: (...c) => { const s = classi(); c.forEach((x) => s.add(x)); scrivi(s); },
      remove: (...c) => { const s = classi(); c.forEach((x) => s.delete(x)); scrivi(s); },
      contains: (c) => classi().has(c),
      toggle: (c, forza) => {
        const s = classi();
        const acceso = forza === undefined ? !s.has(c) : !!forza;
        if (acceso) s.add(c); else s.delete(c);
        scrivi(s);
        return acceso;
      },
    };
  }

  set innerHTML(v) { this._html = v; this.childNodes = []; }
  get innerHTML() { return this._html; }

  set textContent(v) { this._testo = String(v); this.childNodes = []; }
  get textContent() {
    if (this.childNodes.length) return this.childNodes.map((c) => c.textContent).join('');
    return this._testo;
  }

  setAttribute(k, v) { this.attributi.set(k, String(v)); }
  getAttribute(k) { return this.attributi.has(k) ? this.attributi.get(k) : null; }
  removeAttribute(k) { this.attributi.delete(k); }
  addEventListener(tipo, fn) {
    if (!this.ascoltatori.has(tipo)) this.ascoltatori.set(tipo, []);
    this.ascoltatori.get(tipo).push(fn);
  }

  removeEventListener() { /* non serve alla prova */ }

  append(...figli) {
    figli.flat().forEach((f) => {
      if (f == null) return;
      const n = f instanceof Nodo ? f : new Testo(f);
      n.parentNode = this;
      this.childNodes.push(n);
    });
  }

  replaceChildren(...figli) {
    this.childNodes.forEach((c) => { c.parentNode = null; });
    this.childNodes = [];
    this._testo = '';
    this.append(...figli);
  }

  scrollIntoView() { /* niente */ }
  focus() { /* niente */ }
  select() { /* niente */ }

  querySelector(sel) {
    const cerca = (n) => {
      for (const c of n.childNodes) {
        if (c instanceof Nodo) {
          if (sel.startsWith('.') && c.classList.contains(sel.slice(1))) return c;
          if (!sel.startsWith('.') && c.tagName === sel.toUpperCase()) return c;
          const dentro = cerca(c);
          if (dentro) return dentro;
        }
      }
      return null;
    };
    return cerca(this);
  }

  querySelectorAll(sel) {
    const fuori = [];
    const cerca = (n) => n.childNodes.forEach((c) => {
      if (!(c instanceof Nodo)) return;
      if (sel.startsWith('.') ? c.classList.contains(sel.slice(1)) : c.tagName === sel.toUpperCase()) {
        fuori.push(c);
      }
      cerca(c);
    });
    cerca(this);
    return fuori;
  }

  /** Tutto il testo della sottoalbero, per le asserzioni delle prove. */
  get testoPiatto() { return this.textContent; }

  /** Scatena un evento registrato con h(): serve a provare i pulsanti. */
  async scatena(tipo, evento = {}) {
    const fns = this.ascoltatori.get(tipo) || [];
    for (const fn of fns) await fn({ target: this, ...evento });
  }
}

class Testo extends Nodo {
  constructor(t) { super('#text'); this._testo = String(t); }
  get textContent() { return this._testo; }
  set textContent(v) { this._testo = String(v); }
}

export function installa() {
  const documento = {
    createElement: (t) => new Nodo(t),
    createTextNode: (t) => new Testo(t),
    getElementById: () => null,
    head: new Nodo('head'),
    body: new Nodo('body'),
    documentElement: new Nodo('html'),
  };

  // In node alcuni di questi esistono già e sono di sola lettura: si sovrascrivono
  // con defineProperty, altrimenti l'assegnazione esplode.
  const metti = (nome, valore) => {
    Object.defineProperty(globalThis, nome, {
      value: valore, writable: true, configurable: true,
    });
  };

  metti('Node', Nodo);
  metti('document', documento);
  metti('requestAnimationFrame', (fn) => { fn(); return 1; });
  metti('MutationObserver', class { observe() {} disconnect() {} });
  metti('navigator', { vibrate() {}, storage: { estimate: async () => ({}) } });
  metti('location', { hash: '#/oggi' });
  metti('history', { pushState() {} });
  metti('window', {
    addEventListener() {},
    removeEventListener() {},
    confirm: () => true,
    scrollTo() {},
  });
  metti('addEventListener', () => {});
  metti('scrollTo', () => {});

  return { Nodo, documento };
}

/** Un contenitore agganciato alla radice, così isConnected dice la verità. */
export function radice() {
  const r = new Nodo('main');
  r.radice = true;
  return r;
}
