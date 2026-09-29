# FitApp

Allenamento e alimentazione di Giuseppe e Corinna. Si apre da un link, si aggiunge alla schermata Home e da lì si comporta come un'app. Funziona senza rete.

## Installare sul telefono

**iPhone (Safari)** — apri il link, tocca **Condividi** in basso, poi **Aggiungi a Home**. L'icona compare tra le app. Aprila da lì, non da Safari: a schermo intero e con il suo archivio.

**Android (Chrome)** — apri il link, menù a tre puntini, **Installa app**.

Al primo avvio l'app chiede tre cose: di chi è il telefono, la data del primo allenamento e il peso corporeo. Il peso dell'altra persona si mette in **Altro**. Il peso serve solo a calcolare il carico di trazioni e assistite, non viene tracciato nel tempo.

## Dove stanno i dati

Sul telefono, nella memoria del browser. Nessun account, nessun server, nessun upload: le foto non escono mai da lì.

**Un telefono solo per tutti e due** (dal 29/09/2026). Giuseppe e Corinna si allenano insieme e segna tutto Giuseppe: in **Oggi** si sceglie chi si allena (*Insieme*, *Giuseppe* o *Corinna*), e in sessione ogni esercizio ha un riquadro a testa, ognuno coi suoi carichi, il suo storico e il suo peso corporeo. **Progressi** e **Foto** hanno in cima l'interruttore *Giuseppe / Corinna*. I dati di prima diventano, alla prima apertura, del proprietario del telefono. Un backup fatto dal telefono dell'altra persona si importa senza toccare le impostazioni: si aggiungono i suoi allenamenti e le sue foto.

Se si cancella l'app o si cambia telefono i dati se ne vanno. Per questo in **Altro** c'è **Esporta backup**, che genera un file `.zip` con carichi e foto da salvare su iCloud. L'app avvisa quando l'ultimo backup ha più di 30 giorni.

## Modificare dall'app

Tutto si cambia dall'app, senza chiedere niente a nessuno. C'è un pulsante **Modifica** in:

- **Scheda → Modifica** → l'editor del piano, nella Scheda stessa (Fine torna alla lettura): nome e gruppo di ogni esercizio (il gruppo è quello su cui si sommano i progressi), serie, ripetizioni, recupero, tipo di carico, superserie, note; esercizi aggiunti, tolti, riordinati; sedute rinominate, spostate di giorno, aggiunte o tolte. Nome e gruppo valgono in tutti i piani; il resto vale per quel piano. L'identificativo dell'esercizio non cambia mai, quindi lo storico dei carichi non si spezza. Scrivendo il nome di un esercizio già fatto in un altro piano, si riusa quello.
- **Scheda → Altri piani → Crea un piano nuovo** → vuoto o copiato da quello attivo. Vale quando lo si attiva.
- **Sessione → Modifica** (sopra ogni esercizio) → serie e ripetizioni di oggi, o salta l'esercizio. Con la spunta finisce anche nella scheda.
- **Cibo → Settimana** → ogni alimento di pasti, colazione e spuntini si accende o si spegne con un tocco, anche senza Modifica: acceso va nella spesa. Con Modifica ✕ lo toglie, **+ Aggiungi** ne mette uno nuovo, e di un pasto si cambiano nome, piatto e nota.
- **Cibo → Spesa** → una lista sola, fatta dalla dieta. ✎ cambia il reparto di una voce (o toglie una voce fissa, come l'olio); in fondo si aggiungono voci che non stanno nella dieta.

Le modifiche restano su quel telefono ed entrano nel backup. In **Altro → Modifiche ai piani** si vede quante sono e si azzerano tutte insieme, rimettendo i piani come stanno nel repo (i piani creati dall'app restano).

Un piano del repo modificato dall'app diventa una **copia sul telefono**. Se poi Claude aggiorna quel file, Scheda e l'editor lo segnalano e si sceglie quale tenere.

## Allenamento ridotto

Ogni serie confermata con **Fatta** è salvata subito. Quelle in cui si è scritto il peso senza premere Fatta si salvano uscendo (**Esci**) o chiudendo. **Chiudi allenamento** con serie mancanti chiude come allenamento ridotto: quel che è fatto conta nei progressi, e in Oggi e in Scheda la seduta risulta **in parte · 9/14 serie**. L'aumento di carico si suggerisce solo sugli esercizi completati.

**Salta**, in cima a ogni esercizio, lo toglie per oggi e passa al successivo; su un esercizio cominciato diventa **Salta il resto**: le serie fatte restano. Un esercizio saltato non conta come mancante, quindi l'allenamento risulta **✓ fatta · 2 saltati**. Chiudendo con serie ancora da fare si sceglie tra **Salta quello che manca e chiudi** (fatto, con i salti annotati), **Annulla l'allenamento** (non l'hai fatto: sessione e serie si cancellano, non conta nella settimana) e **Continua l'allenamento**. Un allenamento aperto e lasciato senza serie non resta appeso: uscendo sparisce. Gli esercizi saltati, anche solo in parte, non fanno scattare l'aumento di carico.

## Aggiornare i piani

Il canale principale per le cose grosse — una scheda nuova, una settimana alimentare diversa — resta Claude: sono file JSON in `dati/`, e li scrive Claude in chat partendo da `ALLENAMENTO.md` e `ALIMENTAZIONE.md`. Quello che si cambia dall'app non torna nel repo.

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
js/personalizza.js      nomi, gruppi e cibo cambiati dall'app, sopra ai piani
js/backup.js            export e import dello zip
js/viste/               una schermata per file
dati/                   i piani, in sola lettura
prove/                  due file di prove, si lanciano con node
```

## Sviluppo

Serve un server locale, perché i moduli ES e il service worker non funzionano da `file://`:

```bash
python servi.py
```

Poi `http://localhost:8080`, con la vista mobile degli strumenti per sviluppatori (F12, poi Ctrl+Shift+M). **In locale niente cache**: `servi.py` dice al browser di non tenersi i file, e il service worker in locale non si registra e non intercetta niente. Con `python -m http.server` il browser può tenere un file vecchio accanto a uno nuovo, e l'app si rompe con errori tipo `… is not a function`.

Sul telefono, quando arriva una versione nuova, l'app si ricarica da sola una volta: i file vecchi e quelli nuovi non si mescolano.

Le prove girano senza server e senza dipendenze:

```bash
node prove/prova.mjs
```

```bash
node prove/prova-viste.mjs
```

Dettagli in [`prove/LEGGIMI.md`](prove/LEGGIMI.md).

Cambiando i file dell'app va alzato `VERSIONE` in `sw.js`, altrimenti i telefoni continuano a servire la copia vecchia dalla cache.

## Pubblicazione

GitHub Pages, dalla radice del repo. Il repo è pubblico perché Pages su repo privato richiede un piano a pagamento: dentro ci sono solo i piani, che non sono dati sensibili. Carichi e foto non ci finiscono mai.
