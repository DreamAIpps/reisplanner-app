// De wachtrij en het werkproces.
//
// Wat hier misgaat is zelden zichtbaar: twee werkers die dezelfde taak pakken
// levert dubbel werk zonder foutmelding, en een werker die halverwege omvalt
// laat een taak eeuwig op 'bezig' staan — de gebruiker kijkt dan naar een balk
// die nooit meer beweegt. Vandaar dat die twee hier expliciet nagespeeld worden.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, redenOvergeslagen } from "./helper/server.mjs";
import { createRequire } from "node:module";

const require2 = createRequire(import.meta.url);

let S = null;
before(async () => { if (!redenOvergeslagen) S = await startServer(); }, { timeout: 90000 });
after(async () => { if (S) await S.stop(); });
const opties = redenOvergeslagen ? { skip: redenOvergeslagen } : {};

// De wachtrij-functies praten met dezelfde database als de testserver.
function takenModule() {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  return require2("../taken.js");
}

async function maakBoekMetFotos(naam, aantalPaginas = 3) {
  const u = await S.maakGebruiker(naam);
  const { data: reis } = await S.req("POST", "/api/trips", {
    gebruiker: u, body: { name: "Taakreis", start_date: "2025-06-01", end_date: "2025-06-02" },
  });
  const { data: dagen } = await S.req("GET", `/api/trips/${reis.id}/days`, { gebruiker: u });
  const fotos = [];
  for (const kleur of ["#e74c3c", "#3498db", "#2ecc71"]) {
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="${kleur}"/></svg>`).toString("base64");
    const { data } = await S.req("POST", `/api/trips/${reis.id}/photos`, {
      gebruiker: u, body: { image: { data: svg, mediaType: "image/svg+xml" }, day_id: dagen[0].id },
    });
    fotos.push(data.id);
  }
  const { data: boek } = await S.req("POST", `/api/trips/${reis.id}/photobooks`, { gebruiker: u, body: {} });
  const paginas = Array.from({ length: aantalPaginas }, (_, i) => ({
    title: `Pagina ${i + 1}`,
    background: { type: "photo", photo_id: fotos[i % fotos.length] },
    photos: [{ photo_id: fotos[(i + 1) % fotos.length], x: 0.1, y: 0.1, width: 0.6, height: 0.4 }],
  }));
  await S.req("PUT", `/api/photobooks/${boek.id}/pages`, { gebruiker: u, body: { pages: paginas } });
  return { u, reis, boek, fotos };
}

async function wachtTotKlaar(u, taakId, tijdslimiet = 60000) {
  const eind = Date.now() + tijdslimiet;
  let taak = null;
  while (Date.now() < eind) {
    ({ data: taak } = await S.req("GET", `/api/taken/${taakId}`, { gebruiker: u }));
    if (taak.status === "klaar" || taak.status === "mislukt") return taak;
    await new Promise((k) => setTimeout(k, 200));
  }
  throw new Error(`taak bleef op ${taak?.status} (${Math.round((taak?.voortgang ?? 0) * 100)}%)`);
}

test("de PDF komt uit het werkproces en niet uit het verzoek", opties, async () => {
  const { u, boek } = await maakBoekMetFotos("pdftaak", 4);

  const start = await S.req("POST", `/api/photobooks/${boek.id}/pdf`, { gebruiker: u, body: {} });
  assert.equal(start.status, 202, `starten gaf ${start.status}: ${JSON.stringify(start.data)}`);
  assert.ok(start.data.id, "er hoort een taak-id terug te komen");
  // Meteen antwoord: de PDF is op dit moment nog niet gemaakt.
  assert.ok(["wachtend", "bezig"].includes(start.data.status), `status was ${start.data.status}`);

  const taak = await wachtTotKlaar(u, start.data.id);
  assert.equal(taak.status, "klaar", `taak mislukte: ${taak.fout}`);
  assert.equal(taak.paginas, 4);
  assert.equal(taak.voortgang, 1);

  const bestand = await fetch(`${S.basis}/api/taken/${taak.id}/bestand`, {
    headers: { Cookie: `session=${u.token}` }, redirect: "follow",
  });
  assert.equal(bestand.status, 200);
  const pdf = Buffer.from(await bestand.arrayBuffer());
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-", "dit hoort een echte PDF te zijn");
  assert.match(pdf.toString("latin1"), /\/Subtype\s*\/Image/, "de foto's horen erin te zitten");
});

test("twee keer op de knop levert dezelfde taak op, niet twee keer hetzelfde werk", opties, async () => {
  const { u, boek } = await maakBoekMetFotos("dubbelklik", 2);
  const [een, twee] = await Promise.all([
    S.req("POST", `/api/photobooks/${boek.id}/pdf`, { gebruiker: u, body: {} }),
    S.req("POST", `/api/photobooks/${boek.id}/pdf`, { gebruiker: u, body: {} }),
  ]);
  assert.equal(een.status, 202);
  assert.equal(twee.status, 202);
  assert.equal(een.data.id, twee.data.id, "twee verzoeken hoorden dezelfde taak te krijgen");

  await wachtTotKlaar(u, een.data.id);
  const { rows } = await S.pool.query(
    "SELECT COUNT(*)::int AS n FROM taken WHERE soort = 'fotoboek-pdf' AND sleutel = $1",
    [`fotoboek:${boek.id}`]
  );
  assert.equal(rows[0].n, 1, "er hoort maar één taak te zijn aangemaakt");
});

test("de taak van een ander is niet te zien en niet op te halen", opties, async () => {
  const { u, boek } = await maakBoekMetFotos("vanmij", 2);
  const { data: taak } = await S.req("POST", `/api/photobooks/${boek.id}/pdf`, { gebruiker: u, body: {} });
  await wachtTotKlaar(u, taak.id);

  const vreemde = await S.maakGebruiker("vreemdeling");
  // Een taak-id is een oplopend getal, dus zonder controle kun je ze aflopen.
  const stand = await S.req("GET", `/api/taken/${taak.id}`, { gebruiker: vreemde });
  assert.equal(stand.status, 404);
  const bestand = await S.req("GET", `/api/taken/${taak.id}/bestand`, { gebruiker: vreemde });
  assert.equal(bestand.status, 404);
});

test("twee werkers pakken nooit dezelfde taak", opties, async () => {
  const taken = takenModule();
  const u = await S.maakGebruiker("verdelen");
  const gemaakt = [];
  for (let i = 0; i < 6; i++) {
    gemaakt.push(await taken.zetKlaar({ soort: "test-verdelen", invoer: { i }, gebruikerId: u.id }));
  }
  // Allemaal tegelijk pakken, zoals twee werkers dat zouden doen.
  const gepakt = await Promise.all(Array.from({ length: 6 }, () => taken.pakVolgende(["test-verdelen"])));
  const ids = gepakt.filter(Boolean).map((t) => t.id);
  assert.equal(ids.length, 6, "alle zes de taken horen opgepakt te worden");
  assert.equal(new Set(ids).size, 6, "geen enkele taak hoort twee keer opgepakt te worden");
  // En daarna is de rij leeg.
  assert.equal(await taken.pakVolgende(["test-verdelen"]), null);
  await S.pool.query("DELETE FROM taken WHERE soort = 'test-verdelen'");
});

test("een taak van een omgevallen werker wordt weer opgepakt", opties, async () => {
  const taken = takenModule();
  const u = await S.maakGebruiker("omgevallen");
  const taak = await taken.zetKlaar({ soort: "test-vastgelopen", invoer: {}, gebruikerId: u.id });
  const gepakt = await taken.pakVolgende(["test-vastgelopen"]);
  assert.equal(gepakt.id, taak.id);
  // Zolang de hartslag klopt blijft hij van deze werker.
  assert.equal(await taken.pakVolgende(["test-vastgelopen"]), null, "een lopende taak hoort niet afgepakt te worden");

  // Nu valt de werker om: geen hartslag meer.
  await S.pool.query("UPDATE taken SET hartslag = NOW() - INTERVAL '10 minutes' WHERE id = $1", [taak.id]);
  const opnieuw = await taken.pakVolgende(["test-vastgelopen"]);
  assert.ok(opnieuw, "een taak die stilstaat hoort weer beschikbaar te komen");
  assert.equal(opnieuw.id, taak.id);
  assert.equal(opnieuw.pogingen, 2);
  await S.pool.query("DELETE FROM taken WHERE soort = 'test-vastgelopen'");
});

test("een taak die blijft mislukken geeft het na een paar pogingen op", opties, async () => {
  const taken = takenModule();
  const u = await S.maakGebruiker("mislukt");
  const taak = await taken.zetKlaar({ soort: "test-mislukt", invoer: {}, gebruikerId: u.id });
  let laatste = null;
  for (let i = 0; i < taken.MAX_POGINGEN; i++) {
    await taken.pakVolgende(["test-mislukt"]);
    laatste = await taken.meldMislukt(taak.id, "kapot");
  }
  assert.equal(laatste.status, "mislukt", "na de laatste poging hoort hij op mislukt te staan");
  // En dan pakt niemand hem meer op.
  assert.equal(await taken.pakVolgende(["test-mislukt"]), null);

  // De client krijgt geen interne foutmelding te zien.
  const { data } = await S.req("GET", `/api/taken/${taak.id}`, { gebruiker: u });
  assert.equal(data.status, "mislukt");
  assert.doesNotMatch(data.fout || "", /kapot/, "de ruwe foutmelding hoort niet naar buiten te lekken");
  await S.pool.query("DELETE FROM taken WHERE soort = 'test-mislukt'");
});
