/**
 * Izračun preporuke bolusa (SPEC.md tačka 7). Jedino mjesto u projektu gdje se računa doza.
 * Čista funkcija: bez DOM-a, mreže, vremena i globalnog stanja.
 *
 *   bolus_obrok     = uh_ukupno_g / uh_odnos
 *   bolus_korekcija = secer_mmol == null ? 0 : (secer_mmol - cilj_mmol) / fia
 *   zbir            = bolus_obrok + bolus_korekcija
 *   sirovo          = max(0, zbir)
 *   preporuka       = sirovo zaokruženo UVIJEK NANIŽE na višekratnik koraka
 *                     (null kad je šećer ispod hipo praga)
 */

/** Vrijednost iz forme ili tabele: broj, tekst sa zarezom ili tačkom, ili prazno. */
export type Unos = number | string | null | undefined;

export interface UlazIzracuna {
  uh_ukupno_g: Unos;
  /** Prazno znači da šećer nije poznat. */
  secer_mmol: Unos;
  /** Grama UH po 1 jedinici. */
  uh_odnos: Unos;
  /** mmol/L po 1 jedinici. */
  fia: Unos;
  cilj_mmol: Unos;
  korak: Unos;
  hipo_prag: Unos;
  max_doza: Unos;
}

export type PoljeUlaza = keyof UlazIzracuna;

export type KodUpozorenja = 'bez_secera' | 'hipoglikemija' | 'iznad_max_doze';

export interface Upozorenje {
  kod: KodUpozorenja;
  poruka: string;
}

export interface GreskaValidacije {
  polje: PoljeUlaza;
  poruka: string;
}

export type RezultatIzracuna =
  | {
      ok: true;
      bolus_obrok: number;
      bolus_korekcija: number;
      /** bolus_obrok + bolus_korekcija, može biti negativan. */
      zbir: number;
      /** max(0, zbir) */
      sirovo: number;
      /** Jedinice za dati; null kad preporuke nema (hipoglikemija). */
      preporuka: number | null;
      upozorenja: Upozorenje[];
    }
  | { ok: false; greske: GreskaValidacije[] };

/**
 * Vrijednost koja je manje od ovoga ispod višekratnika koraka smatra se tim višekratnikom.
 * Pokriva grešku decimalnog računa (npr. 2.9999999999999982 umjesto 3), a nijedna
 * stvarna razlika u dozi nije toliko mala.
 */
const TOLERANCIJA = 1e-9;

/** Broj decimala na koji se čiste međurezultati, da u tabelu ne ide 1.2000000000000002. */
const DECIMALE_CISCENJA = 10;

const SECER_MIN = 1;
const SECER_MAX = 35;

/**
 * Pretvara unos u broj. Prihvata zarez ili tačku kao decimalni separator i razmake oko broja.
 * Vraća null za prazno, a NaN za sve što nije jednoznačan broj (npr. "1.234,5", "8,4 mmol", "1e3").
 */
export function parsirajBroj(v: Unos): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : Number.NaN;
  const s = v.trim();
  if (s === '') return null;
  if (!/^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/.test(s)) return Number.NaN;
  return Number(s.replace(',', '.'));
}

/** Zaokružuje x naniže na višekratnik koraka, uz toleranciju za decimalni šum. */
export function zaokruziNanize(x: number, korak: number): number {
  const koraka = Math.floor((x + TOLERANCIJA) / korak);
  return ocisti(koraka * korak);
}

function ocisti(x: number): number {
  const r = Number(x.toFixed(DECIMALE_CISCENJA));
  return r === 0 ? 0 : r; // bez -0
}

export function izracunaj(ulaz: UlazIzracuna): RezultatIzracuna {
  const greske: GreskaValidacije[] = [];

  function broj(polje: PoljeUlaza, naziv: string, uslov: (n: number) => boolean, opis: string): number {
    const n = parsirajBroj(ulaz[polje]);
    if (n === null) {
      greske.push({ polje, poruka: `${naziv}: vrijednost nedostaje.` });
      return Number.NaN;
    }
    if (Number.isNaN(n)) {
      greske.push({ polje, poruka: `${naziv}: nije ispravan broj.` });
      return Number.NaN;
    }
    if (!uslov(n)) {
      greske.push({ polje, poruka: `${naziv}: ${opis}.` });
      return Number.NaN;
    }
    return n;
  }

  const uh = broj('uh_ukupno_g', 'Ukupno UH', (n) => n >= 0, 'ne može biti negativno');
  const uhOdnos = broj('uh_odnos', 'UH odnos', (n) => n > 0, 'mora biti veći od 0');
  const fia = broj('fia', 'FIA', (n) => n > 0, 'mora biti veća od 0');
  const cilj = broj('cilj_mmol', 'Ciljni šećer', (n) => n > 0, 'mora biti veći od 0');
  const korak = broj('korak', 'Korak doze', (n) => n > 0, 'mora biti veći od 0');
  const hipoPrag = broj('hipo_prag', 'Hipo prag', (n) => n > 0, 'mora biti veći od 0');
  const maxDoza = broj('max_doza', 'Najveća doza', (n) => n > 0, 'mora biti veća od 0');

  let secer: number | null = parsirajBroj(ulaz.secer_mmol);
  if (secer !== null) {
    if (Number.isNaN(secer)) {
      greske.push({ polje: 'secer_mmol', poruka: 'Šećer: nije ispravan broj.' });
    } else if (secer < SECER_MIN || secer > SECER_MAX) {
      greske.push({ polje: 'secer_mmol', poruka: `Šećer: mora biti između ${SECER_MIN} i ${SECER_MAX} mmol/L.` });
    }
  }

  if (greske.length) return { ok: false, greske };

  const bolusObrok = uh / uhOdnos;
  const bolusKorekcija = secer === null ? 0 : (secer - cilj) / fia;
  const zbir = bolusObrok + bolusKorekcija;
  const sirovo = Math.max(0, zbir);

  const upozorenja: Upozorenje[] = [];
  let preporuka: number | null;

  if (secer === null) {
    upozorenja.push({ kod: 'bez_secera', poruka: 'Bez šećera: računa se samo bolus za obrok, bez korekcije.' });
  }

  if (secer !== null && secer < hipoPrag) {
    preporuka = null;
    upozorenja.push({
      kod: 'hipoglikemija',
      poruka: `Šećer je ispod ${hipoPrag} mmol/L. Nema preporuke: prvo riješi hipoglikemiju.`,
    });
  } else {
    preporuka = zaokruziNanize(sirovo, korak);
    if (preporuka > maxDoza) {
      upozorenja.push({
        kod: 'iznad_max_doze',
        poruka: `Preporuka je veća od najveće doze (${maxDoza} j.). Provjeri unos i potvrdi posebno.`,
      });
    }
  }

  return {
    ok: true,
    bolus_obrok: ocisti(bolusObrok),
    bolus_korekcija: ocisti(bolusKorekcija),
    zbir: ocisti(zbir),
    sirovo: ocisti(sirovo),
    preporuka,
    upozorenja,
  };
}
