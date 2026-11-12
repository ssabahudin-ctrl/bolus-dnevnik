import { describe, expect, it } from 'vitest';
import { maskirajToken, procitajPair } from './konfig';

const KONFIG = { url: 'https://script.google.com/macros/s/ABC/exec', token: 'a'.repeat(64), naziv: 'Mamin telefon' };

function b64tekst(t: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(t)));
}

function b64(o: unknown, urlSafe = false): string {
  const s = b64tekst(JSON.stringify(o));
  return urlSafe ? s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : s;
}

describe('procitajPair', () => {
  it('čita hash #pair=', () => {
    expect(procitajPair('#pair=' + b64(KONFIG))).toEqual({ ok: true, konfig: KONFIG });
  });

  it('čita cijeli zalijepljen link, base64url bez paddinga i UTF-8 naziv', () => {
    const k = { ...KONFIG, naziv: 'Tatin telefon čćžšđ' };
    const link = 'https://primjer.github.io/bolus-dnevnik/#pair=' + b64(k, true);
    expect(procitajPair(link)).toEqual({ ok: true, konfig: k });
  });

  it('čita URL-enkodiran base64', () => {
    expect(procitajPair('#pair=' + encodeURIComponent(b64(KONFIG)))).toEqual({ ok: true, konfig: KONFIG });
  });

  it('bez pair parametra vraća null', () => {
    expect(procitajPair('')).toBeNull();
    expect(procitajPair('#obrok')).toBeNull();
    expect(procitajPair('https://primjer.github.io/')).toBeNull();
  });

  it.each([
    ['oštećen base64', '#pair=%%%'],
    ['nije JSON', '#pair=' + b64tekst('nije json')],
    ['http umjesto https', '#pair=' + b64({ ...KONFIG, url: 'http://script.google.com/x' })],
    ['kratak token', '#pair=' + b64({ ...KONFIG, token: 'kratko' })],
    ['bez naziva', '#pair=' + b64({ ...KONFIG, naziv: '  ' })],
    ['niz umjesto objekta', '#pair=' + b64([1, 2])],
  ])('odbija: %s', (_opis, hash) => {
    const r = procitajPair(hash);
    expect(r && r.ok).toBe(false);
  });
});

describe('maskirajToken', () => {
  it('ne prikazuje cijeli token', () => {
    expect(maskirajToken('abcd1234567890wxyz')).toBe('abcd...wxyz');
    expect(maskirajToken('kratko')).toBe('****');
  });
});
