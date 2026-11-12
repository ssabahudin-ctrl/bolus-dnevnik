// Android omotač: status iz GlucoBridge.status() i konfiguracija u šifrovanom skladištu omotača (SPEC 4).

import { provjeriKonfig, type Konfig } from './konfig';
import type { GlucoBridgeApi } from './secer';

/** Zadnje očitanje starije od ovoga je upozorenje na ekranu statusa (SPEC 4). */
export const KASNI_MIN = 15;

export interface StatusOmotaca {
  verzija: string;
  zadnjeOcitanje: { time: Date; mgdl: number } | null;
  zadnjiPrijem: Date | null;
  neposlano: number;
  odbijeno: number;
  zadnjeOdbijanje: string | null;
  ocitanja24h: number | null;
  najvecaRupa24hMin: number | null;
  baterijaBezOgranicenja: boolean;
  zadnjeSlanje: Date | null;
  zadnjiPokusajSlanja: Date | null;
  greskaSlanja: string | null;
  prestaroNeposlano: number;
  upareno: boolean | null;
}

function vrijeme(v: unknown): Date | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? new Date(v) : null;
}

function brojIli(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

function tekstIli(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}

export function parsirajStatus(s: string | null | undefined): StatusOmotaca | null {
  if (!s) return null;
  let o: unknown;
  try {
    o = JSON.parse(s);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  const z = r.zadnje_ocitanje as Record<string, unknown> | null | undefined;
  const zt = z && typeof z === 'object' ? vrijeme(z.time) : null;
  return {
    verzija: tekstIli(r.verzija) ?? '?',
    zadnjeOcitanje: zt && typeof z!.mgdl === 'number' ? { time: zt, mgdl: z!.mgdl } : null,
    zadnjiPrijem: vrijeme(r.zadnji_prijem),
    neposlano: brojIli(r.neposlano, 0),
    odbijeno: brojIli(r.odbijeno, 0),
    zadnjeOdbijanje: tekstIli(r.zadnje_odbijanje),
    ocitanja24h: typeof r.ocitanja_24h === 'number' ? r.ocitanja_24h : null,
    najvecaRupa24hMin: typeof r.najveca_rupa_24h_min === 'number' ? r.najveca_rupa_24h_min : null,
    baterijaBezOgranicenja: r.baterija_bez_ogranicenja === true,
    zadnjeSlanje: vrijeme(r.zadnje_slanje),
    zadnjiPokusajSlanja: vrijeme(r.zadnji_pokusaj_slanja),
    greskaSlanja: tekstIli(r.greska_slanja),
    prestaroNeposlano: brojIli(r.prestaro_neposlano, 0),
    upareno: typeof r.upareno === 'boolean' ? r.upareno : null,
  };
}

/** Upozorenja za ekran statusa, najvažnije prvo. */
export function upozorenjaStatusa(s: StatusOmotaca, sada: Date = new Date()): string[] {
  const u: string[] = [];
  if (!s.zadnjeOcitanje) {
    u.push('Omotač još nije primio nijedno očitanje. Provjeri da GlucoDataHandler šalje broadcast ovoj aplikaciji.');
  } else {
    const kasni = Math.floor((sada.getTime() - s.zadnjeOcitanje.time.getTime()) / 60000);
    if (kasni > KASNI_MIN) {
      u.push(`Zadnje očitanje kasni ${kasni} min (više od ${KASNI_MIN} min). Provjeri senzor, GlucoDataHandler i bateriju.`);
    }
  }
  if (!s.baterijaBezOgranicenja) {
    u.push('Optimizacija baterije je uključena za omotač. Prijem šećera u pozadini može stati.');
  }
  if (s.upareno === false) u.push('Omotač nije uparen, pa ne šalje šećer u tabelu.');
  else if (s.greskaSlanja) u.push(`Zadnje slanje u tabelu nije uspjelo: ${s.greskaSlanja}`);
  return u;
}

/** Konfiguracija iz omotača; null ako je nema ili nije ispravna. */
export function konfigIzOmotaca(most: GlucoBridgeApi): Konfig | null {
  try {
    const s = most.getConfig();
    if (!s) return null;
    const r = provjeriKonfig(JSON.parse(s));
    return r.ok ? r.konfig : null;
  } catch {
    return null;
  }
}

/** Upis konfiguracije u omotač (null = odspajanje). Baca grešku ako je omotač odbije. */
export function upisiKonfigUOmotac(most: GlucoBridgeApi, k: Konfig | null): void {
  let odg: unknown;
  try {
    odg = JSON.parse(most.setConfig(k ? JSON.stringify(k) : 'null'));
  } catch {
    throw new Error('Omotač nije odgovorio na upis konfiguracije.');
  }
  const r = odg as { ok?: unknown; error?: unknown } | null;
  if (!r || r.ok !== true) {
    throw new Error(typeof r?.error === 'string' ? r.error : 'Omotač je odbio konfiguraciju.');
  }
}
