// Ekran 2: Dodaj namirnicu (SPEC 9.2).

import { ApiGreska } from '../api';
import { parsirajBroj } from '../calc';
import { broj } from '../format';
import { uhStavke } from '../obrok';
import { stanje } from '../stanje';
import type { Namirnica } from '../tipovi';
import { dokTraje, h, poruka, zamijeni } from '../ui';
import type { Navigacija } from '../main';

const BRZE_GRAMAZE = [10, 25, 50, 100, 150, 200, 250];

/** Za pretragu: mala slova, bez dijakritika (č, ć, đ, š, ž). */
export function normalizuj(s: string): string {
  return s
    .toLowerCase()
    .replace(/đ/g, 'dj')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

export function pretrazi(lista: Namirnica[], upit: string, max = 30): Namirnica[] {
  const q = normalizuj(upit);
  const svi = lista.filter((n) => n.naziv && (!q || normalizuj(n.naziv).includes(q)));
  svi.sort((a, b) => {
    const ap = normalizuj(a.naziv).startsWith(q) ? 0 : 1;
    const bp = normalizuj(b.naziv).startsWith(q) ? 0 : 1;
    return ap - bp || a.naziv.localeCompare(b.naziv, 'bs');
  });
  return svi.slice(0, max);
}

export function ekranNamirnica(korijen: HTMLElement, idi: Navigacija): () => void {
  let nacin: 'na100' | 'direktno' = 'na100';

  const pretraga = h('input', { id: 'pretraga', type: 'search', placeholder: 'Traži u zajedničkoj listi', autocomplete: 'off', oninput: () => azurirajListu() });
  const lista = h('ul', { class: 'lista-namirnica' });
  const naziv = h('input', { id: 'naziv', type: 'text', maxlength: '100', autocomplete: 'off', oninput: () => azurirajPregled() });
  const uh100 = h('input', { id: 'uh100', type: 'text', inputmode: 'decimal', autocomplete: 'off', oninput: () => azurirajPregled() });
  const uhDirektno = h('input', { id: 'uh-direktno', type: 'text', inputmode: 'decimal', autocomplete: 'off', oninput: () => azurirajPregled() });
  const gramaza = h('input', { id: 'gramaza', type: 'text', inputmode: 'decimal', autocomplete: 'off', oninput: () => azurirajPregled() });
  const sacuvajUListu = h('input', { id: 'u-listu', type: 'checkbox', checked: true });
  const pregled = h('div', { class: 'pregled-uh' });
  const greske = h('div', { class: 'greska-polja', role: 'alert' });

  const poljeNa100 = h('div', { class: 'red-polja' }, h('label', { for: 'uh100' }, 'UH na 100 g'), uh100);
  const poljeDirektno = h('div', { class: 'red-polja' }, h('label', { for: 'uh-direktno' }, 'UH ukupno (g)'), uhDirektno);
  const poljeUListu = h('label', { class: 'kvacica', for: 'u-listu' }, sacuvajUListu, h('span', {}, 'Sačuvaj u zajedničku listu namirnica'));

  const radio = (vrijednost: typeof nacin, tekst: string) =>
    h(
      'label',
      { class: 'kvacica' },
      h('input', {
        type: 'radio',
        name: 'nacin',
        value: vrijednost,
        checked: nacin === vrijednost,
        onchange: () => {
          nacin = vrijednost;
          azurirajNacin();
        },
      }),
      h('span', {}, tekst),
    );

  function azurirajNacin() {
    poljeNa100.hidden = nacin !== 'na100';
    poljeUListu.hidden = nacin !== 'na100';
    poljeDirektno.hidden = nacin !== 'direktno';
    azurirajPregled();
  }

  function odaberi(nm: Namirnica) {
    naziv.value = nm.naziv;
    uh100.value = broj(nm.uh_na_100g, 1).replace(/,0$/, '');
    if (nm.zadnja_gramaza_g) gramaza.value = String(nm.zadnja_gramaza_g);
    nacin = 'na100';
    korijen.querySelectorAll<HTMLInputElement>('input[name=nacin]').forEach((r) => (r.checked = r.value === 'na100'));
    azurirajNacin();
    gramaza.focus();
    gramaza.select();
  }

  function azurirajListu() {
    const sve = stanje.boot?.namirnice ?? [];
    if (!stanje.boot) {
      zamijeni(lista, h('li', { class: 'prigusen' }, stanje.bootGreska ? `Lista nije učitana: ${stanje.bootGreska}` : 'Lista se učitava...'));
      return;
    }
    const nadjene = pretrazi(sve, pretraga.value);
    zamijeni(
      lista,
      ...(nadjene.length
        ? nadjene.map((nm) =>
            h(
              'li',
              {},
              h(
                'button',
                { class: 'stavka-liste', onclick: () => odaberi(nm) },
                h('span', {}, nm.naziv),
                h('span', { class: 'prigusen' }, `${broj(nm.uh_na_100g)} g/100 g${nm.zadnja_gramaza_g ? `, zadnje ${nm.zadnja_gramaza_g} g` : ''}`),
              ),
            ),
          )
        : [h('li', { class: 'prigusen' }, sve.length ? 'Nema takve namirnice. Upiši je ispod.' : 'Lista je prazna. Upiši namirnicu ispod.')]),
    );
  }

  type Provjera = { ok: true; naziv: string; gramaza: number; uh100: number | null; uh: number } | { ok: false; poruke: string[] };

  function provjeri(): Provjera {
    const poruke: string[] = [];
    const nz = naziv.value.trim();
    if (!nz) poruke.push('Upiši naziv namirnice.');
    const g = parsirajBroj(gramaza.value);
    if (g === null || Number.isNaN(g) || g < 0 || g > 2000) poruke.push('Gramaža mora biti broj od 0 do 2000 g.');
    let u100: number | null = null;
    let uh = Number.NaN;
    if (nacin === 'na100') {
      const v = parsirajBroj(uh100.value);
      if (v === null || Number.isNaN(v) || v < 0 || v > 100) poruke.push('UH na 100 g mora biti broj od 0 do 100.');
      else u100 = v;
      if (u100 !== null && g !== null && !Number.isNaN(g)) uh = uhStavke(g, u100);
    } else {
      const v = parsirajBroj(uhDirektno.value);
      if (v === null || Number.isNaN(v) || v < 0 || v > 500) poruke.push('UH ukupno mora biti broj od 0 do 500 g.');
      else uh = v;
    }
    if (poruke.length) return { ok: false, poruke };
    return { ok: true, naziv: nz, gramaza: g as number, uh100: u100, uh };
  }

  function azurirajPregled() {
    const p = provjeri();
    zamijeni(pregled, p.ok ? h('span', {}, '= ', h('strong', {}, `${broj(p.uh)} g UH`)) : '');
  }

  const dodajBtn = h('button', { class: 'dugme primarno siroko veliko-dugme', onclick: () => void dodaj() }, 'Dodaj u obrok');

  async function dodaj() {
    const p = provjeri();
    if (!p.ok) {
      zamijeni(greske, h('ul', {}, ...p.poruke.map((x) => h('li', {}, x))));
      return;
    }
    greske.textContent = '';
    stanje.nacrt.stavke.push({ namirnica: p.naziv, gramaza_g: p.gramaza, uh_na_100g: p.uh100, uh_g: p.uh });
    stanje.sacuvajNacrt();

    if (nacin === 'na100' && sacuvajUListu.checked && p.uh100 !== null) {
      await dokTraje(dodajBtn, 'Čuvam u listu...', async () => {
        try {
          await stanje.apiBezUpozorenja('saveFood', {
            food: { naziv: p.naziv, uh_na_100g: p.uh100, zadnja_gramaza_g: p.gramaza },
          });
          void stanje.osvjezi();
        } catch (e) {
          const tekst = e instanceof ApiGreska ? e.message : String(e);
          poruka('greska', `Stavka je dodana u obrok, ali namirnica NIJE sačuvana u zajedničku listu. ${tekst}`);
        }
      });
    }
    poruka('uspjeh', `Dodano: ${p.naziv}, ${broj(p.uh)} g UH.`);
    idi('obrok');
  }

  zamijeni(
    korijen,
    h(
      'section',
      { class: 'kartica' },
      h('h2', {}, 'Zajednička lista'),
      h('div', { class: 'red-polja' }, h('label', { for: 'pretraga', class: 'skriveno' }, 'Traži'), pretraga),
      lista,
    ),
    h(
      'section',
      { class: 'kartica' },
      h('h2', {}, 'Namirnica'),
      h('div', { class: 'red-polja' }, h('label', { for: 'naziv' }, 'Naziv'), naziv),
      h('div', { class: 'red-radio' }, radio('na100', 'UH na 100 g'), radio('direktno', 'Direktan unos UH')),
      poljeNa100,
      poljeDirektno,
      h('div', { class: 'red-polja' }, h('label', { for: 'gramaza' }, 'Gramaža (g)'), gramaza),
      h(
        'div',
        { class: 'brza-dugmad' },
        ...BRZE_GRAMAZE.map((g) =>
          h('button', { class: 'dugme obicno', onclick: () => { gramaza.value = String(g); azurirajPregled(); } }, `${g} g`),
        ),
      ),
      pregled,
      poljeUListu,
      greske,
      dodajBtn,
      h('button', { class: 'dugme obicno siroko', onclick: () => idi('obrok') }, 'Nazad na obrok'),
    ),
  );
  azurirajNacin();
  azurirajListu();
  if (!stanje.boot && !stanje.bootUToku) void stanje.osvjezi();
  return stanje.pretplati(azurirajListu);
}
