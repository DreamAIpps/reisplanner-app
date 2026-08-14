// Twee servers die tegelijk opstarten tegen een lege database.
//
// Dit ging mis: CREATE TABLE IF NOT EXISTS is niet bestand tegen twee backends
// die op hetzelfde moment dezelfde tabel aanmaken — ze botsen op
// pg_type_typname_nsp_index en één van de twee valt om met "duplicate key
// value" nog vóór hij een verzoek heeft beantwoord. Bij een rolling deploy is
// dat precies wat er gebeurt.
//
// De test draait tegen een eigen, verse database: op een database waar alles al
// staat is de race er niet, en dan bewijst de test niets.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { DATABASE_URL, redenOvergeslagen } from "./helper/server.mjs";

const opties = redenOvergeslagen ? { skip: redenOvergeslagen } : {};
const PROJECT = new URL("..", import.meta.url).pathname;
const opTeRuimen = [];

after(async () => {
  for (const { url, naam } of opTeRuimen) {
    const beheer = new pg.Pool({ connectionString: url });
    await beheer.query(`DROP DATABASE IF EXISTS "${naam}" WITH (FORCE)`).catch(() => {});
    await beheer.end().catch(() => {});
  }
});

// Een verse database naast de bestaande, met dezelfde inloggegevens.
async function verseDatabase() {
  const naam = "rp_migratie_" + randomBytes(4).toString("hex");
  const basis = new URL(DATABASE_URL);
  basis.pathname = "/postgres";
  const beheer = new pg.Pool({ connectionString: basis.href });
  await beheer.query(`CREATE DATABASE "${naam}"`);
  await beheer.end();
  opTeRuimen.push({ url: basis.href, naam });
  const eigen = new URL(DATABASE_URL);
  eigen.pathname = "/" + naam;
  return eigen.href;
}

// Alleen de migratie draaien, zonder de rest van de server. Exit 0 betekent dat
// hij er doorheen kwam; de uitvoer komt mee zodat een fout leesbaar is.
function draaiMigratie(url) {
  return new Promise((klaar) => {
    const kind = spawn(process.execPath, ["-e", "require('./db').initDb().then(() => process.exit(0), (e) => { console.error(e.message); process.exit(1); })"], {
      cwd: PROJECT,
      env: { ...process.env, DATABASE_URL: url, TEST_DATABASE_URL: "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const uit = [];
    kind.stdout.on("data", (d) => uit.push(String(d)));
    kind.stderr.on("data", (d) => uit.push(String(d)));
    kind.on("exit", (code) => klaar({ code, uitvoer: uit.join("") }));
  });
}

test("twee servers tegelijk op een lege database botsen niet", opties, async (t) => {
  t.diagnostic("maakt een verse database aan; dit duurt even");
  const url = await verseDatabase();

  const uitkomsten = await Promise.all([draaiMigratie(url), draaiMigratie(url), draaiMigratie(url)]);
  const gevallen = uitkomsten.filter((u) => u.code !== 0);
  assert.equal(gevallen.length, 0,
    `${gevallen.length} van de 3 gelijktijdige starts viel om:\n${gevallen.map((u) => u.uitvoer).join("\n")}`);

  // En de database staat er daarna gewoon: één keer alles, niet half.
  const pool = new pg.Pool({ connectionString: url });
  const { rows } = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  );
  await pool.end();
  const tabellen = rows.map((r) => r.table_name);
  for (const nodig of ["trips", "days", "photos", "users", "trip_evaluaties", "trip_fotostemmen"]) {
    assert.ok(tabellen.includes(nodig), `tabel ${nodig} ontbreekt na de migratie`);
  }
});

test("een tweede start raakt de tabellen niet meer aan", opties, async (t) => {
  // Dit is wat de deadlock in CI veroorzaakte: server A was al klaar met
  // migreren en beantwoordde verzoeken, terwijl server B nog CREATE/ALTER
  // draaide. Die vraagt een exclusieve lock op tabellen waar A op dat moment
  // uit staat te lezen, en dan gooit Postgres er eentje uit.
  //
  // Sinds er een vingerafdruk in de database staat slaat een tweede start het
  // hele blok over. Dat is hier te zien aan het tijdstip: dat verspringt alleen
  // als er echt gemigreerd is.
  t.diagnostic("maakt een verse database aan; dit duurt even");
  const url = await verseDatabase();
  assert.equal((await draaiMigratie(url)).code, 0);

  const pool = new pg.Pool({ connectionString: url });
  const { rows: eerste } = await pool.query("SELECT vingerafdruk, bijgewerkt FROM schema_versie");
  assert.equal(eerste.length, 1, "er hoort precies één regel in schema_versie te staan");

  assert.equal((await draaiMigratie(url)).code, 0);
  const { rows: tweede } = await pool.query("SELECT vingerafdruk, bijgewerkt FROM schema_versie");
  await pool.end();

  assert.equal(tweede[0].vingerafdruk, eerste[0].vingerafdruk);
  assert.equal(tweede[0].bijgewerkt.getTime(), eerste[0].bijgewerkt.getTime(),
    "de migratie draaide een tweede keer — dan pakt hij weer exclusieve locks terwijl een andere server bedient");
});

test("migreren terwijl een andere server bedient loopt niet vast", opties, async (t) => {
  t.diagnostic("maakt een verse database aan; dit duurt even");
  const url = await verseDatabase();
  await draaiMigratie(url);

  // Eén verbinding leest onafgebroken uit dezelfde tabellen die de migratie
  // aanraakt — precies de rol van de server die al bedient.
  const pool = new pg.Pool({ connectionString: url });
  let lezen = true;
  let leesfout = null;
  const lezer = (async () => {
    while (lezen) {
      try {
        await pool.query(`SELECT e.antwoorden, u.id, u.name
                            FROM trip_evaluaties e JOIN users u ON u.id = e.user_id
                           WHERE e.trip_id = 1`);
        await pool.query("SELECT id, name FROM trips LIMIT 1");
      } catch (err) { leesfout = err.message; lezen = false; }
    }
  })();

  const starts = await Promise.all([draaiMigratie(url), draaiMigratie(url), draaiMigratie(url)]);
  lezen = false;
  await lezer;
  await pool.end();

  const gevallen = starts.filter((s) => s.code !== 0);
  assert.equal(gevallen.length, 0,
    `een start viel om terwijl er bediend werd:\n${gevallen.map((s) => s.uitvoer).join("\n")}`);
  assert.equal(leesfout, null, `het bedienen liep stuk tijdens een start: ${leesfout}`);
});
