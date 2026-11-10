# Upute za Claude Code u ovom repozitoriju

- Specifikacija je SPEC.md. Pročitaj relevantne tačke prije svake izmjene. Ako zadatak traži nešto što se kosi sa SPEC.md, stani i pitaj.
- Ovo je aplikacija koja računa doze inzulina. Kad nisi siguran, pitaj umjesto da pretpostaviš.
- Izračun doze postoji samo u web/src/calc.ts. Ne dupliraj ga u Android kodu ni u Apps Scriptu.
- Nikad ne mijenjaj testove da bi prošli. Ako misliš da je test pogrešan, stani i reci.
- Nikad ne upisuj tokene, URL deploymenta, lozinke ni keystore u repozitorij. Lokalne vrijednosti idu u .env, local.properties ili keystore.properties, koji su u .gitignore.
- Prije završetka zadatka pokreni testove dijela koji si mijenjao (web: npm test; android: ./gradlew test) i javi rezultat.
- Interfejs je na bosanskom. U tekstu za korisnika ne koristi em ni en crtice, samo hyphen.
- Commit radi samo kad te pitam.

Struktura:
- web/ - TypeScript + Vite, ekrani i izračun
- android/ - Kotlin omotač
- apps-script/ - Code.gs i testovi API-ja
- spike/ - jednokratni testovi iz Faze 1
