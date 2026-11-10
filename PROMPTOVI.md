# Promptovi po fazama

Svaku fazu počni sa /clear. Prvo uđi u plan mode (Shift+Tab dok ne piše plan mode), zalijepi prompt, pročitaj plan, ispravi ga ako treba, pa tek onda odobri izvršenje.

## Faza 1 - Android spike

```
Pročitaj SPEC.md, tačke 3, 4 i 10, i CLAUDE.md. Napravi u folderu spike/android minimalnu Android aplikaciju u Kotlinu (Gradle, Kotlin DSL), bez WebView-a. Ona treba da:
1) ima BroadcastReceiver deklarisan u manifestu za akciju glucodata.Minute, koji svako primljeno očitanje (svi extras, sirovo) upisuje u mali lokalni log;
2) ima dugme koje traži dozvolu za čitanje šećera iz Health Connecta i ispisuje očitanja iz zadnjih 6 sati (vrijeme, vrijednost, jedinica, izvorna aplikacija);
3) na jednom ekranu prikazuje: zadnjih 20 primljenih broadcastova, rezultat Health Connecta, verziju Androida i model telefona;
4) ima dugme "Kopiraj izvještaj" koje sve to kopira kao tekst.
Prije pisanja koda provjeri na mom računaru da li postoje Java i Android SDK i reci mi šta fali. Na kraju mi daj tačne korake: kako napraviti APK, kako ga prebaciti na telefon preko USB-a i šta da podesim u GlucoDataHandler da šalje broadcast ovoj aplikaciji.
```

Nakon testa na telefonu:

```
Ovo je izvještaj iz spike aplikacije sa telefona: [ZALIJEPI]. Analiziraj: radi li broadcast, radi li Health Connect, u kojem razmaku stižu očitanja, koliko historije daje Health Connect. Predloži izmjene SPEC.md tačke 3 i 4 i minSdk. Ništa ne mijenjaj dok ne potvrdim.
```

## Faza 2 - Google Sheet i Apps Script

```
Pročitaj SPEC.md, tačke 5 i 6, i CLAUDE.md. U folderu apps-script/ napiši Code.gs koji implementira cijeli API. Dodaj funkciju setup() koja kreira sve listove i zaglavlja ako ne postoje i u Uredjaji dodaje jedan uređaj "Test" sa nasumičnim tokenom koji ispiše u log. Napiši apps-script/test-api.mjs (Node, bez biblioteka) koji testira sve slučajeve iz kraja tačke 11. URL i token čita iz apps-script/.env. Na kraju mi daj korake: gdje zalijepiti kod, kako pokrenuti setup(), kako objaviti kao web app i šta upisati u .env.
```

## Faza 3 - izračun

```
Pročitaj SPEC.md, tačke 7 i 11, i CLAUDE.md. U folderu web/ postavi Vite + TypeScript + Vitest. Napiši web/src/calc.ts kao čistu funkciju bez DOM-a i mreže, koja vraća i međurezultate (bolus_obrok, bolus_korekcija, sirovo, preporuka, lista upozorenja). Prvo napiši testove iz tabele u tački 11 i rubne slučajeve (zarez kao decimalni separator, null šećer, koraci 0.5 i 1.0, max_doza), pa tek onda implementaciju. Pravilo zaokruživanja je [NAJBLIŽI KORAK / UVIJEK NANIŽE]. Pazi na greške decimalnog računa.
```

## Faza 4 - web ekrani

```
Pročitaj SPEC.md, tačke 2, 3, 6, 7 i 9, i CLAUDE.md. Napravi u web/ četiri ekrana iz tačke 9, za širinu 360-430 px. Šećer se u ovoj fazi unosi ručno kroz ManualAdapter, ali napravi interfejs getGlucose i prazan AndroidBridgeAdapter koji se koristi samo ako postoji window.GlucoBridge. Izračun ide isključivo kroz calc.ts. Implementiraj bootstrap, saveMeal, confirm sa obradom warning:"recent_bolus" (dijalog sa uređajem, dozom i vremenom, pa ponovni zahtjev sa force:true), saveFood, uparivanje preko #pair= linka. Bez tihih neuspjeha: svaka greška mreže se prikaže. Podesi GitHub Actions da web/ objavljuje na GitHub Pages pri pushu na main.
```

## Faza 5 - Android omotač

```
Pročitaj SPEC.md, tačke 2, 3 i 4, CLAUDE.md i zaključke iz Faze 1 u SPEC.md. Napravi pravi omotač u android/ (ne diraj spike/). Implementiraj sve iz tačke 4: MainActivity sa WebView-om ograničenim na naš origin, GlucoReceiver, Room bazu, UploadWorker, konfiguraciju u šifrovanom skladištu, most GlucoBridge sa svim metodama i uparivanje (kad WebView otvori #pair= link, omotač preuzme konfiguraciju). Dopuni AndroidBridgeAdapter u web/ i dodaj status omotača u Postavke. Napiši unit testove za validaciju očitanja i za logiku "šta je neposlano". Podesi potpisivanje release builda iz keystore.properties izvan gita i napiši mi komandu za generisanje keystore-a. Na kraju mi daj kontrolnu listu podešavanja za svaki telefon (GDH, dozvole, optimizacija baterije).
```

## Faza 6 - grafikon

```
Pročitaj SPEC.md, tačku 8, i CLAUDE.md. Implementiraj grafikon u web/ prema tački 8, koristeći getGlucose iz tabele i GlucoBridge.history() kad postoji. Testovi: spajanje bez duplikata, prozor preko ponoći, obrok mlađi od 3 h, rupa duža od 20 min, prazan prozor.
```

## Faza 7 - pregled

```
Uradi pregled cijelog koda (web/, android/, apps-script/) kao da ga vidiš prvi put. Traži mjesta gdje se doza može prikazati ili upisati pogrešno (zaokruživanje, zarez/tačka, zastarjeli šećer, dupli upis, dvostruki bolus sa dva telefona, promjena postavki usred unosa, rad bez mreže), tihe neuspjehe, i sve što u tabelu upisuje vrijednost koju korisnik nije vidio. Za svaki nalaz daj scenarij i prijedlog popravke. Ništa ne mijenjaj dok ne potvrdim listu.
```
