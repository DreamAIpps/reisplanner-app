// De S3-compatibele opslagclient: ondertekenen en het heen en weer sturen.
//
// Het ondertekenen is het deel dat stil kan falen: een verkeerde handtekening
// geeft geen fout in de code maar een 403 van de bucket, in productie, bij de
// eerste foto. Daarom wordt hij hier tegen de gepubliceerde testvectoren van
// AWS gelegd — dezelfde die de officiele SDK's gebruiken.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { startNepS3, zetOpslagEnv } from "./helper/nep-s3.mjs";
import { createRequire } from "node:module";

const require2 = createRequire(import.meta.url);
const opslag = require2("../opslag.js");

test("de handtekening klopt met de AWS-testvector get-vanilla", () => {
  const r = opslag.ondertekening({
    methode: "GET", host: "example.amazonaws.com", pad: "/", query: {},
    headers: { Host: "example.amazonaws.com", "X-Amz-Date": "20150830T123600Z" },
    lichaamHash: crypto.createHash("sha256").update("").digest("hex"),
    stempel: { lang: "20150830T123600Z", kort: "20150830" },
    regio: "us-east-1", dienst: "service",
    sleutel: "AKIDEXAMPLE", geheim: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  });
  assert.equal(r.handtekening, "5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31");
  assert.equal(r.ondertekendeHeaders, "host;x-amz-date");
});

test("de handtekening klopt met het presign-voorbeeld uit de S3-documentatie", () => {
  const query = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": "AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request",
    "X-Amz-Date": "20130524T000000Z",
    "X-Amz-Expires": "86400",
    "X-Amz-SignedHeaders": "host",
  };
  const r = opslag.ondertekening({
    methode: "GET", host: "examplebucket.s3.amazonaws.com", pad: "/test.txt", query,
    headers: { Host: "examplebucket.s3.amazonaws.com" }, lichaamHash: "UNSIGNED-PAYLOAD",
    stempel: { lang: "20130524T000000Z", kort: "20130524" },
    regio: "us-east-1", dienst: "s3",
    sleutel: "AKIAIOSFODNN7EXAMPLE", geheim: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  });
  assert.equal(r.handtekening, "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404");
});

test("zonder ingestelde bucket is de opslag uit", () => {
  opslag.vergeetConfiguratie();
  const oud = { ...process.env };
  delete process.env.S3_ENDPOINT; delete process.env.S3_BUCKET;
  delete process.env.S3_ACCESS_KEY_ID; delete process.env.S3_SECRET_ACCESS_KEY;
  try {
    assert.equal(opslag.actief(), false);
    assert.throws(() => opslag.getekendeUrl("fotos/1"), /niet ingesteld/);
  } finally {
    Object.assign(process.env, oud);
    opslag.vergeetConfiguratie();
  }
});

test("bewaren, teruglezen en verwijderen gaat heen en weer", async () => {
  const nep = await startNepS3();
  const herstel = zetOpslagEnv(nep);
  opslag.vergeetConfiguratie();
  try {
    const bytes = crypto.randomBytes(4096);
    const sleutel = opslag.fotoSleutel(4242, "abc123");
    await opslag.bewaar(sleutel, bytes, "image/jpeg");

    assert.equal(nep.aantal(), 1);
    assert.deepEqual(await opslag.haal(sleutel), bytes);
    assert.equal(nep.objecten.get(sleutel).contentType, "image/jpeg");

    // Elk verzoek is ondertekend binnengekomen; de nep-bucket weigert de rest.
    assert.ok(nep.verzoeken.every((v) => v.ondertekend), "elk verzoek hoort ondertekend te zijn");

    assert.equal(await opslag.verwijder(sleutel), true);
    assert.equal(nep.aantal(), 0);
    assert.equal(await opslag.haal(sleutel), null);
    // Iets wegdoen dat er niet is telt als gelukt, anders blijft opruimen hangen.
    assert.equal(await opslag.verwijder(sleutel), true);
  } finally {
    herstel(); opslag.vergeetConfiguratie(); await nep.stop();
  }
});

test("een getekende URL haalt het object op zonder sleutel in de app", async () => {
  const nep = await startNepS3();
  const herstel = zetOpslagEnv(nep);
  opslag.vergeetConfiguratie();
  try {
    const bytes = Buffer.from("hallo vanuit de bucket");
    const sleutel = opslag.fotoSleutel(7, "deadbeef", "thumb");
    await opslag.bewaar(sleutel, bytes, "image/jpeg");

    const url = opslag.getekendeUrl(sleutel);
    assert.match(url, /X-Amz-Signature=/);
    assert.match(url, /X-Amz-Expires=/);

    const r = await fetch(url);
    assert.equal(r.status, 200);
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), bytes);

    // Zonder handtekening komt er niets uit — de bucket is niet publiek.
    const kaal = await fetch(url.split("?")[0]);
    assert.equal(kaal.status, 403);
  } finally {
    herstel(); opslag.vergeetConfiguratie(); await nep.stop();
  }
});

test("staat er een CDN voor, dan wordt er niet getekend maar doorverwezen", async () => {
  const nep = await startNepS3();
  const herstel = zetOpslagEnv(nep, { S3_PUBLIC_BASE: "https://fotos.voorbeeld.nl" });
  opslag.vergeetConfiguratie();
  try {
    const url = opslag.getekendeUrl("fotos/4/4242-abc");
    assert.equal(url, "https://fotos.voorbeeld.nl/fotos/4/4242-abc");
    assert.ok(!url.includes("X-Amz-"), "een publieke CDN-URL hoeft geen handtekening");
  } finally {
    herstel(); opslag.vergeetConfiguratie(); await nep.stop();
  }
});

test("sleutels blijven binnen de bucket, ook bij rare inhoud", () => {
  const s = opslag.fotoSleutel(1234, "a/b c+d");
  assert.ok(!s.includes(".."), "geen pad omhoog");
  // De sleutel wordt gecodeerd in de URL, niet rauw doorgegeven.
  assert.equal(opslag.codeerPad("fotos/1/a b+c"), "fotos/1/a%20b%2Bc");
  assert.equal(opslag.codeer("a b!c*d'e(f)"), "a%20b%21c%2Ad%27e%28f%29");
});
