// De ranglijst van Snake en Pong. Het spelen zelf gebeurt in de browser; wat
// hier telt is dat er per speler één beste score blijft staan en dat niemand
// die van een ander overschrijft.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, redenOvergeslagen } from "./helper/server.mjs";

let S = null;
before(async () => { if (!redenOvergeslagen) S = await startServer(); }, { timeout: 90000 });
after(async () => { if (S) await S.stop(); });
const opties = redenOvergeslagen ? { skip: redenOvergeslagen } : {};

async function maakReisMetTweeSpelers() {
  const a = await S.maakGebruiker("speler");
  const b = await S.maakGebruiker("tegenstander");
  const { data: reis } = await S.req("POST", "/api/trips", {
    gebruiker: a, body: { name: "Speelreis", start_date: "2025-06-01", end_date: "2025-06-03" },
  });
  await S.pool.query("INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1,$2,'editor') ON CONFLICT DO NOTHING", [reis.id, b.id]);
  return { a, b, reis };
}

const stuur = (gebruiker, reis, spel, score) =>
  S.req("POST", `/api/trips/${reis.id}/spellen/${spel}`, { gebruiker, body: { score } });
const lees = (gebruiker, reis) => S.req("GET", `/api/trips/${reis.id}/spellen`, { gebruiker });

test("alleen je beste score blijft staan", opties, async () => {
  const { a, reis } = await maakReisMetTweeSpelers();
  assert.equal((await stuur(a, reis, "snake", 12)).data.beste, 12);
  assert.equal((await stuur(a, reis, "snake", 30)).data.beste, 30);
  // Een slechtere poging haalt het record niet naar beneden.
  assert.equal((await stuur(a, reis, "snake", 4)).data.beste, 30);

  const { data } = await lees(a, reis);
  assert.equal(data.ranglijsten.snake.length, 1, "er staan meerdere rijen voor dezelfde speler");
  assert.equal(data.ranglijsten.snake[0].score, 30);
  assert.ok(data.ranglijsten.snake[0].naam, "de naam ontbreekt in de ranglijst");
});

test("de twee spellen hebben elk hun eigen ranglijst", opties, async () => {
  const { a, b, reis } = await maakReisMetTweeSpelers();
  await stuur(a, reis, "snake", 20);
  await stuur(a, reis, "pong", 3);
  await stuur(b, reis, "pong", 9);

  const { data } = await lees(a, reis);
  assert.deepEqual(data.ranglijsten.snake.map((r) => r.score), [20]);
  // Hoogste bovenaan.
  assert.deepEqual(data.ranglijsten.pong.map((r) => r.score), [9, 3]);
  assert.equal(data.ranglijsten.pong[0].userId, b.id);
  // Elkaars score blijft heel: b's inzending raakte die van a niet.
  assert.equal(data.ranglijsten.snake[0].userId, a.id);
});

test("onzin komt de ranglijst niet in", opties, async () => {
  const { a, reis } = await maakReisMetTweeSpelers();
  for (const onzin of [-1, 999999999, "veel", null, Infinity]) {
    const r = await stuur(a, reis, "snake", onzin);
    assert.ok(r.status >= 400, `score ${JSON.stringify(onzin)} werd geaccepteerd`);
  }
  assert.ok((await stuur(a, reis, "schaken", 5)).status >= 400, "een onbekend spel werd geaccepteerd");

  const { data } = await lees(a, reis);
  assert.deepEqual(data.ranglijsten.snake, []);
});

test("een nul telt gewoon mee, en een meekijker mag meedoen", opties, async () => {
  const { a, reis } = await maakReisMetTweeSpelers();
  // Nul is een geldige score: je kunt afgaan zonder te scoren, en dan hoort er
  // geen foutmelding te komen.
  assert.equal((await stuur(a, reis, "pong", 0)).status, 200);

  const kijker = await S.maakGebruiker("meekijker");
  await S.pool.query("INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1,$2,'viewer') ON CONFLICT DO NOTHING", [reis.id, kijker.id]);
  assert.equal((await stuur(kijker, reis, "pong", 7)).status, 200, "een meekijker mocht niet meespelen");
  const { data } = await lees(kijker, reis);
  assert.equal(data.ranglijsten.pong[0].userId, kijker.id);
});

test("een buitenstaander komt er niet bij", opties, async () => {
  const { reis } = await maakReisMetTweeSpelers();
  const vreemde = await S.maakGebruiker("vreemde");
  assert.ok((await lees(vreemde, reis)).status >= 400, "een buitenstaander kon de ranglijst lezen");
  assert.ok((await stuur(vreemde, reis, "snake", 99)).status >= 400, "een buitenstaander kon een score inzenden");
});
