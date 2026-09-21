# Scheda

Allenamento e alimentazione di Giuseppe e Corinna. Si apre da un link, si aggiunge alla schermata Home e da lì si comporta come un'app. Funziona senza rete.

## Installare sul telefono

**iPhone (Safari)** — apri il link, tocca **Condividi** in basso, poi **Aggiungi a Home**. L'icona compare tra le app. Aprila da lì, non da Safari: a schermo intero e con il suo archivio.

**Android (Chrome)** — apri il link, menù a tre puntini, **Installa app**.

Al primo avvio l'app chiede tre cose: chi sei, la data del primo allenamento e il peso corporeo. Il peso serve solo a calcolare il carico di trazioni e assistite, non viene tracciato nel tempo.

## Dove stanno i dati

Sul telefono, nella memoria del browser. Nessun account, nessun server, nessun upload: le foto non escono mai da lì.

Questo ha una conseguenza che conviene sapere: **l'app di Giuseppe e quella di Corinna sono lo stesso link ma due archivi separati**, e se si cancella l'app o si cambia telefono i dati se ne vanno. Per questo in **Altro** c'è **Esporta backup**, che genera un file `.zip` con carichi e foto da salvare su iCloud. L'app avvisa quando l'ultimo backup ha più di 30 giorni.

## Aggiornare i piani

I piani di allenamento e alimentazione **non si modificano dall'app**: sono file JSON in `dati/`, e li scrive Claude in chat partendo da `ALLENAMENTO.md` e `ALIMENTAZIONE.md`.

Per una scheda nuova:

1. si passa la scheda a Claude, in qualsiasi forma;
2. Claude aggiunge un file in `dati/allenamento/` e una riga in `dati/indice.json` con le settimane in cui vale;
3. al commit, l'app di entrambi si aggiorna alla prima apertura con rete.

I piani vecchi non si cancellano: restano consultabili in **Altro → Piano attivo**, e lo storico dei carichi continua a puntare al piano con cui è stato registrato.

**La regola da non rompere:** l'`id` di un esercizio non si rinomina mai. È la chiave che tiene insieme lo storico dei carichi attraverso schede diverse. Il resto è spiegato in [`dati/SCHEMA.md`](dati/SCHEMA.md).

## Com'è fatta

HTML, CSS e JavaScript scritti a mano, moduli ES nativi. Nessun framework, nessuna dipendenza, nessuna compilazione: il repo contiene esattamente i file che girano nel browser.

```
index.html              guscio e barra di navigazione
sw.js                   service worker: guscio in cache, piani dalla rete quando c'è
css/app.css             il sistema visivo: nero su bianco, nient'altro
js/app.js               avvio, tema, navigazione
js/store.js             IndexedDB — l'unico posto dove si scrive
js/piani.js             lettura dei piani, fase e settimana correnti
js/backup.js            export e import dello zip
js/viste/               una schermata per file
dati/                   i piani, in sola lettura
```

## Sviluppo

Serve un server locale, perché i moduli ES e il service worker non funzionano da `file://`:

```bash
python -m http.server 8080
```

Poi `http://localhost:8080`. Per il service worker, `localhost` è considerato sicuro come `https`.

Cambiando i file dell'app va alzato `VERSIONE` in `sw.js`, altrimenti i telefoni continuano a servire la copia vecchia dalla cache.

## Pubblicazione

GitHub Pages, dalla radice del repo. Il repo è pubblico perché Pages su repo privato richiede un piano a pagamento: dentro ci sono solo i piani, che non sono dati sensibili. Carichi e foto non ci finiscono mai.
