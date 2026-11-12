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
  latest(): string;
  history(fromMs: number, toMs: number): string;
  status(): string;
  getConfig(): string;
  setConfig(json: string): void;
  openBatterySettings(): void;
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
 * Šećer iz omotača preko window.GlucoBridge.latest().
 * Faza 4: namjerno prazan, uvijek vraća null. Popunjava se u Fazi 5.
 */
export class AndroidBridgeAdapter implements IzvorSecera {
  static dostupan(w: { GlucoBridge?: unknown } = globalThis as { GlucoBridge?: unknown }): boolean {
    return typeof w.GlucoBridge === 'object' && w.GlucoBridge !== null;
  }

  async getGlucose(): Promise<Ocitanje | null> {
    return null;
  }
}

/** Ručni unos ima prednost; inače omotač, ako postoji. */
export async function getGlucose(manual: IzvorSecera, most: IzvorSecera | null): Promise<Ocitanje | null> {
  const r = await manual.getGlucose();
  if (r) return r;
  return most ? most.getGlucose() : null;
}
