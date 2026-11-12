// Izvor šećera (SPEC 3). Interfejs getGlucose i dva adaptera.

export interface Ocitanje {
  mmol: number;
  time: Date;
  source: 'gdh' | 'rucno';
}

export interface IzvorSecera {
  getGlucose(): Promise<Ocitanje | null>;
}

/** Most iz Android omotača (SPEC 4). Svi rezultati su JSON stringovi. */
export interface GlucoBridgeApi {
  latest(): string | null;
  history(fromMs: number, toMs: number): string;
  status(): string;
  getConfig(): string | null;
  /** JSON {url, token, naziv} ili "null" za odspajanje. Vraća {"ok":true} ili {"ok":false,"error":"..."}. */
  setConfig(json: string): string;
  openBatterySettings(): void;
}

/** mmol/L = mg/dL / 18.016 (SPEC 3); zaokružuje se tek pri prikazu. */
export const MGDL_PO_MMOL = 18.016;

export interface OcitanjeMgdl {
  mgdl: number;
  time: Date;
}

function ispravnoMgdl(o: unknown): o is { mgdl: number; time: number } {
  if (!o || typeof o !== 'object') return false;
  const { mgdl, time } = o as Record<string, unknown>;
  return (
    typeof mgdl === 'number' && Number.isInteger(mgdl) && mgdl >= 20 && mgdl <= 600 &&
    typeof time === 'number' && Number.isFinite(time) && time > 0
  );
}

/** latest() iz omotača u Ocitanje. Sve što nije ispravno daje null (ne izmišlja šećer). */
export function parsirajLatest(s: string | null | undefined): Ocitanje | null {
  if (!s) return null;
  let o: unknown;
  try {
    o = JSON.parse(s);
  } catch {
    return null;
  }
  if (!ispravnoMgdl(o)) return null;
  return { mmol: o.mgdl / MGDL_PO_MMOL, time: new Date(o.time), source: 'gdh' };
}

/** history() iz omotača; neispravni elementi se preskaču. */
export function parsirajHistory(s: string | null | undefined): OcitanjeMgdl[] {
  if (!s) return [];
  let o: unknown;
  try {
    o = JSON.parse(s);
  } catch {
    return [];
  }
  if (!Array.isArray(o)) return [];
  return o.filter(ispravnoMgdl).map((x) => ({ mgdl: x.mgdl, time: new Date(x.time) }));
}

declare global {
  interface Window {
    GlucoBridge?: GlucoBridgeApi;
  }
}

/** Ručni unos u mmol/L. Uvijek dostupan; ima prednost kad ga korisnik upiše. */
export class ManualAdapter implements IzvorSecera {
  private ocitanje: Ocitanje | null = null;

  postavi(mmol: number, vrijeme: Date = new Date()): void {
    this.ocitanje = { mmol, time: vrijeme, source: 'rucno' };
  }

  obrisi(): void {
    this.ocitanje = null;
  }

  async getGlucose(): Promise<Ocitanje | null> {
    return this.ocitanje;
  }
}

/**
 * Šećer iz omotača preko window.GlucoBridge (SPEC 3 i 4). Ako mosta nema, vraća null.
 * Izvor je uvijek 'gdh', a starost se računa iz vremena očitanja, pa ekran može
 * prikazati izvor i starost prije izračuna.
 */
export class AndroidBridgeAdapter implements IzvorSecera {
  static dostupan(w: { GlucoBridge?: unknown } = globalThis as { GlucoBridge?: unknown }): boolean {
    return typeof w.GlucoBridge === 'object' && w.GlucoBridge !== null;
  }

  private readonly most: GlucoBridgeApi | null;

  constructor(most?: GlucoBridgeApi | null) {
    const g = globalThis as { GlucoBridge?: GlucoBridgeApi };
    this.most = most !== undefined ? most : AndroidBridgeAdapter.dostupan(g) ? g.GlucoBridge! : null;
  }

  get api(): GlucoBridgeApi | null {
    return this.most;
  }

  async getGlucose(): Promise<Ocitanje | null> {
    return this.most ? parsirajLatest(this.most.latest()) : null;
  }

  /** Lokalna očitanja omotača za prozor (za grafikon, SPEC 8). */
  history(od: Date, doo: Date): OcitanjeMgdl[] {
    return this.most ? parsirajHistory(this.most.history(od.getTime(), doo.getTime())) : [];
  }
}

/** Ručni unos ima prednost; inače omotač, ako postoji. */
export async function getGlucose(manual: IzvorSecera, most: IzvorSecera | null): Promise<Ocitanje | null> {
  const r = await manual.getGlucose();
  if (r) return r;
  return most ? most.getGlucose() : null;
}
