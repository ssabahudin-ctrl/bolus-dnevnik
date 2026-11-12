// Poziv Apps Script API-ja (SPEC 6). Svaka greška postaje ApiGreska sa porukom za korisnika;
// ništa se ne guta. Upozorenje "recent_bolus" nije greška, nego se vraća pozivaocu.

import type { Konfig } from './konfig';
import type { UpozorenjeDuplogBolusa } from './tipovi';

export class ApiGreska extends Error {
  constructor(
    readonly kod: string,
    poruka: string,
  ) {
    super(poruka);
    this.name = 'ApiGreska';
  }
}

const PORUKE: Record<string, string> = {
  nije_uparen: 'Uređaj nije uparen. Otvori Postavke i upari ga linkom.',
  mreza: 'Nema veze sa serverom. Provjeri internet i pokušaj ponovo.',
  timeout: 'Server nije odgovorio na vrijeme. Pokušaj ponovo; ako je upis ipak prošao, duplikat neće nastati.',
  http: 'Server je vratio grešku',
  nije_json: 'Server je vratio neočekivan odgovor. Provjeri da li je URL servisa ispravan (uparivanje).',
  auth: 'Uređaj nije prepoznat ili je isključen u tabeli (Uredjaji). Upari ga ponovo ili ga aktiviraj.',
  forbidden: 'Ovaj uređaj nema pravo mijenjati postavke.',
  busy: 'Server je zauzet. Pokušaj ponovo za nekoliko sekundi.',
  validation: 'Server je odbio podatke',
  setup: 'Tabela nije pripremljena (pokreni setup() u Apps Scriptu)',
  not_found: 'Unos nije pronađen u tabeli.',
  server: 'Greška na serveru. Pokušaj ponovo.',
  neocekivano_upozorenje: 'Server je vratio neočekivano upozorenje. Javi programeru.',
};

export function porukaZaKod(kod: string, detalj?: string): string {
  const osnova = PORUKE[kod] ?? `Neočekivana greška servera (${kod}). Javi programeru.`;
  return detalj ? `${osnova}: ${detalj}` : osnova;
}

export type OdgovorSaUpozorenjem<T> = T | UpozorenjeDuplogBolusa;

export function jeUpozorenjeDuplog(x: unknown): x is UpozorenjeDuplogBolusa {
  return !!x && typeof x === 'object' && (x as { warning?: unknown }).warning === 'recent_bolus';
}

export interface OpcijePoziva {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

/**
 * POST sa Content-Type text/plain (bez CORS preflighta). Vraća odgovor sa ok:true ili
 * upozorenje recent_bolus; sve ostalo baca ApiGreska.
 */
export async function pozovi<T extends { ok: true }>(
  konfig: Konfig | null,
  action: string,
  tijelo: Record<string, unknown> = {},
  opcije: OpcijePoziva = {},
): Promise<OdgovorSaUpozorenjem<T>> {
  if (!konfig) throw new ApiGreska('nije_uparen', porukaZaKod('nije_uparen'));
  const fetchFn = opcije.fetchFn ?? fetch;
  const kontroler = new AbortController();
  const tajmer = setTimeout(() => kontroler.abort(), opcije.timeoutMs ?? 20000);

  let res: Response;
  try {
    res = await fetchFn(konfig.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...tijelo, token: konfig.token, action }),
      redirect: 'follow',
      signal: kontroler.signal,
    });
  } catch (e) {
    clearTimeout(tajmer);
    if (kontroler.signal.aborted) throw new ApiGreska('timeout', porukaZaKod('timeout'));
    throw new ApiGreska('mreza', porukaZaKod('mreza'));
  }

  let tekst: string;
  try {
    tekst = await res.text();
  } catch {
    clearTimeout(tajmer);
    if (kontroler.signal.aborted) throw new ApiGreska('timeout', porukaZaKod('timeout'));
    throw new ApiGreska('mreza', porukaZaKod('mreza'));
  }
  clearTimeout(tajmer);

  if (!res.ok) throw new ApiGreska('http', porukaZaKod('http', `HTTP ${res.status}`));

  let json: unknown;
  try {
    json = JSON.parse(tekst);
  } catch {
    throw new ApiGreska('nije_json', porukaZaKod('nije_json'));
  }
  if (!json || typeof json !== 'object') throw new ApiGreska('nije_json', porukaZaKod('nije_json'));

  const o = json as { ok?: unknown; error?: unknown; poruka?: unknown };
  if (o.ok === true) return json as T;
  if (jeUpozorenjeDuplog(json)) return json;
  const kod = typeof o.error === 'string' ? o.error : 'nepoznato';
  const detalj = typeof o.poruka === 'string' ? o.poruka : undefined;
  throw new ApiGreska(kod, porukaZaKod(kod, detalj));
}

/** Za pozive kod kojih server ne vraća upozorenje: upozorenje se tretira kao greška. */
export async function pozoviBezUpozorenja<T extends { ok: true }>(
  konfig: Konfig | null,
  action: string,
  tijelo: Record<string, unknown> = {},
  opcije: OpcijePoziva = {},
): Promise<T> {
  const r = await pozovi<T>(konfig, action, tijelo, opcije);
  if (jeUpozorenjeDuplog(r)) throw new ApiGreska('neocekivano_upozorenje', porukaZaKod('neocekivano_upozorenje'));
  return r;
}
