// Ulaz web dijela: okvir, navigacija između četiri ekrana i uparivanje iz #pair= linka.

import './style.css';
import { ekranDnevnik } from './ekrani/dnevnik';
import { ekranNamirnica } from './ekrani/namirnica';
import { ekranObrok } from './ekrani/obrok';
import { ekranPostavke, upari } from './ekrani/postavke';
import { procitajPair } from './konfig';
import { stanje } from './stanje';
import { h, poruka, postaviKontejnerPoruka, zamijeni } from './ui';

export type ImeEkrana = 'obrok' | 'namirnica' | 'dnevnik' | 'postavke';
export type Navigacija = (ekran: ImeEkrana) => void;

const EKRANI: Record<ImeEkrana, { naslov: string; nav: string; prikazi: (k: HTMLElement, idi: Navigacija) => () => void }> = {
  obrok: { naslov: 'Novi obrok', nav: 'Obrok', prikazi: ekranObrok },
  namirnica: { naslov: 'Dodaj namirnicu', nav: 'Namirnica', prikazi: ekranNamirnica },
  dnevnik: { naslov: 'Dnevnik', nav: 'Dnevnik', prikazi: ekranDnevnik },
  postavke: { naslov: 'Postavke', nav: 'Postavke', prikazi: ekranPostavke },
};

const app = document.querySelector<HTMLDivElement>('#app')!;
const naslov = h('h1', {});
const uredjaj = h('span', { class: 'uredjaj' });
const porukeEl = h('div', { class: 'poruke', 'aria-live': 'polite' });
const sadrzaj = h('main', { class: 'sadrzaj' });
const navDugmad = new Map<ImeEkrana, HTMLButtonElement>();
const nav = h(
  'nav',
  { class: 'donja-nav' },
  ...(Object.keys(EKRANI) as ImeEkrana[]).map((ime) => {
    const b = h('button', { onclick: () => idi(ime) }, EKRANI[ime].nav);
    navDugmad.set(ime, b);
    return b;
  }),
);
zamijeni(app, h('header', { class: 'zaglavlje' }, naslov, uredjaj), porukeEl, sadrzaj, nav);
postaviKontejnerPoruka(porukeEl);

let ociste: (() => void) | null = null;

const idi: Navigacija = (ime) => {
  ociste?.();
  naslov.textContent = EKRANI[ime].naslov;
  for (const [k, b] of navDugmad) {
    b.classList.toggle('aktivno', k === ime);
    if (k === ime) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
  ociste = EKRANI[ime].prikazi(sadrzaj, idi);
};

function azurirajZaglavlje() {
  const naziv = stanje.boot?.uredjaj.naziv ?? stanje.konfig?.naziv;
  uredjaj.textContent = naziv ? naziv : 'nije uparen';
  uredjaj.classList.toggle('bez-veze', !!stanje.bootGreska || !stanje.konfig);
}
stanje.pretplati(azurirajZaglavlje);
azurirajZaglavlje();

// Neuhvaćene greške se prikazuju, ne nestaju tiho.
window.addEventListener('unhandledrejection', (e) => poruka('greska', `Neočekivana greška: ${String(e.reason)}`));
window.addEventListener('error', (e) => poruka('greska', `Neočekivana greška: ${e.message}`));

/** Obrađuje #pair= iz adrese. Vraća true ako je link postojao. */
async function obradiPair(): Promise<boolean> {
  const pair = procitajPair(location.hash);
  if (!pair) return false;
  // Token ne ostaje u adresi ni u historiji.
  history.replaceState(null, '', location.pathname + location.search);
  if (!pair.ok) {
    poruka('greska', pair.poruka);
    return false;
  }
  idi('postavke');
  await upari(pair.konfig);
  idi('obrok');
  return true;
}

// Link za uparivanje otvoren dok je aplikacija već otvorena mijenja samo hash.
window.addEventListener('hashchange', () => void obradiPair());

async function pokreni() {
  if (await obradiPair()) return;
  if (!stanje.konfig) {
    idi('postavke');
    poruka('info', 'Uređaj nije uparen. Otvori link za uparivanje koji si dobio, ili ga zalijepi u Postavke.');
    return;
  }
  idi('obrok');
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && stanje.konfig) void stanje.osvjezi();
});

void pokreni();
