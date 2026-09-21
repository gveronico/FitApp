/* avvio.js — primo avvio. Tre domande, una volta sola. */

import { h, metti, iso } from '../ui.js';
import * as store from '../store.js';
import { vaiA } from '../app.js';

export async function monta(app) {
  let profilo = null;

  const scelta = (chi, nome) => h('button.btn.btn-primo', {
    onclick: () => { profilo = chi; disegnaDati(); },
  }, nome);

  function disegnaBenvenuto() {
    metti(app, h('div.schermata', [
      h('div', { style: 'height:8vh' }),
      h('p.occhiello', 'Allenamento e alimentazione'),
      h('h1.titolo', 'Scheda'),
      h('p.nota', 'I dati restano su questo telefono. Nessun account, nessun server.'),
      h('hr.sep'),
      h('p.occhiello', 'Chi sei?'),
      h('div.pila', [scelta('giuseppe', 'Giuseppe'), scelta('corinna', 'Corinna')]),
    ]));
  }

  function disegnaDati() {
    const campoData = h('input', { type: 'date', value: iso(), id: 'data-inizio' });
    const campoPeso = h('input', { type: 'number', inputmode: 'decimal', step: '0.5', id: 'peso', placeholder: 'kg' });

    const salva = async () => {
      await store.scrivi('profilo', profilo);
      await store.scrivi('dataInizio', campoData.value || iso());
      const p = parseFloat(String(campoPeso.value).replace(',', '.'));
      if (!Number.isNaN(p)) await store.scrivi('pesoCorporeo', p);
      vaiA('/oggi');
      location.reload();
    };

    metti(app, h('div.schermata', [
      h('div', { style: 'height:6vh' }),
      h('p.occhiello', profilo === 'corinna' ? 'Corinna' : 'Giuseppe'),
      h('h1.titolo', 'Due cose e si parte'),

      h('div.blocco', [
        h('p.occhiello', 'Primo allenamento della settimana 1'),
        h('div', { style: 'height:8px' }),
        campoData,
        h('p.nota', { style: 'margin-top:8px' },
          'Da qui l’app calcola in che settimana e in che fase sei. Si cambia dopo, in Altro.'),
      ]),

      h('div.blocco', [
        h('p.occhiello', 'Peso corporeo'),
        h('div', { style: 'height:8px' }),
        campoPeso,
        h('p.nota', { style: 'margin-top:8px' },
          'Serve solo a calcolare il carico di trazioni e assistite. Non viene tracciato nel tempo.'),
      ]),

      h('button.btn.btn-primo', { onclick: salva }, 'Inizia'),
      h('button.btn', { onclick: disegnaBenvenuto }, 'Indietro'),
    ]));
  }

  disegnaBenvenuto();
}
