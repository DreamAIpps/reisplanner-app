// Sleutels voorbij de twee miljard.
//
// SERIAL is een integer en houdt op bij 2.147.483.647. Bij honderdduizenden
// actieve gebruikers is dat geen theoretische grens: elke foto, elke notificatie
// (één per kijker per gebeurtenis) en elke keer dat iemand een reis opent kost
// een nummer. Alle sleutels zijn daarom bigint.
//
// Alleen: dat repareren is meer dan de kolom breder maken. Er zitten drie
// dingen achter die stuk voor stuk stil falen, en die deze tests bewaken:
//
//   1. De reeks (sequence) is óók "AS integer" en loopt op dezelfde grens vast,
//      ook als de kolom allang bigint is.
//   2. node-postgres geeft een bigint als tékst terug, niet als getal. Dan is
//      photo.id ineens "42" en klapt elke vergelijking met === naar false.
//   3. Query's die een id door ::int[] halen lopen over bij het eerste nummer
//      boven de grens — en dat zijn precies de plekken (fotoboek opslaan,
//      dubbels samenvoegen) die je zelden aanraakt.
//
// De structuurtest hieronder is bewust uit de catalogus geschreven en niet uit
// een lijst: een tabel die later bijkomt valt er vanzelf onder.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, redenOvergeslagen } from "./helper/server.mjs";

let S = null;
before(async () => { if (!redenOvergeslagen) S = await startServer(); }, { timeout: 90000 });
after(async () => { if (S) await S.stop(); });
const opties = redenOvergeslagen ? { skip: redenOvergeslagen } : {};

const BOVEN_DE_GRENS = 2147483647n;

test("geen enkele sleutel of verwijzing is nog een integer", opties, async () => {
  const { rows } = await S.pool.query(`
    SELECT c.relname AS tabel, a.attname AS kolom, 'sleutel' AS soort
      FROM pg_class c
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
     WHERE c.relkind = 'r' AND c.relnamespace = 'public'::regnamespace
       AND a.atttypid = 'int4'::regtype
       AND pg_get_expr(d.adbin, d.adrelid) LIKE 'nextval%'
    UNION
    SELECT c.relname, a.attname, 'verwijzing'
      FROM pg_constraint co
      JOIN pg_class c ON c.oid = co.conrelid
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(co.conkey) AND NOT a.attisdropped
     WHERE co.contype = 'f' AND c.relnamespace = 'public'::regnamespace
       AND a.atttypid = 'int4'::regtype
  `);
  assert.deepEqual(rows, [], `nog integer: ${rows.map((r) => `${r.tabel}.${r.kolom} (${r.soort})`).join(", ")}`);
});

test("geen enkele reeks telt nog in integers", opties, async () => {
  // Het addertje: de kolom repareren zonder de reeks lost niets op. nextval
  // geeft dan gewoon een fout zodra de teller bij 2^31 is, en er kan niets meer
  // bij — precies de storing waar dit allemaal om begonnen is.
  const { rows } = await S.pool.query(`
    SELECT c.relname AS naam, ps.seqmax
      FROM pg_class c JOIN pg_sequence ps ON ps.seqrelid = c.oid
     WHERE c.relnamespace = 'public'::regnamespace AND ps.seqtypid = 'int4'::regtype
  `);
  assert.deepEqual(rows, [], `nog op integer: ${rows.map((r) => r.naam).join(", ")}`);
});

// De tellers een eind vooruit zetten, zoals ze over een paar jaar staan.
async function zetTellersVooruit() {
  for (const reeks of ["trips_id_seq", "days_id_seq", "photos_id_seq", "journal_entries_id_seq",
                       "notifications_id_seq", "photobooks_id_seq", "photobook_pages_id_seq",
                       "photobook_page_photos_id_seq", "trip_views_id_seq"]) {
    // GREATEST, want de testdatabase blijft tussen runs staan: een tweede keer
    // hard terugzetten zou botsen met de rijen van de vorige keer.
    await S.pool.query("SELECT setval($1, GREATEST(nextval($1), $2::bigint))", [reeks, String(BOVEN_DE_GRENS + 1n)]);
  }
}

test("de API geeft een groot id als getal terug, niet als tekst", opties, async () => {
  const u = await S.maakGebruiker("getalvorm");
  await zetTellersVooruit();
  const r = await fetch(`${S.basis}/api/trips`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `session=${u.token}` },
    body: JSON.stringify({ name: "Vormtest", start_date: "2025-06-01", end_date: "2025-06-02" }),
  });
  const tekst = await r.text();
  assert.equal(r.status, 201, tekst);
  // Letterlijk in de JSON kijken: "id":2147483648 hoort er zonder aanhalings-
  // tekens te staan. Met tekst eromheen zou elke === in de client omklappen.
  assert.match(tekst, /"id":\s*\d{10}/, `id staat niet als getal in het antwoord: ${tekst.slice(0, 120)}`);
  assert.doesNotMatch(tekst, /"id":\s*"/, "een id hoort geen tekst te zijn");
  assert.equal(typeof JSON.parse(tekst).id, "number");
});

test("de app werkt door met foto's, dagboek en fotoboek voorbij de grens", opties, async () => {
  const u = await S.maakGebruiker("grootgetal");

  await zetTellersVooruit();

  const { status: reisStatus, data: reis } = await S.req("POST", "/api/trips", {
    gebruiker: u, body: { name: "Ver in de toekomst", start_date: "2025-06-01", end_date: "2025-06-02" },
  });
  assert.equal(reisStatus, 201, `reis aanmaken gaf ${reisStatus}: ${JSON.stringify(reis)}`);
  assert.ok(reis.id > 2147483647, `het id hoort voorbij de grens te liggen, maar was ${reis.id}`);
  assert.equal(typeof reis.id, "number");

  const { data: dagen } = await S.req("GET", `/api/trips/${reis.id}/days`, { gebruiker: u });
  assert.ok(dagen.length > 0);
  assert.ok(dagen[0].id > 2147483647);

  // Een foto erbij, teruglezen, en de bytes ook echt kunnen ophalen.
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#2d3436"/></svg>').toString("base64");
  const { status: fotoStatus, data: foto } = await S.req("POST", `/api/trips/${reis.id}/photos`, {
    gebruiker: u, body: { image: { data: svg, mediaType: "image/svg+xml" }, day_id: dagen[0].id },
  });
  assert.equal(fotoStatus, 201, `foto uploaden gaf ${fotoStatus}: ${JSON.stringify(foto)}`);
  assert.ok(foto.id > 2147483647);

  const beeld = await S.req("GET", `/api/photos/${foto.id}/raw`, { gebruiker: u });
  assert.equal(beeld.status, 200, `de foto teruglezen gaf ${beeld.status}`);

  // Het fotoboek: hier gaan de id's als array de database in, en juist daar
  // liep een ::int[] over.
  const { data: boek } = await S.req("POST", `/api/trips/${reis.id}/photobooks`, { gebruiker: u, body: {} });
  assert.ok(boek.id > 2147483647);
  const bewaard = await S.req("PUT", `/api/photobooks/${boek.id}/pages`, {
    gebruiker: u,
    body: { pages: [{
      title: "Groot",
      background: { type: "photo", photo_id: foto.id },
      photos: [{ photo_id: foto.id, x: 0.1, y: 0.1, width: 0.5, height: 0.4 }],
    }] },
  });
  assert.equal(bewaard.status, 200, `fotoboek opslaan gaf ${bewaard.status}: ${JSON.stringify(bewaard.data)}`);

  const { data: terug } = await S.req("GET", `/api/photobooks/${boek.id}`, { gebruiker: u });
  assert.equal(terug.pages.length, 1);
  assert.equal(terug.pages[0].photos.length, 1, "de foto op de pagina hoort er weer uit te komen");
  assert.equal(terug.pages[0].photos[0].photoId, foto.id, "en met hetzelfde id — als tekst zou dit niet matchen");
  assert.equal(terug.pages[0].background?.type, "photo");

  // Dagboek: schrijft een notificatie weg voor elke kijker.
  const notitie = await S.req("POST", `/api/trips/${reis.id}/journal`, {
    gebruiker: u, body: { day_id: dagen[0].id, body: "Werkt het nog?" },
  });
  assert.ok(notitie.status === 200 || notitie.status === 201, `dagboek gaf ${notitie.status}`);

  // En de PDF, die alle id's nog eens langsloopt.
  const { status, pdf } = await S.maakPdf(u, boek.id);
  assert.equal(status, 200);
  assert.ok(pdf.length > 1000);
});
