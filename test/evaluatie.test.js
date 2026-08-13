// De evaluatie aan het eind van de reis: een top vijf foto's en vijf vragen.
//
// Tegen de echte server, want het interessante zit in de optelling en in wie
// wat te zien krijgt — niet in het formulier.
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
    gebruiker: a, body: { name: "Evaluatiereis", start_date: "2025-06-01", end_date: "2025-06-03" },
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
  return { a, b, reis, fotos };
}

test("de uitslag blijft verborgen tot je zelf hebt ingevuld", opties, async () => {
  const { a, b, reis, fotos } = await maakReisMetFotos(3);
  // b vult wel in.
  await S.req("PUT", `/api/trips/${reis.id}/evaluatie`, {
    gebruiker: b, body: { antwoorden: { plaats: "Kyoto" }, top: [fotos[0]] },
  });
  // a heeft nog niets gedaan en hoort de uitslag niet te zien.
  const voor = await S.req("GET", `/api/trips/${reis.id}/evaluatie`, { gebruiker: a });
  assert.equal(voor.status, 200);
  assert.equal(voor.data.uitslag, null, "de uitslag lekte naar iemand die nog niet had ingevuld");
  assert.equal(voor.data.mijn.ingediendOp, null);

  // Na het indienen wel.
  const na = await S.req("PUT", `/api/trips/${reis.id}/evaluatie`, {
    gebruiker: a, body: { antwoorden: { plaats: "Nara" }, top: [fotos[1]] },
  });
  assert.equal(na.status, 200);
  assert.ok(na.data.uitslag, "de uitslag ontbreekt na het indienen");
  assert.equal(na.data.uitslag.aantalIngediend, 2);
});

test("plek 1 telt zwaarder dan plek 5", opties, async () => {
  const { a, b, reis, fotos } = await maakReisMetFotos(6);
  // a: f0 f2 f3 f4 f5  -> 5 4 3 2 1
  // b: f1 f2 f3 f4 f0  -> 5 4 3 2 1
  // Opgeteld: f2 = 8, f0 = 6, f3 = 6, f1 = 5, f4 = 4, f5 = 1.
  await S.req("PUT", `/api/trips/${reis.id}/evaluatie`, {
    gebruiker: a, body: { antwoorden: {}, top: [fotos[0], fotos[2], fotos[3], fotos[4], fotos[5]] },
  });
  const r = await S.req("PUT", `/api/trips/${reis.id}/evaluatie`, {
    gebruiker: b, body: { antwoorden: {}, top: [fotos[1], fotos[2], fotos[3], fotos[4], fotos[0]] },
  });
  const lijst = r.data.uitslag.fotos;
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
  await S.req("PUT", `/api/trips/${reis.id}/evaluatie`, {
    gebruiker: a, body: { antwoorden: {}, top: [fotos[0], fotos[1], fotos[2]] },
  });
  const r = await S.req("PUT", `/api/trips/${reis.id}/evaluatie`, {
    gebruiker: a, body: { antwoorden: {}, top: [fotos[3]] },
  });
  const ids = r.data.uitslag.fotos.map((x) => x.photoId);
  assert.deepEqual(ids, [fotos[3]], `er staan nog oude stemmen in: ${ids.join(", ")}`);
  const { rows } = await S.pool.query("SELECT COUNT(*)::int n FROM trip_fotostemmen WHERE trip_id = $1 AND user_id = $2", [reis.id, a.id]);
  assert.equal(rows[0].n, 1);
});

test("meer dan vijf foto's kiezen kan niet, en een foto uit een andere reis ook niet", opties, async () => {
  const { a, reis, fotos } = await maakReisMetFotos(8);
  // Acht meesturen: de server houdt er vijf over in plaats van te klagen —
  // afkappen is hier vriendelijker dan een foutmelding over een grens die de
  // app zelf al bewaakt.
  const r = await S.req("PUT", `/api/trips/${reis.id}/evaluatie`, {
    gebruiker: a, body: { antwoorden: {}, top: fotos },
  });
  assert.equal(r.status, 200);
  const { rows } = await S.pool.query("SELECT COUNT(*)::int n FROM trip_fotostemmen WHERE trip_id = $1 AND user_id = $2", [reis.id, a.id]);
  assert.equal(rows[0].n, 5);

  // Een foto uit een andere reis wordt geweigerd.
  const ander = await maakReisMetFotos(1);
  const fout = await S.req("PUT", `/api/trips/${reis.id}/evaluatie`, {
    gebruiker: a, body: { antwoorden: {}, top: [ander.fotos[0]] },
  });
  assert.equal(fout.status, 400, "een foto uit een andere reis werd geaccepteerd");
});

test("alleen de vijf bekende vragen worden bewaard", opties, async () => {
  const { a, reis } = await maakReisMetFotos(1);
  await S.req("PUT", `/api/trips/${reis.id}/evaluatie`, {
    gebruiker: a,
    body: {
      antwoorden: {
        plaats: "  Kyoto  ", hotel: "Ryokan", restaurant: "", verzonnen: "hoort hier niet",
      },
      top: [],
    },
  });
  const { rows } = await S.pool.query("SELECT antwoorden FROM trip_evaluaties WHERE trip_id = $1 AND user_id = $2", [reis.id, a.id]);
  const bewaard = rows[0].antwoorden;
  assert.deepEqual(Object.keys(bewaard).sort(), ["hotel", "plaats"], "er is een onbekende sleutel of een leeg antwoord bewaard");
  assert.equal(bewaard.plaats, "Kyoto", "de spaties zijn niet weggehaald");
});

test("de uitslag noemt per vraag wie wat antwoordde", opties, async () => {
  const { a, b, reis } = await maakReisMetFotos(1);
  await S.req("PUT", `/api/trips/${reis.id}/evaluatie`, { gebruiker: a, body: { antwoorden: { restaurant: "Sushi Ken" }, top: [] } });
  const r = await S.req("PUT", `/api/trips/${reis.id}/evaluatie`, { gebruiker: b, body: { antwoorden: { restaurant: "Ramen Taro" }, top: [] } });
  const vraag = r.data.uitslag.vragen.find((v) => v.sleutel === "restaurant");
  assert.equal(vraag.antwoorden.length, 2);
  assert.deepEqual(vraag.antwoorden.map((x) => x.tekst).sort(), ["Ramen Taro", "Sushi Ken"]);
  assert.ok(vraag.antwoorden.every((x) => x.naam), "er staat een antwoord zonder naam bij");
});

test("een meekijker stemt mee voor de foto's, maar niet op de vragen", opties, async () => {
  const { a, reis, fotos } = await maakReisMetFotos(3);
  const kijker = await S.maakGebruiker("meekijker");
  await S.pool.query("INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1,$2,'viewer') ON CONFLICT DO NOTHING", [reis.id, kijker.id]);
  await S.req("PUT", `/api/trips/${reis.id}/evaluatie`, { gebruiker: a, body: { antwoorden: { plaats: "Kyoto" }, top: [fotos[0]] } });

  // Voordat hij zelf stemt ziet hij de uitslag niet — dezelfde regel als voor
  // iedereen, anders stemt hij met de tussenstand in zijn achterhoofd.
  const voor = await S.req("GET", `/api/trips/${reis.id}/evaluatie`, { gebruiker: kijker });
  assert.equal(voor.status, 200);
  assert.equal(voor.data.uitslag, null, "een meekijker zag de uitslag voordat hij zelf stemde");
  assert.equal(voor.data.magFotosKiezen, true);
  assert.equal(voor.data.magVragenBeantwoorden, false);

  // Zijn fotostem telt, zijn poging om de vragen in te vullen niet.
  const stem = await S.req("PUT", `/api/trips/${reis.id}/evaluatie`, {
    gebruiker: kijker, body: { antwoorden: { plaats: "Ik was er niet bij" }, top: [fotos[1], fotos[0]] },
  });
  assert.equal(stem.status, 200);

  const { rows: stemmen } = await S.pool.query(
    "SELECT photo_id, positie FROM trip_fotostemmen WHERE trip_id = $1 AND user_id = $2 ORDER BY positie", [reis.id, kijker.id]);
  assert.deepEqual(stemmen.map((r) => r.photo_id), [fotos[1], fotos[0]], "de fotostemmen van de meekijker zijn niet bewaard");

  const { rows: eigen } = await S.pool.query(
    "SELECT antwoorden FROM trip_evaluaties WHERE trip_id = $1 AND user_id = $2", [reis.id, kijker.id]);
  assert.deepEqual(eigen[0].antwoorden, {}, "een meekijker kon toch een vraag beantwoorden");

  // En zijn stem telt mee in de uitslag: foto 0 heeft nu 5 (van a) + 4 = 9.
  const punten = Object.fromEntries(stem.data.uitslag.fotos.map((x) => [x.photoId, x.punten]));
  assert.equal(punten[fotos[0]], 9);
  assert.equal(punten[fotos[1]], 5);
});

test("een buitenstaander komt er niet bij", opties, async () => {
  const { reis } = await maakReisMetFotos(1);
  const vreemde = await S.maakGebruiker("vreemde");
  const lezen = await S.req("GET", `/api/trips/${reis.id}/evaluatie`, { gebruiker: vreemde });
  assert.ok(lezen.status >= 400, `een buitenstaander kon de evaluatie lezen (${lezen.status})`);
  const schrijven = await S.req("PUT", `/api/trips/${reis.id}/evaluatie`, { gebruiker: vreemde, body: { antwoorden: {}, top: [] } });
  assert.ok(schrijven.status >= 400, `een buitenstaander kon de evaluatie invullen (${schrijven.status})`);
});
