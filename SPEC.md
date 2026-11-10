# Bolus dnevnik - specifikacija

Verzija 0.2, 10.11.2026. Ovaj fajl ide u korijen repozitorija i referentni je dokument za sve faze razvoja.

Izmjene u odnosu na 0.1: Android omotač je osnovni put za šećer; 4-5 telefona pišu u istu tabelu; dodan grafikon šećera oko obroka; dodana provjera dvostrukog bolusa između uređaja.

## 1. Svrha i granice

Aplikacija za 4-5 Android telefona koji prate istu osobu. Bilježi sastav obroka (namirnica, gramaža, UH), trenutni šećer, računa preporuku bolusa, bilježi da li je inzulin dat i prikazuje krivu šećera oko obroka. Svi zapisi idu u jedan Google Sheet sa vremenskom oznakom i nazivom uređaja.

Aplikacija je kalkulator i dnevnik. Ne upravlja pumpom, ne šalje ništa prema medicinskim uređajima i nikad sama ne bilježi "dato" bez korisnikove potvrde. Parametre (UH odnos, FIA, ciljni šećer) unosi korisnik prema uputi dijabetologa.

## 2. Arhitektura

Tri dijela:

1. Web dio (`web/`): TypeScript + Vite, bez UI frameworka ili sa Preact. Sadrži sve ekrane, izračun i komunikaciju sa tabelom. Objavljuje se na GitHub Pages (HTTPS). Radi i u običnom Chromeu sa ručnim unosom šećera, što služi za razvoj i kao rezerva.
2. Android omotač (`android/`): Kotlin, minimalna aplikacija. Jedan ekran sa WebView-om koji učitava web dio sa GitHub Pages. Prima šećer od GlucoDataHandlera, čuva ga lokalno, šalje krivu šećera u tabelu u pozadini i predaje podatke web dijelu preko mosta.
3. Backend (`apps-script/`): Google Apps Script web app vezan za Google Sheet. Deploy: "Execute as: Me", pristup "Anyone". Autorizacija tokenom uređaja.

Pravila:

- U repozitoriju nema tajni, tokena, URL-a deploymenta ni zdravstvenih podataka. Keystore za potpisivanje je izvan repozitorija.
- Izračun doze postoji na jednom mjestu (`web/src/calc.ts`). Android kod ne računa doze.
- Web dio mora raditi i bez omotača (detekcija: postoji li `window.GlucoBridge`).

## 3. Izvor šećera

Interfejs u web dijelu: `getGlucose(): Promise<{ mmol: number, time: Date, source: 'gdh' | 'rucno' } | null>`

Adapteri:

1. `AndroidBridgeAdapter` (osnovni): čita `window.GlucoBridge.latest()` iz omotača.
2. `ManualAdapter`: ručni unos u mmol/L. Uvijek dostupan i ima prednost kad ga korisnik upiše.

U omotaču, dva moguća puta do šećera. Faza 1 utvrđuje koji radi na ciljnim telefonima:

- A) Broadcast: `BroadcastReceiver` deklarisan u manifestu za akciju `glucodata.Minute`. Extras: `glucodata.Minute.mgdl` (int, mg/dL), `glucodata.Minute.Time` (long, ms od epohe), `glucodata.Minute.Rate` (float, može biti NaN), `glucodata.Minute.SerialNumber` (string). Uslov: u GDH je uključeno prosljeđivanje broadcasta i odabrana naša aplikacija.
- B) Health Connect: čitanje zapisa šećera (BloodGlucoseRecord) koje GDH upisuje, uz korisnikovu dozvolu. Daje i historiju unazad.

Ako rade oba, A je primarni za trenutnu vrijednost, B služi za popunjavanje rupa u krivoj.

Konverzija: mmol/L = mg/dL / 18.016, zaokruženo na jednu decimalu tek pri prikazu.

Očitanje starije od N minuta (postavka, podrazumijevano 10) prikazuje se kao zastarjelo i ne ulazi u izračun dok ga korisnik ne potvrdi ili ne upiše ručno.

## 4. Android omotač

- `minSdk` i `targetSdk` odrediti u Fazi 1 prema verzijama Androida na ciljnim telefonima i zahtjevima Health Connecta.
- `MainActivity`: WebView, učitava URL web dijela. Navigacija van tog origina se otvara u vanjskom pregledniku. JavaScript most se izlaže samo stranici sa tog origina.
- `GlucoReceiver`: prijem broadcasta, validacija (mgdl 20-600, vrijeme ne u budućnosti više od 2 min), upis u lokalnu bazu. Bez ikakve mreže u receiveru.
- Lokalna baza (Room): tabela `ocitanja` (vrijeme_ms PRIMARY KEY, mgdl, izvor, poslano BOOLEAN). Čuva zadnjih 14 dana.
- `UploadWorker` (WorkManager, periodično 15 min + odmah nakon otvaranja aplikacije): šalje neposlana očitanja akcijom `saveGlucose`, označava ih poslanim tek nakon `ok`.
- Konfiguracija (URL servisa, token, naziv uređaja) u EncryptedSharedPreferences ili Android Keystore. Postavlja se uparivanjem (QR ili link).
- Most `window.GlucoBridge`:
  - `latest(): string` - JSON `{mgdl, time, rate, source}` ili `null`
  - `history(fromMs, toMs): string` - JSON niz `{mgdl, time}` iz lokalne baze
  - `status(): string` - JSON: verzija omotača, zadnje primljeno očitanje, broj neposlanih, stanje Health Connect dozvole, je li optimizacija baterije isključena
  - `getConfig(): string`, `setConfig(json)` - konfiguracija uređaja
  - `requestHealthConnect()`, `openBatterySettings()`
- Svi rezultati mosta su stringovi (JSON), jer WebView most prenosi samo jednostavne tipove.
- Ekran statusa u Postavkama prikazuje sve iz `status()` i upozorava ako zadnje očitanje kasni više od 15 min.

## 5. Model podataka (Google Sheet)

Vremenska zona tabele: Europe/Sarajevo. Vremena se šalju kao ISO 8601 sa offsetom.

`Obroci` (jedan red po unosu): `id` (UUID sa klijenta), `vrijeme_unosa`, `uredjaj`, `tip` (doručak/ručak/večera/užina/korekcija), `stavke_tekst`, `uh_ukupno_g`, `secer_mmol`, `secer_izvor` (gdh/rucno/nema), `secer_vrijeme`, `uh_odnos`, `fia`, `cilj_mmol`, `bolus_obrok`, `bolus_korekcija`, `preporuka_j`, `dato_j`, `inzulin_dat` (TRUE/FALSE), `vrijeme_potvrde`, `potvrdio_uredjaj`, `upozorenje_prihvaceno` (TRUE/FALSE), `napomena`, `verzija_app`

`Stavke`: `obrok_id`, `vrijeme_unosa`, `uredjaj`, `namirnica`, `gramaza_g`, `uh_na_100g`, `uh_g`

`Namirnice` (zajednička lista): `naziv`, `uh_na_100g`, `zadnja_gramaza_g`, `dodao_uredjaj`

`Postavke` (jedine važeće postavke za sve uređaje): `kljuc`, `vrijednost`, `izmijenjeno`, `izmijenio_uredjaj`

`Uredjaji`: `naziv`, `token`, `aktivan` (TRUE/FALSE), `smije_mijenjati_postavke` (TRUE/FALSE), `zadnji_kontakt`

`Secer`: `vrijeme`, `mgdl`, `mmol`, `uredjaj`. Jedan red po očitanju; duplikati sa više uređaja se odbacuju (vidi 6).

Parametri korišteni u izračunu upisuju se u svaki red obroka, tako da se stari unosi mogu provjeriti i nakon promjene postavki.

## 6. API (Apps Script)

POST zahtjevi idu kao `Content-Type: text/plain` sa JSON tijelom (izbjegava CORS preflight). Odgovor je JSON preko ContentService. Svaki zahtjev nosi `token`; server iz lista `Uredjaji` utvrđuje naziv uređaja i ažurira `zadnji_kontakt`. Neaktivan ili nepoznat token vraća `{ok:false, error:"auth"}` bez detalja. Svi upisi idu kroz LockService.

- `saveMeal {meal, items}` - upis u `Obroci` i `Stavke`; idempotentno po `id`.
- `confirm {id, dato_j, vrijeme_potvrde, force}` - potvrda inzulina. Prije upisa server traži drugi obrok sa `inzulin_dat=TRUE` i `vrijeme_potvrde` u zadnjih N minuta (postavka `prozor_dupli_bolus_min`, podrazumijevano 120). Ako postoji i `force` nije `true`, vraća `{ok:false, warning:"recent_bolus", uredjaj, dato_j, vrijeme}` i ništa ne upisuje. Sa `force:true` upisuje i postavlja `upozorenje_prihvaceno=TRUE`.
- `saveGlucose {readings:[{time, mgdl}]}` - upisuje samo očitanja čije vrijeme nije već u `Secer` (tolerancija 30 s). Vraća broj upisanih i preskočenih.
- `getGlucose {from, to}` - očitanja za prozor, sortirano po vremenu.
- `saveFood {food}`, `saveSettings {settings}` (odbija uređaje bez `smije_mijenjati_postavke`).
- `bootstrap` - postavke, namirnice, zadnjih 30 obroka, zadnji potvrđen bolus (sa bilo kojeg uređaja) i vrijeme servera.

Uparivanje novog uređaja: vlasnik doda red u `Uredjaji` sa novim tokenom; link oblika `https://<pages>/#pair=<base64 JSON {url, token, naziv}>` ili QR sa istim sadržajem. Podaci su iza `#` da ne bi završili u logovima servera.

## 7. Izračun

Ulazi: `uh_ukupno_g`, `secer_mmol` (može biti null), `uh_odnos` (g UH po 1 j.), `fia` (mmol/L po 1 j.), `cilj_mmol`, `korak`, `hipo_prag`, `max_doza`.

```
bolus_obrok     = uh_ukupno_g / uh_odnos
bolus_korekcija = secer_mmol == null ? 0 : (secer_mmol - cilj_mmol) / fia
sirovo          = max(0, bolus_obrok + bolus_korekcija)
preporuka_j     = zaokruzi(sirovo, korak)      // pravilo: vidi 12
```

Pravila:

- `secer_mmol < hipo_prag`: nema preporuke; poruka da se prvo riješi hipoglikemija. Unos hrane se i dalje može sačuvati.
- Šećer ispod cilja a iznad praga: korekcija je negativna i umanjuje bolus za obrok.
- Bez šećera: računa se samo bolus za obrok, jasno označeno.
- Prije prikaza preporuke klijent radi `bootstrap` i prikazuje zadnji potvrđen bolus sa bilo kojeg uređaja (doza, vrijeme, uređaj). Ako je unutar prozora iz 6, upozorenje je istaknuto. U v1 se aktivni inzulin ne oduzima automatski.
- Bez mreže ekran jasno kaže da podatak o zadnjem bolusu nije svjež i od kada je.
- Ekran uvijek prikazuje cijeli račun po stavkama.
- `dato_j` je zasebno polje, unaprijed popunjeno preporukom; korisnik ga može promijeniti. U tabelu idu i preporuka i stvarno data doza.
- Validacija: `uh_odnos > 0`, `fia > 0`, šećer 1-35 mmol/L, gramaža 0-2000 g, preporuka iznad `max_doza` (podrazumijevano 20 j.) traži dodatnu potvrdu.
- Postavke dolaze isključivo iz tabele; prikazuje se vrijeme zadnjeg povlačenja.

Kasnija faza, "aplikacija sama računa": kad je kvačica uključena, UH odnos i FIA se izvode po pravilu koje treba potvrditi (vidi 12).

## 8. Grafikon šećera oko obroka

- Dugme "Grafikon" na svakoj kartici u Dnevniku.
- X osa od -60 do +180 min u odnosu na `vrijeme_unosa`; Y osa mmol/L.
- Linija šećera; vertikalne oznake za unos obroka i potvrdu inzulina; osjenčan ciljni opseg (postavke `opseg_donji`, `opseg_gornji`); iznad grafikona UH, data doza, početni šećer, uređaj.
- Izvor podataka: `getGlucose` iz tabele. Ako omotač ima lokalna očitanja koja tabela još nema, spajaju se na klijentu bez duplikata.
- Rupe duže od 20 min se ne spajaju linijom. Prozor bez očitanja daje poruku umjesto praznog grafikona. Obrok mlađi od 3 h prikazuje krivu do sadašnjeg trenutka.
- Crta se SVG-om, bez biblioteke.

## 9. Ekrani

1. Novi obrok: kartica šećera (vrijednost, izvor, starost, ručni unos), zadnji bolus sa svih uređaja, lista stavki, ukupno UH, izračun po stavkama, polje "Dato jedinica", kvačica "Inzulin dat", dugme "Sačuvaj u tabelu".
2. Dodaj namirnicu: pretraga zajedničke liste, gramaža sa brzim dugmadima, UH na 100 g ili direktan unos UH.
3. Dnevnik: zadnji unosi sa svih uređaja, status potvrde, naknadna potvrda, dugme "Grafikon", link na tabelu.
4. Postavke: parametri izračuna (samo za čitanje na uređajima bez prava), status omotača (iz `status()`), uparivanje, test veze.

Jezik: bosanski. Decimalni unos prihvata zarez i tačku. Dodirne površine najmanje 44 px.

## 10. Faze

- Faza 0: priprema računara i naloga (bez koda).
- Faza 1: Android spike - minimalna aplikacija koja prima broadcast i čita Health Connect; test na jednom telefonu.
- Faza 2: Sheet + Apps Script API + testovi.
- Faza 3: modul izračuna sa testovima.
- Faza 4: web ekrani (ručni šećer), objava na GitHub Pages.
- Faza 5: pravi omotač - WebView, most, receiver, baza, upload, uparivanje, potpisivanje.
- Faza 6: grafikon.
- Faza 7: drugi do peti telefon, pregled koda, paralelna ručna provjera.

## 11. Testni slučajevi izračuna (minimum)

| UH g | šećer | odnos | FIA | cilj | korak | očekivano |
|---|---|---|---|---|---|---|
| 63 | 8.4 | 10 | 2.0 | 6.0 | 0.5 | obrok 6.3, korekcija 1.2, preporuka 7.5 |
| 63 | null | 10 | 2.0 | 6.0 | 0.5 | obrok 6.3, korekcija 0, preporuka 6.5, oznaka "bez šećera" |
| 30 | 4.5 | 10 | 2.0 | 6.0 | 0.5 | obrok 3.0, korekcija -0.75, sirovo 2.25; tačno na pola koraka, preporuka 2.0 ili 2.5 zavisno od pravila iz tačke 12 |
| 0 | 10.0 | 10 | 2.0 | 6.0 | 0.5 | preporuka 2.0 |
| 10 | 4.0 | 10 | 1.0 | 6.0 | 0.5 | sirovo -1.0, preporuka 0 |
| 40 | 3.5 | 10 | 2.0 | 6.0 | 0.5 | nema preporuke (hipo prag 3.9) |
| 40 | 7.0 | 0 | 2.0 | 6.0 | 0.5 | greška validacije |

Testovi servera (minimum): dupli `saveMeal`; `confirm` sa i bez prethodnog bolusa u prozoru; dva skoro istovremena `confirm` sa različitih uređaja; `saveGlucose` sa istim očitanjem sa dva uređaja; neaktivan token; `saveSettings` bez prava.

## 12. Otvorena pitanja

- Šta tačno znači FIA u terapiji i u kojim jedinicama se vodi.
- Da li se UH odnos vodi kao "g UH po 1 j." ili drugačije.
- Zaokruživanje: na najbliži korak ili uvijek naniže.
- Šta znači "aplikacija sama računa" (ukupna dnevna doza ili profili po dobu dana).
- Verzije Androida na svih pet telefona.
- Da li GDH na ciljnim telefonima prosljeđuje broadcast odabranoj aplikaciji i da li upisuje šećer u Health Connect (Faza 1).
