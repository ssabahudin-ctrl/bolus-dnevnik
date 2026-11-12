// Oblici podataka koje vraća Apps Script (SPEC.md tačke 5 i 6).

export type Vrijednost = number | string | boolean | null;

/** Postavke iz lista Postavke: ključ -> vrijednost (broj ili tekst, prazno je null). */
export type Postavke = Record<string, number | string | null>;

export interface Namirnica {
  naziv: string;
  uh_na_100g: number;
  zadnja_gramaza_g: number | null;
  dodao_uredjaj: string | null;
}

/** Red iz lista Obroci, kako ga vraća bootstrap (datumi su ISO stringovi, prazno je null). */
export interface ObrokRed {
  id: string;
  vrijeme_unosa: string | null;
  uredjaj: string | null;
  tip: string | null;
  stavke_tekst: string | null;
  uh_ukupno_g: number | null;
  secer_mmol: number | null;
  secer_izvor: string | null;
  preporuka_j: number | null;
  dato_j: number | null;
  inzulin_dat: boolean;
  vrijeme_potvrde: string | null;
  potvrdio_uredjaj: string | null;
  upozorenje_prihvaceno: boolean;
  napomena: string | null;
  [kolona: string]: Vrijednost;
}

export interface ZadnjiBolus {
  obrok_id: string;
  dato_j: number;
  vrijeme: string;
  uredjaj: string;
}

export interface Bootstrap {
  ok: true;
  verzija_api: string;
  server_vrijeme: string;
  uredjaj: { naziv: string; smije_mijenjati_postavke: boolean };
  postavke: Postavke;
  namirnice: Namirnica[];
  obroci: ObrokRed[];
  zadnji_bolus: ZadnjiBolus | null;
}

/** Odgovor servera kad u prozoru postoji drugi potvrđen bolus; ništa nije upisano. */
export interface UpozorenjeDuplogBolusa {
  ok: false;
  warning: 'recent_bolus';
  obrok_id: string;
  uredjaj: string;
  dato_j: number;
  vrijeme: string;
  prozor_min: number;
}

export const TIPOVI_OBROKA = ['doručak', 'ručak', 'večera', 'užina', 'korekcija'] as const;
export type TipObroka = (typeof TIPOVI_OBROKA)[number];
