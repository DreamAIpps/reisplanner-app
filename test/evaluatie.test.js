// De evaluatie aan het eind van de reis: een top vijf foto's en vijf vragen.
// Het zijn twee losse onderdelen — je kunt je foto's inleveren zonder de vragen
// te doen — dus de tests leveren ze ook los in.
//
// Tegen de echte server, want het interessante zit in de optelling, in de
// keuzelijst die uit de reis komt, en in wie wat te zien krijgt.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, redenOvergeslagen } from "./helper/server.mjs";

let S = null;
before(async () => { if (!redenOvergeslagen) S = await startServer(); }, { timeout: 90000 });
after(async () => { if (S) await S.stop(); });
const opties = redenOvergeslagen ? { skip: redenOvergeslagen } : {};

const SVG = (kleur) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="${kleur}"/></svg>`
).toString("base64");

// Een reis met een handvol foto's en twee mensen die erbij mogen.
async function maakReisMetFotos(aantal = 6) {
  const a = await S.maakGebruiker("reiziger");
  const b = await S.maakGebruiker("medereiziger");
  const { data: reis } = await S.req("POST", "/api/trips", {
    gebruiker: a,
    body: { name: "Evaluatiereis", destination: "Japan", start_date: "2025-06-01", end_date: "2025-06-03" },
  });
  await S.pool.query("INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1,$2,'editor') ON CONFLICT DO NOTHING", [reis.id, b.id]);
  const { data: dagen } = await S.req("GET", `/api/trips/${reis.id}/days`, { gebruiker: a });
  const fotos = [];
  const kleuren = ["#f00", "#0f0", "#00f", "#ff0", "#0ff", "#f0f", "#888", "#333"];
  for (let i = 0; i < aantal; i++) {
    const r = await S.req("POST", `/api/trips/${reis.id}/photos`, {
      gebruiker: a, body: { image: { data: SVG(kleuren[i % kleuren.length]), mediaType: "image/svg+xml" }, day_id: dagen[0].id },
    });
    fotos.push(r.data.id);
  }
  return { a, b, reis, fotos, dagen };
}

const stuurFotos = (gebruiker, reis, top) =>
  S.req("PUT", `/api/trips/${reis.id}/evaluatie/fotos`, { gebruiker, body: { top } });
const stuurVragen = (gebruiker, reis, antwoorden) =>
  S.req("PUT", `/api/trips/${reis.id}/evaluatie/vragen`, { gebruiker, body: { antwoorden } });
const lees = (gebruiker, reis) =>
  S.req("GET", `/api/trips/${reis.id}/evaluatie`, { gebruiker });
const wisFotos = (gebruiker, reis) =>
  S.req("DELETE", `/api/trips/${reis.id}/evaluatie/fotos`, { gebruiker });
const wisVragen = (gebruiker, reis) =>
  S.req("DELETE", `/api/trips/${reis.id}/evaluatie/vragen`, { gebruiker });

test("de twee onderdelen staan los: je foto's inleveren toont niet de antwoorden", opties, async () => {
  const { a, b, reis, fotos } = await maakReisMetFotos(3);
  // b doet allebei.
  await stuurFotos(b, reis, [fotos[0]]);
  await stuurVragen(b, reis, { plaats: "Kyoto" });

  // a heeft nog niets gedaan en hoort geen van beide uitslagen te zien.
  const voor = await lees(a, reis);
  assert.equal(voor.status, 200);
  assert.equal(voor.data.uitslagFotos, null, "de foto-uitslag lekte naar iemand die nog niet had gestemd");
  assert.equal(voor.data.uitslagVragen, null, "de antwoorden lekten naar iemand die nog niet had ingevuld");
  assert.equal(voor.data.mijn.fotosOp, null);
  assert.equal(voor.data.mijn.vragenOp, null);

  // Alleen de foto's inleveren geeft alleen de foto-uitslag.
  const na = await stuurFotos(a, reis, [fotos[1]]);
  assert.equal(na.status, 200);
  assert.ok(na.data.uitslagFotos, "de foto-uitslag ontbreekt na het stemmen");

  const tussen = await lees(a, reis);
  assert.ok(tussen.data.uitslagFotos, "de foto-uitslag is weer weg na het stemmen");
  assert.equal(tussen.data.uitslagVragen, null, "de antwoorden werden zichtbaar terwijl alleen de foto's waren ingeleverd");
  assert.equal(tussen.data.voortgang.fotos, 2);
  assert.equal(tussen.data.voortgang.vragen, 1);

  // En daarna de vragen.
  const vragen = await stuurVragen(a, reis, { plaats: "Nara" });
  assert.equal(vragen.data.aantalVragenIngediend, 2);
  const klaar = await lees(a, reis);
  assert.ok(klaar.data.uitslagVragen, "de antwoorden blijven verborgen na het invullen");
});

test("de keuzelijst komt uit de reis zelf", opties, async () => {
  const { a, reis, dagen } = await maakReisMetFotos(1);
  const act = (title, category, location) =>
    S.req("POST", `/api/days/${dagen[0].id}/activities`, { gebruiker: a, body: { title, category, location } });

  await S.req("POST", `/api/trips/${reis.id}/accommodations`, {
    gebruiker: a, body: { name: "Ryokan Sakura", check_in: "2025-06-01", check_out: "2025-06-03" },
  });
  await S.req("POST", `/api/trips/${reis.id}/accommodations`, {
    gebruiker: a, body: { name: "Hotel Granvia", address: "Gionmachi, Higashiyama, Kyoto 605-0862", check_in: "2025-06-01", check_out: "2025-06-03" },
  });
  await act("Sushi Ken", "Restaurant", "Kyoto");
  await act("Fushimi Inari", "Bezienswaardigheid", "Kyoto");
  await act("Nationaal Museum", "Museum", "Nara");
  await act("Nishiki-markt", "Shopping", "Osaka");
  await act("Hardlopen", "Sport", "Osaka");

  const { data } = await lees(a, reis);
  assert.deepEqual(data.keuzes.hotel, ["Hotel Granvia", "Ryokan Sakura"]);
  assert.deepEqual(data.keuzes.restaurant, ["Sushi Ken"]);
  assert.deepEqual(data.keuzes.shoppen, ["Nishiki-markt"]);
  assert.deepEqual(data.keuzes.bezichtiging, ["Fushimi Inari", "Nationaal Museum"]);
  // De bestemming van de reis staat erbij, en elke plaats maar één keer. Het
  // adres van een verblijf komt er rauw in: de app maakt er "Kyoto" van met
  // dezelfde opzoeker als het dagboek. De naam van een verblijf hoort er niet
  // in — een hotel is geen plaats.
  assert.deepEqual(data.keuzes.plaats,
    ["Gionmachi, Higashiyama, Kyoto 605-0862", "Japan", "Kyoto", "Nara", "Osaka"]);
  assert.ok(!data.keuzes.plaats.includes("Ryokan Sakura"));

  // Een activiteit die bij geen van de vragen hoort komt nergens in een lijst.
  const alles = Object.values(data.keuzes).flat();
  assert.ok(!alles.includes("Hardlopen"), "een sportactiviteit belandde in een keuzelijst");
});

test("plek 1 telt zwaarder dan plek 5", opties, async () => {
  const { a, b, reis, fotos } = await maakReisMetFotos(6);
  // a: f0 f2 f3 f4 f5  -> 5 4 3 2 1
  // b: f1 f2 f3 f4 f0  -> 5 4 3 2 1
  // Opgeteld: f2 = 8, f0 = 6, f3 = 6, f1 = 5, f4 = 4, f5 = 1.
  await stuurFotos(a, reis, [fotos[0], fotos[2], fotos[3], fotos[4], fotos[5]]);
  const r = await stuurFotos(b, reis, [fotos[1], fotos[2], fotos[3], fotos[4], fotos[0]]);
  const lijst = r.data.uitslagFotos;
  const punten = Object.fromEntries(lijst.map((x) => [x.photoId, x.punten]));

  // Twee keer plek 2 (8) verslaat één keer plek 1 plus één keer plek 5 (6).
  // Dat is precies waar de weging voor is: breed gewaardeerd wint van één
  // uitschieter.
  assert.equal(lijst[0].photoId, fotos[2], "de foto met acht punten staat niet bovenaan");
  assert.equal(punten[fotos[2]], 8);
  assert.equal(punten[fotos[0]], 6);
  assert.equal(punten[fotos[1]], 5);
  assert.equal(punten[fotos[5]], 1);

  // f0 en f3 hebben allebei 6 punten en 2 stemmen; f0 stond ooit op plek 1 en
  // wint daarom de gelijke stand.
  const volgorde = lijst.map((x) => x.photoId);
  assert.ok(volgorde.indexOf(fotos[0]) < volgorde.indexOf(fotos[3]),
    "bij gelijke punten hoort de hoogste plek voor te gaan");

  const f0 = lijst.find((x) => x.photoId === fotos[0]);
  assert.equal(f0.stemmen, 2);
});

test("je top vijf overschrijven laat geen oude stemmen achter", opties, async () => {
  const { a, reis, fotos } = await maakReisMetFotos(6);
  await stuurFotos(a, reis, [fotos[0], fotos[1], fotos[2]]);
  const r = await stuurFotos(a, reis, [fotos[3]]);
  const ids = r.data.uitslagFotos.map((x) => x.photoId);
  assert.deepEqual(ids, [fotos[3]], `er staan nog oude stemmen in: ${ids.join(", ")}`);
  const { rows } = await S.pool.query("SELECT COUNT(*)::int n FROM trip_fotostemmen WHERE trip_id = $1 AND user_id = $2", [reis.id, a.id]);
  assert.equal(rows[0].n, 1);
});

test("meer dan vijf foto's kiezen kan niet, en een foto uit een andere reis ook niet", opties, async () => {
  const { a, reis, fotos } = await maakReisMetFotos(8);
  // Acht meesturen: de server houdt er vijf over in plaats van te klagen —
  // afkappen is hier vriendelijker dan een foutmelding over een grens die de
  // app zelf al bewaakt.
  const r = await stuurFotos(a, reis, fotos);
  assert.equal(r.status, 200);
  const { rows } = await S.pool.query("SELECT COUNT(*)::int n FROM trip_fotostemmen WHERE trip_id = $1 AND user_id = $2", [reis.id, a.id]);
  assert.equal(rows[0].n, 5);

  // Een foto uit een andere reis wordt geweigerd.
  const ander = await maakReisMetFotos(1);
  const fout = await stuurFotos(a, reis, [ander.fotos[0]]);
  assert.equal(fout.status, 400, "een foto uit een andere reis werd geaccepteerd");
});

test("alleen de vijf bekende vragen worden bewaard", opties, async () => {
  const { a, reis } = await maakReisMetFotos(1);
  await stuurVragen(a, reis, {
    plaats: "  Kyoto  ", hotel: "Ryokan", restaurant: "", verzonnen: "hoort hier niet",
  });
  const { rows } = await S.pool.query("SELECT antwoorden FROM trip_evaluaties WHERE trip_id = $1 AND user_id = $2", [reis.id, a.id]);
  const bewaard = rows[0].antwoorden;
  assert.deepEqual(Object.keys(bewaard).sort(), ["hotel", "plaats"], "er is een onbekende sleutel of een leeg antwoord bewaard");
  assert.equal(bewaard.plaats, "Kyoto", "de spaties zijn niet weggehaald");
});

test("de uitslag noemt per vraag wie wat antwoordde", opties, async () => {
  const { a, b, reis } = await maakReisMetFotos(1);
  await stuurVragen(a, reis, { restaurant: "Sushi Ken" });
  const r = await stuurVragen(b, reis, { restaurant: "Ramen Taro" });
  const vraag = r.data.uitslagVragen.find((v) => v.sleutel === "restaurant");
  assert.equal(vraag.antwoorden.length, 2);
  assert.deepEqual(vraag.antwoorden.map((x) => x.tekst).sort(), ["Ramen Taro", "Sushi Ken"]);
  assert.ok(vraag.antwoorden.every((x) => x.naam), "er staat een antwoord zonder naam bij");
});

test("een meekijker stemt mee voor de foto's, maar komt niet bij de vragen", opties, async () => {
  const { a, reis, fotos } = await maakReisMetFotos(3);
  const kijker = await S.maakGebruiker("meekijker");
  await S.pool.query("INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1,$2,'viewer') ON CONFLICT DO NOTHING", [reis.id, kijker.id]);
  await stuurFotos(a, reis, [fotos[0]]);
  await stuurVragen(a, reis, { plaats: "Kyoto" });

  // Voordat hij zelf stemt ziet hij de uitslag niet — dezelfde regel als voor
  // iedereen, anders stemt hij met de tussenstand in zijn achterhoofd.
  const voor = await lees(kijker, reis);
  assert.equal(voor.status, 200);
  assert.equal(voor.data.uitslagFotos, null, "een meekijker zag de foto-uitslag voordat hij zelf stemde");
  assert.equal(voor.data.magVragenBeantwoorden, false);

  // Zijn fotostem telt.
  const stem = await stuurFotos(kijker, reis, [fotos[1], fotos[0]]);
  assert.equal(stem.status, 200);
  const { rows: stemmen } = await S.pool.query(
    "SELECT photo_id, positie FROM trip_fotostemmen WHERE trip_id = $1 AND user_id = $2 ORDER BY positie", [reis.id, kijker.id]);
  assert.deepEqual(stemmen.map((r) => r.photo_id), [fotos[1], fotos[0]], "de fotostemmen van de meekijker zijn niet bewaard");

  // Zijn poging om de vragen in te vullen niet.
  const vragen = await stuurVragen(kijker, reis, { plaats: "Ik was er niet bij" });
  assert.ok(vragen.status >= 400, `een meekijker kon de vragen invullen (${vragen.status})`);
  const { rows: eigen } = await S.pool.query(
    "SELECT antwoorden, vragen_op FROM trip_evaluaties WHERE trip_id = $1 AND user_id = $2", [reis.id, kijker.id]);
  assert.deepEqual(eigen[0].antwoorden, {}, "een meekijker kon toch een vraag beantwoorden");
  assert.equal(eigen[0].vragen_op, null);

  // En zijn stem telt mee in de uitslag: foto 0 heeft nu 5 (van a) + 4 = 9.
  const punten = Object.fromEntries(stem.data.uitslagFotos.map((x) => [x.photoId, x.punten]));
  assert.equal(punten[fotos[0]], 9);
  assert.equal(punten[fotos[1]], 5);
});

test("opnieuw beginnen wist je eigen inzending, en die van een ander niet", opties, async () => {
  const { a, b, reis, fotos } = await maakReisMetFotos(3);
  await stuurFotos(a, reis, [fotos[0], fotos[1]]);
  await stuurVragen(a, reis, { plaats: "Kyoto" });
  await stuurFotos(b, reis, [fotos[2]]);
  await stuurVragen(b, reis, { plaats: "Nara" });

  // Alleen de foto's wissen laat de antwoorden staan: het zijn twee onderdelen.
  const naFotos = await wisFotos(a, reis);
  assert.equal(naFotos.status, 200);
  assert.equal(naFotos.data.voortgang.fotos, 1);
  assert.equal(naFotos.data.voortgang.vragen, 2);

  const tussen = await lees(a, reis);
  assert.deepEqual(tussen.data.mijn.top, [], "de fotostemmen staan er nog");
  assert.equal(tussen.data.mijn.fotosOp, null);
  assert.equal(tussen.data.uitslagFotos, null, "de foto-uitslag bleef zichtbaar na het wissen");
  assert.ok(tussen.data.uitslagVragen, "de antwoorden verdwenen mee met de foto's");
  assert.deepEqual(tussen.data.mijn.antwoorden, { plaats: "Kyoto" });

  // En dan de vragen.
  const naVragen = await wisVragen(a, reis);
  assert.equal(naVragen.data.voortgang.vragen, 1);
  const leeg = await lees(a, reis);
  assert.deepEqual(leeg.data.mijn.antwoorden, {});
  assert.equal(leeg.data.mijn.vragenOp, null);
  assert.equal(leeg.data.uitslagVragen, null);

  // De rij is nu helemaal weg in plaats van leeg achtergebleven.
  const { rows } = await S.pool.query(
    "SELECT COUNT(*)::int n FROM trip_evaluaties WHERE trip_id = $1 AND user_id = $2", [reis.id, a.id]);
  assert.equal(rows[0].n, 0, "er bleef een lege inzending achter");

  // b is niet geraakt: zijn stem en zijn antwoord staan er nog.
  const vanB = await lees(b, reis);
  assert.deepEqual(vanB.data.mijn.top.map((t) => t.photoId), [fotos[2]]);
  assert.deepEqual(vanB.data.mijn.antwoorden, { plaats: "Nara" });
  const punten = Object.fromEntries(vanB.data.uitslagFotos.map((x) => [x.photoId, x.punten]));
  assert.deepEqual(punten, { [fotos[2]]: 5 }, "de stemmen van a tellen nog mee in de uitslag");
});

test("wissen mag alleen bij je eigen reis, en een meekijker wist alleen foto's", opties, async () => {
  const { a, reis, fotos } = await maakReisMetFotos(2);
  const kijker = await S.maakGebruiker("meekijker");
  await S.pool.query("INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1,$2,'viewer') ON CONFLICT DO NOTHING", [reis.id, kijker.id]);
  await stuurFotos(kijker, reis, [fotos[0]]);
  await stuurFotos(a, reis, [fotos[1]]);

  assert.equal((await wisFotos(kijker, reis)).status, 200);
  const { rows } = await S.pool.query(
    "SELECT COUNT(*)::int n FROM trip_fotostemmen WHERE trip_id = $1 AND user_id = $2", [reis.id, kijker.id]);
  assert.equal(rows[0].n, 0, "de meekijker kon zijn eigen stem niet wissen");
  assert.ok((await wisVragen(kijker, reis)).status >= 400, "een meekijker kwam bij de vragen");

  const vreemde = await S.maakGebruiker("vreemde");
  assert.ok((await wisFotos(vreemde, reis)).status >= 400, "een buitenstaander kon wissen");
  assert.ok((await wisVragen(vreemde, reis)).status >= 400, "een buitenstaander kon wissen");

  // a's stem staat er nog: een ander die wist raakt jou niet.
  const { rows: vanA } = await S.pool.query(
    "SELECT COUNT(*)::int n FROM trip_fotostemmen WHERE trip_id = $1 AND user_id = $2", [reis.id, a.id]);
  assert.equal(vanA[0].n, 1);
});

test("wissen zonder ooit iets te hebben ingeleverd gaat gewoon goed", opties, async () => {
  const { a, reis } = await maakReisMetFotos(1);
  assert.equal((await wisFotos(a, reis)).status, 200);
  assert.equal((await wisVragen(a, reis)).status, 200);
  const { rows } = await S.pool.query(
    "SELECT COUNT(*)::int n FROM trip_evaluaties WHERE trip_id = $1 AND user_id = $2", [reis.id, a.id]);
  assert.equal(rows[0].n, 0);
});

test("de deel-link laat iemand van buiten de vragen beantwoorden", opties, async () => {
  const { a, reis, fotos } = await maakReisMetFotos(2);
  const { status, data } = await S.req("POST", `/api/trips/${reis.id}/evaluatie/deellink`, { gebruiker: a });
  assert.equal(status, 200);
  const token = data.link.split("/evaluatie/")[1];
  assert.ok(token, `de link ziet er niet uit als verwacht: ${data.link}`);

  // Twee keer delen geeft dezelfde link: een tweede keer delen hoort de eerste
  // niet dood te maken.
  const tweede = await S.req("POST", `/api/trips/${reis.id}/evaluatie/deellink`, { gebruiker: a });
  assert.equal(tweede.data.link, data.link);

  // Iemand van buiten kan er nog niets mee.
  const gast = await S.maakGebruiker("buurvrouw");
  assert.ok((await lees(gast, reis)).status >= 400, "een buitenstaander kwam er zonder de link al bij");

  // De link volgen schrijft hem in en stuurt hem naar de vragen.
  const heen = await S.req("GET", `/evaluatie/${token}`, { gebruiker: gast });
  assert.equal(heen.status, 302);
  assert.equal(heen.headers.get("location"), `/?trip=${reis.id}&tab=reisvragen`);

  // Nu mag hij de vragen invullen — als meekijker zou dat niet mogen.
  const na = await lees(gast, reis);
  assert.equal(na.status, 200);
  assert.equal(na.data.magVragenBeantwoorden, true, "de genodigde mag de vragen niet beantwoorden");
  assert.equal(na.data.magDelen, false, "een genodigde kan zelf verder uitnodigen");
  assert.equal(na.data.deelLink, null);

  const ingevuld = await stuurVragen(gast, reis, { plaats: "Kyoto" });
  assert.equal(ingevuld.status, 200);
  assert.ok(ingevuld.data.uitslagVragen.find((v) => v.sleutel === "plaats").antwoorden.length === 1);

  // En hij mag ook meestemmen over de foto's — dat mocht een meekijker al.
  assert.equal((await stuurFotos(gast, reis, [fotos[0]])).status, 200);
  // Zijn eigen antwoord weer wissen ook.
  assert.equal((await wisVragen(gast, reis)).status, 200);

  // Maar de rest van de reis blijft dicht: hij is geen reisgenoot geworden.
  const planning = await S.req("POST", `/api/days/1/activities`, { gebruiker: gast, body: { title: "Stiekem" } });
  assert.ok(planning.status >= 400, "een genodigde kon in de planning schrijven");
});

test("een ongeldige deel-link stuurt je weg, en delen is niet voor meekijkers", opties, async () => {
  const { reis } = await maakReisMetFotos(1);
  const gast = await S.maakGebruiker("gast");
  const fout = await S.req("GET", "/evaluatie/bestaatniet", { gebruiker: gast });
  assert.equal(fout.status, 302);
  assert.equal(fout.headers.get("location"), "/?error=invalid-evaluatie");

  const kijker = await S.maakGebruiker("meekijker");
  await S.pool.query("INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1,$2,'viewer') ON CONFLICT DO NOTHING", [reis.id, kijker.id]);
  const delen = await S.req("POST", `/api/trips/${reis.id}/evaluatie/deellink`, { gebruiker: kijker });
  assert.ok(delen.status >= 400, "een meekijker kon een deel-link maken");
});

test("een buitenstaander komt er niet bij", opties, async () => {
  const { reis, fotos } = await maakReisMetFotos(1);
  const vreemde = await S.maakGebruiker("vreemde");
  const lezen = await lees(vreemde, reis);
  assert.ok(lezen.status >= 400, `een buitenstaander kon de evaluatie lezen (${lezen.status})`);
  const stemmen = await stuurFotos(vreemde, reis, [fotos[0]]);
  assert.ok(stemmen.status >= 400, `een buitenstaander kon meestemmen (${stemmen.status})`);
  const invullen = await stuurVragen(vreemde, reis, { plaats: "Kyoto" });
  assert.ok(invullen.status >= 400, `een buitenstaander kon de vragen invullen (${invullen.status})`);
});
