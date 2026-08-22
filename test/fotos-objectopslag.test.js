// Foto's buiten de database: het hele pad, tegen de echte server.
//
// Het gevaarlijke aan deze verandering is niet dat het niet werkt, maar dat het
// half werkt: nieuwe foto's in de bucket en oude in de database, en dan één
// scherm dat alleen naar photos.data kijkt en een lege foto laat zien. Daarom
// draait hier alles door elkaar heen — uploaden, teruglezen, draaien,
// verhuizen, weggooien — in één test-server met een nep-bucket erachter.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, redenOvergeslagen } from "./helper/server.mjs";
import { startNepS3, zetOpslagEnv } from "./helper/nep-s3.mjs";

let S = null;
let nep = null;

before(async () => {
  if (redenOvergeslagen) return;
  nep = await startNepS3();
  S = await startServer({
    env: {
      S3_ENDPOINT: nep.endpoint,
      S3_BUCKET: nep.bucket,
      S3_ACCESS_KEY_ID: "TESTSLEUTEL",
      S3_SECRET_ACCESS_KEY: "testgeheim0123456789",
      S3_REGION: "eu-central-1",
      S3_URL_TTL_SECONDS: "600",
    },
  });
}, { timeout: 90000 });
after(async () => { if (S) await S.stop(); if (nep) await nep.stop(); });
const opties = redenOvergeslagen ? { skip: redenOvergeslagen } : {};

const plaatje = (kleur, maat = 60) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${maat}" height="${maat}"><rect width="${maat}" height="${maat}" fill="${kleur}"/></svg>`
).toString("base64");

async function maakReis(naam) {
  const u = await S.maakGebruiker(naam);
  const { data: reis } = await S.req("POST", "/api/trips", {
    gebruiker: u, body: { name: "Bucketreis", start_date: "2025-06-01", end_date: "2025-06-02" },
  });
  const { data: dagen } = await S.req("GET", `/api/trips/${reis.id}/days`, { gebruiker: u });
  return { u, reis, dag: dagen[0] };
}

async function beheerder(naam) {
  const u = await S.maakGebruiker(naam);
  await S.pool.query("UPDATE users SET is_admin = true WHERE id = $1", [u.id]);
  return u;
}

async function upload(u, reis, dagId, kleur, maat) {
  const { status, data } = await S.req("POST", `/api/trips/${reis.id}/photos`, {
    gebruiker: u,
    body: { image: { data: plaatje(kleur, maat), mediaType: "image/svg+xml" }, day_id: dagId },
  });
  assert.ok(status === 201 || status === 200, `upload gaf ${status}`);
  return data;
}

test("een nieuwe foto gaat naar de bucket en niet in de database", opties, async () => {
  const { u, reis, dag } = await maakReis("bucket");
  const foto = await upload(u, reis, dag.id, "#c0392b");

  const { rows } = await S.pool.query(
    "SELECT data, storage_key, byte_size, thumb_data, thumb_key, thumb_size FROM photos WHERE id = $1",
    [foto.id]
  );
  assert.equal(rows[0].data, null, "de bytes horen niet meer in de database te staan");
  assert.ok(rows[0].storage_key, "er hoort een sleutel in de objectopslag te staan");
  assert.ok(rows[0].byte_size > 0, "de maat wordt apart bewaard, anders klopt het beheerscherm niet meer");
  assert.equal(rows[0].thumb_data, null);
  assert.ok(rows[0].thumb_key, "ook de miniatuur hoort in de bucket");

  // En hij ligt er echt.
  assert.ok(nep.objecten.has(rows[0].storage_key), "het object staat niet in de bucket");
  assert.ok(nep.objecten.has(rows[0].thumb_key));
  assert.equal(rows[0].byte_size, nep.objecten.get(rows[0].storage_key).body.length);
});

test("de foto opvragen stuurt door naar de bucket in plaats van de bytes zelf", opties, async () => {
  const { u, reis, dag } = await maakReis("doorsturen");
  const foto = await upload(u, reis, dag.id, "#2980b9");

  for (const pad of ["raw", "thumb"]) {
    const r = await S.req("GET", `/api/photos/${foto.id}/${pad}`, { gebruiker: u });
    assert.equal(r.status, 302, `${pad} hoort door te verwijzen`);
    const doel = r.headers.get("location");
    assert.match(doel, /X-Amz-Signature=/, "de doorverwijzing hoort ondertekend te zijn");

    // De omleiding mag niet langer gecachet worden dan de handtekening leeft,
    // anders wijst een gecachete omleiding straks naar iets verlopens.
    const cache = r.headers.get("cache-control");
    const maxAge = Number(/max-age=(\d+)/.exec(cache)?.[1]);
    assert.ok(maxAge > 0 && maxAge <= 600, `cache-control was ${cache}`);

    // En de browser haalt er echt iets op.
    const beeld = await fetch(doel);
    assert.equal(beeld.status, 200);
    assert.ok((await beeld.arrayBuffer()).byteLength > 0);
  }
});

test("wie niet bij de reis mag, krijgt ook geen getekende URL", opties, async () => {
  const { u, reis, dag } = await maakReis("afgeschermd");
  const foto = await upload(u, reis, dag.id, "#8e44ad");
  const vreemde = await S.maakGebruiker("vreemde");
  const r = await S.req("GET", `/api/photos/${foto.id}/raw`, { gebruiker: vreemde });
  assert.ok(r.status === 403 || r.status === 404, `kreeg ${r.status}`);
  assert.equal(r.headers.get("location"), null);
});

test("een foto draaien vervangt het object en meldt het oude voor opruiming", opties, async () => {
  const { u, reis, dag } = await maakReis("draaien");
  const foto = await upload(u, reis, dag.id, "#16a085");
  const voor = (await S.pool.query("SELECT storage_key FROM photos WHERE id = $1", [foto.id])).rows[0].storage_key;

  const r = await S.req("POST", `/api/photos/${foto.id}/rotate`, { gebruiker: u, body: { turns: 1 } });
  assert.equal(r.status, 200);

  const na = (await S.pool.query("SELECT data, storage_key, thumb_key FROM photos WHERE id = $1", [foto.id])).rows[0];
  assert.equal(na.data, null, "ook na het draaien horen de bytes buiten de database te blijven");
  assert.notEqual(na.storage_key, voor, "andere bytes horen een ander object te zijn");
  assert.ok(nep.objecten.has(na.storage_key));

  const { rows: wachtrij } = await S.pool.query("SELECT sleutel FROM opslag_opruimen WHERE sleutel = $1", [voor]);
  assert.equal(wachtrij.length, 1, "het oude object hoort in de opruimlijst te staan");

  const admin = await beheerder("opruimer");
  await S.req("POST", "/api/admin/opslag-opruimen", { gebruiker: admin, body: {} });
  assert.equal(nep.objecten.has(voor), false, "na het opruimen hoort het oude object weg te zijn");
});

test("een foto weggooien ruimt ook de bucket op — ook als de reis in zijn geheel weggaat", opties, async () => {
  const { u, reis, dag } = await maakReis("weggooien");
  const los = await upload(u, reis, dag.id, "#d35400");
  const metDeReis = await upload(u, reis, dag.id, "#27ae60");
  const sleutels = (await S.pool.query(
    "SELECT storage_key, thumb_key FROM photos WHERE id = ANY($1::int[])", [[los.id, metDeReis.id]]
  )).rows.flatMap((r) => [r.storage_key, r.thumb_key]);
  assert.ok(sleutels.every((s) => nep.objecten.has(s)));

  await S.req("DELETE", `/api/photos/${los.id}`, { gebruiker: u });
  // De hele reis weg: die sleept via ON DELETE CASCADE de foto's mee, zonder
  // dat er ook maar één fotoroute aan te pas komt. Precies het geval waarvoor
  // het opruimen in de database zelf zit en niet in de route.
  await S.req("DELETE", `/api/trips/${reis.id}`, { gebruiker: u });

  const admin = await beheerder("opruimer2");
  const r = await S.req("POST", "/api/admin/opslag-opruimen", { gebruiker: admin, body: {} });
  assert.equal(r.status, 200);
  for (const s of sleutels) assert.equal(nep.objecten.has(s), false, `${s} hoort opgeruimd te zijn`);
});

test("bestaande foto's uit de database verhuizen in batches", opties, async () => {
  const { u, reis, dag } = await maakReis("verhuizen");
  const admin = await beheerder("verhuizer");

  // Drie foto's zoals ze er vóór deze verandering in stonden: bytes in de
  // kolom, geen sleutel. Rechtstreeks in de database, want de route zet ze
  // tegenwoordig meteen in de bucket.
  const ids = [];
  for (const kleur of ["#111111", "#222222", "#333333"]) {
    const foto = await upload(u, reis, dag.id, kleur);
    const bytes = nep.objecten.get(
      (await S.pool.query("SELECT storage_key FROM photos WHERE id = $1", [foto.id])).rows[0].storage_key
    ).body;
    await S.pool.query(
      "UPDATE photos SET data = $1, storage_key = NULL, thumb_data = NULL, thumb_key = NULL WHERE id = $2",
      [bytes, foto.id]
    );
    ids.push(foto.id);
  }

  // Zolang ze in de database staan komen de bytes gewoon uit de app.
  const voor = await S.req("GET", `/api/photos/${ids[0]}/raw`, { gebruiker: u });
  assert.equal(voor.status, 200, "een niet-verhuisde foto hoort nog gewoon geserveerd te worden");

  // Twee tegelijk, zodat de cursor ook echt gebruikt wordt. De cursor begint
  // net onder de eerste eigen foto: de testdatabase draagt de foto's van eerdere
  // runs met zich mee, en die zouden anders eerst aan de beurt zijn.
  const ronde1 = await S.req("POST", "/api/admin/fotos-verhuizen", {
    gebruiker: admin, body: { aantal: 2, naId: ids[0] - 1 },
  });
  assert.equal(ronde1.status, 200);
  assert.equal(ronde1.data.verhuisd, 2);
  assert.equal(ronde1.data.nogTeGaan, true);

  const ronde2 = await S.req("POST", "/api/admin/fotos-verhuizen", {
    gebruiker: admin, body: { aantal: 2, naId: ronde1.data.laatsteId },
  });
  assert.equal(ronde2.data.verhuisd, 1);
  assert.equal(ronde2.data.nogTeGaan, false);

  const { rows } = await S.pool.query(
    "SELECT id, data, storage_key, byte_size FROM photos WHERE id = ANY($1::int[]) ORDER BY id", [ids]
  );
  for (const r of rows) {
    assert.equal(r.data, null, `foto ${r.id} staat nog in de database`);
    assert.ok(r.storage_key && nep.objecten.has(r.storage_key), `foto ${r.id} ligt niet in de bucket`);
    assert.ok(r.byte_size > 0);
  }

  // En na de verhuizing wordt hij doorverwezen in plaats van geserveerd.
  const na = await S.req("GET", `/api/photos/${ids[0]}/raw`, { gebruiker: u });
  assert.equal(na.status, 302);
});

test("het beheerscherm blijft de juiste omvang tonen na de verhuizing", opties, async () => {
  const { u, reis, dag } = await maakReis("omvang");
  const admin = await beheerder("meter");
  await upload(u, reis, dag.id, "#0abde3", 200);

  const r = await S.req("GET", "/api/admin/storage", { gebruiker: admin });
  assert.equal(r.status, 200);
  // De bytes staan in de bucket, dus length(data) is nul — zonder byte_size zou
  // hier "0 bytes aan foto's" staan terwijl de bucket vol loopt.
  assert.ok(Number(r.data.photosBytes) > 0, `photosBytes was ${r.data.photosBytes}`);
  assert.ok(Number(r.data.thumbsBytes) > 0);
  assert.ok(r.data.inObjectopslag > 0);
});

test("dezelfde foto twee keer uploaden levert nog steeds één rij op", opties, async () => {
  const { u, reis, dag } = await maakReis("dubbel");
  const een = await upload(u, reis, dag.id, "#7f8c8d");
  const twee = await upload(u, reis, dag.id, "#7f8c8d");
  assert.equal(een.id, twee.id, "dezelfde bytes horen dezelfde rij te zijn");
  const { rows } = await S.pool.query("SELECT COUNT(*)::int AS n FROM photos WHERE trip_id = $1", [reis.id]);
  assert.equal(rows[0].n, 1);
});

test("het fotoboek-PDF haalt de foto's uit de bucket", opties, async () => {
  const { u, reis, dag } = await maakReis("boek");
  const foto = await upload(u, reis, dag.id, "#e17055", 300);
  const { data: boek } = await S.req("POST", `/api/trips/${reis.id}/photobooks`, { gebruiker: u, body: {} });
  await S.req("PUT", `/api/photobooks/${boek.id}/pages`, {
    gebruiker: u,
    body: { pages: [{
      title: "Een",
      background: { type: "photo", photo_id: foto.id },
      photos: [{ photo_id: foto.id, x: 0.1, y: 0.1, width: 0.5, height: 0.3 }],
    }] },
  });

  const r = await fetch(`${S.basis}/api/photobooks/${boek.id}/pdf`, { headers: { Cookie: `session=${u.token}` } });
  assert.equal(r.status, 200);
  const pdf = Buffer.from(await r.arrayBuffer());
  // Een PDF verwijst nergens heen: staan de bytes er niet in, dan zijn ze bij
  // het ophalen uit de bucket blijven liggen en is het boek leeg gedrukt.
  assert.ok(pdf.length > 3000, `de PDF is verdacht klein (${pdf.length} bytes)`);
  assert.match(pdf.toString("latin1"), /\/Subtype\s*\/Image/, "er hoort een afbeelding in de PDF te zitten");
});

test("een foto zonder bytes en zonder sleutel geeft een nette 404, geen 500", opties, async () => {
  const { u, reis, dag } = await maakReis("kwijt");
  const foto = await upload(u, reis, dag.id, "#636e72");
  // Het object weg, de rij blijft: precies wat er gebeurt als een verhuizing
  // halverwege strandt of iemand handmatig in de bucket opruimt.
  const sleutel = (await S.pool.query("SELECT storage_key FROM photos WHERE id = $1", [foto.id])).rows[0].storage_key;
  nep.objecten.delete(sleutel);

  const r = await S.req("GET", `/api/photos/${foto.id}/raw`, { gebruiker: u });
  // De app verwijst nog steeds door — dat mag, de bucket antwoordt zelf met 404.
  assert.equal(r.status, 302);
  const beeld = await fetch(r.headers.get("location"));
  assert.equal(beeld.status, 404);

  // Maar een pad dat de bytes écht nodig heeft mag niet omvallen.
  await S.pool.query("UPDATE photos SET thumb_key = NULL, thumb_data = NULL, thumb_rev = 0 WHERE id = $1", [foto.id]);
  const t = await S.req("GET", `/api/photos/${foto.id}/thumb`, { gebruiker: u });
  assert.equal(t.status, 404, `de miniatuur hoort 404 te geven, kreeg ${t.status}`);
});

test("opnieuw uploaden herstelt een ontbrekende miniatuur, mét het juiste revisienummer", opties, async () => {
  const { u, reis, dag } = await maakReis("miniatuur");
  const foto = await upload(u, reis, dag.id, "#00b894");
  const rev = (await S.pool.query("SELECT thumb_rev FROM photos WHERE id = $1", [foto.id])).rows[0].thumb_rev;
  assert.ok(rev > 0);

  // Zoals een foto van vóór de miniaturen, of eentje waarvan het maken misging.
  await S.pool.query(
    "UPDATE photos SET thumb_data = NULL, thumb_key = NULL, thumb_size = NULL, thumb_rev = 0 WHERE id = $1",
    [foto.id]
  );

  const opnieuw = await upload(u, reis, dag.id, "#00b894");
  assert.equal(opnieuw.id, foto.id, "dezelfde bytes horen dezelfde rij te blijven");
  const na = (await S.pool.query("SELECT thumb_key, thumb_size, thumb_rev FROM photos WHERE id = $1", [foto.id])).rows[0];
  assert.ok(na.thumb_key, "de miniatuur hoort weer terug te zijn");
  assert.equal(na.thumb_rev, rev, "en met het revisienummer van de huidige generator");
  assert.ok(na.thumb_size > 0);
  assert.ok(nep.objecten.has(na.thumb_key));
});
