// Foto's die op elkaar lijken opsporen en samenvoegen.
//
// Byte-identieke foto's kunnen al niet meer twee keer in een reis staan. Wat
// wél kan is dezelfde foto met net andere bytes — één keer op volle grootte
// geüpload, één keer al verkleind. Die vindt deze route op het opnametijdstip
// of op de maat.
//
// Het gevaarlijke deel is niet het opsporen maar het samenvoegen: aan een foto
// hangen fotoboekpagina's en evaluatiestemmen, en die moeten verhuizen in
// plaats van meegewist worden door de ON DELETE CASCADE.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, redenOvergeslagen } from "./helper/server.mjs";

let S = null;
before(async () => { if (!redenOvergeslagen) S = await startServer(); }, { timeout: 90000 });
after(async () => { if (S) await S.stop(); });
const opties = redenOvergeslagen ? { skip: redenOvergeslagen } : {};

// Zelfde plaatje, andere bytes. Een commentaarregel erin volstaat niet: de
// server normaliseert de afbeelding vóór opslag en dan zijn de bytes alsnog
// gelijk, precies zoals de content_hash bedoeld is. Een andere afmeting is wél
// een echt verschil, en het is ook het realistische geval: het origineel naast
// de verkleinde kopie.
const svg = (kleur, maat = 40) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${maat}" height="${maat}"><rect width="${maat}" height="${maat}" fill="${kleur}"/></svg>`
).toString("base64");

async function maakBeheerder(naam) {
  const u = await S.maakGebruiker(naam);
  await S.pool.query("UPDATE users SET is_admin = true WHERE id = $1", [u.id]);
  return u;
}

async function maakReis(gebruiker) {
  const { data: reis } = await S.req("POST", "/api/trips", {
    gebruiker, body: { name: "Dubbelreis", start_date: "2025-06-01", end_date: "2025-06-02" },
  });
  const { data: dagen } = await S.req("GET", `/api/trips/${reis.id}/days`, { gebruiker });
  return { reis, dagen };
}

async function upload(gebruiker, reis, dagId, data, extra = {}) {
  const r = await S.req("POST", `/api/trips/${reis.id}/photos`, {
    gebruiker, body: { image: { data, mediaType: "image/svg+xml" }, day_id: dagId, ...extra },
  });
  assert.ok(r.data?.id, `upload mislukt: ${JSON.stringify(r.data)}`);
  return r.data.id;
}

test("twee opnames op hetzelfde tijdstip komen als groep terug", opties, async () => {
  const beheerder = await maakBeheerder("beheerder");
  const { reis, dagen } = await maakReis(beheerder);
  const moment = "2025-06-01T10:30:00.000Z";
  const groot = await upload(beheerder, reis, dagen[0].id, svg("#f00", 64), { taken_at: moment });
  const klein = await upload(beheerder, reis, dagen[0].id, svg("#f00"), { taken_at: moment });
  // Een derde foto op een ander tijdstip hoort er niet bij te staan.
  const los = await upload(beheerder, reis, dagen[0].id, svg("#0f0"), { taken_at: "2025-06-01T11:00:00.000Z" });

  const { status, data } = await S.req("GET", "/api/admin/fotodubbels", { gebruiker: beheerder });
  assert.equal(status, 200);
  const groep = data.groepen.find((g) => g.tripId === reis.id);
  assert.ok(groep, "de groep is niet gevonden");
  assert.equal(groep.signaal, "exif");
  assert.deepEqual(groep.fotos.map((f) => f.id).sort(), [groot, klein].sort());
  assert.ok(!groep.fotos.some((f) => f.id === los), "een foto van een ander tijdstip zit in de groep");
  // De maten staan erbij, want daarop kies je welke blijft.
  assert.ok(groep.fotos.every((f) => f.bytes > 0), "de bestandsgrootte ontbreekt");
});

test("samenvoegen laat fotoboekpagina's en stemmen niet omvallen", opties, async () => {
  const beheerder = await maakBeheerder("beheerder");
  const { reis, dagen } = await maakReis(beheerder);
  const moment = "2025-06-02T09:00:00.000Z";
  const houd = await upload(beheerder, reis, dagen[0].id, svg("#00f", 64), { taken_at: moment });
  const weg = await upload(beheerder, reis, dagen[0].id, svg("#00f"), { taken_at: moment });

  // De foto die weggaat zit in een fotoboek en heeft een stem in de evaluatie.
  const { data: boek } = await S.req("POST", `/api/trips/${reis.id}/photobooks`, { gebruiker: beheerder, body: {} });
  await S.req("PUT", `/api/photobooks/${boek.id}/pages`, {
    gebruiker: beheerder,
    body: { pages: [{ photos: [{ photo_id: weg, position: 0 }], background: { type: "photo", photo_id: weg } }] },
  });
  const { rows: paginas } = await S.pool.query("SELECT id FROM photobook_pages WHERE photobook_id = $1", [boek.id]);
  const pagina = paginas[0];
  assert.ok(pagina, "de fotoboekpagina is niet aangemaakt");
  await S.req("PUT", `/api/trips/${reis.id}/evaluatie/fotos`, { gebruiker: beheerder, body: { top: [weg] } });

  const r = await S.req("POST", "/api/admin/fotodubbels/opruimen", {
    gebruiker: beheerder, body: { groepen: [{ houd, weg: [weg] }] },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.opgeruimd, 1);

  // De dubbele is weg, de andere staat er nog.
  const { rows: over } = await S.pool.query("SELECT id FROM photos WHERE id = ANY($1::bigint[])", [[houd, weg]]);
  assert.deepEqual(over.map((x) => x.id), [houd]);

  // En alles wat ernaar verwees is meeverhuisd in plaats van meegewist.
  const { rows: opPagina } = await S.pool.query("SELECT photo_id FROM photobook_page_photos WHERE page_id = $1", [pagina.id]);
  assert.deepEqual(opPagina.map((x) => x.photo_id), [houd], "de foto is van de fotoboekpagina verdwenen");
  const { rows: achtergrond } = await S.pool.query("SELECT background_photo_id FROM photobook_pages WHERE id = $1", [pagina.id]);
  assert.equal(achtergrond[0].background_photo_id, houd, "de achtergrond van de pagina is leeggelopen");
  const { rows: stem } = await S.pool.query("SELECT photo_id FROM trip_fotostemmen WHERE trip_id = $1", [reis.id]);
  assert.deepEqual(stem.map((x) => x.photo_id), [houd], "de stem in de evaluatie is verdwenen");
});

test("stemde iemand op allebei, dan blijft er één stem over", opties, async () => {
  const beheerder = await maakBeheerder("beheerder");
  const { reis, dagen } = await maakReis(beheerder);
  const moment = "2025-06-02T12:00:00.000Z";
  const houd = await upload(beheerder, reis, dagen[0].id, svg("#ff0", 64), { taken_at: moment });
  const weg = await upload(beheerder, reis, dagen[0].id, svg("#ff0"), { taken_at: moment });

  // Allebei in de top vijf: plek 1 en plek 2.
  await S.req("PUT", `/api/trips/${reis.id}/evaluatie/fotos`, { gebruiker: beheerder, body: { top: [houd, weg] } });

  const r = await S.req("POST", "/api/admin/fotodubbels/opruimen", {
    gebruiker: beheerder, body: { groepen: [{ houd, weg: [weg] }] },
  });
  assert.equal(r.status, 200, `opruimen mislukt: ${JSON.stringify(r.data)}`);

  const { rows } = await S.pool.query(
    "SELECT photo_id, positie FROM trip_fotostemmen WHERE trip_id = $1 ORDER BY positie", [reis.id]);
  assert.deepEqual(rows, [{ photo_id: houd, positie: 1 }],
    "de dubbele stem is niet opgelost — de hoogste plek hoort te blijven staan");
});

test("alleen een beheerder komt erbij, en niet met foto's uit twee reizen", opties, async () => {
  const beheerder = await maakBeheerder("beheerder");
  const gewoon = await S.maakGebruiker("gewoon");
  assert.ok((await S.req("GET", "/api/admin/fotodubbels", { gebruiker: gewoon })).status >= 400,
    "een gewone gebruiker kon de dubbelen bekijken");
  assert.ok((await S.req("POST", "/api/admin/fotodubbels/opruimen", { gebruiker: gewoon, body: { groepen: [{ houd: 1, weg: [2] }] } })).status >= 400,
    "een gewone gebruiker kon opruimen");

  // Twee foto's uit verschillende reizen samenvoegen mag niet.
  const eerste = await maakReis(beheerder);
  const tweede = await maakReis(beheerder);
  const a = await upload(beheerder, eerste.reis, eerste.dagen[0].id, svg("#0ff"));
  const b = await upload(beheerder, tweede.reis, tweede.dagen[0].id, svg("#f0f"));
  const kruis = await S.req("POST", "/api/admin/fotodubbels/opruimen", {
    gebruiker: beheerder, body: { groepen: [{ houd: a, weg: [b] }] },
  });
  assert.equal(kruis.status, 400, "foto's uit twee reizen werden samengevoegd");
  const { rows } = await S.pool.query("SELECT COUNT(*)::int n FROM photos WHERE id = ANY($1::bigint[])", [[a, b]]);
  assert.equal(rows[0].n, 2, "er is toch iets weggegooid");
});
