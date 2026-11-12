// Ekran 4: Postavke (SPEC 9.4): parametri, status omotača, uparivanje, test veze.

import { ApiGreska } from '../api';
import { parsirajBroj } from '../calc';
import { broj, uBroj } from '../format';
import { hostServisa, maskirajToken, procitajPair, type Konfig } from '../konfig';
import { VERZIJA_APP } from '../obrok';
import { stanje } from '../stanje';
import type { Postavke } from '../tipovi';
import { dokTraje, h, poruka, potvrdi, zamijeni } from '../ui';
import { kratkoVrijeme } from '../vrijeme';
import type { Navigacija } from '../main';

export const OZNAKE_POSTAVKI: [string, string][] = [
  ['uh_odnos', 'UH odnos (g UH po 1 j.)'],
  ['fia', 'FIA (mmol/L po 1 j.)'],
  ['cilj_mmol', 'Ciljni šećer (mmol/L)'],
  ['korak', 'Korak doze (j.)'],
  ['hipo_prag', 'Hipo prag (mmol/L)'],
  ['max_doza', 'Najveća doza bez dodatne potvrde (j.)'],
  ['prozor_dupli_bolus_min', 'Upozorenje o duplom bolusu (min)'],
  ['zastarjelo_min', 'Šećer zastarijeva nakon (min)'],
  ['opseg_donji', 'Ciljni opseg, donja granica (mmol/L)'],
  ['opseg_gornji', 'Ciljni opseg, gornja granica (mmol/L)'],
];

/** Potvrda prije uparivanja: korisnik vidi kome će se slati podaci. */
export async function upari(k: Konfig): Promise<boolean> {
  const ok = await potvrdi(
    'Upariti uređaj?',
    [
      h('p', {}, 'Naziv uređaja: ', h('strong', {}, k.naziv)),
      h('p', {}, 'Servis: ', h('strong', {}, hostServisa(k.url))),
      h('p', { class: 'prigusen malo' }, 'Upari samo linkom koji si dobio od vlasnika tabele.'),
    ],
    'Upari',
  );
  if (!ok) return false;
  stanje.postaviKonfig(k);
  if (await stanje.osvjezi()) poruka('uspjeh', `Upareno kao "${stanje.boot?.uredjaj.naziv ?? k.naziv}". Veza radi.`);
  else poruka('greska', `Uparivanje je sačuvano, ali test veze nije uspio: ${stanje.bootGreska ?? ''}`);
  return true;
}

function statusOmotaca(): HTMLElement {
  const most = window.GlucoBridge;
  if (!most) {
    return h('p', {}, 'Omotač nije prisutan: aplikacija radi u pregledniku, šećer se unosi ručno.');
  }
  try {
    const s = JSON.parse(most.status()) as Record<string, unknown>;
    return h('dl', { class: 'kv' }, ...Object.entries(s).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, String(v))]));
  } catch (e) {
    return h('div', { class: 'upozorenje jako' }, `Status omotača nije pročitan: ${String(e)}`);
  }
}

export function ekranPostavke(korijen: HTMLElement, _idi: Navigacija): () => void {
  const uredjajEl = h('div');
  const parametriEl = h('div');
  const pairInput = h('input', { id: 'pair', type: 'text', autocomplete: 'off', placeholder: 'https://...#pair=...' });
  const tabelaInput = h('input', { id: 'tabela', type: 'url', autocomplete: 'off', value: stanje.tabelaUrl, placeholder: 'https://docs.google.com/spreadsheets/...' });

  const testBtn: HTMLButtonElement = h('button', {
    class: 'dugme primarno',
    onclick: () =>
      void dokTraje(testBtn, 'Testiram...', async () => {
        if (await stanje.osvjezi()) {
          const b = stanje.boot!;
          poruka('uspjeh', `Veza radi. Server vidi uređaj "${b.uredjaj.naziv}", API ${b.verzija_api}, vrijeme servera ${kratkoVrijeme(new Date(b.server_vrijeme))}.`);
        } else {
          poruka('greska', `Test veze nije uspio: ${stanje.bootGreska ?? ''}`);
        }
      }),
  }, 'Test veze');

  function azurirajUredjaj() {
    const k = stanje.konfig;
    zamijeni(
      uredjajEl,
      k
        ? h(
            'dl',
            { class: 'kv' },
            h('dt', {}, 'Naziv'),
            h('dd', {}, k.naziv),
            h('dt', {}, 'Servis'),
            h('dd', {}, hostServisa(k.url)),
            h('dt', {}, 'Token'),
            h('dd', {}, maskirajToken(k.token)),
            h('dt', {}, 'Zadnje povlačenje'),
            h('dd', {}, stanje.bootVrijeme ? kratkoVrijeme(stanje.bootVrijeme) : 'nikad'),
          )
        : h('div', { class: 'upozorenje jako' }, 'Uređaj nije uparen. Otvori link za uparivanje koji si dobio, ili ga zalijepi ispod.'),
      stanje.bootGreska && h('div', { class: 'upozorenje jako', role: 'alert' }, stanje.bootGreska),
      h(
        'div',
        { class: 'red' },
        k && testBtn,
        k &&
          h('button', {
            class: 'dugme opasno',
            onclick: async () => {
              if (await potvrdi('Odspojiti uređaj?', 'Uređaj više neće moći čitati ni pisati u tabelu dok se ponovo ne upari.', 'Odspoji')) {
                stanje.postaviKonfig(null);
                poruka('info', 'Uređaj je odspojen.');
              }
            },
          }, 'Odspoji'),
      ),
    );
  }

  function azurirajParametre() {
    const b = stanje.boot;
    if (!b) {
      zamijeni(parametriEl, h('p', { class: 'prigusen' }, stanje.bootUToku ? 'Učitavam...' : 'Postavke nisu učitane.'));
      return;
    }
    const smije = b.uredjaj.smije_mijenjati_postavke;
    const polja = new Map<string, HTMLInputElement>();
    const redovi = OZNAKE_POSTAVKI.map(([k, oznaka]) => {
      const v = b.postavke[k];
      if (!smije) return h('div', { class: 'racun-red' }, h('span', {}, oznaka), h('strong', {}, v === null || v === undefined ? 'nije upisano' : broj(uBroj(v), 2).replace(/,?0+$/, '')));
      const input = h('input', { id: `p-${k}`, type: 'text', inputmode: 'decimal', autocomplete: 'off', value: v === null || v === undefined ? '' : String(v).replace('.', ',') });
      polja.set(k, input);
      return h('div', { class: 'red-polja' }, h('label', { for: `p-${k}` }, oznaka), input);
    });
    const sacuvajBtn: HTMLButtonElement = h('button', { class: 'dugme primarno siroko', onclick: () => void sacuvajPostavke(b.postavke, polja, sacuvajBtn) }, 'Sačuvaj postavke');
    zamijeni(
      parametriEl,
      ...redovi,
      smije ? sacuvajBtn : h('p', { class: 'prigusen malo' }, 'Ovaj uređaj ne smije mijenjati postavke. Mijenjaju se sa uređaja koji ima pravo ili direktno u tabeli.'),
    );
  }

  async function sacuvajPostavke(stare: Postavke, polja: Map<string, HTMLInputElement>, dugme: HTMLButtonElement) {
    const izmjene: Record<string, number> = {};
    const opisi: string[] = [];
    for (const [k, input] of polja) {
      const n = parsirajBroj(input.value);
      const stara = uBroj(stare[k]);
      if (n === null && stara === null) continue;
      if (n === null || Number.isNaN(n)) {
        poruka('greska', `${OZNAKE_POSTAVKI.find((x) => x[0] === k)?.[1] ?? k}: upiši ispravan broj.`);
        input.focus();
        return;
      }
      if (n !== stara) {
        izmjene[k] = n;
        opisi.push(`${OZNAKE_POSTAVKI.find((x) => x[0] === k)?.[1] ?? k}: ${stara === null ? 'prazno' : broj(stara, 2)} -> ${broj(n, 2)}`);
      }
    }
    if (!opisi.length) {
      poruka('info', 'Nema izmjena.');
      return;
    }
    const ok = await potvrdi(
      'Promijeniti postavke za sve uređaje?',
      [h('ul', {}, ...opisi.map((o) => h('li', {}, o))), h('p', {}, 'Parametre izračuna mijenjaj samo prema uputi dijabetologa.')],
      'Sačuvaj',
    );
    if (!ok) return;
    await dokTraje(dugme, 'Čuvam...', async () => {
      try {
        await stanje.apiBezUpozorenja('saveSettings', { settings: izmjene });
        poruka('uspjeh', 'Postavke su sačuvane u tabelu.');
      } catch (e) {
        poruka('greska', `Postavke NISU sačuvane. ${e instanceof ApiGreska ? e.message : String(e)}`);
      }
      await stanje.osvjezi();
    });
  }

  // Parametri se crtaju iznova samo kad stignu novi podaci, da se ne izgubi ono što korisnik kuca.
  let prikazaniBoot: unknown = undefined;
  let prikazanoUToku = false;
  function azuriraj() {
    azurirajUredjaj();
    const uToku = !!stanje.bootUToku;
    if (stanje.boot !== prikazaniBoot || (!stanje.boot && uToku !== prikazanoUToku)) {
      prikazaniBoot = stanje.boot;
      prikazanoUToku = uToku;
      azurirajParametre();
    }
  }

  zamijeni(
    korijen,
    h('section', { class: 'kartica' }, h('h2', {}, 'Uređaj'), uredjajEl),
    h(
      'section',
      { class: 'kartica' },
      h('h2', {}, 'Uparivanje'),
      h('div', { class: 'red-polja' }, h('label', { for: 'pair' }, 'Link za uparivanje'), pairInput),
      h('button', {
        class: 'dugme obicno siroko',
        onclick: async () => {
          const r = procitajPair(pairInput.value);
          if (!r) {
            poruka('greska', 'U linku nema dijela "#pair=". Zalijepi cijeli link koji si dobio.');
            return;
          }
          if (!r.ok) {
            poruka('greska', r.poruka);
            return;
          }
          if (await upari(r.konfig)) pairInput.value = '';
        },
      }, 'Upari'),
    ),
    h('section', { class: 'kartica' }, h('h2', {}, 'Parametri izračuna (iz tabele)'), parametriEl),
    h('section', { class: 'kartica' }, h('h2', {}, 'Android omotač'), statusOmotaca()),
    h(
      'section',
      { class: 'kartica' },
      h('h2', {}, 'Link na tabelu'),
      h('div', { class: 'red-polja' }, h('label', { for: 'tabela' }, 'Adresa Google tabele (za Dnevnik)'), tabelaInput),
      h('button', {
        class: 'dugme obicno siroko',
        onclick: () => {
          const v = tabelaInput.value.trim();
          if (v && !/^https:\/\//.test(v)) {
            poruka('greska', 'Link mora počinjati sa https://');
            return;
          }
          stanje.postaviTabelaUrl(v);
          poruka('uspjeh', v ? 'Link na tabelu je sačuvan.' : 'Link na tabelu je uklonjen.');
        },
      }, 'Sačuvaj link'),
    ),
    h('p', { class: 'prigusen malo centar' }, `Verzija aplikacije ${VERZIJA_APP}`),
  );
  azuriraj();
  if (stanje.konfig && !stanje.boot && !stanje.bootUToku) void stanje.osvjezi();
  return stanje.pretplati(azuriraj);
}
