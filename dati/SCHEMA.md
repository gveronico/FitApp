# Schema dei dati

I file in `dati/` sono **il piano**: li scrive Claude, non l'app. L'app li legge e basta.
Quello che inserisce l'utente (carichi, foto, spunte) sta in IndexedDB e non tocca mai questi file.

## Regola ferrea sugli `id`

L'`id` di un esercizio è la chiave con cui si lega tutto lo storico dei carichi.
Formato: minuscolo, senza accenti, parole separate da trattino — `panca-piana-manubri`.

**Un `id` non si rinomina mai.** Se un esercizio compare in una scheda nuova con lo stesso
movimento, deve riusare lo stesso `id`: è così che il progresso della panca resta visibile
attraverso schede diverse. Rinominarlo spezza lo storico in silenzio.

Esercizi diversi hanno `id` diversi anche se il nome si somiglia:
`panca-piana-manubri` ≠ `panca-inclinata-manubri` ≠ `panca-inclinata-bilanciere`.

## `dati/indice.json`

Elenca i piani e dice in quali settimane sono attivi. L'app calcola la settimana corrente
dalla `dataInizio` impostata dall'utente e sceglie il piano il cui intervallo la contiene.

## Piano di allenamento — `dati/allenamento/*.json`

```jsonc
{
  "id": "2026-fase1",
  "nome": "Fase 1 — Avvicinamento",
  "fonte": "ALLENAMENTO.md v3.0",
  "settimane": 4,
  "monitorata": false,        // false = i carichi si registrano ma non entrano nei calcoli
  "regole": [                 // mostrate in cima alla scheda, testo libero
    "Ci si ferma 4 ripetizioni prima del cedimento nelle settimane 1-2, 3 nelle 3-4."
  ],
  "progressione": null,       // vedi sotto, solo per le fasi monitorate
  "sedute": [
    {
      "id": "upper-a",
      "giorno": 1,            // 1 = lunedì … 7 = domenica
      "nome": "Upper A",
      "sottotitolo": "Petto, dorso, tricipiti",
      "riscaldamento": {
        "minuti": 7,
        "voci": ["3' rowing o ellittica", "Circonduzioni spalle", "15 band pull apart"]
      },
      "scarico": { "minuti": 3, "voci": ["Stretching pettorali e dorsali"] },
      "esercizi": [
        {
          "id": "panca-piana-manubri",
          "nome": "Panca piana con manubri",
          "serie": 2,
          "serieDaSettimana": { "3": 3 },   // dalla settimana 3 diventano 3 serie. Assente = fisse
          "rip": "10-12",                   // come si legge a schermo
          "ripMin": 10,
          "ripMax": 12,                     // usato per la doppia progressione
          "recuperoSec": 90,
          "carico": "esterno",              // vedi tabella sotto
          "superserie": null,               // "4" lega 4a e 4b: stesso valore = stesso giro
          "incrementoKg": 2.5,              // di quanto si sale quando si progredisce
          "note": "",                       // riga sotto il nome, testo libero
          "varianteFacile": "Goblet squat"  // per Corinna; omesso se non prevista
        }
      ]
    }
  ]
}
```

### `carico` — come si registra il peso

| Valore | Significato | Cosa chiede l'app |
|---|---|---|
| `esterno` | Bilanciere, manubri, macchina | I kg, direttamente |
| `assistito` | Trazioni assistite | L'assistenza letta sulla macchina. Registra `pesoCorporeo − assistenza` |
| `corpoLibero` | Trazioni, plank | L'eventuale zavorra. Registra `pesoCorporeo + zavorra` |
| `tempo` | Plank | I secondi al posto delle ripetizioni |

### `caricoAlternativo` — lo stesso esercizio fatto in due modi

Campo facoltativo, accanto a `carico`. Vale quando lo stesso movimento si può fare in due
modi che si registrano in modo diverso — trazioni libere (`corpoLibero`) o alla macchina
assistita (`assistito`). L'app mostra un interruttore sopra le serie: `carico` è il modo
predefinito, `caricoAlternativo` l'altro, e la scelta si ricorda. In entrambi i casi la serie
viene salvata con lo stesso `id` e con il carico reale in kg, quindi lo storico resta
confrontabile: l'`id` non si duplica e non si rinomina.

### Esercizio che entra solo da una certa settimana

Non c'è un campo dedicato. Si aggiunge come esercizio normale nella posizione giusta,
con `"serie": 0` e `"serieDaSettimana": { "<settimana>": <valore> }` (0 serie finché non
si arriva a quella settimana, poi il valore indicato), spiegando in `note` da quale
settimana entra e perché. Esempio: Fase 1, venerdì, "stacco da rialzo con bilanciere"
entra dalla settimana 3 con `"serie": 0, "serieDaSettimana": { "3": 2 }`.

### `progressione`

```jsonc
"progressione": {
  "tipo": "doppia",
  "descrizione": "Si sale di carico quando tutte le serie chiudono al numero alto di ripetizioni."
}
```
`null` nelle fasi non monitorate: l'app non suggerisce aumenti.

## Piano alimentare — `dati/cibo/*.json`

```jsonc
{
  "id": "2026-base",
  "nome": "Piano alimentare 1.1",
  "fonte": "ALIMENTAZIONE.md v1.1",
  "vincoli": [                        // banner sempre visibile. NON è decorazione
    { "chi": "Giuseppe", "testo": "Niente olive. Olio d'oliva sì." },
    { "chi": "Corinna", "testo": "Fuori pesche, albicocche, nettarine, noci, noci pecan." }
  ],
  "avvertenze": ["Frutta a guscio: solo buste singole, mai i mix."],
  "regole": [
    { "titolo": "Proteine a ogni pasto", "testo": "Colazione compresa." }
  ],
  "porzioni": [
    { "cosa": "Proteine", "quanto": "Un palmo", "nota": "Giuseppe: due." }
  ],
  "settimana": [
    {
      "giorno": 1,
      "pranzo": {
        "nome": "Pollo e ceci",
        "testo": "Pollo a cubetti + ceci, pomodorini, rucola, olio e limone.",
        "ingredienti": ["Pollo", "Ceci", "Pomodorini", "Rucola"],
        "nota": "Pane integrale a parte.",
        "libero": false
      },
      "cena": { "...": "stessa forma" }
    }
  ],
  "colazioni": [{ "nome": "Yogurt e avena", "testo": "..." }],
  "spuntini": ["Yogurt greco senza lattosio + muesli"],
  "domenica": { "minuti": 45, "voci": ["Lessare una pentola di farro o riso"] },
  "integratori": [
    { "cosa": "Creatina monoidrato", "verdetto": "Sì, per primo", "dose": "3-5 g al giorno", "ordine": 1 }
  ],
  "bevande": ["Acqua: ~2 litri al giorno, più una bottiglia in palestra."]
}
```

Un pasto con `"libero": true` non ha ingredienti: è una serata libera.

## Lista della spesa — `dati/cibo/2026-spesa.json`

```jsonc
{
  "id": "2026-spesa",
  "liste": [
    {
      "id": "A",
      "nome": "Lista A — spesa comune",
      "sottotitolo": "Da chiedere ai genitori",
      "reparti": [
        { "nome": "Verdura", "nota": "Deve esserci tutta la settimana", "voci": ["Zucchine", "Broccoli"] }
      ]
    }
  ]
}
```

La chiave della spunta è `spesa:<idLista>:<voce>`, quindi **rinominare una voce azzera la sua spunta**.
È accettabile: le spunte si azzerano ogni settimana comunque.
