# Prove

Due file, si lanciano a mano con node. Non c'è nessuna dipendenza da installare.

```bash
node prove/prova.mjs        # i dati e la logica: piani, personalizzazioni, calcoli
node prove/prova-viste.mjs  # le schermate: si montano davvero e si toccano i pulsanti
```

`stub-idb.mjs` e `stub-dom.mjs` sono finti IndexedDB e finto DOM: quel tanto che
serve a far girare l'app fuori dal browser. Non sono un browser e non provano
l'aspetto — servono a far esplodere gli errori veri (un campo letto dall'oggetto
sbagliato, una funzione che non esiste) prima che lo faccia il telefono in palestra.

Restano fuori, e vanno verificate a mano sul telefono:

1. il giro completo esporta backup → cancella tutto → importa, su foto vere;
2. le foto: scatto, ridimensionamento, sagoma del mese prima;
3. l'installazione su iPhone, in modalità aereo.
