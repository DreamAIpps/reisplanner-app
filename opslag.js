// Foto-bytes buiten de database.
//
// Foto's staan van oudsher als BYTEA in Postgres. Dat werkt prima tot een reis
// of tien, en daarna niet meer: de database wordt zo groot dat een back-up uren
// duurt, elke upload schrijft de bytes ook nog eens naar de WAL, en elke
// weergave sleept ze door het serverproces heen. Dit bestand biedt de andere
// kant: een S3-compatibele bucket (Cloudflare R2, AWS S3, Backblaze B2,
// MinIO), waar de bytes staan en waar de browser ze rechtstreeks ophaalt.
//
// Bewust zonder de AWS-SDK. Die weegt tientallen megabytes en we gebruiken er
// vier dingen van; het ondertekenen (SigV4) is een pagina code met node:crypto
// en is hieronder ook echt tegen de gepubliceerde testvectoren van AWS
// nagerekend. Eén afhankelijkheid minder om bij te houden en te vertrouwen.
//
// Staat er geen bucket ingesteld, dan is dit hele bestand een lege huls
// (`actief()` is false) en blijft alles werken zoals het werkte: bytes in de
// database. Zo kan de overstap per omgeving en stap voor stap.
const crypto = require("crypto");
const https = require("https");
const http = require("http");
const { URL } = require("url");

const LEEG_LICHAAM = crypto.createHash("sha256").update("").digest("hex");

// Wat er in de omgeving moet staan. `S3_PUBLIC_BASE` is optioneel: staat de
// bucket achter een CDN met publieke toegang, dan hoeft er niets ondertekend te
// worden en wijst de app rechtstreeks naar die basis-URL.
function configuratie() {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const sleutel = process.env.S3_ACCESS_KEY_ID;
  const geheim = process.env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !sleutel || !geheim) return null;
  return {
    endpoint: endpoint.replace(/\/+$/, ""),
    bucket,
    sleutel,
    geheim,
    regio: process.env.S3_REGION || "auto",
    publiekeBasis: (process.env.S3_PUBLIC_BASE || "").replace(/\/+$/, "") || null,
    // Hoe lang een getekende URL geldig is. Ruim genoeg dat een fotoboek met
    // honderd foto's binnen één sessie geladen wordt, kort genoeg dat een
    // gelekte URL geen eeuwigdurende sleutel is.
    tekenGeldigheid: Number(process.env.S3_URL_TTL_SECONDS) || 6 * 60 * 60,
  };
}

let gecachet;
function config() {
  if (gecachet === undefined) gecachet = configuratie();
  return gecachet;
}
// Alleen voor tests: de omgeving wijzigt daar per test.
function vergeetConfiguratie() { gecachet = undefined; }

function actief() { return config() !== null; }

// ---------- Ondertekenen (AWS Signature Version 4) ----------

function hmac(sleutel, tekst) {
  return crypto.createHmac("sha256", sleutel).update(tekst, "utf8").digest();
}

function sha256hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

// S3 wil een striktere codering dan encodeURIComponent: ook ! * ' ( ) moeten
// eraan geloven, anders klopt de handtekening niet.
function codeer(tekst) {
  return encodeURIComponent(tekst).replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

// Een sleutel is een pad; de schuine strepen moeten schuine strepen blijven.
function codeerPad(pad) {
  return pad.split("/").map(codeer).join("/");
}

function stempels(nu) {
  const iso = nu.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { lang: iso, kort: iso.slice(0, 8) };
}

function tekensleutel(geheim, kort, regio, dienst) {
  return hmac(hmac(hmac(hmac(`AWS4${geheim}`, kort), regio), dienst), "aws4_request");
}

// De kern van SigV4. Losgetrokken van het versturen zodat de testvectoren van
// AWS er rechtstreeks doorheen kunnen.
function ondertekening({ methode, host, pad, query, headers, lichaamHash, stempel, regio, dienst, sleutel, geheim }) {
  const namen = Object.keys(headers).map((h) => h.toLowerCase()).sort();
  const ondertekendeHeaders = namen.join(";");
  const canoniekeHeaders = namen
    .map((naam) => {
      const echteNaam = Object.keys(headers).find((h) => h.toLowerCase() === naam);
      return `${naam}:${String(headers[echteNaam]).trim().replace(/\s+/g, " ")}\n`;
    })
    .join("");

  const canoniekeQuery = Object.keys(query).sort()
    .map((k) => `${codeer(k)}=${codeer(query[k])}`)
    .join("&");

  const canoniek = [methode, pad, canoniekeQuery, canoniekeHeaders, ondertekendeHeaders, lichaamHash].join("\n");
  const bereik = `${stempel.kort}/${regio}/${dienst}/aws4_request`;
  const teTekenen = ["AWS4-HMAC-SHA256", stempel.lang, bereik, sha256hex(canoniek)].join("\n");
  const handtekening = crypto.createHmac("sha256", tekensleutel(geheim, stempel.kort, regio, dienst)).update(teTekenen, "utf8").digest("hex");
  return { handtekening, ondertekendeHeaders, bereik, canoniek, teTekenen };
}

// ---------- Verzoeken ----------

function bucketUrl(c, sleutelpad) {
  return new URL(`${c.endpoint}/${c.bucket}/${codeerPad(sleutelpad)}`);
}

function verstuur(url, opties, lichaam) {
  const vervoer = url.protocol === "http:" ? http : https;
  return new Promise((klaar, mis) => {
    const req = vervoer.request(url, opties, (res) => {
      const stukken = [];
      res.on("data", (s) => stukken.push(s));
      res.on("end", () => klaar({ status: res.statusCode, headers: res.headers, lichaam: Buffer.concat(stukken) }));
    });
    req.on("error", mis);
    // Een bucket die niet antwoordt mag geen request laten hangen tot de
    // browser het opgeeft; dan liever een nette fout.
    req.setTimeout(Number(process.env.S3_TIMEOUT_MS) || 20000, () => req.destroy(new Error("Objectopslag antwoordde niet op tijd")));
    if (lichaam) req.write(lichaam);
    req.end();
  });
}

async function ondertekendVerzoek(methode, sleutelpad, { lichaam = null, contentType = null } = {}) {
  const c = config();
  if (!c) throw new Error("Objectopslag is niet ingesteld");
  const url = bucketUrl(c, sleutelpad);
  const stempel = stempels(new Date());
  const lichaamHash = lichaam ? sha256hex(lichaam) : LEEG_LICHAAM;

  const headers = {
    Host: url.host,
    "x-amz-content-sha256": lichaamHash,
    "x-amz-date": stempel.lang,
  };
  if (contentType) headers["Content-Type"] = contentType;
  if (lichaam) headers["Content-Length"] = String(lichaam.length);

  const { handtekening, ondertekendeHeaders, bereik } = ondertekening({
    methode, host: url.host, pad: url.pathname, query: {}, headers,
    lichaamHash, stempel, regio: c.regio, dienst: "s3", sleutel: c.sleutel, geheim: c.geheim,
  });
  headers.Authorization = `AWS4-HMAC-SHA256 Credential=${c.sleutel}/${bereik}, SignedHeaders=${ondertekendeHeaders}, Signature=${handtekening}`;

  return verstuur(url, { method: methode, headers }, lichaam);
}

async function bewaar(sleutelpad, buffer, contentType) {
  const r = await ondertekendVerzoek("PUT", sleutelpad, { lichaam: buffer, contentType });
  if (r.status < 200 || r.status >= 300) {
    throw new Error(`Objectopslag weigerde het bewaren van ${sleutelpad} (${r.status}): ${r.lichaam.toString().slice(0, 200)}`);
  }
  return sleutelpad;
}

async function haal(sleutelpad) {
  const r = await ondertekendVerzoek("GET", sleutelpad);
  if (r.status === 404) return null;
  if (r.status < 200 || r.status >= 300) {
    throw new Error(`Objectopslag gaf ${sleutelpad} niet terug (${r.status})`);
  }
  return r.lichaam;
}

// Een object dat er niet is telt als verwijderd: opruimen moet altijd kunnen
// slagen, anders blijft een halfmislukte verwijdering eeuwig terugkomen.
async function verwijder(sleutelpad) {
  const r = await ondertekendVerzoek("DELETE", sleutelpad);
  if (r.status === 404) return true;
  if (r.status < 200 || r.status >= 300) {
    throw new Error(`Objectopslag kon ${sleutelpad} niet verwijderen (${r.status})`);
  }
  return true;
}

// ---------- Getekende URL's ----------

// Een URL waarmee de browser het object zelf ophaalt, zonder sleutel en zonder
// dat de bytes door dit proces gaan. Dat is het hele punt van de overstap.
function getekendeUrl(sleutelpad, { geldigheid = null, contentType = null } = {}) {
  const c = config();
  if (!c) throw new Error("Objectopslag is niet ingesteld");
  // Staat er een CDN voor met publieke toegang, dan is er niets te tekenen.
  if (c.publiekeBasis) return `${c.publiekeBasis}/${codeerPad(sleutelpad)}`;

  const url = bucketUrl(c, sleutelpad);
  const stempel = stempels(new Date());
  const seconden = Math.min(Math.max(Number(geldigheid) || c.tekenGeldigheid, 60), 7 * 24 * 60 * 60);
  const query = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${c.sleutel}/${stempel.kort}/${c.regio}/s3/aws4_request`,
    "X-Amz-Date": stempel.lang,
    "X-Amz-Expires": String(seconden),
    "X-Amz-SignedHeaders": "host",
  };
  if (contentType) query["response-content-type"] = contentType;

  const { handtekening } = ondertekening({
    methode: "GET", host: url.host, pad: url.pathname, query,
    headers: { Host: url.host }, lichaamHash: "UNSIGNED-PAYLOAD",
    stempel, regio: c.regio, dienst: "s3", sleutel: c.sleutel, geheim: c.geheim,
  });
  query["X-Amz-Signature"] = handtekening;
  const zoek = Object.keys(query).sort().map((k) => `${codeer(k)}=${codeer(query[k])}`).join("&");
  return `${url.origin}${url.pathname}?${zoek}`;
}

// Hoe lang een getekende URL nog mee moet. De doorverwijzing die de app geeft
// mag korter gecachet worden dan dit, anders wijst een gecachete omleiding naar
// een handtekening die al verlopen is.
function geldigheidSeconden() {
  const c = config();
  return c ? c.tekenGeldigheid : 0;
}

// ---------- Sleutels ----------

// Het pad in de bucket: soort / reis / inhoud.
//
// Op de inhoud gebaseerd, want dan leveren dezelfde bytes dezelfde sleutel en
// overschrijft opnieuw bewaren zichzelf in plaats van rommel achter te laten.
// Per reis afgeschermd, en dat is geen ordening maar een veiligheidsmaatregel:
// zouden twee reizen dezelfde foto delen, dan zou het weggooien van de ene het
// object onder de andere vandaan trekken. Binnen één reis kan dat niet, want
// daar staat al een unieke index op (trip_id, content_hash).
//
// Zonder inhoudshash (dat kan, als een omgezette foto op een hash-botsing
// stuitte) valt hij terug op toeval — dan is er niets te delen en dus ook niets
// per ongeluk te overschrijven.
function fotoSleutel(tripId, contentHash, soort = "vol") {
  const map = soort === "thumb" ? "thumbs" : "fotos";
  const staart = contentHash || crypto.randomBytes(16).toString("hex");
  return `${map}/${tripId}/${staart}`;
}

module.exports = {
  actief, config, vergeetConfiguratie,
  bewaar, haal, verwijder,
  getekendeUrl, geldigheidSeconden, fotoSleutel,
  // Voor de tests:
  ondertekening, codeer, codeerPad, stempels,
};
