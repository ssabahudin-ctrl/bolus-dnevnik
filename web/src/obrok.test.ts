import { describe, expect, it } from 'vitest';
import {
  izracunajObrok,
  napraviObrok,
  noviNacrt,
  potvrdiInzulin,
  provjeriDato,
  sacuvajObrok,
  secerZaIzracun,
  ukupnoUh,
  uhStavke,
  type Nacrt,
  type PozivApi,
} from './obrok';
import { AndroidBridgeAdapter, ManualAdapter, getGlucose } from './secer';
import type { Postavke } from './tipovi';

const POSTAVKE: Postavke = { uh_odnos: 10, fia: 2, cilj_mmol: 6, korak: 0.5, hipo_prag: 3.9, max_doza: 20 };
const SADA = new Date('2026-11-12T08:00:00+01:00');
const min = (m: number) => new Date(SADA.getTime() - m * 60000);

function nacrt(izmjene: Partial<Nacrt> = {}): Nacrt {
  return {
    ...noviNacrt('test-1234-5678'),
    tip: 'ručak',
    stavke: [
      { namirnica: 'Hljeb', gramaza_g: 60, uh_na_100g: 50, uh_g: 30 },
      { namirnica: 'Jabuka', gramaza_g: 150, uh_na_100g: 22, uh_g: 33 },
    ],
    ...izmjene,
  };
}

describe('stavke', () => {
  it('UH stavke i ukupno bez decimalnog šuma', () => {
    expect(uhStavke(150, 22)).toBe(33);
    expect(uhStavke(70, 0.1)).toBe(0.07);
    expect(ukupnoUh([{ namirnica: 'a', gramaza_g: 1, uh_na_100g: null, uh_g: 0.1 }, { namirnica: 'b', gramaza_g: 1, uh_na_100g: null, uh_g: 0.2 }])).toBe(0.3);
  });
});

describe('šećer za izračun', () => {
  it('svježe očitanje ulazi', () => {
    expect(secerZaIzracun({ mmol: 8.4, time: min(3), source: 'rucno' }, SADA, 10, null)).toEqual({
      mmol: 8.4, izvor: 'rucno', vrijeme: min(3),
    });
  });

  it('zastarjelo ne ulazi dok se ne potvrdi', () => {
    const o = { mmol: 8.4, time: min(12), source: 'gdh' as const };
    expect(secerZaIzracun(o, SADA, 10, null)).toBeNull();
    expect(secerZaIzracun(o, SADA, 10, min(11).getTime())).toBeNull(); // potvrda drugog očitanja
    expect(secerZaIzracun(o, SADA, 10, o.time.getTime())).not.toBeNull();
  });

  it('nema očitanja', () => {
    expect(secerZaIzracun(null, SADA, 10, null)).toBeNull();
  });

  it('ručni unos ima prednost, AndroidBridgeAdapter je zasad prazan', async () => {
    const m = new ManualAdapter();
    const most = new AndroidBridgeAdapter();
    expect(await getGlucose(m, most)).toBeNull();
    m.postavi(7.1, min(1));
    expect(await getGlucose(m, most)).toEqual({ mmol: 7.1, time: min(1), source: 'rucno' });
    m.obrisi();
    expect(await getGlucose(m, null)).toBeNull();
  });

  it('AndroidBridgeAdapter se koristi samo ako postoji GlucoBridge', () => {
    expect(AndroidBridgeAdapter.dostupan({})).toBe(false);
    expect(AndroidBridgeAdapter.dostupan({ GlucoBridge: {} })).toBe(true);
  });
});

describe('dato', () => {
  it('bez kvačice "Inzulin dat" doza se ne upisuje', () => {
    expect(provjeriDato(nacrt({ inzulinDat: false, datoTekst: '7,5' }), 20)).toEqual({ ok: true, dato: null, iznadMax: false });
  });

  it('sa kvačicom doza je obavezna, zarez radi', () => {
    expect(provjeriDato(nacrt({ inzulinDat: true, datoTekst: '' }), 20).ok).toBe(false);
    expect(provjeriDato(nacrt({ inzulinDat: true, datoTekst: '7,5' }), 20)).toEqual({ ok: true, dato: 7.5, iznadMax: false });
    expect(provjeriDato(nacrt({ inzulinDat: true, datoTekst: '0' }), 20).ok).toBe(false);
    expect(provjeriDato(nacrt({ inzulinDat: true, datoTekst: '7,5j' }), 20).ok).toBe(false);
  });

  it('iznad max_doze traži dodatnu potvrdu', () => {
    expect(provjeriDato(nacrt({ inzulinDat: true, datoTekst: '21' }), 20)).toEqual({ ok: true, dato: 21, iznadMax: true });
  });
});

describe('napraviObrok', () => {
  it('upisuje tačno ono što je izračunato i prikazano', () => {
    const n = nacrt({ inzulinDat: true, datoTekst: '7' });
    const secer = { mmol: 8.4, izvor: 'rucno' as const, vrijeme: min(2) };
    const rez = izracunajObrok(n, secer, POSTAVKE);
    if (!rez.ok) throw new Error('izračun');
    const m = napraviObrok(n, rez, secer, POSTAVKE, 7, SADA);
    expect(m).toMatchObject({
      id: 'test-1234-5678',
      tip: 'ručak',
      stavke_tekst: 'Hljeb 60 g, Jabuka 150 g',
      uh_ukupno_g: 63,
      secer_mmol: 8.4,
      secer_izvor: 'rucno',
      uh_odnos: 10,
      fia: 2,
      cilj_mmol: 6,
      bolus_obrok: 6.3,
      bolus_korekcija: 1.2,
      preporuka_j: 7.5,
      dato_j: 7,
      inzulin_dat: true,
    });
    expect(m.vrijeme_unosa).toMatch(/^2026-11-12T\d\d:00:00[+-]\d\d:\d\d$/);
    expect(m.vrijeme_potvrde).toBe(m.vrijeme_unosa);
  });

  it('bez šećera: izvor nema, bez korekcije', () => {
    const n = nacrt();
    const rez = izracunajObrok(n, null, POSTAVKE);
    if (!rez.ok) throw new Error('izračun');
    const m = napraviObrok(n, rez, null, POSTAVKE, null, SADA);
    expect(m).toMatchObject({ secer_mmol: null, secer_izvor: 'nema', secer_vrijeme: null, preporuka_j: 6, dato_j: null, inzulin_dat: false, vrijeme_potvrde: null });
  });

  it('postavke sa zarezom iz tabele se upisuju kao brojevi', () => {
    const p = { ...POSTAVKE, fia: '2,5' };
    const n = nacrt();
    const rez = izracunajObrok(n, null, p);
    if (!rez.ok) throw new Error('izračun');
    expect(napraviObrok(n, rez, null, p, null, SADA).fia).toBe(2.5);
  });

  it('bez postavki iz tabele nema izračuna', () => {
    const rez = izracunajObrok(nacrt(), null, null);
    expect(rez.ok).toBe(false);
  });
});

const UPOZORENJE = {
  ok: false, warning: 'recent_bolus', obrok_id: 'drugi', uredjaj: 'Tatin telefon', dato_j: 4,
  vrijeme: '2026-11-12T06:30:00.000Z', prozor_min: 120,
};

function lazniApi(odgovori: unknown[]): { api: PozivApi; pozivi: { action: string; tijelo: Record<string, unknown> }[] } {
  const pozivi: { action: string; tijelo: Record<string, unknown> }[] = [];
  const api: PozivApi = async (action, tijelo) => {
    pozivi.push({ action, tijelo });
    if (!odgovori.length) throw new Error('nema više odgovora');
    return odgovori.shift();
  };
  return { api, pozivi };
}

describe('sacuvajObrok', () => {
  const meal = { id: 'x', inzulin_dat: true, dato_j: 7, vrijeme_potvrde: '2026-11-12T08:00:00+01:00' };

  it('bez upozorenja: jedan poziv', async () => {
    const { api, pozivi } = lazniApi([{ ok: true, id: 'x', upozorenje_prihvaceno: false }]);
    const r = await sacuvajObrok(api, meal, [], async () => 'odustani');
    expect(r).toEqual({ status: 'sacuvano', inzulinUpisan: true, upozorenjePrihvaceno: false, duplikat: false });
    expect(pozivi).toHaveLength(1);
  });

  it('recent_bolus pa "upiši ipak": drugi poziv sa force:true', async () => {
    const { api, pozivi } = lazniApi([UPOZORENJE, { ok: true, id: 'x', upozorenje_prihvaceno: true }]);
    let pitano: unknown = null;
    const r = await sacuvajObrok(api, meal, [], async (u) => {
      pitano = u;
      return 'force';
    });
    expect(pitano).toEqual(UPOZORENJE);
    expect(r).toMatchObject({ status: 'sacuvano', upozorenjePrihvaceno: true });
    expect(pozivi[1]!.tijelo.force).toBe(true);
    expect(pozivi[1]!.tijelo.meal).toEqual(meal);
  });

  it('recent_bolus pa "bez inzulina": obrok bez doze i potvrde', async () => {
    const { api, pozivi } = lazniApi([UPOZORENJE, { ok: true, id: 'x' }]);
    const r = await sacuvajObrok(api, meal, [], async () => 'bez_inzulina');
    expect(r).toMatchObject({ status: 'sacuvano', inzulinUpisan: false });
    expect(pozivi[1]!.tijelo.force).toBeUndefined();
    expect(pozivi[1]!.tijelo.meal).toMatchObject({ inzulin_dat: false, dato_j: null, vrijeme_potvrde: null });
  });

  it('recent_bolus pa "odustani": ništa se ne upisuje', async () => {
    const { api, pozivi } = lazniApi([UPOZORENJE]);
    expect(await sacuvajObrok(api, meal, [], async () => 'odustani')).toEqual({ status: 'odustao' });
    expect(pozivi).toHaveLength(1);
  });

  it('mrežna greška se ne guta', async () => {
    const api: PozivApi = async () => {
      throw new Error('Nema veze');
    };
    await expect(sacuvajObrok(api, meal, [], async () => 'force')).rejects.toThrow('Nema veze');
  });
});

describe('potvrdiInzulin', () => {
  it('recent_bolus pa force', async () => {
    const { api, pozivi } = lazniApi([UPOZORENJE, { ok: true, id: 'x', inzulin_dat: true, upozorenje_prihvaceno: true }]);
    const r = await potvrdiInzulin(api, 'x', 3.5, SADA, async () => 'force');
    expect(r).toEqual({ status: 'potvrdjeno', upozorenjePrihvaceno: true });
    expect(pozivi.map((p) => p.tijelo.force)).toEqual([undefined, true]);
    expect(pozivi[0]!.tijelo).toMatchObject({ id: 'x', dato_j: 3.5, inzulin_dat: true });
  });

  it('recent_bolus pa odustani', async () => {
    const { api, pozivi } = lazniApi([UPOZORENJE]);
    expect(await potvrdiInzulin(api, 'x', 3.5, SADA, async () => 'odustani')).toEqual({ status: 'odustao' });
    expect(pozivi).toHaveLength(1);
  });

  it('već potvrđeno sa drugog uređaja', async () => {
    const { api } = lazniApi([{ ok: true, id: 'x', vec_potvrdjeno: true, dato_j: 4, potvrdio_uredjaj: 'Tata' }]);
    expect(await potvrdiInzulin(api, 'x', 3.5, SADA, async () => 'force')).toEqual({
      status: 'vec_potvrdjeno', dato_j: 4, potvrdio: 'Tata',
    });
  });
});
