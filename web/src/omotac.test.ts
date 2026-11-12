import { describe, expect, it } from 'vitest';
import { konfigIzOmotaca, parsirajStatus, upisiKonfigUOmotac, upozorenjaStatusa } from './omotac';
import { AndroidBridgeAdapter, MGDL_PO_MMOL, parsirajHistory, parsirajLatest, type GlucoBridgeApi } from './secer';

const SADA = new Date('2026-11-12T10:00:00Z');
const prije = (min: number) => SADA.getTime() - min * 60000;

function lazniMost(dio: Partial<GlucoBridgeApi> = {}): GlucoBridgeApi {
  return {
    latest: () => 'null',
    history: () => '[]',
    status: () => '{}',
    getConfig: () => 'null',
    setConfig: () => '{"ok":true}',
    openBatterySettings: () => {},
    ...dio,
  };
}

describe('latest() iz omotača', () => {
  it('mg/dL u mmol/L, vrijeme očitanja i izvor gdh', () => {
    const o = parsirajLatest(JSON.stringify({ mgdl: 151, time: prije(3), rate: -1.2, source: 'gdh' }));
    expect(o).toEqual({ mmol: 151 / MGDL_PO_MMOL, time: new Date(prije(3)), source: 'gdh' });
    expect(o!.mmol).toBeCloseTo(8.38, 2);
  });

  it('null, prazno i neispravno daju null', () => {
    for (const s of [null, undefined, '', 'null', '{', '[]', '{"mgdl":120}', '{"time":1}',
      '{"mgdl":"120","time":1}', '{"mgdl":120.5,"time":1}', '{"mgdl":10,"time":1}', '{"mgdl":601,"time":1}',
      '{"mgdl":120,"time":0}']) {
      expect(parsirajLatest(s)).toBeNull();
    }
  });

  it('adapter čita most; bez mosta vraća null', async () => {
    const most = lazniMost({ latest: () => JSON.stringify({ mgdl: 108, time: prije(1), rate: null, source: 'gdh' }) });
    expect((await new AndroidBridgeAdapter(most).getGlucose())?.source).toBe('gdh');
    expect(await new AndroidBridgeAdapter(null).getGlucose()).toBeNull();
    expect(await new AndroidBridgeAdapter(lazniMost()).getGlucose()).toBeNull();
  });

  it('history preskače neispravne elemente', () => {
    expect(parsirajHistory('[{"mgdl":100,"time":5},{"mgdl":"x","time":6},null,{"mgdl":110,"time":7}]')).toEqual([
      { mgdl: 100, time: new Date(5) },
      { mgdl: 110, time: new Date(7) },
    ]);
    expect(parsirajHistory('{}')).toEqual([]);
    expect(parsirajHistory('nije json')).toEqual([]);
  });

  it('adapter prosljeđuje prozor u ms', () => {
    let pozvano: number[] = [];
    const most = lazniMost({ history: (a, b) => ((pozvano = [a, b]), '[]') });
    new AndroidBridgeAdapter(most).history(new Date(1000), new Date(2000));
    expect(pozvano).toEqual([1000, 2000]);
  });
});

describe('status() omotača', () => {
  const dobar = {
    verzija: '0.5.0 (1)',
    zadnje_ocitanje: { time: prije(2), mgdl: 140 },
    zadnji_prijem: prije(2),
    neposlano: 3,
    odbijeno: 0,
    zadnje_odbijanje: null,
    ocitanja_24h: 1300,
    najveca_rupa_24h_min: 4.5,
    baterija_bez_ogranicenja: true,
    zadnje_slanje: prije(10),
    zadnji_pokusaj_slanja: prije(10),
    greska_slanja: null,
    prestaro_neposlano: 0,
    upareno: true,
  };

  it('parsira sva polja', () => {
    const s = parsirajStatus(JSON.stringify(dobar))!;
    expect(s.zadnjeOcitanje).toEqual({ time: new Date(prije(2)), mgdl: 140 });
    expect(s.neposlano).toBe(3);
    expect(s.najvecaRupa24hMin).toBe(4.5);
    expect(s.baterijaBezOgranicenja).toBe(true);
    expect(s.zadnjeSlanje).toEqual(new Date(prije(10)));
    expect(upozorenjaStatusa(s, SADA)).toEqual([]);
  });

  it('neispravan status daje null', () => {
    expect(parsirajStatus('null')).toBeNull();
    expect(parsirajStatus('x')).toBeNull();
    expect(parsirajStatus(null)).toBeNull();
  });

  it('upozorava kad zadnje očitanje kasni više od 15 min', () => {
    const s = (min: number) => parsirajStatus(JSON.stringify({ ...dobar, zadnje_ocitanje: { time: prije(min), mgdl: 140 } }))!;
    expect(upozorenjaStatusa(s(15), SADA)).toEqual([]);
    expect(upozorenjaStatusa(s(16), SADA)[0]).toContain('kasni 16 min');
  });

  it('upozorava bez očitanja, uz uključenu optimizaciju baterije i grešku slanja', () => {
    const s = parsirajStatus(JSON.stringify({ ...dobar, zadnje_ocitanje: null, baterija_bez_ogranicenja: false, greska_slanja: 'Server: auth' }))!;
    const u = upozorenjaStatusa(s, SADA);
    expect(u).toHaveLength(3);
    expect(u[0]).toContain('nijedno očitanje');
    expect(u[1]).toContain('baterije');
    expect(u[2]).toContain('Server: auth');
  });
});

describe('konfiguracija u omotaču', () => {
  const k = { url: 'https://script.google.com/macros/s/x/exec', token: 'a'.repeat(24), naziv: 'Telefon 1' };

  it('čita ispravnu, odbacuje neispravnu', () => {
    expect(konfigIzOmotaca(lazniMost({ getConfig: () => JSON.stringify(k) }))).toEqual(k);
    expect(konfigIzOmotaca(lazniMost({ getConfig: () => 'null' }))).toBeNull();
    expect(konfigIzOmotaca(lazniMost({ getConfig: () => '{"url":"http://x/"}' }))).toBeNull();
    expect(konfigIzOmotaca(lazniMost({ getConfig: () => { throw new Error('x'); } }))).toBeNull();
  });

  it('upis šalje JSON ili "null" i javlja odbijanje', () => {
    const poslano: string[] = [];
    const most = lazniMost({ setConfig: (s) => (poslano.push(s), '{"ok":true}') });
    upisiKonfigUOmotac(most, k);
    upisiKonfigUOmotac(most, null);
    expect(poslano).toEqual([JSON.stringify(k), 'null']);
    expect(() => upisiKonfigUOmotac(lazniMost({ setConfig: () => '{"ok":false,"error":"Token nije ispravan."}' }), k)).toThrow('Token nije ispravan.');
    expect(() => upisiKonfigUOmotac(lazniMost({ setConfig: () => 'null' }), k)).toThrow();
  });
});
