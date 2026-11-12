// Testovi API-ja (SPEC.md, kraj tačke 11). Pokretanje iz korijena repozitorija:
//   node apps-script/test-api.mjs
// Treba Node 18 ili noviji. Bez biblioteka.
//
// Testovi pišu u pravu tabelu, kao uređaji Test i Test2, sa vremenima 1-3 dana unazad.
// Nakon testiranja u Apps Script editoru pokreni cleanupTest().

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const env = ucitajEnv(join(dir, '.env'));
const API_URL = env.API_URL;
const T1 = env.TOKEN_TEST;
const T2 = env.TOKEN_TEST2;
const TN = env.TOKEN_NEAKTIVAN;

if (!API_URL || !T1 || !T2 || !TN) {
  console.error('U apps-script/.env nedostaje API_URL, TOKEN_TEST, TOKEN_TEST2 ili TOKEN_NEAKTIVAN.');
  process.exit(2);
}

function ucitajEnv(putanja) {
  let txt;
  try {
    txt = readFileSync(putanja, 'utf8');
  } catch {
    console.error(`Nema fajla ${putanja}. Napravi ga po uzoru na .env.example.`);
    process.exit(2);
  }
  const rez = {};
  for (const linija of txt.split(/\r?\n/)) {
    const m = linija.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) rez[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return rez;
}

async function poziv(token, action, tijelo = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token, action, ...tijelo }),
    redirect: 'follow',
  });
  const txt = await res.text();
  try {
    return JSON.parse(txt);
  } catch {
    throw new Error(
      `Odgovor nije JSON (HTTP ${res.status}). Najčešći uzrok: web app nije objavljen sa pristupom "Anyone" ` +
      `ili API_URL nije adresa koja završava sa /exec. Početak odgovora: ${txt.slice(0, 150)}`,
    );
  }
}

const H = 3600000;
const M = 60000;
// Slučajna baza 30-50 h unazad, da se ponovljena pokretanja rijetko preklapaju.
const BAZA = Date.now() - 30 * H - Math.floor(Math.random() * 20 * H);
const iso = (ms) => new Date(ms).toISOString();

function obrok(vrijemeMs, dodatno = {}) {
  return {
    id: 'test-' + randomUUID(),
    vrijeme_unosa: iso(vrijemeMs),
    tip: 'korekcija',
    uh_ukupno_g: 20,
    secer_mmol: 7.2,
    secer_izvor: 'rucno',
    secer_vrijeme: iso(vrijemeMs),
    preporuka_j: 2,
    napomena: 'TEST',
    verzija_app: 'test-api',
    ...dodatno,
  };
}
const stavke = [{ namirnica: 'Test hljeb', gramaza_g: 40, uh_na_100g: 50, uh_g: 20 }];

const rezultati = [];
async function test(naziv, fn) {
  try {
    await fn();
    rezultati.push([naziv, true]);
    console.log(`PROŠAO  ${naziv}`);
  } catch (e) {
    rezultati.push([naziv, false]);
    console.log(`PAO     ${naziv}\n        ${e.message}`);
  }
}
function provjeri(uslov, poruka, odgovor) {
  if (!uslov) throw new Error(poruka + (odgovor ? ` | odgovor: ${JSON.stringify(odgovor)}` : ''));
}

// ---------------------------------------------------------------- testovi

await test('neaktivan token se odbija', async () => {
  const r = await poziv(TN, 'bootstrap');
  provjeri(r.ok === false && r.error === 'auth', 'očekivano auth', r);
});

await test('nepoznat token se odbija', async () => {
  const r = await poziv('x'.repeat(64), 'bootstrap');
  provjeri(r.ok === false && r.error === 'auth', 'očekivano auth', r);
});

await test('bootstrap vraća uređaj i postavke', async () => {
  const r = await poziv(T1, 'bootstrap');
  provjeri(r.ok === true && r.uredjaj && r.uredjaj.naziv === 'Test', 'očekivan uređaj Test', r);
  provjeri(r.postavke && 'prozor_dupli_bolus_min' in r.postavke, 'nedostaju postavke', r);
  provjeri(Number(r.postavke.prozor_dupli_bolus_min) >= 60,
    'prozor_dupli_bolus_min mora biti bar 60 da bi testovi ispod imali smisla', r.postavke);
});

await test('dupli saveMeal ne pravi drugi red', async () => {
  const m = obrok(BAZA + 20 * H);
  const r1 = await poziv(T1, 'saveMeal', { meal: m, items: stavke });
  provjeri(r1.ok === true && !r1.duplikat, 'prvi upis nije uspio', r1);
  const r2 = await poziv(T1, 'saveMeal', { meal: m, items: stavke });
  provjeri(r2.ok === true && r2.duplikat === true, 'drugi upis nije prepoznat kao duplikat', r2);
});

await test('saveMeal odbija UH koji se ne slaže sa stavkama', async () => {
  const r = await poziv(T1, 'saveMeal', { meal: obrok(BAZA + 20 * H, { uh_ukupno_g: 35 }), items: stavke });
  provjeri(r.ok === false && r.error === 'validation', 'očekivana greška validacije', r);
});

let prviBolusId;
await test('confirm bez prethodnog bolusa u prozoru prolazi', async () => {
  const m = obrok(BAZA - 5 * M);
  provjeri((await poziv(T1, 'saveMeal', { meal: m, items: stavke })).ok, 'saveMeal nije uspio');
  const r = await poziv(T1, 'confirm', { id: m.id, dato_j: 2, vrijeme_potvrde: iso(BAZA) });
  provjeri(r.ok === true, 'confirm nije uspio (ako je warning, pokreni cleanupTest() pa ponovo)', r);
  prviBolusId = m.id;
});

await test('confirm sa bolusom drugog uređaja u prozoru vraća upozorenje, force upisuje', async () => {
  const m = obrok(BAZA + 25 * M);
  provjeri((await poziv(T2, 'saveMeal', { meal: m, items: stavke })).ok, 'saveMeal nije uspio');
  const r1 = await poziv(T2, 'confirm', { id: m.id, dato_j: 1.5, vrijeme_potvrde: iso(BAZA + 30 * M) });
  provjeri(r1.ok === false && r1.warning === 'recent_bolus', 'očekivano upozorenje recent_bolus', r1);
  provjeri(r1.uredjaj === 'Test' && r1.obrok_id === prviBolusId, 'upozorenje ne pokazuje pravi raniji bolus', r1);
  const r2 = await poziv(T2, 'confirm', { id: m.id, dato_j: 1.5, vrijeme_potvrde: iso(BAZA + 30 * M), force: true });
  provjeri(r2.ok === true && r2.upozorenje_prihvaceno === true, 'force nije upisao potvrdu', r2);
});

await test('ponovljen confirm istog obroka ne mijenja upis', async () => {
  const r = await poziv(T2, 'confirm', { id: prviBolusId, dato_j: 9, vrijeme_potvrde: iso(BAZA) });
  provjeri(r.ok === true && r.vec_potvrdjeno === true && Number(r.dato_j) === 2, 'očekivano vec_potvrdjeno sa dozom 2', r);
});

await test('dva skoro istovremena confirm sa različitih uređaja: tačno jedan prolazi', async () => {
  const t = BAZA + 8 * H;
  const a = obrok(t - 5 * M);
  const b = obrok(t - 4 * M);
  provjeri((await poziv(T1, 'saveMeal', { meal: a, items: stavke })).ok, 'saveMeal a nije uspio');
  provjeri((await poziv(T2, 'saveMeal', { meal: b, items: stavke })).ok, 'saveMeal b nije uspio');
  const [ra, rb] = await Promise.all([
    poziv(T1, 'confirm', { id: a.id, dato_j: 2, vrijeme_potvrde: iso(t) }),
    poziv(T2, 'confirm', { id: b.id, dato_j: 2, vrijeme_potvrde: iso(t + M) }),
  ]);
  const prosli = [ra, rb].filter((r) => r.ok === true).length;
  const upozoreni = [ra, rb].filter((r) => r.warning === 'recent_bolus').length;
  provjeri(prosli === 1 && upozoreni === 1, 'očekivan jedan ok i jedno upozorenje', { ra, rb });
});

await test('saveMeal sa inzulin_dat:true takođe provjerava raniji bolus', async () => {
  const t = BAZA + 8 * H + 20 * M;
  const r = await poziv(T2, 'saveMeal', {
    meal: obrok(t, { inzulin_dat: true, dato_j: 2, vrijeme_potvrde: iso(t) }), items: stavke,
  });
  provjeri(r.ok === false && r.warning === 'recent_bolus', 'očekivano upozorenje recent_bolus', r);
});

// Šećer: jedan red po 5-minutnom slotu (SPEC 5 i 6). Slotovi se biraju poravnati na 5 min,
// da test ne zavisi od toga gdje unutar slota padne slučajno vrijeme.
const SLOT = 5 * M;
const SLOT_A = Math.floor((BAZA + 14 * H) / SLOT) * SLOT;

await test('isto očitanje šećera sa dva uređaja upisuje se jednom (isti slot)', async () => {
  const r1 = await poziv(T1, 'saveGlucose', { readings: [{ time: iso(SLOT_A + 30000), mgdl: 140 }] });
  provjeri(r1.ok === true && r1.upisano === 1, 'prvo očitanje nije upisano', r1);
  // Drugi uređaj, isto očitanje sa vremenom pomjerenim 40 s, i dalje u istom slotu.
  const r2 = await poziv(T2, 'saveGlucose', { readings: [{ time: iso(SLOT_A + 70000), mgdl: 141 }] });
  provjeri(r2.ok === true && r2.upisano === 0 && r2.preskoceno === 1, 'drugo očitanje nije preskočeno', r2);
  const r3 = await poziv(T1, 'getGlucose', { from: iso(SLOT_A), to: iso(SLOT_A + SLOT - 1) });
  provjeri(r3.ok === true && r3.readings.length === 1 && r3.readings[0].mgdl === 140, 'getGlucose ne vraća tačno jedno očitanje', r3);
});

await test('očitanje u susjednom slotu se upisuje', async () => {
  // 10 s nakon granice slota: blizu prethodnog očitanja, ali novi slot.
  const r = await poziv(T2, 'saveGlucose', { readings: [{ time: iso(SLOT_A + SLOT + 10000), mgdl: 142 }] });
  provjeri(r.ok === true && r.upisano === 1 && r.preskoceno === 0, 'očitanje u novom slotu nije upisano', r);
});

await test('više očitanja istog slota u jednom zahtjevu: upisuje se najranije', async () => {
  const s = SLOT_A + 3 * SLOT;
  const r = await poziv(T1, 'saveGlucose', {
    readings: [
      { time: iso(s + 120000), mgdl: 152 },
      { time: iso(s + 0), mgdl: 150 },
      { time: iso(s + 60000), mgdl: 151 },
    ],
  });
  provjeri(r.ok === true && r.upisano === 1 && r.preskoceno === 2, 'očekivano 1 upisano i 2 preskočena', r);
  const g = await poziv(T1, 'getGlucose', { from: iso(s), to: iso(s + SLOT - 1) });
  provjeri(g.ok === true && g.readings.length === 1 && g.readings[0].mgdl === 150, 'nije upisano najranije očitanje', g);
});

await test('saveGlucose odbacuje očitanje starije od 7 dana', async () => {
  const r = await poziv(T1, 'saveGlucose', { readings: [{ time: iso(Date.now() - 8 * 24 * H), mgdl: 120 }] });
  provjeri(r.ok === true && r.odbaceno === 1 && r.upisano === 0, 'očekivano 1 odbačeno', r);
});

await test('saveGlucose odbacuje nemoguće vrijednosti', async () => {
  const r = await poziv(T1, 'saveGlucose', {
    readings: [{ time: iso(Date.now()), mgdl: 5 }, { time: iso(Date.now() + 10 * H), mgdl: 120 }],
  });
  provjeri(r.ok === true && r.odbaceno === 2 && r.upisano === 0, 'očekivano 2 odbačena', r);
});

await test('saveSettings bez prava se odbija', async () => {
  const r = await poziv(T2, 'saveSettings', { settings: { prozor_dupli_bolus_min: 120 } });
  provjeri(r.ok === false && r.error === 'forbidden', 'očekivano forbidden', r);
});

await test('saveSettings sa pravom upisuje (ista vrijednost, ništa se ne mijenja)', async () => {
  const b = await poziv(T1, 'bootstrap');
  const v = b.postavke.prozor_dupli_bolus_min;
  const r = await poziv(T1, 'saveSettings', { settings: { prozor_dupli_bolus_min: v } });
  provjeri(r.ok === true && Number(r.postavke.prozor_dupli_bolus_min) === Number(v), 'postavka nije upisana', r);
});

await test('saveSettings odbija nepoznat ključ', async () => {
  const r = await poziv(T1, 'saveSettings', { settings: { nesto: 1 } });
  provjeri(r.ok === false && r.error === 'validation', 'očekivana greška validacije', r);
});

const pali = rezultati.filter(([, ok]) => !ok).length;
console.log(`\n${rezultati.length - pali}/${rezultati.length} prošlo.`);
console.log('Za brisanje testnih redova pokreni cleanupTest() u Apps Script editoru.');
process.exit(pali ? 1 : 0);
