// Ekran 1: Novi obrok (SPEC 9.1).

import { ApiGreska } from '../api';
import { parsirajBroj, type RezultatIzracuna } from '../calc';
import { broj, doza, uBroj } from '../format';
import {
  datoIzPreporuke,
  izracunajObrok,
  napraviObrok,
  prozorDuplogMin,
  provjeriDato,
  sacuvajObrok,
  secerZaIzracun,
  stavkeZaSlanje,
  ukupnoUh,
  zastarjeloMin,
  PODRAZUMIJEVANO,
  type OdlukaSaveMeal,
  type SecerZaIzracun,
} from '../obrok';
import type { Ocitanje } from '../secer';
import { stanje } from '../stanje';
import { TIPOVI_OBROKA, type Postavke, type TipObroka, type UpozorenjeDuplogBolusa } from '../tipovi';
import { dijalog, dokTraje, h, poruka, potvrdi, zamijeni } from '../ui';
import { kratkoVrijeme, opisStarosti, parsirajVrijeme, starostMin } from '../vrijeme';
import type { Navigacija } from '../main';

const OTISAK_KLJUCEVI = ['uh_odnos', 'fia', 'cilj_mmol', 'korak', 'hipo_prag', 'max_doza'];

function otisakPostavki(p: Postavke | null): string {
  return p ? JSON.stringify(OTISAK_KLJUCEVI.map((k) => p[k] ?? null)) : '';
}

export function opisDuplogBolusa(u: { uredjaj: string; dato_j: number; vrijeme: string }): HTMLElement {
  const t = parsirajVrijeme(u.vrijeme);
  return h(
    'p',
    {},
    'Na uređaju ',
    h('strong', {}, u.uredjaj),
    ' je ',
    h('strong', {}, t ? `${kratkoVrijeme(t)} (${opisStarosti(starostMin(t))})` : u.vrijeme),
    ' potvrđen bolus od ',
    h('strong', {}, doza(u.dato_j)),
    ' Provjeri da ovo nije isti bolus upisan dvaput.',
  );
}

function pitajDupliObrok(u: UpozorenjeDuplogBolusa): Promise<OdlukaSaveMeal> {
  return dijalog<OdlukaSaveMeal>(
    'Nedavno je već dat bolus',
    [opisDuplogBolusa(u), h('p', {}, 'Ništa još nije upisano u tabelu.')],
    [
      { tekst: 'Odustani', vrijednost: 'odustani' },
      { tekst: 'Sačuvaj obrok bez inzulina', vrijednost: 'bez_inzulina' },
      { tekst: 'Ovo je novi bolus, upiši', vrijednost: 'force', stil: 'opasno' },
    ],
    'odustani',
  );
}

export function ekranObrok(korijen: HTMLElement, idi: Navigacija): () => void {
  const n = () => stanje.nacrt;
  let ocitanje: Ocitanje | null = null;
  let prikazaniRez: RezultatIzracuna | null = null;
  let prikazaniSecer: SecerZaIzracun | null = null;
  let otisak = otisakPostavki(stanje.boot?.postavke ?? null);

  /* ---------- šećer */
  const secerPrikaz = h('div', { class: 'secer-prikaz' });
  const secerGreska = h('div', { class: 'greska-polja', role: 'alert' });
  const secerInput = h('input', {
    id: 'secer-rucno',
    type: 'text',
    inputmode: 'decimal',
    autocomplete: 'off',
    placeholder: 'npr. 7,4',
    onchange: () => void upisiRucniSecer(),
  });
  const secerKartica = h(
    'section',
    { class: 'kartica' },
    h('h2', {}, 'Šećer'),
    secerPrikaz,
    h(
      'div',
      { class: 'red-polja' },
      h('label', { for: 'secer-rucno' }, 'Ručni unos (mmol/L)'),
      h('div', { class: 'red' }, secerInput, h('button', { class: 'dugme obicno', onclick: () => void obrisiRucni() }, 'Obriši')),
    ),
    secerGreska,
  );

  async function upisiRucniSecer() {
    const v = parsirajBroj(secerInput.value);
    secerGreska.textContent = '';
    if (v === null) {
      stanje.manual.obrisi();
    } else if (Number.isNaN(v) || v < 1 || v > 35) {
      secerGreska.textContent = 'Šećer mora biti broj između 1 i 35 mmol/L.';
      stanje.manual.obrisi();
    } else {
      stanje.manual.postavi(v, new Date());
    }
    await ucitajSecer();
  }

  async function obrisiRucni() {
    secerInput.value = '';
    secerGreska.textContent = '';
    stanje.manual.obrisi();
    await ucitajSecer();
  }

  async function ucitajSecer() {
    try {
      ocitanje = await stanje.getGlucose();
    } catch (e) {
      ocitanje = null;
      secerGreska.textContent = `Šećer nije pročitan: ${String(e)}`;
    }
    azuriraj();
  }

  function azurirajSecer(sada: Date) {
    const zast = zastarjeloMin(stanje.boot?.postavke ?? null);
    if (!ocitanje) {
      zamijeni(secerPrikaz, h('p', { class: 'prigusen' }, 'Nema šećera. Upiši ga ručno ili računaj bez korekcije.'));
      return;
    }
    const st = starostMin(ocitanje.time, sada);
    const staro = st >= zast;
    const potvrdjeno = stanje.potvrdjenoZastarjeloMs === ocitanje.time.getTime();
    zamijeni(
      secerPrikaz,
      h('div', { class: 'secer-vrijednost' + (staro ? ' zastarjelo' : '') }, `${broj(ocitanje.mmol)} mmol/L`),
      h('p', { class: 'prigusen' }, `${ocitanje.source === 'rucno' ? 'ručni unos' : 'GDH'}, ${opisStarosti(st)}`),
      staro &&
        h(
          'div',
          { class: 'upozorenje' },
          potvrdjeno
            ? `Očitanje je starije od ${zast} min, ali si potvrdio da se koristi.`
            : `Očitanje je starije od ${zast} min i ne ulazi u izračun. Upiši novi šećer ili potvrdi ovo.`,
          !potvrdjeno &&
            h(
              'button',
              {
                class: 'dugme obicno',
                onclick: () => {
                  stanje.potvrdjenoZastarjeloMs = ocitanje?.time.getTime() ?? null;
                  azuriraj();
                },
              },
              'Koristi ipak ovo očitanje',
            ),
        ),
    );
  }

  /* ---------- zadnji bolus */
  const bolusKartica = h('section', { class: 'kartica' });

  function azurirajBolus(sada: Date) {
    const b = stanje.boot;
    const djeca: (HTMLElement | false)[] = [];
    if (stanje.bootUToku && !stanje.bootPokusan) {
      djeca.push(h('p', { class: 'prigusen' }, 'Učitavam zadnji bolus sa svih uređaja...'));
    } else {
      const zb = b?.zadnji_bolus ?? null;
      const t = zb ? parsirajVrijeme(zb.vrijeme) : null;
      if (zb && t) {
        const st = starostMin(t, sada);
        const prozor = prozorDuplogMin(b?.postavke ?? null);
        const blizu = st < prozor;
        djeca.push(
          h(
            'div',
            { class: blizu ? 'upozorenje jako' : '' },
            h('div', { class: 'veliko' }, doza(zb.dato_j)),
            h('p', {}, `${kratkoVrijeme(t, sada)} (${opisStarosti(st)}), uređaj ${zb.uredjaj}`),
            blizu && h('p', {}, h('strong', {}, `Bolus je dat u zadnjih ${prozor} min.`), ' Aktivni inzulin se ne oduzima automatski.'),
          ),
        );
      } else if (b) {
        djeca.push(h('p', {}, 'Nema zabilježenog potvrđenog bolusa.'));
      }
      if (stanje.bootGreska) {
        djeca.push(
          h(
            'div',
            { class: 'upozorenje jako', role: 'alert' },
            h('strong', {}, 'Podatak o zadnjem bolusu nije svjež. '),
            stanje.bootVrijeme ? `Zadnje uspješno povlačenje: ${kratkoVrijeme(stanje.bootVrijeme, sada)}. ` : 'Podaci sa servera još nisu nikad povučeni. ',
            h('br', {}),
            stanje.bootGreska,
            h('div', {}, h('button', { class: 'dugme obicno', onclick: () => void stanje.osvjezi() }, 'Pokušaj ponovo')),
          ),
        );
      } else if (stanje.bootUToku) {
        djeca.push(h('p', { class: 'prigusen' }, 'Osvježavam...'));
      }
    }
    zamijeni(bolusKartica, h('h2', {}, 'Zadnji bolus (svi uređaji)'), ...djeca);
  }

  /* ---------- tip i stavke */
  const tipSelect = h(
    'select',
    {
      id: 'tip',
      onchange: () => {
        n().tip = tipSelect.value as TipObroka;
        stanje.sacuvajNacrt();
      },
    },
    ...TIPOVI_OBROKA.map((t) => h('option', { value: t, selected: t === n().tip }, t)),
  );
  const stavkeEl = h('div');

  function azurirajStavke() {
    const s = n().stavke;
    zamijeni(
      stavkeEl,
      s.length === 0
        ? h('p', { class: 'prigusen' }, 'Nema stavki.')
        : h(
            'ul',
            { class: 'stavke' },
            ...s.map((st, i) =>
              h(
                'li',
                {},
                h('div', { class: 'stavka-tekst' }, h('strong', {}, st.namirnica), h('span', { class: 'prigusen' }, ` ${broj(st.gramaza_g, 0)} g`)),
                h('div', { class: 'stavka-uh' }, `${broj(st.uh_g)} g UH`),
                h(
                  'button',
                  {
                    class: 'dugme ikona',
                    'aria-label': `Ukloni ${st.namirnica}`,
                    onclick: () => {
                      n().stavke.splice(i, 1);
                      stanje.sacuvajNacrt();
                      azuriraj();
                    },
                  },
                  'x',
                ),
              ),
            ),
          ),
      h('div', { class: 'ukupno' }, 'Ukupno UH: ', h('strong', {}, `${broj(ukupnoUh(s))} g`)),
      h('button', { class: 'dugme obicno siroko', onclick: () => idi('namirnica') }, '+ Dodaj namirnicu'),
    );
  }

  /* ---------- izračun */
  const izracunEl = h('section', { class: 'kartica' });

  function red(oznaka: string, vrijednost: string | HTMLElement, klasa = '') {
    return h('div', { class: 'racun-red ' + klasa }, h('span', {}, oznaka), h('span', {}, vrijednost));
  }

  function azurirajIzracun(sada: Date) {
    const b = stanje.boot;
    prikazaniRez = null;
    prikazaniSecer = null;
    if (!stanje.bootPokusan) {
      zamijeni(izracunEl, h('h2', {}, 'Izračun'), h('p', { class: 'prigusen' }, 'Čekam podatke sa servera prije prikaza preporuke...'));
      return;
    }
    if (!b) {
      zamijeni(
        izracunEl,
        h('h2', {}, 'Izračun'),
        h('div', { class: 'upozorenje jako' }, 'Postavke izračuna nisu učitane iz tabele, pa preporuka nije moguća.'),
      );
      return;
    }
    const p = b.postavke;
    const secer = secerZaIzracun(ocitanje, sada, zastarjeloMin(p), stanje.potvrdjenoZastarjeloMs);
    const rez = izracunajObrok(n(), secer, p);
    prikazaniRez = rez;
    prikazaniSecer = secer;

    if (!rez.ok) {
      zamijeni(
        izracunEl,
        h('h2', {}, 'Izračun'),
        h('div', { class: 'upozorenje jako' }, h('ul', {}, ...rez.greske.map((g) => h('li', {}, g.poruka)))),
        h('p', { class: 'prigusen' }, 'Parametri izračuna se upisuju u list Postavke u tabeli.'),
      );
      return;
    }

    const odnos = uBroj(p.uh_odnos);
    const fia = uBroj(p.fia);
    const cilj = uBroj(p.cilj_mmol);
    const korak = uBroj(p.korak);
    const maxDoza = uBroj(p.max_doza) ?? PODRAZUMIJEVANO.max_doza;
    zamijeni(
      izracunEl,
      h('h2', {}, 'Izračun'),
      red('Ukupno UH', `${broj(ukupnoUh(n().stavke))} g`),
      red('Bolus za obrok', `${broj(ukupnoUh(n().stavke))} / ${broj(odnos)} = ${broj(rez.bolus_obrok, 2)} j.`),
      red(
        'Korekcija',
        secer ? `(${broj(secer.mmol)} - ${broj(cilj)}) / ${broj(fia)} = ${broj(rez.bolus_korekcija, 2)} j.` : 'bez šećera: 0 j.',
      ),
      red('Zbir', rez.zbir < 0 ? `${broj(rez.zbir, 2)} j. (manje od 0, uzima se 0)` : `${broj(rez.zbir, 2)} j.`),
      red(
        `Preporuka (naniže na korak ${broj(korak, 2)})`,
        h('strong', { class: 'preporuka' }, rez.preporuka === null ? 'nema preporuke' : doza(rez.preporuka)),
        'glavni',
      ),
      ...rez.upozorenja.map((u) => h('div', { class: u.kod === 'bez_secera' ? 'info' : 'upozorenje jako' }, u.poruka)),
      h(
        'p',
        { class: 'prigusen malo' },
        `Postavke iz tabele povučene ${stanje.bootVrijeme ? kratkoVrijeme(stanje.bootVrijeme, sada) : '-'}. Najveća doza bez dodatne potvrde: ${doza(maxDoza)}`,
      ),
    );

    if (!n().datoRucno) {
      n().datoTekst = datoIzPreporuke(rez.preporuka);
      if (document.activeElement !== datoInput) datoInput.value = n().datoTekst;
    }
  }

  /* ---------- dato i čuvanje */
  const datoInput = h('input', {
    id: 'dato',
    type: 'text',
    inputmode: 'decimal',
    autocomplete: 'off',
    value: n().datoTekst,
    oninput: () => {
      n().datoTekst = datoInput.value;
      n().datoRucno = true;
      stanje.sacuvajNacrt();
    },
  });
  const vratiPreporuku = h('button', {
    class: 'dugme obicno',
    onclick: () => {
      n().datoRucno = false;
      stanje.sacuvajNacrt();
      azuriraj();
      datoInput.value = n().datoTekst;
    },
  }, 'Vrati preporuku');
  const inzulinCb = h('input', {
    id: 'inzulin-dat',
    type: 'checkbox',
    checked: n().inzulinDat,
    onchange: () => {
      n().inzulinDat = inzulinCb.checked;
      stanje.sacuvajNacrt();
    },
  });
  const napomenaInput = h('input', {
    id: 'napomena',
    type: 'text',
    maxlength: '500',
    value: n().napomena,
    oninput: () => {
      n().napomena = napomenaInput.value;
      stanje.sacuvajNacrt();
    },
  });
  const sacuvajBtn = h('button', { class: 'dugme primarno siroko veliko-dugme', onclick: () => void sacuvaj() }, 'Sačuvaj u tabelu');
  // Greška prethodnog pokušaja čuvanja se uklanja kad čuvanje uspije, da ne zbunjuje.
  let greskaCuvanja: HTMLElement | null = null;

  async function sacuvaj() {
    const b = stanje.boot;
    if (!b) {
      poruka('greska', 'Postavke nisu učitane iz tabele. Obrok nije sačuvan.');
      return;
    }
    if (n().stavke.length === 0 && n().tip !== 'korekcija') {
      poruka('greska', 'Dodaj bar jednu namirnicu, ili za samu korekciju odaberi tip "korekcija".');
      return;
    }
    // Ponovo izračunaj sa trenutnim vremenom; ako se razlikuje od prikazanog, ne čuvaj.
    const sada = new Date();
    const p = b.postavke;
    const secer = secerZaIzracun(ocitanje, sada, zastarjeloMin(p), stanje.potvrdjenoZastarjeloMs);
    const rez = izracunajObrok(n(), secer, p);
    if (JSON.stringify(rez) !== JSON.stringify(prikazaniRez) || JSON.stringify(secer) !== JSON.stringify(prikazaniSecer)) {
      azuriraj();
      poruka('info', 'Izračun se promijenio (npr. šećer je u međuvremenu zastario). Provjeri novi prikaz pa sačuvaj ponovo.');
      return;
    }
    if (!rez.ok) {
      poruka('greska', 'Izračun nije ispravan: ' + rez.greske.map((g) => g.poruka).join(' '));
      return;
    }
    const maxDoza = uBroj(p.max_doza) ?? PODRAZUMIJEVANO.max_doza;
    const d = provjeriDato(n(), maxDoza);
    if (!d.ok) {
      poruka('greska', d.poruka);
      datoInput.focus();
      return;
    }
    if ((rez.preporuka !== null && rez.preporuka > maxDoza) || d.iznadMax) {
      const ok = await potvrdi(
        'Doza iznad najveće doze',
        h('p', {}, `Preporuka ${doza(rez.preporuka)}${d.dato !== null ? `, dato ${doza(d.dato)}` : ''} je iznad ${doza(maxDoza)}. Provjeri unos. Da li je ovo tačno?`),
        'Da, tačno je',
      );
      if (!ok) return;
    }

    const meal = napraviObrok(n(), rez, secer, p, d.dato, sada);
    await dokTraje(sacuvajBtn, 'Čuvam...', async () => {
      try {
        const ishod = await sacuvajObrok(stanje.api, meal, stavkeZaSlanje(n()), pitajDupliObrok);
        if (ishod.status === 'odustao') {
          poruka('info', 'Odustao si. Ništa nije upisano; nacrt je zadržan.');
          return;
        }
        const tekst = ishod.inzulinUpisan
          ? `Sačuvano u tabelu, sa potvrdom inzulina${ishod.upozorenjePrihvaceno ? ' (uz upozorenje o duplom bolusu)' : ''}.`
          : 'Sačuvano u tabelu, bez potvrde inzulina. Potvrdi ga kasnije u Dnevniku.';
        greskaCuvanja?.remove();
        greskaCuvanja = null;
        poruka('uspjeh', ishod.duplikat ? 'Ovaj obrok je već bio sačuvan; ništa nije dupliran.' : tekst);
        stanje.novNacrt();
        secerInput.value = '';
        datoInput.value = '';
        inzulinCb.checked = false;
        napomenaInput.value = '';
        tipSelect.value = n().tip;
        ocitanje = await stanje.getGlucose();
        void stanje.osvjezi();
        azuriraj();
      } catch (e) {
        const tekst = e instanceof ApiGreska ? e.message : String(e instanceof Error ? e.message : e);
        greskaCuvanja?.remove();
        greskaCuvanja = poruka('greska', `Obrok možda NIJE sačuvan. ${tekst} Nacrt je zadržan; ponovni pokušaj neće napraviti duplikat.`);
      }
    });
  }

  /* ---------- sklapanje */
  function azuriraj() {
    const sada = new Date();
    const noviOtisak = otisakPostavki(stanje.boot?.postavke ?? null);
    if (otisak && noviOtisak && noviOtisak !== otisak && n().stavke.length > 0) {
      poruka('info', 'Postavke izračuna u tabeli su se promijenile. Izračun je osvježen; provjeri preporuku.');
    }
    otisak = noviOtisak;
    azurirajSecer(sada);
    azurirajBolus(sada);
    azurirajStavke();
    azurirajIzracun(sada);
  }

  zamijeni(
    korijen,
    secerKartica,
    bolusKartica,
    h(
      'section',
      { class: 'kartica' },
      h('h2', {}, 'Obrok'),
      h('div', { class: 'red-polja' }, h('label', { for: 'tip' }, 'Tip'), tipSelect),
      stavkeEl,
    ),
    izracunEl,
    h(
      'section',
      { class: 'kartica' },
      h('div', { class: 'red-polja' }, h('label', { for: 'dato' }, 'Dato jedinica'), h('div', { class: 'red' }, datoInput, vratiPreporuku)),
      h('label', { class: 'kvacica', for: 'inzulin-dat' }, inzulinCb, h('span', {}, 'Inzulin dat')),
      h('div', { class: 'red-polja' }, h('label', { for: 'napomena' }, 'Napomena (nije obavezno)'), napomenaInput),
      sacuvajBtn,
    ),
  );

  void stanje.getGlucose().then((o) => {
    ocitanje = o;
    if (o?.source === 'rucno') secerInput.value = broj(o.mmol);
    azuriraj();
  });
  azuriraj();
  // Prije prikaza preporuke uvijek svjež bootstrap (SPEC 7).
  void stanje.osvjezi();

  const odjava = stanje.pretplati(azuriraj);
  const tajmer = setInterval(() => void ucitajSecer(), 30000);
  return () => {
    odjava();
    clearInterval(tajmer);
  };
}
