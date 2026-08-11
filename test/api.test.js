// De API-tests, tegen de echte server met een echte database erachter.
//
// Eén server voor alle tests in dit bestand: het opstarten kost een paar
// seconden omdat de client bij het booten gecompileerd wordt, en dat hoeft niet
// per test opnieuw.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, redenOvergeslagen } from "./helper/server.mjs";

let S = null;

before(async () => { if (!redenOvergeslagen) S = await startServer({ env: { APP_HERKOMSTEN: "capacitor://localhost" } }); }, { timeout: 90000 });
after(async () => { if (S) await S.stop(); });

// Alleen de sleutel zetten als er echt overgeslagen wordt: node:test kijkt naar
// de aanwezigheid van "skip", niet naar de waarde, dus { skip: null } slaat
// alsnog alles over.
const opties = redenOvergeslagen ? { skip: redenOvergeslagen } : {};
if (redenOvergeslagen) console.error(redenOvergeslagen);

async function datums(reis, gebruiker) {
  const { data } = await S.req("GET", `/api/trips/${reis.id}/days`, { gebruiker });
  return data.map((d) => String(d.date).slice(0, 10));
}

test("dagen volgen de reisperiode — bij het aanmaken komt er een dag per datum", opties, async () => {
  const u = await S.maakGebruiker("dagen");
  const { data: reis } = await S.req("POST", "/api/trips", {
    gebruiker: u, body: { name: "Reeks", start_date: "2030-05-01", end_date: "2030-05-04" },
  });
  assert.deepEqual(await datums(reis, u), ["2030-05-01", "2030-05-02", "2030-05-03", "2030-05-04"]);
});

test("dagen volgen de reisperiode — de periode verlengen vult de gaten aan", opties, async () => {
  const u = await S.maakGebruiker("verleng");
  const { data: reis } = await S.req("POST", "/api/trips", {
    gebruiker: u, body: { name: "Verleng", start_date: "2030-06-01", end_date: "2030-06-02" },
  });
  await S.req("PUT", `/api/trips/${reis.id}`, {
    gebruiker: u, body: { name: "Verleng", start_date: "2030-06-01", end_date: "2030-06-05" },
  });
  assert.equal((await datums(reis, u)).length, 5);
});

test("dagen volgen de reisperiode — tweemaal dezelfde periode opslaan levert geen dubbele dagen op", opties, async () => {
  // De bug waar dit allemaal mee begon: zonder unieke index op (reis, datum)
  // kwam elke keer opslaan er een rij bij.
  const u = await S.maakGebruiker("dubbel");
  const { data: reis } = await S.req("POST", "/api/trips", {
    gebruiker: u, body: { name: "Dubbel", start_date: "2030-07-01", end_date: "2030-07-03" },
  });
  for (let i = 0; i < 3; i++) {
    await S.req("PUT", `/api/trips/${reis.id}`, {
      gebruiker: u, body: { name: "Dubbel", start_date: "2030-07-01", end_date: "2030-07-03" },
    });
  }
  const rij = await datums(reis, u);
  assert.deepEqual(rij, [...new Set(rij)], "er staan dubbele datums in");
  assert.equal(rij.length, 3);
});

test("dagen volgen de reisperiode — een lege dag buiten de nieuwe periode verdwijnt, een gevulde blijft", opties, async () => {
  const u = await S.maakGebruiker("schuif");
  const { data: reis } = await S.req("POST", "/api/trips", {
    gebruiker: u, body: { name: "Schuif", start_date: "2030-08-01", end_date: "2030-08-04" },
  });
  const { data: dagen } = await S.req("GET", `/api/trips/${reis.id}/days`, { gebruiker: u });
  // 1 augustus krijgt inhoud en valt straks buiten de periode.
  await S.req("POST", `/api/days/${dagen[0].id}/activities`, {
    gebruiker: u, body: { title: "Vertrek", trip_id: reis.id },
  });
  await S.req("PUT", `/api/trips/${reis.id}`, {
    gebruiker: u, body: { name: "Schuif", start_date: "2030-08-03", end_date: "2030-08-05" },
  });
  const rij = await datums(reis, u);
  assert.ok(rij.includes("2030-08-01"), "de dag met een activiteit is weggegooid");
  assert.ok(!rij.includes("2030-08-02"), "de lege dag buiten de periode staat er nog");
  assert.ok(rij.includes("2030-08-05"), "de nieuwe dag is niet toegevoegd");
});

test("eigen reizen gaan mee, die van een ander blijven", opties, async () => {
  const a = await S.maakGebruiker("weg");
  const b = await S.maakGebruiker("blijft");

  const { data: vanA } = await S.req("POST", "/api/trips", {
    gebruiker: a, body: { name: "Van A", start_date: "2030-09-01", end_date: "2030-09-02" },
  });
  // Een deel-link van A: hier liep het verwijderen vroeger op stuk, omdat
  // trip_invites.created_by naar users wees zonder ON DELETE-regel.
  const uitnodiging = await S.req("POST", `/api/trips/${vanA.id}/invite`, { gebruiker: a, body: { role: "editor" } });
  assert.equal(uitnodiging.status, 200);

  const { data: vanB } = await S.req("POST", "/api/trips", {
    gebruiker: b, body: { name: "Van B", start_date: "2030-10-01", end_date: "2030-10-02" },
  });

  const overzicht = await S.req("GET", "/auth/me/verwijderoverzicht", { gebruiker: a });
  assert.equal(overzicht.status, 200);
  assert.equal(overzicht.data.eigenReizen, 1);

  const weg = await S.req("DELETE", "/auth/me", { gebruiker: a });
  assert.equal(weg.status, 200);

  // A bestaat niet meer, zijn reis ook niet, en er blijft geen eigenaarloze
  // reis achter.
  const na = await S.req("GET", "/auth/me", { gebruiker: a });
  assert.equal(na.status, 401, "de sessie van A werkt nog");
  const { rows: gebruikerRij } = await S.pool.query("SELECT 1 FROM users WHERE id = $1", [a.id]);
  assert.equal(gebruikerRij.length, 0);
  const { rows: reisRij } = await S.pool.query("SELECT 1 FROM trips WHERE id = $1", [vanA.id]);
  assert.equal(reisRij.length, 0);
  const { rows: wezen } = await S.pool.query("SELECT 1 FROM trips WHERE id = $1 AND user_id IS NULL", [vanA.id]);
  assert.equal(wezen.length, 0);

  // En B merkt er niets van.
  const bKijkt = await S.req("GET", `/api/trips/${vanB.id}`, { gebruiker: b });
  assert.equal(bKijkt.status, 200);
});

test("de cookie werkt en krijgt geen CORS-header terug", opties, async () => {
  const u = await S.maakGebruiker("koekje");
  const r = await S.req("GET", "/auth/me", { gebruiker: u });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("access-control-allow-origin"), null);
});

test("wie ben ik: cookie en token — een Bearer-token met dezelfde waarde werkt ook", opties, async () => {
  // Het app-pad: geen cookie, wel een Authorization-header.
  const u = await S.maakGebruiker("token");
  const r = await S.req("GET", "/auth/me", { headers: { authorization: `Bearer ${u.token}` } });
  assert.equal(r.status, 200);
  assert.equal(r.data.email, u.email);
});

test("wie ben ik: cookie en token — een verzonnen token wordt geweigerd", opties, async () => {
  const r = await S.req("GET", "/auth/me", { headers: { authorization: "Bearer bestaatniet" } });
  assert.equal(r.status, 401);
});

test("wie ben ik: cookie en token — alleen een herkomst uit APP_HERKOMSTEN krijgt toegang", opties, async () => {
  const u = await S.maakGebruiker("herkomst");
  const goed = await S.req("GET", "/api/trips", { gebruiker: u, headers: { origin: "capacitor://localhost" } });
  assert.equal(goed.headers.get("access-control-allow-origin"), "capacitor://localhost");
  assert.equal(goed.headers.get("access-control-allow-credentials"), "true");

  const fout = await S.req("GET", "/api/trips", { gebruiker: u, headers: { origin: "https://ergensanders.example" } });
  assert.equal(fout.headers.get("access-control-allow-origin"), null, "een onbekende herkomst kreeg toegang");
});

test("je komt niet bij de reis van iemand anders", opties, async () => {
  const a = await S.maakGebruiker("eigenaar");
  const b = await S.maakGebruiker("buitenstaander");
  const { data: reis } = await S.req("POST", "/api/trips", {
    gebruiker: a, body: { name: "Privé", start_date: "2030-11-01", end_date: "2030-11-02" },
  });
  for (const pad of [`/api/trips/${reis.id}`, `/api/trips/${reis.id}/days`, `/api/trips/${reis.id}/photos`]) {
    const r = await S.req("GET", pad, { gebruiker: b });
    assert.ok(r.status === 403 || r.status === 404, `${pad} gaf ${r.status} aan een buitenstaander`);
  }
});

test("rechten — zonder sessie kom je nergens", opties, async () => {
  const r = await S.req("GET", "/api/trips");
  assert.equal(r.status, 401);
});

test("rechten — alleen de eigenaar kan uitnodigen", opties, async () => {
  const a = await S.maakGebruiker("baas");
  const b = await S.maakGebruiker("gast");
  const { data: reis } = await S.req("POST", "/api/trips", {
    gebruiker: a, body: { name: "Delen", start_date: "2030-12-01", end_date: "2030-12-02" },
  });
  const r = await S.req("POST", `/api/trips/${reis.id}/invite`, { gebruiker: b, body: { role: "editor" } });
  assert.ok(r.status >= 400, `een buitenstaander mocht uitnodigen (${r.status})`);
});

test("de bundel komt ingepakt binnen en pakt identiek uit", opties, async () => {
  const kaal = await fetch(`${S.basis}/app.js`, { headers: { "accept-encoding": "identity" } });
  const kaalTekst = await kaal.text();

  const ingepakt = await fetch(`${S.basis}/app.js`, { headers: { "accept-encoding": "gzip" } });
  assert.equal(ingepakt.headers.get("content-encoding"), "gzip");
  // fetch pakt zelf uit, dus dit is de tekst ná uitpakken. Komt die overeen met
  // het origineel, dan is de verpakking onderweg goed gegaan.
  assert.equal(await ingepakt.text(), kaalTekst, "uitgepakt is niet gelijk aan het origineel");

  // Content-Length is wél de maat zoals hij over de lijn ging.
  const overDeLijn = Number(ingepakt.headers.get("content-length"));
  const winst = 1 - overDeLijn / Buffer.byteLength(kaalTekst);
  assert.ok(winst > 0.5, `inpakken leverde maar ${Math.round(winst * 100)}% op`);
});

test("antwoorden worden ingepakt — Vary staat erop, ook zonder inpakken", opties, async () => {
  // Zonder Vary kan een cache een ingepakt antwoord teruggeven aan iemand die
  // het niet kan uitpakken.
  const r = await fetch(`${S.basis}/app.js`, { headers: { "accept-encoding": "identity" } });
  assert.match(String(r.headers.get("vary")), /Accept-Encoding/i);
});

test("antwoorden worden ingepakt — een browser zonder ondersteuning krijgt het gewoon onverpakt", opties, async () => {
  const r = await fetch(`${S.basis}/app.js`, { headers: { "accept-encoding": "identity" } });
  assert.equal(r.headers.get("content-encoding"), null);
  assert.equal(r.status, 200);
});

test("antwoorden worden ingepakt — een lettertype wordt niet nog eens ingepakt", opties, async () => {
  const r = await fetch(`${S.basis}/vendor/font-400.woff2`, { headers: { "accept-encoding": "br, gzip" } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-encoding"), null, "woff2 is al gecomprimeerd en werd toch ingepakt");
});
