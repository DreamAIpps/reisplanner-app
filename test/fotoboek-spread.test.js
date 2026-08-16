// Eén achtergrondfoto over twee bladzijden van een opengeslagen boek.
//
// Het gevoelige punt is niet dat de foto er staat, maar dat de vouw op beide
// bladzijden op dezelfde plek in de foto valt. Op het scherm regelt CSS dat met
// één laag die over allebei ligt; in de PDF worden het twee losse vellen en
// moet de server zelf uitrekenen welke pagina links ligt en hoever de foto dan
// opschuift. Gaat dat mis, dan verspringt het beeld bij de vouw — en dat zie je
// pas in de gedrukte PDF, niet in de editor. Vandaar deze test.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { startServer, redenOvergeslagen } from "./helper/server.mjs";

let S = null;
before(async () => { if (!redenOvergeslagen) S = await startServer(); }, { timeout: 90000 });
after(async () => { if (S) await S.stop(); });
const opties = redenOvergeslagen ? { skip: redenOvergeslagen } : {};

// Breed genoeg om over twee A4-bladzijden te moeten worden bijgesneden.
const breedPlaatje = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="600"><rect width="800" height="600" fill="#dc503c"/><rect x="800" width="800" height="600" fill="#3c5ac8"/></svg>'
).toString("base64");

async function maakBoekMetSpread() {
  const u = await S.maakGebruiker("spread");
  const { data: reis } = await S.req("POST", "/api/trips", {
    gebruiker: u, body: { name: "Vouwreis", start_date: "2025-06-01", end_date: "2025-06-02" },
  });
  const { data: dagen } = await S.req("GET", `/api/trips/${reis.id}/days`, { gebruiker: u });
  const { data: foto } = await S.req("POST", `/api/trips/${reis.id}/photos`, {
    gebruiker: u, body: { image: { data: breedPlaatje, mediaType: "image/svg+xml" }, day_id: dagen[0].id },
  });
  const { data: boek } = await S.req("POST", `/api/trips/${reis.id}/photobooks`, { gebruiker: u, body: {} });
  const achtergrond = { type: "photo", photo_id: foto.id, spread: true };
  await S.req("PUT", `/api/photobooks/${boek.id}/pages`, {
    gebruiker: u,
    body: { pages: [
      { title: "Kaft", role: "cover_front", photos: [] },
      { title: "Links", photos: [], background: achtergrond },
      { title: "Rechts", photos: [], background: achtergrond },
    ] },
  });
  return { u, boek };
}

// Waar tekent de PDF een afbeelding? pdfkit schrijft eerst de plaatsings-matrix
// en dan pas de verwijzing naar het plaatje, allebei in een ingepakte stroom.
function afbeeldingsplekken(pdf) {
  const tekst = pdf.toString("latin1");
  const plekken = [];
  let i = 0;
  while (true) {
    const begin = tekst.indexOf("stream", i);
    if (begin < 0) break;
    let b = begin + "stream".length;
    if (tekst[b] === "\r") b++;
    if (tekst[b] === "\n") b++;
    const eind = tekst.indexOf("endstream", b);
    if (eind < 0) break;
    i = eind + "endstream".length;
    let inhoud = "";
    try { inhoud = zlib.inflateSync(Buffer.from(tekst.slice(b, eind), "latin1")).toString("latin1"); }
    catch { continue; }
    const m = inhoud.match(/([-\d.]+) 0 0 ([-\d.]+) ([-\d.]+) ([-\d.]+) cm\s*\n\/I\d+ Do/);
    if (m) plekken.push({ breedte: Number(m[1]), x: Number(m[3]) });
  }
  return plekken;
}

test("een achtergrond over beide bladzijden komt op beide pagina's terug", opties, async () => {
  const { u, boek } = await maakBoekMetSpread();
  const { data } = await S.req("GET", `/api/photobooks/${boek.id}`, { gebruiker: u });
  const binnenwerk = data.pages.filter((p) => p.role !== "cover_front");
  assert.equal(binnenwerk.length, 2);
  for (const p of binnenwerk) {
    assert.equal(p.background?.type, "photo", `${p.title} hoort een achtergrondfoto te hebben`);
    assert.equal(p.background.spread, true, `${p.title} hoort over beide bladzijden te lopen`);
  }
  // De kaft staat alleen en doet niet mee.
  assert.equal(data.pages.find((p) => p.role === "cover_front").background, null);
});

test("in de PDF schuift de rechterbladzijde precies één pagina op", opties, async () => {
  const { u, boek } = await maakBoekMetSpread();
  const r = await fetch(`${S.basis}/api/photobooks/${boek.id}/pdf`, { headers: { Cookie: `session=${u.token}` } });
  assert.equal(r.status, 200);
  const plekken = afbeeldingsplekken(Buffer.from(await r.arrayBuffer()));

  assert.equal(plekken.length, 2, "beide binnenpagina's horen de achtergrond te tekenen");
  const [links, rechts] = plekken;
  assert.equal(links.breedte, rechts.breedte, "dezelfde foto, dus dezelfde schaal");
  // A4 staand: 595.28pt breed. De rechterbladzijde toont het stuk dat daar
  // begint waar de linker ophoudt, dus staat de foto één paginabreedte verder
  // naar links. Afronding in de PDF-tekst: op een tiende punt vergelijken.
  assert.ok(Math.abs((links.x - rechts.x) - 595.28) < 0.1,
    `de rechterbladzijde hoort 595.28pt op te schuiven, maar het verschil is ${links.x - rechts.x}`);
  // En de foto ligt gecentreerd over het opengeslagen boek: even veel eraf
  // links als rechts. Dat is wat "center/cover" op het scherm ook doet.
  assert.ok(Math.abs(links.x - (595.28 * 2 - links.breedte) / 2) < 0.1,
    `de foto hoort gecentreerd over beide bladzijden te liggen, maar staat op ${links.x}`);
});
