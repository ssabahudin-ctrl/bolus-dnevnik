/**
 * Bolus dnevnik - backend (Google Apps Script vezan za Google Sheet)
 * Implementira SPEC.md v0.2, tačke 5 i 6.
 *
 * Svi zahtjevi idu kao POST sa Content-Type: text/plain i JSON tijelom:
 *   { "token": "...", "action": "saveMeal" | "confirm" | "saveGlucose" | "getGlucose"
 *                               | "saveFood" | "saveSettings" | "bootstrap", ... }
 * Odgovor je uvijek JSON. Greške: { ok:false, error:"<kod>", poruka?:"..." }
 * Kodovi grešaka: bad_json, bad_request, busy, auth, forbidden, unknown_action,
 *                 validation, not_found, setup, server
 * Upozorenje dvostrukog bolusa: { ok:false, warning:"recent_bolus", ... } - ništa nije upisano.
 *
 * Funkcije koje se pokreću ručno iz editora: setup(), cleanupTest()
 */

const TZ = 'Europe/Sarajevo';
const VERZIJA_API = '0.2.0';

const SHEMA = {
  Obroci: ['id', 'vrijeme_unosa', 'uredjaj', 'tip', 'stavke_tekst', 'uh_ukupno_g',
    'secer_mmol', 'secer_izvor', 'secer_vrijeme', 'uh_odnos', 'fia', 'cilj_mmol',
    'bolus_obrok', 'bolus_korekcija', 'preporuka_j', 'dato_j', 'inzulin_dat',
    'vrijeme_potvrde', 'potvrdio_uredjaj', 'upozorenje_prihvaceno', 'napomena', 'verzija_app'],
  Stavke: ['obrok_id', 'vrijeme_unosa', 'uredjaj', 'namirnica', 'gramaza_g', 'uh_na_100g', 'uh_g'],
  Namirnice: ['naziv', 'uh_na_100g', 'zadnja_gramaza_g', 'dodao_uredjaj'],
  Postavke: ['kljuc', 'vrijednost', 'izmijenjeno', 'izmijenio_uredjaj'],
  Uredjaji: ['naziv', 'token', 'aktivan', 'smije_mijenjati_postavke', 'zadnji_kontakt'],
  Secer: ['vrijeme', 'mgdl', 'mmol', 'uredjaj'],
};

const TIPOVI_OBROKA = ['doručak', 'ručak', 'večera', 'užina', 'korekcija'];
const IZVORI_SECERA = ['gdh', 'rucno', 'nema'];

// Granice su provjere razumnosti unosa, ne terapijske preporuke.
const POSTAVKE = {
  uh_odnos: { tip: 'broj', min: 0.1, max: 100 },
  fia: { tip: 'broj', min: 0.1, max: 20 },
  cilj_mmol: { tip: 'broj', min: 3, max: 15 },
  korak: { tip: 'broj', min: 0.05, max: 2 },
  zaokruzivanje: { tip: 'izbor', vrijednosti: ['najblize', 'nanize'] },
  hipo_prag: { tip: 'broj', min: 2, max: 6 },
  max_doza: { tip: 'broj', min: 1, max: 100 },
  prozor_dupli_bolus_min: { tip: 'broj', min: 0, max: 600 },
  zastarjelo_min: { tip: 'broj', min: 1, max: 60 },
  opseg_donji: { tip: 'broj', min: 2, max: 15 },
  opseg_gornji: { tip: 'broj', min: 4, max: 25 },
};

// Samo tehničke vrijednosti iz SPEC.md. Terapijske postavke (uh_odnos, fia, cilj, korak,
// hipo_prag, opseg) ostaju prazne dok ih ne upiše korisnik.
const PODRAZUMIJEVANE = { prozor_dupli_bolus_min: 120, zastarjelo_min: 10, max_doza: 20 };

const SECER_MAX_STAROST_DANA = 3;   // starija očitanja server odbacuje
const SECER_REP_ZA_DUPLIKATE = 10000; // koliko zadnjih redova lista Secer se gleda za duplikate
const SECER_TOLERANCIJA_MS = 30000;
const SECER_MAX_PROZOR_H = 48;
const MS_MIN = 60000;

/* ---------------------------------------------------------------- ulaz */

function doGet() {
  return json_({ ok: true, servis: 'bolus-dnevnik', verzija: VERZIJA_API });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '');
  } catch (err) {
    return json_({ ok: false, error: 'bad_json' });
  }
  return json_(obradi_(req));
}

function obradi_(req) {
  if (!req || typeof req !== 'object' || Array.isArray(req)) return { ok: false, error: 'bad_request' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: 'busy' };
  try {
    const ss = SpreadsheetApp.getActive();
    const ur = autorizuj_(ss, req.token);
    if (!ur) return { ok: false, error: 'auth' };
    const akcije = {
      saveMeal: saveMeal_, confirm: confirm_, saveGlucose: saveGlucose_, getGlucose: getGlucose_,
      saveFood: saveFood_, saveSettings: saveSettings_, bootstrap: bootstrap_,
    };
    const f = Object.prototype.hasOwnProperty.call(akcije, req.action) ? akcije[req.action] : null;
    if (!f) return { ok: false, error: 'unknown_action' };
    const rez = f(ss, ur, req);
    SpreadsheetApp.flush();
    return rez;
  } catch (err) {
    if (err && err.kod) return { ok: false, error: err.kod, poruka: err.message };
    console.error(err && err.stack ? err.stack : err);
    return { ok: false, error: 'server' };
  } finally {
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function autorizuj_(ss, token) {
  if (typeof token !== 'string' || token.length < 20) return null;
  const sh = list_(ss, 'Uredjaji');
  const t = tabela_(sh);
  for (let i = 0; i < t.redovi.length; i++) {
    const r = t.redovi[i];
    if (r.token !== token) continue;
    if (r.aktivan !== true) return null;
    sh.getRange(i + 2, t.kol.zadnji_kontakt + 1).setValue(new Date());
    return { naziv: String(r.naziv), smijePostavke: r.smije_mijenjati_postavke === true };
  }
  return null;
}

/* ---------------------------------------------------------------- akcije */

function saveMeal_(ss, ur, req) {
  const m = req.meal && typeof req.meal === 'object' ? req.meal : {};
  const id = String(m.id || '');
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) throw greska_('validation', 'id nije ispravan');

  const shO = list_(ss, 'Obroci');
  const tabO = tabela_(shO);
  if (tabO.redovi.some(function (r) { return String(r.id) === id; })) {
    return { ok: true, id: id, duplikat: true };
  }

  const vrijemeUnosa = vrijeme_(m.vrijeme_unosa, 'vrijeme_unosa', true);
  const tip = String(m.tip || '');
  if (TIPOVI_OBROKA.indexOf(tip) < 0) throw greska_('validation', 'tip obroka nije ispravan');

  const items = Array.isArray(req.items) ? req.items : [];
  if (items.length > 50) throw greska_('validation', 'previše stavki');
  const stavke = items.map(function (it) {
    it = it || {};
    return {
      obrok_id: id,
      vrijeme_unosa: vrijemeUnosa,
      uredjaj: ur.naziv,
      namirnica: tekst_(it.namirnica, 'namirnica', 100, true),
      gramaza_g: broj_(it.gramaza_g, 'gramaza_g', 0, 2000, true),
      uh_na_100g: broj_(it.uh_na_100g, 'uh_na_100g', 0, 100, false),
      uh_g: broj_(it.uh_g, 'uh_g', 0, 500, true),
    };
  });

  const uhUkupno = broj_(m.uh_ukupno_g, 'uh_ukupno_g', 0, 1000, true);
  if (stavke.length) {
    const zbir = stavke.reduce(function (s, x) { return s + x.uh_g; }, 0);
    if (Math.abs(zbir - uhUkupno) > 0.5) throw greska_('validation', 'uh_ukupno_g se ne slaže sa zbirom stavki');
  }

  const secerIzvor = m.secer_izvor ? String(m.secer_izvor) : 'nema';
  if (IZVORI_SECERA.indexOf(secerIzvor) < 0) throw greska_('validation', 'secer_izvor nije ispravan');
  const secerMmol = broj_(m.secer_mmol, 'secer_mmol', 1, 35, secerIzvor !== 'nema');

  const inzulinDat = m.inzulin_dat === true;
  const datoJ = broj_(m.dato_j, 'dato_j', inzulinDat ? 0.05 : 0, 100, inzulinDat);
  const vrijemePotvrde = inzulinDat ? (vrijeme_(m.vrijeme_potvrde, 'vrijeme_potvrde', false) || new Date()) : null;

  let upozorenjePrihvaceno = false;
  if (inzulinDat) {
    const nedavni = nedavniBolus_(ss, vrijemePotvrde, id);
    if (nedavni) {
      if (req.force !== true) return Object.assign({ ok: false, warning: 'recent_bolus' }, nedavni);
      upozorenjePrihvaceno = true;
    }
  }

  const obrok = {
    id: id,
    vrijeme_unosa: vrijemeUnosa,
    uredjaj: ur.naziv,
    tip: tip,
    stavke_tekst: m.stavke_tekst
      ? tekst_(m.stavke_tekst, 'stavke_tekst', 1000, false)
      : stavke.map(function (s) { return s.namirnica + ' ' + s.gramaza_g + ' g'; }).join(', '),
    uh_ukupno_g: uhUkupno,
    secer_mmol: secerMmol,
    secer_izvor: secerIzvor,
    secer_vrijeme: vrijeme_(m.secer_vrijeme, 'secer_vrijeme', false),
    uh_odnos: broj_(m.uh_odnos, 'uh_odnos', 0.1, 100, false),
    fia: broj_(m.fia, 'fia', 0.1, 20, false),
    cilj_mmol: broj_(m.cilj_mmol, 'cilj_mmol', 3, 15, false),
    bolus_obrok: broj_(m.bolus_obrok, 'bolus_obrok', 0, 100, false),
    bolus_korekcija: broj_(m.bolus_korekcija, 'bolus_korekcija', -50, 100, false),
    preporuka_j: broj_(m.preporuka_j, 'preporuka_j', 0, 100, false),
    dato_j: datoJ,
    inzulin_dat: inzulinDat,
    vrijeme_potvrde: vrijemePotvrde,
    potvrdio_uredjaj: inzulinDat ? ur.naziv : null,
    upozorenje_prihvaceno: upozorenjePrihvaceno,
    napomena: tekst_(m.napomena, 'napomena', 500, false),
    verzija_app: tekst_(m.verzija_app, 'verzija_app', 40, false),
  };

  dodajRedove_(shO, [obrok]);
  dodajRedove_(list_(ss, 'Stavke'), stavke);
  return { ok: true, id: id, upozorenje_prihvaceno: upozorenjePrihvaceno };
}

function confirm_(ss, ur, req) {
  const id = String(req.id || '');
  const sh = list_(ss, 'Obroci');
  const tab = tabela_(sh);
  let idx = -1;
  for (let i = 0; i < tab.redovi.length; i++) {
    if (String(tab.redovi[i].id) === id) { idx = i; break; }
  }
  if (idx < 0) throw greska_('not_found', 'obrok ne postoji');
  const r = tab.redovi[idx];

  if (r.inzulin_dat === true) {
    return {
      ok: true, id: id, vec_potvrdjeno: true, dato_j: r.dato_j,
      vrijeme_potvrde: iso_(r.vrijeme_potvrde), potvrdio_uredjaj: r.potvrdio_uredjaj || null,
    };
  }

  const dat = req.inzulin_dat !== false; // inzulin_dat:false = korisnik označava da inzulin nije dat
  const vp = vrijeme_(req.vrijeme_potvrde, 'vrijeme_potvrde', false) || new Date();
  let datoJ = 0;
  let prihvaceno = false;
  if (dat) {
    datoJ = broj_(req.dato_j, 'dato_j', 0.05, 100, true);
    const nedavni = nedavniBolus_(ss, vp, id);
    if (nedavni) {
      if (req.force !== true) return Object.assign({ ok: false, warning: 'recent_bolus' }, nedavni);
      prihvaceno = true;
    }
  }

  postavi_(sh, tab.kol, idx + 2, {
    dato_j: datoJ, inzulin_dat: dat, vrijeme_potvrde: vp,
    potvrdio_uredjaj: ur.naziv, upozorenje_prihvaceno: prihvaceno,
  });
  return { ok: true, id: id, inzulin_dat: dat, upozorenje_prihvaceno: prihvaceno };
}

function saveGlucose_(ss, ur, req) {
  const ulaz = Array.isArray(req.readings) ? req.readings : [];
  if (ulaz.length > 2000) throw greska_('validation', 'previše očitanja u jednom zahtjevu (max 2000)');
  const sada = Date.now();
  const najstarije = sada - SECER_MAX_STAROST_DANA * 86400000;
  const validna = [];
  let odbaceno = 0;
  ulaz.forEach(function (o) {
    const t = new Date(o && o.time).getTime();
    const mg = Number(o && o.mgdl);
    if (!isFinite(t) || t < najstarije || t > sada + 2 * MS_MIN || !isFinite(mg) || mg < 20 || mg > 600) {
      odbaceno++;
      return;
    }
    validna.push({ t: t, mg: Math.round(mg) });
  });
  if (!validna.length) return { ok: true, upisano: 0, preskoceno: 0, odbaceno: odbaceno };

  const sh = list_(ss, 'Secer');
  const zadnji = sh.getLastRow();
  const n = Math.min(Math.max(zadnji - 1, 0), SECER_REP_ZA_DUPLIKATE);
  const postojeca = n
    ? sh.getRange(zadnji - n + 1, 1, n, 1).getValues()
      .map(function (r) { return r[0] instanceof Date ? r[0].getTime() : NaN; })
      .filter(function (x) { return isFinite(x); })
    : [];
  postojeca.sort(function (a, b) { return a - b; });
  validna.sort(function (a, b) { return a.t - b.t; });

  const novi = [];
  let preskoceno = 0;
  validna.forEach(function (v) {
    const i = donjaGranica_(postojeca, v.t - SECER_TOLERANCIJA_MS);
    if (i < postojeca.length && postojeca[i] <= v.t + SECER_TOLERANCIJA_MS) { preskoceno++; return; }
    postojeca.splice(donjaGranica_(postojeca, v.t), 0, v.t);
    novi.push(v);
  });

  dodajRedove_(sh, novi.map(function (v) {
    return { vrijeme: new Date(v.t), mgdl: v.mg, mmol: Math.round(v.mg / 18.016 * 10) / 10, uredjaj: ur.naziv };
  }));
  return { ok: true, upisano: novi.length, preskoceno: preskoceno, odbaceno: odbaceno };
}

function getGlucose_(ss, ur, req) {
  const od = new Date(req.from).getTime();
  const doo = new Date(req.to).getTime();
  if (!isFinite(od) || !isFinite(doo) || doo <= od) throw greska_('validation', 'from/to nisu ispravni');
  if (doo - od > SECER_MAX_PROZOR_H * 3600000) throw greska_('validation', 'prozor je duži od ' + SECER_MAX_PROZOR_H + ' h');
  const tab = tabela_(list_(ss, 'Secer'));
  const rez = tab.redovi
    .filter(function (r) {
      return r.vrijeme instanceof Date && r.vrijeme.getTime() >= od && r.vrijeme.getTime() <= doo;
    })
    .sort(function (a, b) { return a.vrijeme - b.vrijeme; })
    .map(function (r) {
      return { time: r.vrijeme.toISOString(), mgdl: r.mgdl, mmol: r.mmol, uredjaj: r.uredjaj };
    });
  return { ok: true, readings: rez };
}

function saveFood_(ss, ur, req) {
  const f = req.food && typeof req.food === 'object' ? req.food : {};
  const naziv = tekst_(f.naziv, 'naziv', 100, true);
  const uh = broj_(f.uh_na_100g, 'uh_na_100g', 0, 100, true);
  const gram = broj_(f.zadnja_gramaza_g, 'zadnja_gramaza_g', 0, 2000, false);
  const sh = list_(ss, 'Namirnice');
  const tab = tabela_(sh);
  const kljuc = naziv.replace(/^'/, '').toLowerCase();
  for (let i = 0; i < tab.redovi.length; i++) {
    if (String(tab.redovi[i].naziv).replace(/^'/, '').trim().toLowerCase() === kljuc) {
      const izmjene = { uh_na_100g: uh };
      if (gram !== null) izmjene.zadnja_gramaza_g = gram;
      postavi_(sh, tab.kol, i + 2, izmjene);
      return { ok: true, naziv: naziv, novo: false };
    }
  }
  dodajRedove_(sh, [{ naziv: naziv, uh_na_100g: uh, zadnja_gramaza_g: gram, dodao_uredjaj: ur.naziv }]);
  return { ok: true, naziv: naziv, novo: true };
}

function saveSettings_(ss, ur, req) {
  if (!ur.smijePostavke) return { ok: false, error: 'forbidden' };
  const s = req.settings && typeof req.settings === 'object' ? req.settings : {};
  const kljucevi = Object.keys(s);
  if (!kljucevi.length) throw greska_('validation', 'nema postavki');
  const vrijednosti = {};
  kljucevi.forEach(function (k) {
    const def = Object.prototype.hasOwnProperty.call(POSTAVKE, k) ? POSTAVKE[k] : null;
    if (!def) throw greska_('validation', 'nepoznata postavka: ' + k);
    if (def.tip === 'broj') {
      vrijednosti[k] = broj_(s[k], k, def.min, def.max, true);
    } else {
      if (def.vrijednosti.indexOf(s[k]) < 0) throw greska_('validation', k + ' nije ispravna vrijednost');
      vrijednosti[k] = s[k];
    }
  });
  const trenutne = postavke_(ss);
  const donji = vrijednosti.opseg_donji !== undefined ? vrijednosti.opseg_donji : trenutne.opseg_donji;
  const gornji = vrijednosti.opseg_gornji !== undefined ? vrijednosti.opseg_gornji : trenutne.opseg_gornji;
  if (donji != null && gornji != null && donji >= gornji) throw greska_('validation', 'opseg_donji mora biti manji od opseg_gornji');

  const sh = list_(ss, 'Postavke');
  const tab = tabela_(sh);
  const sada = new Date();
  const noviRedovi = [];
  kljucevi.forEach(function (k) {
    let i = -1;
    for (let j = 0; j < tab.redovi.length; j++) if (tab.redovi[j].kljuc === k) { i = j; break; }
    const izmjena = { kljuc: k, vrijednost: vrijednosti[k], izmijenjeno: sada, izmijenio_uredjaj: ur.naziv };
    if (i >= 0) postavi_(sh, tab.kol, i + 2, izmjena); else noviRedovi.push(izmjena);
  });
  dodajRedove_(sh, noviRedovi);
  return { ok: true, postavke: postavke_(ss) };
}

function bootstrap_(ss, ur) {
  const obroci = tabela_(list_(ss, 'Obroci')).redovi.filter(function (r) { return r.id !== ''; });
  obroci.sort(function (a, b) { return vrijemeMs_(b.vrijeme_unosa) - vrijemeMs_(a.vrijeme_unosa); });

  let zadnji = null;
  obroci.forEach(function (r) {
    if (r.inzulin_dat !== true || !(r.vrijeme_potvrde instanceof Date)) return;
    if (!zadnji || r.vrijeme_potvrde > zadnji.vrijeme_potvrde) zadnji = r;
  });

  return {
    ok: true,
    verzija_api: VERZIJA_API,
    server_vrijeme: new Date().toISOString(),
    uredjaj: { naziv: ur.naziv, smije_mijenjati_postavke: ur.smijePostavke },
    postavke: postavke_(ss),
    namirnice: tabela_(list_(ss, 'Namirnice')).redovi
      .filter(function (r) { return r.naziv !== ''; }).map(serializuj_),
    obroci: obroci.slice(0, 30).map(serializuj_),
    zadnji_bolus: zadnji ? {
      obrok_id: zadnji.id, dato_j: zadnji.dato_j, vrijeme: iso_(zadnji.vrijeme_potvrde),
      uredjaj: zadnji.potvrdio_uredjaj || zadnji.uredjaj,
    } : null,
  };
}

/* ---------------------------------------------------------------- logika */

// Traži potvrđen bolus na drugom obroku unutar prozora (u oba smjera od t).
function nedavniBolus_(ss, t, iskljuciId) {
  const p = postavke_(ss);
  const prozor = p.prozor_dupli_bolus_min != null ? p.prozor_dupli_bolus_min : PODRAZUMIJEVANE.prozor_dupli_bolus_min;
  if (!(prozor > 0)) return null;
  const tab = tabela_(list_(ss, 'Obroci'));
  let najblizi = null;
  tab.redovi.forEach(function (r) {
    if (String(r.id) === iskljuciId || r.inzulin_dat !== true || !(r.vrijeme_potvrde instanceof Date)) return;
    const razlika = Math.abs(r.vrijeme_potvrde.getTime() - t.getTime());
    if (razlika <= prozor * MS_MIN && (!najblizi || razlika < najblizi.razlika)) najblizi = { razlika: razlika, r: r };
  });
  if (!najblizi) return null;
  const r = najblizi.r;
  return {
    obrok_id: r.id, uredjaj: r.potvrdio_uredjaj || r.uredjaj, dato_j: r.dato_j,
    vrijeme: r.vrijeme_potvrde.toISOString(), prozor_min: prozor,
  };
}

function postavke_(ss) {
  const rez = {};
  tabela_(list_(ss, 'Postavke')).redovi.forEach(function (r) {
    if (r.kljuc === '') return;
    rez[r.kljuc] = r.vrijednost === '' ? null : r.vrijednost;
  });
  return rez;
}

/* ---------------------------------------------------------------- pomoćne */

function greska_(kod, poruka) {
  const e = new Error(poruka || kod);
  e.kod = kod;
  return e;
}

function list_(ss, ime) {
  const sh = ss.getSheetByName(ime);
  if (!sh) throw greska_('setup', 'nedostaje list ' + ime + ' - pokreni setup()');
  return sh;
}

function tabela_(sh) {
  const vals = sh.getDataRange().getValues();
  const zag = vals[0].map(String);
  const kol = {};
  zag.forEach(function (h, i) { kol[h] = i; });
  const redovi = vals.slice(1).map(function (r) {
    const o = {};
    zag.forEach(function (h, i) { o[h] = r[i]; });
    return o;
  });
  return { zag: zag, kol: kol, redovi: redovi };
}

function dodajRedove_(sh, objekti) {
  if (!objekti.length) return;
  const zag = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const redovi = objekti.map(function (o) {
    return zag.map(function (h) { return o[h] === undefined || o[h] === null ? '' : o[h]; });
  });
  sh.getRange(sh.getLastRow() + 1, 1, redovi.length, zag.length).setValues(redovi);
}

function postavi_(sh, kol, red, izmjene) {
  Object.keys(izmjene).forEach(function (k) {
    if (kol[k] === undefined) throw greska_('setup', 'nedostaje kolona ' + k + ' - pokreni setup()');
    const v = izmjene[k];
    sh.getRange(red, kol[k] + 1).setValue(v === null || v === undefined ? '' : v);
  });
}

function broj_(v, naziv, min, max, obavezan) {
  if (v === null || v === undefined || v === '') {
    if (obavezan) throw greska_('validation', naziv + ' nedostaje');
    return null;
  }
  if (typeof v === 'boolean' || typeof v === 'object') throw greska_('validation', naziv + ' nije broj');
  const n = typeof v === 'string' ? Number(v.trim().replace(',', '.')) : Number(v);
  if (!isFinite(n)) throw greska_('validation', naziv + ' nije broj');
  if ((min !== undefined && n < min) || (max !== undefined && n > max)) {
    throw greska_('validation', naziv + ' van dozvoljenog opsega (' + min + ' - ' + max + ')');
  }
  return n;
}

function vrijeme_(v, naziv, obavezan) {
  if (v === null || v === undefined || v === '') {
    if (obavezan) throw greska_('validation', naziv + ' nedostaje');
    return null;
  }
  const d = new Date(v);
  if (isNaN(d.getTime())) throw greska_('validation', naziv + ' nije ispravno vrijeme');
  if (d.getTime() > Date.now() + 5 * MS_MIN) throw greska_('validation', naziv + ' je u budućnosti');
  return d;
}

// Tekst koji počinje sa = + - @ Sheets bi protumačio kao formulu; apostrof to sprječava.
function tekst_(v, naziv, maxDuzina, obavezan) {
  const s = v === null || v === undefined ? '' : String(v).trim();
  if (!s) {
    if (obavezan) throw greska_('validation', naziv + ' nedostaje');
    return null;
  }
  if (s.length > maxDuzina) throw greska_('validation', naziv + ' je predug');
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function iso_(d) {
  return d instanceof Date ? d.toISOString() : (d === '' || d === undefined ? null : d);
}

function vrijemeMs_(d) {
  return d instanceof Date ? d.getTime() : 0;
}

function serializuj_(o) {
  const r = {};
  Object.keys(o).forEach(function (k) {
    const v = o[k];
    r[k] = v instanceof Date ? v.toISOString() : (v === '' ? null : v);
  });
  return r;
}

// Prvi indeks u sortiranom nizu a za koji je a[i] >= x.
function donjaGranica_(a, x) {
  let lo = 0, hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] < x) lo = mid + 1; else hi = mid;
  }
  return lo;
}

function noviToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

/* ---------------------------------------------------------------- ručno pokretanje */

/**
 * Kreira listove i zaglavlja koja nedostaju, upisuje ključeve postavki i testne uređaje.
 * Sigurno je pokrenuti više puta: ništa postojeće ne briše niti mijenja.
 */
function setup() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(TZ);

  Object.keys(SHEMA).forEach(function (ime) {
    const sh = ss.getSheetByName(ime) || ss.insertSheet(ime);
    const zag = SHEMA[ime];
    const lc = sh.getLastColumn();
    const postojece = lc ? sh.getRange(1, 1, 1, lc).getValues()[0].map(String).filter(String) : [];
    if (!postojece.length) {
      sh.getRange(1, 1, 1, zag.length).setValues([zag]);
    } else {
      const fali = zag.filter(function (h) { return postojece.indexOf(h) < 0; });
      if (fali.length) sh.getRange(1, postojece.length + 1, 1, fali.length).setValues([fali]);
    }
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
  });

  // Prazan početni list (Sheet1 / List 1) se briše.
  ss.getSheets().forEach(function (sh) {
    if (!SHEMA[sh.getName()] && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });

  const shP = ss.getSheetByName('Postavke');
  const postoje = tabela_(shP).redovi.map(function (r) { return r.kljuc; });
  dodajRedove_(shP, Object.keys(POSTAVKE)
    .filter(function (k) { return postoje.indexOf(k) < 0; })
    .map(function (k) {
      return {
        kljuc: k, vrijednost: PODRAZUMIJEVANE[k] !== undefined ? PODRAZUMIJEVANE[k] : '',
        izmijenjeno: new Date(), izmijenio_uredjaj: 'setup',
      };
    }));

  const shU = ss.getSheetByName('Uredjaji');
  [['Test', true, true], ['Test2', true, false], ['TestNeaktivan', false, false]].forEach(function (u) {
    const tab = tabela_(shU);
    const postojeci = tab.redovi.filter(function (r) { return r.naziv === u[0]; })[0];
    if (postojeci) {
      Logger.log('Uređaj %s već postoji, token: %s', u[0], postojeci.token);
      return;
    }
    const token = noviToken_();
    dodajRedove_(shU, [{ naziv: u[0], token: token, aktivan: u[1], smije_mijenjati_postavke: u[2] }]);
    const red = shU.getLastRow();
    shU.getRange(red, tab.kol.aktivan + 1, 1, 2).insertCheckboxes();
    Logger.log('Uređaj %s dodan, token: %s', u[0], token);
  });

  Logger.log('Setup završen. Terapijske postavke u listu Postavke su prazne dok ih ne upišeš.');
}

/**
 * Briše sve redove koje su napravili testni uređaji (naziv počinje sa "Test")
 * iz listova Obroci, Stavke, Secer i Namirnice. Postavke i Uredjaji se ne diraju.
 */
function cleanupTest() {
  const ss = SpreadsheetApp.getActive();
  const ciljevi = { Obroci: 'uredjaj', Stavke: 'uredjaj', Secer: 'uredjaj', Namirnice: 'dodao_uredjaj' };
  Object.keys(ciljevi).forEach(function (ime) {
    const sh = ss.getSheetByName(ime);
    if (!sh) return;
    const tab = tabela_(sh);
    let obrisano = 0;
    for (let i = tab.redovi.length - 1; i >= 0; i--) {
      if (/^Test/.test(String(tab.redovi[i][ciljevi[ime]]))) {
        sh.deleteRow(i + 2);
        obrisano++;
      }
    }
    Logger.log('%s: obrisano %s testnih redova', ime, obrisano);
  });
}
