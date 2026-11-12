// Nacrt obroka, šta ulazi u izračun i šta se šalje u tabelu, i tokovi saveMeal/confirm
// sa obradom upozorenja recent_bolus. Bez DOM-a, da se može testirati.

import { izracunaj, parsirajBroj, type RezultatIzracuna, type UlazIzracuna } from './calc';
import { uBroj } from './format';
import type { Ocitanje } from './secer';
import type { Postavke, TipObroka, UpozorenjeDuplogBolusa } from './tipovi';
import { isoSaOffsetom, starostMin } from './vrijeme';
import { jeUpozorenjeDuplog } from './api';

export const VERZIJA_APP = 'web-0.1.0';

export const PODRAZUMIJEVANO = { zastarjelo_min: 10, prozor_dupli_bolus_min: 120, max_doza: 20 };

export interface Stavka {
  namirnica: string;
  gramaza_g: number;
  uh_na_100g: number | null;
  uh_g: number;
}

export interface Nacrt {
  /** UUID zadržava se do uspješnog upisa, pa ponovljeni pokušaj ne pravi duplikat. */
  id: string;
  tip: TipObroka;
  stavke: Stavka[];
  /** Tekst iz polja "Dato jedinica", tačno kako ga korisnik vidi. */
  datoTekst: string;
  /** true kad je korisnik sam mijenjao "Dato"; tada ga preporuka više ne prepisuje. */
  datoRucno: boolean;
  inzulinDat: boolean;
  napomena: string;
}

export function noviNacrt(id: string): Nacrt {
  return { id, tip: tipPoSatu(new Date()), stavke: [], datoTekst: '', datoRucno: false, inzulinDat: false, napomena: '' };
}

export function tipPoSatu(d: Date): TipObroka {
  const h = d.getHours();
  if (h >= 5 && h < 11) return 'doručak';
  if (h >= 11 && h < 16) return 'ručak';
  if (h >= 17 && h < 22) return 'večera';
  return 'užina';
}

function ocisti(x: number): number {
  const r = Number(x.toFixed(10));
  return r === 0 ? 0 : r;
}

export function uhStavke(gramaza: number, uhNa100: number): number {
  return ocisti((gramaza * uhNa100) / 100);
}

export function ukupnoUh(stavke: Stavka[]): number {
  return ocisti(stavke.reduce((s, x) => s + x.uh_g, 0));
}

export function zastarjeloMin(p: Postavke | null): number {
  return uBroj(p?.zastarjelo_min) ?? PODRAZUMIJEVANO.zastarjelo_min;
}

export function prozorDuplogMin(p: Postavke | null): number {
  return uBroj(p?.prozor_dupli_bolus_min) ?? PODRAZUMIJEVANO.prozor_dupli_bolus_min;
}

export interface SecerZaIzracun {
  mmol: number;
  izvor: 'gdh' | 'rucno';
  vrijeme: Date;
}

/**
 * Šećer koji ulazi u izračun. Očitanje starije od zastarjelo_min ne ulazi
 * dok ga korisnik ne potvrdi (SPEC 3).
 */
export function secerZaIzracun(
  o: Ocitanje | null,
  sada: Date,
  zastarjelo: number,
  potvrdjenoZastarjeloMs: number | null,
): SecerZaIzracun | null {
  if (!o) return null;
  const staro = starostMin(o.time, sada) >= zastarjelo;
  if (staro && potvrdjenoZastarjeloMs !== o.time.getTime()) return null;
  return { mmol: o.mmol, izvor: o.source, vrijeme: o.time };
}

export function ulazZaIzracun(uh: number, secer: SecerZaIzracun | null, p: Postavke | null): UlazIzracuna {
  return {
    uh_ukupno_g: uh,
    secer_mmol: secer ? secer.mmol : null,
    uh_odnos: p?.uh_odnos ?? null,
    fia: p?.fia ?? null,
    cilj_mmol: p?.cilj_mmol ?? null,
    korak: p?.korak ?? null,
    hipo_prag: p?.hipo_prag ?? null,
    max_doza: p?.max_doza ?? PODRAZUMIJEVANO.max_doza,
  };
}

export function izracunajObrok(nacrt: Nacrt, secer: SecerZaIzracun | null, p: Postavke | null): RezultatIzracuna {
  return izracunaj(ulazZaIzracun(ukupnoUh(nacrt.stavke), secer, p));
}

/** Tekst za polje "Dato jedinica" iz preporuke (zarez kao separator). */
export function datoIzPreporuke(preporuka: number | null): string {
  return preporuka === null ? '' : String(preporuka).replace('.', ',');
}

export type ProvjeraDato =
  | { ok: true; dato: number | null; iznadMax: boolean }
  | { ok: false; poruka: string };

export function provjeriDato(nacrt: Nacrt, maxDoza: number): ProvjeraDato {
  const n = parsirajBroj(nacrt.datoTekst);
  if (!nacrt.inzulinDat) {
    // Doza se upisuje samo kad je korisnik potvrdio da je inzulin dat.
    if (n !== null && Number.isNaN(n)) return { ok: false, poruka: 'Dato jedinica: nije ispravan broj.' };
    return { ok: true, dato: null, iznadMax: false };
  }
  if (n === null) return { ok: false, poruka: 'Upiši koliko je jedinica dato, ili skini kvačicu "Inzulin dat".' };
  if (Number.isNaN(n)) return { ok: false, poruka: 'Dato jedinica: nije ispravan broj.' };
  if (n <= 0 || n > 100) return { ok: false, poruka: 'Dato jedinica mora biti veće od 0 i najviše 100.' };
  return { ok: true, dato: n, iznadMax: n > maxDoza };
}

/** Red za list Obroci. Sve vrijednosti su one koje je korisnik vidio na ekranu. */
export function napraviObrok(
  nacrt: Nacrt,
  rez: Extract<RezultatIzracuna, { ok: true }>,
  secer: SecerZaIzracun | null,
  p: Postavke,
  dato: number | null,
  sada: Date,
): Record<string, unknown> {
  return {
    id: nacrt.id,
    vrijeme_unosa: isoSaOffsetom(sada),
    tip: nacrt.tip,
    stavke_tekst: nacrt.stavke.map((s) => `${s.namirnica} ${s.gramaza_g} g`).join(', '),
    uh_ukupno_g: ukupnoUh(nacrt.stavke),
    secer_mmol: secer ? secer.mmol : null,
    secer_izvor: secer ? secer.izvor : 'nema',
    secer_vrijeme: secer ? isoSaOffsetom(secer.vrijeme) : null,
    uh_odnos: parsirajBroj(p.uh_odnos),
    fia: parsirajBroj(p.fia),
    cilj_mmol: parsirajBroj(p.cilj_mmol),
    bolus_obrok: rez.bolus_obrok,
    bolus_korekcija: rez.bolus_korekcija,
    preporuka_j: rez.preporuka,
    dato_j: nacrt.inzulinDat ? dato : null,
    inzulin_dat: nacrt.inzulinDat,
    vrijeme_potvrde: nacrt.inzulinDat ? isoSaOffsetom(sada) : null,
    napomena: nacrt.napomena.trim() || null,
    verzija_app: VERZIJA_APP,
  };
}

export function stavkeZaSlanje(nacrt: Nacrt): Record<string, unknown>[] {
  return nacrt.stavke.map((s) => ({ ...s }));
}

/* ---------------------------------------------------------------- tokovi */

export type PozivApi = (action: string, tijelo: Record<string, unknown>) => Promise<unknown>;

export type OdlukaSaveMeal = 'force' | 'bez_inzulina' | 'odustani';
export type OdlukaConfirm = 'force' | 'odustani';

export type IshodSaveMeal =
  | { status: 'sacuvano'; inzulinUpisan: boolean; upozorenjePrihvaceno: boolean; duplikat: boolean }
  | { status: 'odustao' };

/**
 * saveMeal. Ako server javi recent_bolus, pita korisnika: upisati ipak (force),
 * sačuvati obrok bez potvrde inzulina, ili odustati (ništa se ne upisuje).
 * Mrežne greške se propuštaju pozivaocu (ApiGreska).
 */
export async function sacuvajObrok(
  api: PozivApi,
  meal: Record<string, unknown>,
  items: Record<string, unknown>[],
  pitaj: (u: UpozorenjeDuplogBolusa) => Promise<OdlukaSaveMeal>,
): Promise<IshodSaveMeal> {
  const r = (await api('saveMeal', { meal, items })) as Record<string, unknown>;
  if (!jeUpozorenjeDuplog(r)) {
    return {
      status: 'sacuvano',
      inzulinUpisan: meal.inzulin_dat === true,
      upozorenjePrihvaceno: r.upozorenje_prihvaceno === true,
      duplikat: r.duplikat === true,
    };
  }
  const odluka = await pitaj(r);
  if (odluka === 'odustani') return { status: 'odustao' };
  if (odluka === 'force') {
    const r2 = (await api('saveMeal', { meal, items, force: true })) as Record<string, unknown>;
    if (jeUpozorenjeDuplog(r2)) throw new Error('Server je i uz potvrdu vratio upozorenje.');
    return { status: 'sacuvano', inzulinUpisan: true, upozorenjePrihvaceno: true, duplikat: r2.duplikat === true };
  }
  const bez = { ...meal, inzulin_dat: false, dato_j: null, vrijeme_potvrde: null };
  const r3 = (await api('saveMeal', { meal: bez, items })) as Record<string, unknown>;
  if (jeUpozorenjeDuplog(r3)) throw new Error('Server je vratio upozorenje i za obrok bez inzulina.');
  return { status: 'sacuvano', inzulinUpisan: false, upozorenjePrihvaceno: false, duplikat: r3.duplikat === true };
}

export type IshodConfirm =
  | { status: 'potvrdjeno'; upozorenjePrihvaceno: boolean }
  | { status: 'vec_potvrdjeno'; dato_j: number | null; potvrdio: string | null }
  | { status: 'odustao' };

/** Naknadna potvrda inzulina (confirm), sa istom obradom recent_bolus. */
export async function potvrdiInzulin(
  api: PozivApi,
  id: string,
  dato: number,
  sada: Date,
  pitaj: (u: UpozorenjeDuplogBolusa) => Promise<OdlukaConfirm>,
): Promise<IshodConfirm> {
  const tijelo = { id, dato_j: dato, vrijeme_potvrde: isoSaOffsetom(sada), inzulin_dat: true };
  const r = (await api('confirm', tijelo)) as Record<string, unknown>;
  if (jeUpozorenjeDuplog(r)) {
    if ((await pitaj(r)) === 'odustani') return { status: 'odustao' };
    const r2 = (await api('confirm', { ...tijelo, force: true })) as Record<string, unknown>;
    if (jeUpozorenjeDuplog(r2)) throw new Error('Server je i uz potvrdu vratio upozorenje.');
    return potvrdaIshod(r2);
  }
  return potvrdaIshod(r);
}

function potvrdaIshod(r: Record<string, unknown>): IshodConfirm {
  if (r.vec_potvrdjeno === true) {
    return {
      status: 'vec_potvrdjeno',
      dato_j: uBroj(r.dato_j),
      potvrdio: typeof r.potvrdio_uredjaj === 'string' ? r.potvrdio_uredjaj : null,
    };
  }
  return { status: 'potvrdjeno', upozorenjePrihvaceno: r.upozorenje_prihvaceno === true };
}
