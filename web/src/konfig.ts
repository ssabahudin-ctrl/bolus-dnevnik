// Konfiguracija uređaja i uparivanje preko linka #pair=<base64 JSON {url, token, naziv}> (SPEC 6).
// Podaci su iza # da ne bi završili u logovima servera; nakon čitanja se brišu iz adrese.

export interface Konfig {
  url: string;
  token: string;
  naziv: string;
}

export type RezultatUparivanja = { ok: true; konfig: Konfig } | { ok: false; poruka: string };

/** Base64 ili base64url u UTF-8 tekst. */
function dekodirajBase64(s: string): string {
  let b = s.trim().replace(/-/g, '+').replace(/_/g, '/');
  while (b.length % 4) b += '=';
  const bin = atob(b);
  const bajtovi = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bajtovi);
}

export function provjeriKonfig(o: unknown): RezultatUparivanja {
  if (!o || typeof o !== 'object') return { ok: false, poruka: 'Link za uparivanje ne sadrži podatke.' };
  const { url, token, naziv } = o as Record<string, unknown>;
  if (typeof url !== 'string' || !/^https:\/\/[^\s/]+\/\S*$/.test(url)) {
    return { ok: false, poruka: 'Link za uparivanje nema ispravan https URL servisa.' };
  }
  if (typeof token !== 'string' || token.length < 20) {
    return { ok: false, poruka: 'Link za uparivanje nema ispravan token.' };
  }
  if (typeof naziv !== 'string' || naziv.trim() === '') {
    return { ok: false, poruka: 'Link za uparivanje nema naziv uređaja.' };
  }
  return { ok: true, konfig: { url, token, naziv: naziv.trim() } };
}

/**
 * Čita #pair= iz hash dijela adrese (ili iz cijelog zalijepljenog linka).
 * Vraća null ako pair parametra nema.
 */
export function procitajPair(tekst: string): RezultatUparivanja | null {
  const i = tekst.indexOf('#');
  const hash = i >= 0 ? tekst.slice(i + 1) : tekst;
  const m = hash.match(/(?:^|&)pair=([^&]*)/);
  if (!m) return null;
  let vrijednost = m[1] ?? '';
  try {
    vrijednost = decodeURIComponent(vrijednost);
  } catch {
    return { ok: false, poruka: 'Link za uparivanje je oštećen.' };
  }
  let json: unknown;
  try {
    json = JSON.parse(dekodirajBase64(vrijednost));
  } catch {
    return { ok: false, poruka: 'Link za uparivanje je oštećen (nije ispravan base64 JSON).' };
  }
  return provjeriKonfig(json);
}

export function hostServisa(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Token za prikaz: samo prvih i zadnjih nekoliko znakova. */
export function maskirajToken(t: string): string {
  return t.length <= 10 ? '****' : `${t.slice(0, 4)}...${t.slice(-4)}`;
}
