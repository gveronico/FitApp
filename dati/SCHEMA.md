# Schema dei dati

I file in `dati/` sono **il piano di partenza**: li scrive Claude, l'app li legge e basta.
Un piano cambiato dal telefono diventa una copia sul telefono, e da lì in poi vale quella
(vedi *Personalizzazioni*, in fondo).
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
  "monitorata": true,         // false = i carichi si registrano ma non entrano nei calcoli.
                              // Lo decide il piano, non la serie: se una fase diventa
                              // monitorata, anche le serie già registrate contano
  "allenamentiDaSettimana": { "1": 2, "3": 4 },  // facoltativo, vedi sotto
  "regole": [                 // mostrate in cima alla scheda, testo libero
    "Ci si ferma 4 ripetizioni prima del cedimento nelle settimane 1-2, 3 nelle 3-4."
  ],
  "sedute": [
    {
      "id": "upper-a",
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
          "gruppo": "petto",                // vedi sotto. Obbligatorio: senza, l'esercizio
                                            // sparisce dagli aggregati per gruppo
          "serie": 3,
          "rip": "10-12",                   // come si legge a schermo
          "ripSerie": [12, 10, 8],          // facoltativo: un numero per serie, vedi sotto
          "ripMin": 10,
          "ripMax": 12,
          "recuperoSec": 90,                // sempre più di zero: ogni esercizio ha il suo recupero
          "note": "",                       // riga sotto il nome, testo libero
          "varianteFacile": "Goblet squat"  // per Corinna; omesso se non prevista
        }
      ]
    }
  ]
}
```

### `gruppo` — il gruppo muscolare

Uno di questi sei, esatto. È la divisione con cui l'app aggrega i progressi.

| Valore | Etichetta a schermo | Cosa ci sta |
|---|---|---|
| `braccia` | Braccia | Bicipiti e tricipiti |
| `gambe` | Gambe | Tutto il treno inferiore, polpacci compresi |
| `dorso` | Dorso | Lat machine, rematore, pulley |
| `petto` | Petto | Tutte le spinte su panca, anche inclinata a 45°, con manubri, bilanciere o macchina; croci |
| `spalle` | Spalle | Spinte sopra la testa (military press), alzate laterali e posteriori, face pull |
| `addome` | Addome | Crunch, sit up |

Le spinte su panca lavorano anche le spalle, ma stanno nel petto: un esercizio ha un
gruppo solo. Fino al 05/10/2026 c'era `petto-spalle`: se lo trova ancora (una copia del
piano sul telefono), l'app lo smista dal nome dell'esercizio — military, alzate e face
pull vanno in spalle, il resto in petto.

L'elenco vive in `js/piani.js` (`GRUPPI`): aggiungerne uno significa toccare quello,
non solo i JSON. Un esercizio senza `gruppo` continua a funzionare ma finisce in
"Senza gruppo" negli aggregati — nei piani non deve succedere.

### `ripSerie` — ripetizioni diverse per ogni serie

Facoltativo. Dove la scheda prescrive una scala — il 12-10-8 della Fase 1 — si scrive
`"ripSerie": [12, 10, 8]` e `serie` deve valere quanto la lunghezza dell'array.
Cosa cambia nell'app:

- il campo delle ripetizioni parte **già scritto con il numero prescritto**, non con
  quello dell'ultima volta: lì le ripetizioni sono fisse, e ripescare l'11 di una
  serie andata storta abbasserebbe il bersaglio in silenzio. Il **carico** invece
  continua a venire dall'ultima volta;
- l'intestazione della colonna diventa `Rip · 12-10-8`.

Senza `ripSerie` non cambia niente: vale il range in `rip`, come prima.

### Cosa non c'è più (dal 05/10/2026)

Tolti per semplicità, dal piano e dal codice: `superserie`, `incrementoKg`, `carico`
(con i tipi `assistito`, `corpoLibero`, `tempo`), `caricoAlternativo`, `serieDaSettimana`
e `progressione`. Ogni esercizio si registra allo stesso modo, `kg × ripetizioni`, con il
suo recupero. Quando salire di carico lo dicono le `regole` del piano, in parole: l'app non
lo calcola. Se un file vecchio o una copia sul telefono hanno ancora questi campi, l'app
li ignora.

### `allenamentiDaSettimana` — quanti allenamenti a settimana

Facoltativo. `{ "1": 2, "3": 4 }` vuol dire due allenamenti nelle settimane 1-2 e
quattro dalla 3. Assente = uno per seduta.
Non vincola niente: in Oggi fa solo il conto "fatti 1 di 2" della settimana. Quali
sedute fare lo sceglie l'utente — in Oggi ogni seduta del piano si può avviare in
qualsiasi giorno, e quella già fatta nella settimana viene segnalata.

Le sedute **non hanno `giorno`** (dal 29/09/2026): sono allenamenti da fare nella
settimana, e quale fare lo si sceglie in Oggi. L'ordine nel file è quello in cui l'app
le propone. Un `giorno` rimasto in un file vecchio viene ignorato.

## Piano alimentare — `dati/cibo/*.json`

```jsonc
{
  "id": "2026-base",
  "nome": "Piano alimentare 1.1",
  "fonte": "ALIMENTAZIONE.md v1.2",
  // Niente `vincoli` e niente `avvertenze`: dal 21/09/2026 allergie, intolleranze e
  // note sulle etichette non si stampano più, né qui né a schermo. Giuseppe e Corinna
  // le conoscono. Continuano a valere quando si scrive il piano — stanno in CLAUDE.md.
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
        "ingredienti": ["Pollo", "Farro", "Orzo", "Pomodorini"],  // gli alimenti: vanno nella spesa
        "spenti": ["Orzo"],        // facoltativo: in elenco ma spenti, si accendono dall'app
        "nota": "Pane integrale a parte.",
        "libero": false
      },
      "cena": { "...": "stessa forma" }
    }
  ],
  // Colazione e spuntini non sono ricette: sono alimenti. Stessa logica dei pasti.
  "colazione": { "nota": "Dopo l'allenamento.", "alimenti": ["Cereali proteici", "Uova"], "spenti": [] },
  "spuntino":  { "nota": "1-2 al giorno.", "alimenti": ["Barrette proteiche", "Mandorle"] },
  "domenica": { "minuti": 45, "voci": ["Lessare una pentola di farro o riso"] },
  "integratori": [
    { "cosa": "Creatina monoidrato", "verdetto": "Sì, per primo", "dose": "3-5 g al giorno", "ordine": 1 }
  ],
  "bevande": ["Acqua: ~2 litri al giorno, più una bottiglia in palestra."]
}
```

Un pasto con `"libero": true` non ha ingredienti: è una serata libera.

**Gli alimenti sono la spesa.** Il nome di un alimento è quello che compare nella lista
della spesa, quindi va scritto come si compra: `Macinato di manzo`, non `Manzo`;
`Tacchino a fette` e `Fesa di tacchino` sono due voci perché sono due prodotti. Lo stesso
nome in più pasti fa una voce sola: accenti, maiuscole e punteggiatura non contano.

## Lista della spesa — `dati/cibo/2026-spesa.json`

Dal 29/09/2026 non contiene voci: è il **catalogo dei reparti**. La lista la compone
`js/spesa.js` da quello che è acceso nella dieta (pasti, colazione, spuntini). Una lista
sola, niente più Lista A e Lista B.

```jsonc
{
  "id": "2026-spesa",
  "nome": "Lista della spesa 1.3",
  "altro": "Altro",                 // il reparto di chi non ne ha uno
  "reparti": [
    {
      "nome": "Verdura",            // l'ordine dei reparti è quello della lista
      "alimenti": ["Zucchine", "Broccoli"],  // chi sta qui; l'ordine vale anche dentro al reparto
      "sempre": ["Cipolla, aglio, limoni"]   // facoltativo: in lista anche se la dieta non li chiede
    }
  ]
}
```

Un alimento che il catalogo non ha per intero cerca il reparto dalle prime parole:
`Riso integrale` trova `Riso`, `Yogurt magro` trova `Yogurt`. Per questo il catalogo
tiene anche le parole generiche (`Riso`, `Pasta`, `Latte`...). Se non trova niente,
va in `altro`. Aggiungere un alimento al catalogo non lo mette in lista: in lista va
solo quello che la dieta usa.

La spunta è `spesa:<slug del nome>` (`spesa:pane-integrale`): la stessa in ogni
settimana e in ogni pasto. Riscrivere il nome di un alimento nella dieta cambia la
voce, e la spunta vecchia resta orfana: si azzerano ogni settimana, va bene così.

---

## Personalizzazioni — quello che scrive l'utente sopra al piano

I file di questa cartella restano di sola lettura. Sopra ci passa `js/personalizza.js`,
che applica le modifiche fatte dall'app: un nome cambiato, un alimento acceso o spento,
aggiunto o tolto, una voce della spesa in un altro reparto. Stanno in IndexedDB insieme al resto,
quindi entrano nel backup e non escono dal telefono.

```
pz:esercizio:<idEsercizio>               { nome, gruppo }
pz:pasto:<idPiano>:<giorno>:<quale>      { nome, testo, ingredienti, scelta, nota }
pz:alimenti:<idPiano>:colazione          { ingredienti, scelta }
pz:alimenti:<idPiano>:spuntino           { ingredienti, scelta }
pz:spesa:<slug>                          { reparto, nascosto }      nascosto: solo le voci `sempre`
pz:spesa:+<id>                           { testo, reparto }         aggiunta dall'app
```

`ingredienti` c'è solo quando l'elenco è diverso da quello del piano (un alimento
aggiunto o tolto); `scelta` è `{ <slug>: true|false }`, solo per gli alimenti accesi o
spenti a mano rispetto al piano. Riaccendere quello che il piano ha acceso toglie la
scelta: non resta una modifica fantasma.

Le chiavi di prima del 29/09/2026 (`pz:colazione…`, `pz:spuntino…`, `pz:spesa:A:…`,
`pz:spesa:B:…`) non corrispondono più a niente e l'app non le conta.

Le schede modificate dall'app non sono personalizzazioni sparse ma **copie intere**,
sempre in `impostazioni`:

```
piano:<idPiano>   { piano, locale, meta, modificato }
```

- `piano` è il JSON completo, nella stessa forma dei file qui sopra;
- **la copia vince sul file, sempre e senza chiedere** (dal 05/10/2026). Le modifiche dal
  telefono valgono quanto quelle scritte qui: niente avviso se il file cambia, niente
  "rimetti il piano originale". Conseguenza: **se un piano è già stato cambiato dal
  telefono, una modifica al suo file non arriva sul telefono.** Per far arrivare una
  modifica di Claude lì, o la si fa dal telefono, o si scrive un piano nuovo con un `id`
  nuovo. Le copie di prima avevano anche `base` (la firma del file): non si usa più;
- `locale: true` è un piano creato dall'app, che nel repo non esiste. `meta` ne tiene
  `settimanaDa`, `settimanaA`, `monitorata`. Il calendario non lo sceglie mai da solo:
  vale quando lo si forza.

Nome e gruppo di un esercizio restano in `pz:esercizio`, legati all'id: valgono in ogni
piano, così i progressi per gruppo non cambiano da una scheda all'altra.

Le sessioni portano anche `seriePreviste` (dopo le variazioni del giorno), `serieFatte`,
`ridotto` e `variazioni: { <idEsercizio>: { serie, rip, ripMin, ripMax, ripSerie } }`.

**Esercizi cambiati in sessione** (dal 08/10/2026). Con *Cambia* un esercizio della scheda
si sostituisce per quel giorno:

```
sostituzioni: { <idEsercizioNellaScheda>: <idEsercizioFatto> }
```

- le serie si salvano con l'`esercizioId` dell'esercizio **fatto davvero**: lo storico è
  il suo;
- serie, ripetizioni e recupero restano quelli della scheda. `variazioni` resta con la
  chiave dell'esercizio **della scheda**, così cambiare esercizio non perde le modifiche
  di oggi;
- allenandosi in due, le due sessioni hanno le stesse `sostituzioni`.

Si sceglie dal catalogo: gli esercizi di tutti i piani più quelli creati dal telefono
(`piani.catalogoEsercizi()`). Un esercizio creato dal telefono sta in `impostazioni`:

```
esercizio:<id>   { locale: true, nome, gruppo, recuperoSec, creato }
```

con id `app-<slug del nome>-<ms in base 36>`. Non ha il prefisso `pz:`, entra nel backup.
Creandone uno con il nome di un esercizio che esiste già (maiuscole e accenti non contano)
si riusa quello.
Le righe scritte e non confermate stanno in `bozze:<idSessione>` finché non si salvano.

Due cose da non dimenticare:

1. **Degli esercizi si cambia solo il nome mostrato.** L'`id` non si tocca, quindi la
   regola ferrea più in alto continua a valere e lo storico dei carichi regge.
2. **Le voci di cibo non hanno un id nel piano**, quindi la chiave è il loro testo.
   Riscrivere quel testo in un piano nuovo lascia orfana la personalizzazione. Va bene
   così: un piano nuovo arriva già scritto come lo si voleva.
