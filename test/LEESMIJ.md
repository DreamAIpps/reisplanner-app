# Tests

```
npm test
```

De tests draaien tegen een **echte server met een echte Postgres erachter**, geen
namaak. Dat is een keuze: de bugs die er tot nu toe uit kwamen — dubbele
dagkaarten, een gebruiker die door een foreign key niet te verwijderen was,
tijden in de verkeerde zone — waren geen van alle zichtbaar zonder database.

## Lokaal draaien

Zet `TEST_DATABASE_URL` naar een database die leeg mag zijn. Het schema wordt
bij het opstarten van de server vanzelf aangemaakt.

```
TEST_DATABASE_URL=postgresql://postgres:wachtwoord@localhost:5432/reisplanner_test npm test
```

Zonder die variabele worden de API-tests **overgeslagen met een melding** in
plaats van te slagen op niets. `bouw.test.js` heeft geen database nodig en
draait altijd.

## Wat er getest wordt

| bestand | wat |
|---|---|
| `bouw.test.js` | de client compileert, verwijst niet naar namen die niet bestaan, en laat niets ongebruikt achter |
| `api.test.js` | dagen volgen de reisperiode, account verwijderen, cookie- en tokensessies, CORS, rechten, compressie |

`bouw.test.js` is de goedkoopste en vangt het vaakst iets: een JSX-fout laat de
server wél starten maar geeft elke bezoeker een lege pagina.

## Blijft hij rood worden?

Een testsuite die niet meer kan falen is erger dan geen suite. Deze is
gecontroleerd door expres drie dingen stuk te maken:

| wat kapot | gevangen |
|---|---|
| dagen-synchronisatie eruit gesloopt | 2 tests rood |
| compressie uitgezet | 1 test rood |
| JSX-fout in het dagboek | 18 tests rood |

Doe dat opnieuw als je twijfelt of een nieuwe test echt iets controleert.
