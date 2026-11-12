import { describe, expect, it } from 'vitest';
import { ApiGreska, pozovi } from './api';

const KONFIG = { url: 'https://script.google.com/macros/s/X/exec', token: 't'.repeat(40), naziv: 'Test' };

function lazniFetch(odgovor: () => Promise<Response>, zahtjevi: RequestInit[] = []): typeof fetch {
  return (async (_url: RequestInfo | URL, init?: RequestInit) => {
    zahtjevi.push(init ?? {});
    return odgovor();
  }) as typeof fetch;
}

const json = (o: unknown, status = 200) => async () => new Response(JSON.stringify(o), { status });

async function greska(p: Promise<unknown>): Promise<ApiGreska> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiGreska) return e;
    throw e;
  }
  throw new Error('očekivana ApiGreska');
}

describe('pozovi', () => {
  it('šalje text/plain POST sa tokenom i akcijom', async () => {
    const zahtjevi: RequestInit[] = [];
    const r = await pozovi(KONFIG, 'bootstrap', { a: 1 }, { fetchFn: lazniFetch(json({ ok: true, x: 2 }), zahtjevi) });
    expect(r).toEqual({ ok: true, x: 2 });
    expect(zahtjevi[0]!.method).toBe('POST');
    expect((zahtjevi[0]!.headers as Record<string, string>)['Content-Type']).toMatch(/^text\/plain/);
    expect(JSON.parse(zahtjevi[0]!.body as string)).toEqual({ a: 1, token: KONFIG.token, action: 'bootstrap' });
  });

  it('upozorenje recent_bolus se vraća, ne baca', async () => {
    const u = { ok: false, warning: 'recent_bolus', uredjaj: 'Tata', dato_j: 4, vrijeme: '2026-11-12T07:00:00.000Z' };
    const r = await pozovi(KONFIG, 'confirm', {}, { fetchFn: lazniFetch(json(u)) });
    expect(r).toEqual(u);
  });

  it('bez konfiguracije: nije_uparen', async () => {
    expect((await greska(pozovi(null, 'bootstrap'))).kod).toBe('nije_uparen');
  });

  it('mrežna greška', async () => {
    const f = lazniFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    const e = await greska(pozovi(KONFIG, 'bootstrap', {}, { fetchFn: f }));
    expect(e.kod).toBe('mreza');
    expect(e.message).toMatch(/Nema veze/);
  });

  it('timeout', async () => {
    const f = ((_u: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
      })) as typeof fetch;
    const e = await greska(pozovi(KONFIG, 'bootstrap', {}, { fetchFn: f, timeoutMs: 10 }));
    expect(e.kod).toBe('timeout');
  });

  it('HTTP greška', async () => {
    const e = await greska(pozovi(KONFIG, 'bootstrap', {}, { fetchFn: lazniFetch(json({}, 500)) }));
    expect(e.kod).toBe('http');
    expect(e.message).toMatch(/500/);
  });

  it('odgovor koji nije JSON (npr. Google stranica za prijavu)', async () => {
    const f = lazniFetch(async () => new Response('<html>Sign in</html>', { status: 200 }));
    expect((await greska(pozovi(KONFIG, 'bootstrap', {}, { fetchFn: f }))).kod).toBe('nije_json');
  });

  it.each([
    ['auth', /nije prepoznat/],
    ['forbidden', /nema pravo/],
    ['busy', /zauzet/],
    ['server', /Greška na serveru/],
    ['nesto_novo', /nesto_novo/],
  ])('greška servera %s ima poruku za korisnika', async (kod, poruka) => {
    const e = await greska(pozovi(KONFIG, 'bootstrap', {}, { fetchFn: lazniFetch(json({ ok: false, error: kod })) }));
    expect(e.kod).toBe(kod);
    expect(e.message).toMatch(poruka);
  });

  it('validation prenosi detalj servera', async () => {
    const f = lazniFetch(json({ ok: false, error: 'validation', poruka: 'gramaza_g van dozvoljenog opsega' }));
    const e = await greska(pozovi(KONFIG, 'saveMeal', {}, { fetchFn: f }));
    expect(e.message).toMatch(/gramaza_g van dozvoljenog opsega/);
  });
});
