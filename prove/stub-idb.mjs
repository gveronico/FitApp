/* Stub minimale di IndexedDB: quel tanto che serve a store.js per girare in node. */

function req(valore) {
  const r = { result: undefined, error: null, onsuccess: null, onerror: null };
  queueMicrotask(() => {
    try {
      r.result = typeof valore === 'function' ? valore() : valore;
      r.onsuccess?.({ target: r });
    } catch (e) {
      r.error = e;
      r.onerror?.({ target: r });
    }
  });
  return r;
}

class Archivio {
  constructor(nome, opzioni = {}) {
    this.nome = nome;
    this.keyPath = opzioni.keyPath || null;
    this.dati = new Map();
    this.indici = new Map();
  }

  createIndex(nome, percorso) { this.indici.set(nome, percorso); return { nome }; }

  put(valore, chiave) {
    const k = this.keyPath ? valore[this.keyPath] : chiave;
    return req(() => { this.dati.set(k, valore); return k; });
  }

  get(chiave) { return req(() => this.dati.get(chiave)); }
  delete(chiave) { return req(() => { this.dati.delete(chiave); }); }
  clear() { return req(() => { this.dati.clear(); }); }
  getAll() { return req(() => [...this.dati.values()]); }
  getAllKeys() { return req(() => [...this.dati.keys()]); }

  index(nome) {
    const percorso = this.indici.get(nome);
    return {
      getAll: (v) => req(() => [...this.dati.values()].filter((x) => x[percorso] === v)),
    };
  }
}

class Db {
  constructor() {
    this.archivi = new Map();
    this.objectStoreNames = { contains: (n) => this.archivi.has(n) };
  }

  createObjectStore(nome, opzioni) {
    const a = new Archivio(nome, opzioni);
    this.archivi.set(nome, a);
    return a;
  }

  transaction(nomi) {
    const t = {
      objectStore: (n) => this.archivi.get(n),
      oncomplete: null,
      onerror: null,
    };
    queueMicrotask(() => queueMicrotask(() => t.oncomplete?.()));
    return t;
  }
}

export function installa() {
  const db = new Db();
  globalThis.indexedDB = {
    open() {
      const r = { result: db, onupgradeneeded: null, onsuccess: null, onerror: null };
      queueMicrotask(() => {
        r.onupgradeneeded?.({ target: r });
        r.onsuccess?.({ target: r });
      });
      return r;
    },
  };
  return db;
}
