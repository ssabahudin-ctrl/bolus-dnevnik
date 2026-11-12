// Ekran 3: Dnevnik (SPEC 9.3).

import { ApiGreska } from '../api';
import { parsirajBroj } from '../calc';
import { broj, doza, uBroj } from '../format';
import { datoIzPreporuke, potvrdiInzulin, type OdlukaConfirm } from '../obrok';
import { stanje } from '../stanje';
import type { ObrokRed, UpozorenjeDuplogBolusa } from '../tipovi';
import { dijalog, dokTraje, h, poruka, zamijeni } from '../ui';
import { kratkoVrijeme, parsirajVrijeme } from '../vrijeme';
import { opisDuplogBolusa } from './obrok';
import type { Navigacija } from '../main';

function pitajDupliConfirm(u: UpozorenjeDuplogBolusa): Promise<OdlukaConfirm> {
  return dijalog<OdlukaConfirm>(
    'Nedavno je već dat bolus',
    [opisDuplogBolusa(u), h('p', {}, 'Ništa još nije upisano u tabelu.')],
    [
      { tekst: 'Odustani', vrijednost: 'odustani' },
      { tekst: 'Ovo je novi bolus, upiši', vrijednost: 'force', stil: 'opasno' },
    ],
    'odustani',
  );
}

async function naknadnaPotvrda(o: ObrokRed, dugme: HTMLButtonElement) {
  const input = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', value: datoIzPreporuke(uBroj(o.preporuka_j)) });
  const greska = h('div', { class: 'greska-polja', role: 'alert' });
  let dato = Number.NaN;
  const ok = await dijalog(
    'Potvrdi inzulin',
    [
      h('p', {}, `${o.tip ?? ''}, ${o.stavke_tekst ?? ''}. Preporuka je bila ${doza(uBroj(o.preporuka_j))}`),
      h('label', {}, 'Dato jedinica', input),
      greska,
    ],
    [
      { tekst: 'Odustani', vrijednost: false },
      { tekst: 'Potvrdi', vrijednost: true, stil: 'primarno' },
    ],
    false,
    () => {
      const v = parsirajBroj(input.value);
      if (v === null || Number.isNaN(v) || v <= 0 || v > 100) {
        greska.textContent = 'Upiši dozu, broj veći od 0 i najviše 100.';
        return false;
      }
      dato = v;
      return true;
    },
  );
  if (!ok) return;

  await dokTraje(dugme, 'Potvrđujem...', async () => {
    try {
      const r = await potvrdiInzulin(stanje.api, o.id, dato, new Date(), pitajDupliConfirm);
      if (r.status === 'odustao') poruka('info', 'Odustao si. Ništa nije upisano.');
      else if (r.status === 'vec_potvrdjeno')
        poruka('info', `Ovaj obrok je već potvrđen${r.potvrdio ? ` sa uređaja ${r.potvrdio}` : ''} (${doza(r.dato_j)}). Ništa nije promijenjeno.`);
      else poruka('uspjeh', `Inzulin potvrđen: ${doza(dato)}${r.upozorenjePrihvaceno ? ', uz upozorenje o duplom bolusu' : ''}.`);
    } catch (e) {
      poruka('greska', `Potvrda NIJE upisana. ${e instanceof ApiGreska ? e.message : String(e)}`);
    }
    await stanje.osvjezi();
  });
}

function kartica(o: ObrokRed, sada: Date): HTMLElement {
  const t = parsirajVrijeme(o.vrijeme_unosa);
  const tp = parsirajVrijeme(o.vrijeme_potvrde);
  const potvrdiBtn: HTMLButtonElement = h('button', { class: 'dugme primarno', onclick: () => void naknadnaPotvrda(o, potvrdiBtn) }, 'Potvrdi inzulin');
  const secer = uBroj(o.secer_mmol);
  return h(
    'li',
    { class: 'kartica obrok-kartica' },
    h('div', { class: 'obrok-zaglavlje' }, h('strong', {}, o.tip ?? ''), h('span', { class: 'prigusen' }, `${t ? kratkoVrijeme(t, sada) : ''}, ${o.uredjaj ?? ''}`)),
    o.stavke_tekst && h('p', { class: 'malo' }, o.stavke_tekst),
    h(
      'p',
      {},
      `UH ${broj(uBroj(o.uh_ukupno_g))} g, šećer ${secer === null ? 'nije unesen' : `${broj(secer)} (${o.secer_izvor === 'rucno' ? 'ručno' : o.secer_izvor})`}, preporuka ${doza(uBroj(o.preporuka_j))}`,
    ),
    o.inzulin_dat === true
      ? h(
          'p',
          { class: 'status-dato' },
          `Dato ${doza(uBroj(o.dato_j))}${o.potvrdio_uredjaj ? `, potvrdio ${o.potvrdio_uredjaj}` : ''}${tp ? `, ${kratkoVrijeme(tp, sada)}` : ''}`,
          o.upozorenje_prihvaceno === true && h('span', { class: 'oznaka' }, ' uz upozorenje o duplom bolusu'),
        )
      : h('p', { class: 'status-nije' }, 'Inzulin nije potvrđen'),
    h(
      'div',
      { class: 'red' },
      o.inzulin_dat !== true && potvrdiBtn,
      h('button', { class: 'dugme obicno', disabled: true, title: 'Grafikon dolazi u sljedećoj verziji' }, 'Grafikon'),
    ),
  );
}

export function ekranDnevnik(korijen: HTMLElement, _idi: Navigacija): () => void {
  const sadrzaj = h('div');
  const osvjeziBtn = h('button', { class: 'dugme obicno', onclick: () => void stanje.osvjezi() }, 'Osvježi');

  function azuriraj() {
    const sada = new Date();
    const b = stanje.boot;
    const obroci = (b?.obroci ?? []).filter((o) => o.id);
    zamijeni(
      sadrzaj,
      stanje.bootUToku && h('p', { class: 'prigusen' }, 'Osvježavam...'),
      stanje.bootGreska &&
        h(
          'div',
          { class: 'upozorenje jako', role: 'alert' },
          h('strong', {}, 'Dnevnik nije svjež. '),
          stanje.bootVrijeme ? `Prikazano stanje od ${kratkoVrijeme(stanje.bootVrijeme, sada)}. ` : '',
          stanje.bootGreska,
        ),
      b && obroci.length === 0 && h('p', { class: 'prigusen' }, 'Nema unosa.'),
      obroci.length > 0 && h('ul', { class: 'lista-obroka' }, ...obroci.map((o) => kartica(o, sada))),
    );
  }

  zamijeni(
    korijen,
    h(
      'section',
      { class: 'kartica' },
      h('div', { class: 'red razmak' }, h('h2', {}, 'Zadnji unosi (svi uređaji)'), osvjeziBtn),
      stanje.tabelaUrl
        ? h('a', { href: stanje.tabelaUrl, target: '_blank', rel: 'noopener', class: 'dugme obicno siroko' }, 'Otvori tabelu')
        : h('p', { class: 'prigusen malo' }, 'Link na tabelu možeš upisati u Postavkama.'),
    ),
    sadrzaj,
  );
  azuriraj();
  void stanje.osvjezi();
  return stanje.pretplati(azuriraj);
}
