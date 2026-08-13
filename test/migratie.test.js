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
