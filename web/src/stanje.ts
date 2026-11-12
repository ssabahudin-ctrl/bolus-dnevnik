// Stanje aplikacije: konfiguracija, zadnji bootstrap (keširan za rad bez mreže), nacrt obroka.

import { ApiGreska, pozoviBezUpozorenja, pozovi } from './api';
import type { Konfig } from './konfig';
import { noviNacrt, type Nacrt } from './obrok';
import { konfigIzOmotaca, upisiKonfigUOmotac } from './omotac';
import { AndroidBridgeAdapter, ManualAdapter, getGlucose, type Ocitanje } from './secer';
import type { Bootstrap } from './tipovi';

const K = {
  konfig: 'bd.konfig',
  boot: 'bd.bootstrap',
  bootVrijeme: 'bd.bootstrapVrijeme',
  nacrt: 'bd.nacrt',
  tabela: 'bd.tabelaUrl',
};

/** localStorage može biti nedostupan (privatni prozor); tada aplikacija radi bez keša. */
const skladiste = {
  citaj<T>(k: string): T | null {
    try {
      const s = localStorage.getItem(k);
      return s === null ? null : (JSON.parse(s) as T);
    } catch {
      return null;
    }
  },
  pisi(k: string, v: unknown): boolean {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch {
      return false;
    }
  },
  brisi(k: string): void {
    try {
      localStorage.removeItem(k);
    } catch {
      /* nema šta */
    }
  },
};

export function noviId(): string {
  return crypto.randomUUID();
}

class Stanje {
  readonly manual = new ManualAdapter();
  readonly most: AndroidBridgeAdapter | null = AndroidBridgeAdapter.dostupan() ? new AndroidBridgeAdapter() : null;

  /**
   * U omotaču konfiguracija (sa tokenom) živi samo u njegovom šifrovanom skladištu, jer je
   * treba i UploadWorker. U pregledniku je u localStorage.
   */
  konfig: Konfig | null = this.most?.api ? konfigIzOmotaca(this.most.api) : skladiste.citaj<Konfig>(K.konfig);
  boot: Bootstrap | null = skladiste.citaj<Bootstrap>(K.boot);
  bootVrijeme: Date | null = (() => {
    const s = skladiste.citaj<string>(K.bootVrijeme);
    return s ? new Date(s) : null;
  })();
  /** Greška zadnjeg pokušaja bootstrapa; null ako je uspio. */
  bootGreska: string | null = null;
  bootUToku: Promise<boolean> | null = null;
  /** true kad je u ovoj sesiji bar jednom pokušan bootstrap (uspješno ili ne). */
  bootPokusan = false;

  nacrt: Nacrt = skladiste.citaj<Nacrt>(K.nacrt) ?? noviNacrt(noviId());
  tabelaUrl: string = skladiste.citaj<string>(K.tabela) ?? '';

  /** Vrijeme očitanja koje je korisnik potvrdio iako je zastarjelo. */
  potvrdjenoZastarjeloMs: number | null = null;

  private slusaoci = new Set<() => void>();

  pretplati(f: () => void): () => void {
    this.slusaoci.add(f);
    return () => this.slusaoci.delete(f);
  }

  javi(): void {
    for (const f of this.slusaoci) f();
  }

  getGlucose(): Promise<Ocitanje | null> {
    return getGlucose(this.manual, this.most);
  }

  sacuvajNacrt(): void {
    skladiste.pisi(K.nacrt, this.nacrt);
  }

  novNacrt(): void {
    this.nacrt = noviNacrt(noviId());
    this.manual.obrisi();
    this.potvrdjenoZastarjeloMs = null;
    this.sacuvajNacrt();
  }

  /** Baca grešku ako omotač odbije konfiguraciju; tada se ništa ne mijenja. */
  postaviKonfig(k: Konfig | null): void {
    if (this.most?.api) {
      upisiKonfigUOmotac(this.most.api, k);
      skladiste.brisi(K.konfig);
    } else if (k) skladiste.pisi(K.konfig, k);
    else skladiste.brisi(K.konfig);
    this.konfig = k;
    // Keš pripada uparenom uređaju.
    this.boot = null;
    this.bootVrijeme = null;
    skladiste.brisi(K.boot);
    skladiste.brisi(K.bootVrijeme);
    this.javi();
  }

  postaviTabelaUrl(url: string): void {
    this.tabelaUrl = url.trim();
    skladiste.pisi(K.tabela, this.tabelaUrl);
  }

  /** Poziv API-ja sa trenutnom konfiguracijom (vraća i upozorenje recent_bolus). */
  api = (action: string, tijelo: Record<string, unknown> = {}): Promise<unknown> => pozovi(this.konfig, action, tijelo);

  apiBezUpozorenja<T extends { ok: true }>(action: string, tijelo: Record<string, unknown> = {}): Promise<T> {
    return pozoviBezUpozorenja<T>(this.konfig, action, tijelo);
  }

  /** Povlači postavke, namirnice, obroke i zadnji bolus. Greška se pamti i prikazuje, ne guta. */
  osvjezi(): Promise<boolean> {
    if (this.bootUToku) return this.bootUToku;
    this.bootUToku = (async () => {
      try {
        const b = await this.apiBezUpozorenja<Bootstrap>('bootstrap');
        this.boot = b;
        this.bootVrijeme = new Date();
        this.bootGreska = null;
        skladiste.pisi(K.boot, b);
        skladiste.pisi(K.bootVrijeme, this.bootVrijeme.toISOString());
        return true;
      } catch (e) {
        this.bootGreska = e instanceof ApiGreska ? e.message : `Neočekivana greška: ${String(e)}`;
        return false;
      } finally {
        this.bootPokusan = true;
        this.bootUToku = null;
        this.javi();
      }
    })();
    this.javi();
    return this.bootUToku;
  }
}

export const stanje = new Stanje();
