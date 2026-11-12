// Vrijeme za slanje (ISO 8601 sa offsetom, SPEC 5) i za prikaz.

function dvije(n: number): string {
  return String(n).padStart(2, '0');
}

/** Lokalno vrijeme uređaja kao ISO 8601 sa offsetom, npr. 2026-11-12T08:15:00+01:00. */
export function isoSaOffsetom(d: Date): string {
  const off = -d.getTimezoneOffset();
  const znak = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return (
    `${d.getFullYear()}-${dvije(d.getMonth() + 1)}-${dvije(d.getDate())}` +
    `T${dvije(d.getHours())}:${dvije(d.getMinutes())}:${dvije(d.getSeconds())}` +
    `${znak}${dvije(Math.floor(a / 60))}:${dvije(a % 60)}`
  );
}

export function parsirajVrijeme(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function satMinuta(d: Date): string {
  return `${dvije(d.getHours())}:${dvije(d.getMinutes())}`;
}

/** "danas 08:15", "jučer 21:40" ili "10.11. 08:15". */
export function kratkoVrijeme(d: Date, sada: Date = new Date()): string {
  const dan = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const razlika = Math.round((dan(sada) - dan(d)) / 86400000);
  if (razlika === 0) return `danas ${satMinuta(d)}`;
  if (razlika === 1) return `jučer ${satMinuta(d)}`;
  return `${dvije(d.getDate())}.${dvije(d.getMonth() + 1)}. ${satMinuta(d)}`;
}

/** Starost u cijelim minutama (nikad negativna). */
export function starostMin(d: Date, sada: Date = new Date()): number {
  return Math.max(0, Math.floor((sada.getTime() - d.getTime()) / 60000));
}

export function opisStarosti(min: number): string {
  if (min < 1) return 'upravo sada';
  if (min < 60) return `prije ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `prije ${h} h ${m} min` : `prije ${h} h`;
}
