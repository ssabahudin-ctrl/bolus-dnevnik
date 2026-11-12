// Prikaz brojeva na bosanskom: decimalni zarez.

export function broj(n: number | null | undefined, decimala = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  return n.toFixed(decimala).replace('.', ',');
}

/** Doza: bez nepotrebnih decimala (7 j., 7,5 j., 0,25 j.). */
export function doza(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  const s = String(Number(n.toFixed(3)));
  return s.replace('.', ',') + ' j.';
}

/** Broj iz tabele može stići kao broj ili tekst. */
export function uBroj(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
