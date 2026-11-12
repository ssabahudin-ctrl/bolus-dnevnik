// Mali DOM pomoćnici, dijalog i poruke. Bez frameworka.

export type Dijete = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> = {},
  ...djeca: Dijete[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'class') {
      el.className = String(v);
    } else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') {
      (el as unknown as Record<string, unknown>)[k] = v;
    } else {
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  dodaj(el, djeca);
  return el;
}

export function dodaj(el: Element, djeca: Dijete[]): void {
  for (const d of djeca) {
    if (d === null || d === undefined || d === false) continue;
    el.append(typeof d === 'object' ? d : String(d));
  }
}

export function zamijeni(el: Element, ...djeca: Dijete[]): void {
  el.replaceChildren();
  dodaj(el, djeca);
}

/* ---------------------------------------------------------------- poruke */

let kontejnerPoruka: HTMLElement | null = null;

export function postaviKontejnerPoruka(el: HTMLElement): void {
  kontejnerPoruka = el;
}

/** Greške ostaju dok ih korisnik ne zatvori; uspjeh i info nestaju same. */
export function poruka(tip: 'greska' | 'uspjeh' | 'info', tekst: string): HTMLElement | null {
  if (!kontejnerPoruka) {
    // Ne bi se smjelo desiti, ali greška ne smije nestati tiho.
    alert(tekst);
    return null;
  }
  const el = h(
    'div',
    { class: `poruka poruka-${tip}`, role: tip === 'greska' ? 'alert' : 'status' },
    h('span', {}, tekst),
    h('button', { class: 'zatvori', 'aria-label': 'Zatvori', onclick: () => el.remove() }, 'x'),
  );
  kontejnerPoruka.append(el);
  if (tip !== 'greska') setTimeout(() => el.remove(), 6000);
  return el;
}

/* ---------------------------------------------------------------- dijalog */

export interface DugmeDijaloga<T> {
  tekst: string;
  vrijednost: T;
  stil?: 'primarno' | 'opasno' | 'obicno';
}

/** Modalni dijalog. Escape ili klik van dijaloga vraća vrijednost za odustajanje. */
export function dijalog<T>(
  naslov: string,
  sadrzaj: Dijete | Dijete[],
  dugmad: DugmeDijaloga<T>[],
  odustani: T,
  prijeZatvaranja?: (v: T) => boolean,
): Promise<T> {
  return new Promise((resolve) => {
    const prethodniFokus = document.activeElement as HTMLElement | null;
    const zatvori = (v: T) => {
      if (prijeZatvaranja && v !== odustani && !prijeZatvaranja(v)) return;
      document.removeEventListener('keydown', naTipku);
      pozadina.remove();
      prethodniFokus?.focus?.();
      resolve(v);
    };
    const naTipku = (e: KeyboardEvent) => {
      if (e.key === 'Escape') zatvori(odustani);
    };
    const okvir = h(
      'div',
      { class: 'dijalog', role: 'dialog', 'aria-modal': 'true', 'aria-label': naslov },
      h('h2', {}, naslov),
      h('div', { class: 'dijalog-sadrzaj' }, ...(Array.isArray(sadrzaj) ? sadrzaj : [sadrzaj])),
      h(
        'div',
        { class: 'dijalog-dugmad' },
        ...dugmad.map((d) => h('button', { class: `dugme ${d.stil ?? 'obicno'}`, onclick: () => zatvori(d.vrijednost) }, d.tekst)),
      ),
    );
    const pozadina = h('div', { class: 'dijalog-pozadina', onclick: (e: Event) => e.target === pozadina && zatvori(odustani) }, okvir);
    document.addEventListener('keydown', naTipku);
    document.body.append(pozadina);
    (okvir.querySelector('input') ?? okvir.querySelector('button'))?.focus();
  });
}

export function potvrdi(naslov: string, tekst: Dijete | Dijete[], da: string, ne = 'Odustani'): Promise<boolean> {
  return dijalog(naslov, tekst, [{ tekst: ne, vrijednost: false }, { tekst: da, vrijednost: true, stil: 'primarno' }], false);
}

/** Zaključava dugme dok traje radnja (sprječava dupli klik). */
export async function dokTraje<T>(dugme: HTMLButtonElement, tekst: string, radnja: () => Promise<T>): Promise<T> {
  const stari = dugme.textContent;
  dugme.disabled = true;
  dugme.textContent = tekst;
  try {
    return await radnja();
  } finally {
    dugme.disabled = false;
    dugme.textContent = stari;
  }
}
