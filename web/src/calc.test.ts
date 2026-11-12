import { describe, expect, it } from 'vitest';
import { izracunaj, parsirajBroj, zaokruziNanize, type RezultatIzracuna, type UlazIzracuna } from './calc';

// Zajednički parametri iz tabele u SPEC.md tačka 11.
const OSNOVA: UlazIzracuna = {
  uh_ukupno_g: 0,
  secer_mmol: null,
  uh_odnos: 10,
  fia: 2.0,
  cilj_mmol: 6.0,
  korak: 0.5,
  hipo_prag: 3.9,
  max_doza: 20,
};

function ulaz(izmjene: Partial<UlazIzracuna>): UlazIzracuna {
  return { ...OSNOVA, ...izmjene };
}

type Uspjeh = Extract<RezultatIzracuna, { ok: true }>;
type Neuspjeh = Extract<RezultatIzracuna, { ok: false }>;

function uspjeh(r: RezultatIzracuna): Uspjeh {
  if (!r.ok) throw new Error('očekivan uspjeh, greške: ' + JSON.stringify(r.greske));
  return r;
}

function neuspjeh(r: RezultatIzracuna): Neuspjeh {
  if (r.ok) throw new Error('očekivana greška validacije, rezultat: ' + JSON.stringify(r));
  return r;
}

function kodovi(r: Uspjeh): string[] {
  return r.upozorenja.map((u) => u.kod);
}

describe('tabela iz SPEC.md tačka 11 (zaokruživanje uvijek naniže)', () => {
  it('63 g, šećer 8.4: obrok 6.3, korekcija 1.2, preporuka 7.5', () => {
    const r = uspjeh(izracunaj(ulaz({ uh_ukupno_g: 63, secer_mmol: 8.4 })));
    expect(r.bolus_obrok).toBeCloseTo(6.3, 9);
    expect(r.bolus_korekcija).toBeCloseTo(1.2, 9);
    expect(r.sirovo).toBeCloseTo(7.5, 9);
    expect(r.preporuka).toBe(7.5);
    expect(r.upozorenja).toEqual([]);
  });

  it('63 g, bez šećera: obrok 6.3, korekcija 0, preporuka 6.0, oznaka "bez šećera"', () => {
    const r = uspjeh(izracunaj(ulaz({ uh_ukupno_g: 63, secer_mmol: null })));
    expect(r.bolus_obrok).toBeCloseTo(6.3, 9);
    expect(r.bolus_korekcija).toBe(0);
    expect(r.preporuka).toBe(6.0);
    expect(kodovi(r)).toEqual(['bez_secera']);
  });

  it('30 g, šećer 4.5: obrok 3.0, korekcija -0.75, sirovo 2.25, preporuka 2.0', () => {
    const r = uspjeh(izracunaj(ulaz({ uh_ukupno_g: 30, secer_mmol: 4.5 })));
    expect(r.bolus_obrok).toBeCloseTo(3.0, 9);
    expect(r.bolus_korekcija).toBeCloseTo(-0.75, 9);
    expect(r.sirovo).toBeCloseTo(2.25, 9);
    expect(r.preporuka).toBe(2.0);
  });

  it('0 g, šećer 10.0: preporuka 2.0', () => {
    const r = uspjeh(izracunaj(ulaz({ uh_ukupno_g: 0, secer_mmol: 10.0 })));
    expect(r.bolus_obrok).toBe(0);
    expect(r.bolus_korekcija).toBeCloseTo(2.0, 9);
    expect(r.preporuka).toBe(2.0);
  });

  it('10 g, šećer 4.0, FIA 1.0: zbir -1.0, sirovo 0, preporuka 0', () => {
    const r = uspjeh(izracunaj(ulaz({ uh_ukupno_g: 10, secer_mmol: 4.0, fia: 1.0 })));
    expect(r.bolus_obrok).toBeCloseTo(1.0, 9);
    expect(r.bolus_korekcija).toBeCloseTo(-2.0, 9);
    expect(r.zbir).toBeCloseTo(-1.0, 9);
    expect(r.sirovo).toBe(0);
    expect(r.preporuka).toBe(0);
  });

  it('40 g, šećer 3.5 (ispod hipo praga 3.9): nema preporuke', () => {
    const r = uspjeh(izracunaj(ulaz({ uh_ukupno_g: 40, secer_mmol: 3.5 })));
    expect(r.preporuka).toBeNull();
    expect(kodovi(r)).toContain('hipoglikemija');
  });

  it('UH odnos 0: greška validacije', () => {
    const r = neuspjeh(izracunaj(ulaz({ uh_ukupno_g: 40, secer_mmol: 7.0, uh_odnos: 0 })));
    expect(r.greske.map((g) => g.polje)).toContain('uh_odnos');
  });
});

describe('zarez kao decimalni separator', () => {
  it('prihvata zarez u svim poljima, isti rezultat kao sa tačkom', () => {
    const sTackom = uspjeh(izracunaj(ulaz({ uh_ukupno_g: 63, secer_mmol: 8.4 })));
    const sZarezom = uspjeh(
      izracunaj({
        uh_ukupno_g: '63',
        secer_mmol: '8,4',
        uh_odnos: '10',
        fia: '2,0',
        cilj_mmol: '6,0',
        korak: '0,5',
        hipo_prag: '3,9',
        max_doza: '20',
      }),
    );
    expect(sZarezom).toEqual(sTackom);
  });

  it('prihvata razmake oko broja i tačku u stringu', () => {
    const r = uspjeh(izracunaj(ulaz({ uh_ukupno_g: ' 30 ', secer_mmol: ' 4.5 ' })));
    expect(r.preporuka).toBe(2.0);
  });

  it('parsirajBroj', () => {
    expect(parsirajBroj('8,4')).toBe(8.4);
    expect(parsirajBroj('8.4')).toBe(8.4);
    expect(parsirajBroj(8.4)).toBe(8.4);
    expect(parsirajBroj(' 12 ')).toBe(12);
    expect(parsirajBroj('-0,75')).toBe(-0.75);
    expect(parsirajBroj('')).toBeNull();
    expect(parsirajBroj('   ')).toBeNull();
    expect(parsirajBroj(null)).toBeNull();
    expect(parsirajBroj(undefined)).toBeNull();
    // Dvosmisleno ili nevaljano: ne pogađamo, nego odbijamo.
    expect(parsirajBroj('1.234,5')).toBeNaN();
    expect(parsirajBroj('1,2,3')).toBeNaN();
    expect(parsirajBroj('8,4 mmol')).toBeNaN();
    expect(parsirajBroj('abc')).toBeNaN();
    expect(parsirajBroj(',')).toBeNaN();
    expect(parsirajBroj('1e3')).toBeNaN();
    expect(parsirajBroj(Number.NaN)).toBeNaN();
    expect(parsirajBroj(Number.POSITIVE_INFINITY)).toBeNaN();
  });

  it('nevaljan tekst u polju je greška validacije za to polje', () => {
    const r = neuspjeh(izracunaj(ulaz({ uh_ukupno_g: '63', secer_mmol: '8,4,1' })));
    expect(r.greske.map((g) => g.polje)).toEqual(['secer_mmol']);
  });
});

describe('null i prazan šećer', () => {
  it('prazan string znači bez šećera', () => {
    const r = uspjeh(izracunaj(ulaz({ uh_ukupno_g: 63, secer_mmol: '' })));
    expect(r.bolus_korekcija).toBe(0);
    expect(r.preporuka).toBe(6.0);
    expect(kodovi(r)).toEqual(['bez_secera']);
  });

  it('undefined znači bez šećera', () => {
    const r = uspjeh(izracunaj(ulaz({ uh_ukupno_g: 63, secer_mmol: undefined })));
    expect(kodovi(r)).toEqual(['bez_secera']);
  });

  it('bez šećera nema hipo provjere ni negativne korekcije', () => {
    const r = uspjeh(izracunaj(ulaz({ uh_ukupno_g: 5, secer_mmol: null })));
    expect(r.bolus_korekcija).toBe(0);
    expect(r.preporuka).toBe(0.5);
  });
});

describe('koraci 0.5 i 1.0', () => {
  it.each([
    // [UH g, šećer, korak, očekivana preporuka]
    [63, 8.4, 0.5, 7.5],
    [63, 8.4, 1.0, 7],
    [63, null, 0.5, 6.0],
    [63, null, 1.0, 6],
    [30, 4.5, 0.5, 2.0],
    [30, 4.5, 1.0, 2],
    [49, null, 0.5, 4.5],
    [49, null, 1.0, 4],
    [50, null, 1.0, 5],
    [9, null, 1.0, 0],
  ])('%s g, šećer %s, korak %s: preporuka %s', (uh, secer, korak, ocekivano) => {
    const r = uspjeh(izracunaj(ulaz({ uh_ukupno_g: uh, secer_mmol: secer, korak })));
    expect(r.preporuka).toBe(ocekivano);
  });

  it('preporuka nikad nije veća od sirovog izračuna', () => {
    for (let uh = 0; uh <= 200; uh += 7) {
      for (const secer of [null, 4.2, 6.0, 7.7, 12.3, 19.9]) {
        for (const korak of [0.5, 1.0]) {
          const r = uspjeh(izracunaj(ulaz({ uh_ukupno_g: uh, secer_mmol: secer, korak, max_doza: 100 })));
          expect(r.preporuka).not.toBeNull();
          expect(r.preporuka!).toBeLessThanOrEqual(r.sirovo + 1e-9);
          expect(r.sirovo - r.preporuka!).toBeLessThan(korak);
        }
      }
    }
  });

  it('korak 0 ili negativan je greška validacije', () => {
    expect(neuspjeh(izracunaj(ulaz({ uh_ukupno_g: 10, korak: 0 }))).greske.map((g) => g.polje)).toEqual(['korak']);
    expect(neuspjeh(izracunaj(ulaz({ uh_ukupno_g: 10, korak: -0.5 }))).greske.map((g) => g.polje)).toEqual(['korak']);
  });
});

describe('greške decimalnog računa', () => {
  it('(6.3 - 6.0) / 0.1 daje 2.9999999999999982, preporuka mora biti 3.0, ne 2.5', () => {
    // Bez tolerancije bi floor(2.9999999999999982 / 0.5) dao 5, tj. 2.5 j.
    const r = uspjeh(izracunaj(ulaz({ uh_ukupno_g: 0, secer_mmol: 6.3, cilj_mmol: 6.0, fia: 0.1 })));
    expect(r.preporuka).toBe(3.0);
  });

  it('0.1 + 0.2 u ulazima ne kvari rezultat', () => {
    // 0.3 g UH / 0.1 g po j. = 2.9999999999999996
    const r = uspjeh(izracunaj(ulaz({ uh_ukupno_g: 0.3, uh_odnos: 0.1, korak: 1.0 })));
    expect(r.preporuka).toBe(3);
  });

  it('preporuka je čist broj, bez ostataka poput 7.000000000000001', () => {
    for (let uh = 0; uh <= 150; uh += 3) {
      const r = uspjeh(izracunaj(ulaz({ uh_ukupno_g: uh, secer_mmol: 8.7, uh_odnos: 7, fia: 1.7, korak: 0.5 })));
      const p = r.preporuka!;
      expect(Number.isInteger(p * 2)).toBe(true);
      expect(String(p)).toMatch(/^\d+(\.5)?$/);
    }
  });

  it('međurezultati nemaju decimalni šum', () => {
    const r = uspjeh(izracunaj(ulaz({ uh_ukupno_g: 63, secer_mmol: 8.4 })));
    // (8.4 - 6.0) / 2 u JavaScriptu daje 1.2000000000000002
    expect(r.bolus_korekcija).toBe(1.2);
    expect(r.zbir).toBe(7.5);
    expect(r.sirovo).toBe(7.5);
  });

  it('zaokruziNanize', () => {
    expect(zaokruziNanize(2.25, 0.5)).toBe(2.0);
    // Stvarno ispod višekratnika (1e-6): ide naniže.
    expect(zaokruziNanize(2.499999, 0.5)).toBe(2.0);
    // Ispod višekratnika manje od 1e-9 (decimalni šum): računa se kao višekratnik.
    expect(zaokruziNanize(2.4999999999, 0.5)).toBe(2.5);
    expect(zaokruziNanize(2.4999999999999996, 0.5)).toBe(2.5);
    expect(zaokruziNanize(2.5, 0.5)).toBe(2.5);
    expect(zaokruziNanize(7.9, 1)).toBe(7);
    expect(zaokruziNanize(0, 0.5)).toBe(0);
    expect(zaokruziNanize(0.49, 0.5)).toBe(0);
  });
});

describe('max_doza', () => {
  it('preporuka iznad max_doze daje upozorenje, ali preporuka ostaje', () => {
    // 210 g / 10 = 21 j.
    const r = uspjeh(izracunaj(ulaz({ uh_ukupno_g: 210, secer_mmol: 6.0 })));
    expect(r.preporuka).toBe(21);
    expect(kodovi(r)).toEqual(['iznad_max_doze']);
  });

  it('preporuka tačno jednaka max_dozi nema upozorenje', () => {
    const r = uspjeh(izracunaj(ulaz({ uh_ukupno_g: 200, secer_mmol: 6.0 })));
    expect(r.preporuka).toBe(20);
    expect(r.upozorenja).toEqual([]);
  });

  it('gleda se zaokružena preporuka, ne sirovo', () => {
    // sirovo 20.4, preporuka 20.0: nije iznad max_doze 20
    const r = uspjeh(izracunaj(ulaz({ uh_ukupno_g: 204, secer_mmol: 6.0 })));
    expect(r.sirovo).toBeCloseTo(20.4, 9);
    expect(r.preporuka).toBe(20);
    expect(r.upozorenja).toEqual([]);
  });

  it('max_doza iz postavki sa zarezom', () => {
    const r = uspjeh(izracunaj(ulaz({ uh_ukupno_g: 120, secer_mmol: 6.0, max_doza: '10,5' })));
    expect(r.preporuka).toBe(12);
    expect(kodovi(r)).toEqual(['iznad_max_doze']);
  });

  it('bez šećera i iznad max_doze: oba upozorenja', () => {
    const r = uspjeh(izracunaj(ulaz({ uh_ukupno_g: 250, secer_mmol: null })));
    expect(kodovi(r).sort()).toEqual(['bez_secera', 'iznad_max_doze']);
  });
});

describe('hipoglikemija', () => {
  it('šećer tačno na hipo pragu nije hipo', () => {
    const r = uspjeh(izracunaj(ulaz({ uh_ukupno_g: 40, secer_mmol: 3.9 })));
    expect(r.preporuka).not.toBeNull();
    expect(kodovi(r)).not.toContain('hipoglikemija');
  });

  it('kod hipo se međurezultati i dalje vraćaju, za prikaz računa', () => {
    const r = uspjeh(izracunaj(ulaz({ uh_ukupno_g: 40, secer_mmol: 3.5 })));
    expect(r.bolus_obrok).toBeCloseTo(4.0, 9);
    expect(r.bolus_korekcija).toBeCloseTo(-1.25, 9);
    expect(r.preporuka).toBeNull();
    expect(kodovi(r)).toEqual(['hipoglikemija']);
  });

  it('šećer ispod cilja a iznad praga: negativna korekcija umanjuje bolus', () => {
    const r = uspjeh(izracunaj(ulaz({ uh_ukupno_g: 40, secer_mmol: 5.0 })));
    expect(r.bolus_korekcija).toBeCloseTo(-0.5, 9);
    expect(r.preporuka).toBe(3.5);
  });
});

describe('validacija', () => {
  it.each([
    ['uh_odnos', { uh_odnos: 0 }],
    ['uh_odnos', { uh_odnos: -10 }],
    ['fia', { fia: 0 }],
    ['fia', { fia: -2 }],
    ['secer_mmol', { secer_mmol: 0.9 }],
    ['secer_mmol', { secer_mmol: 35.1 }],
    ['uh_ukupno_g', { uh_ukupno_g: -1 }],
    ['uh_ukupno_g', { uh_ukupno_g: '' }],
    ['uh_ukupno_g', { uh_ukupno_g: null }],
    ['cilj_mmol', { cilj_mmol: null }],
    ['hipo_prag', { hipo_prag: '' }],
    ['max_doza', { max_doza: 0 }],
    ['korak', { korak: 'pola' }],
  ] as const)('%s nevaljan: %j', (polje, izmjena) => {
    const r = neuspjeh(izracunaj(ulaz({ uh_ukupno_g: 40, secer_mmol: 7.0, ...izmjena })));
    expect(r.greske.map((g) => g.polje)).toEqual([polje]);
    expect(r.greske[0]!.poruka.length).toBeGreaterThan(0);
  });

  it('šećer tačno 1 i tačno 35 je dozvoljen', () => {
    expect(izracunaj(ulaz({ uh_ukupno_g: 0, secer_mmol: 1 })).ok).toBe(true);
    expect(izracunaj(ulaz({ uh_ukupno_g: 0, secer_mmol: 35 })).ok).toBe(true);
  });

  it('vraća sve greške odjednom', () => {
    const r = neuspjeh(izracunaj(ulaz({ uh_ukupno_g: 'x', uh_odnos: 0, fia: 0 })));
    expect(r.greske.map((g) => g.polje).sort()).toEqual(['fia', 'uh_odnos', 'uh_ukupno_g']);
  });

  it('poruke za korisnika nemaju em ni en crtice', () => {
    const r = neuspjeh(izracunaj(ulaz({ uh_ukupno_g: -1, uh_odnos: 0, fia: 0, secer_mmol: 99, korak: 0 })));
    const ok = uspjeh(izracunaj(ulaz({ uh_ukupno_g: 250, secer_mmol: null })));
    const hipo = uspjeh(izracunaj(ulaz({ uh_ukupno_g: 40, secer_mmol: 3.5 })));
    const sviTekstovi = [...r.greske, ...ok.upozorenja, ...hipo.upozorenja].map((x) => x.poruka).join(' ');
    expect(sviTekstovi).not.toMatch(/[–—]/);
  });
});
