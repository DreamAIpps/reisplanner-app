// Een nep-bucket: genoeg S3 om put/get/delete/presign echt heen en weer te doen,
// zonder netwerk en zonder account. Hij controleert ook of er ondertekend is —
// een verzoek zonder handtekening wordt geweigerd, precies zoals de echte.
import http from "node:http";
import crypto from "node:crypto";

export async function startNepS3({ bucket = "reisfotos" } = {}) {
  const objecten = new Map(); // sleutel -> { body, contentType }
  const verzoeken = []; // wat er binnenkwam, zodat een test kan kijken

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pad = decodeURIComponent(url.pathname);
    const voorvoegsel = `/${bucket}/`;
    verzoeken.push({ methode: req.method, pad, ondertekend: !!req.headers.authorization || url.searchParams.has("X-Amz-Signature") });

    if (!pad.startsWith(voorvoegsel)) { res.writeHead(404); res.end("geen bucket"); return; }
    const sleutel = pad.slice(voorvoegsel.length);

    // Ondertekend of getekende URL — anders eruit, net als een echte bucket.
    const heeftHandtekening = !!req.headers.authorization || url.searchParams.has("X-Amz-Signature");
    if (!heeftHandtekening) { res.writeHead(403); res.end("niet ondertekend"); return; }
    if (url.searchParams.has("X-Amz-Signature")) {
      const verlopen = Number(url.searchParams.get("X-Amz-Expires"));
      if (!verlopen || verlopen < 1) { res.writeHead(403); res.end("geen geldigheid"); return; }
    }

    if (req.method === "PUT") {
      const stukken = [];
      req.on("data", (s) => stukken.push(s));
      req.on("end", () => {
        objecten.set(sleutel, { body: Buffer.concat(stukken), contentType: req.headers["content-type"] || null });
        res.writeHead(200, { ETag: `"${crypto.randomBytes(8).toString("hex")}"` });
        res.end();
      });
      return;
    }
    if (req.method === "GET") {
      const o = objecten.get(sleutel);
      if (!o) { res.writeHead(404); res.end(); return; }
      // S3 laat de client het type en de bestandsnaam overschrijven via de
      // query. De app gebruikt dat om een PDF te laten downloaden in plaats van
      // openen, dus dat moet hier ook werken.
      const headers = {
        "Content-Type": url.searchParams.get("response-content-type") || o.contentType || "application/octet-stream",
        "Content-Length": o.body.length,
      };
      const disp = url.searchParams.get("response-content-disposition");
      if (disp) headers["Content-Disposition"] = disp;
      res.writeHead(200, headers);
      res.end(o.body);
      return;
    }
    if (req.method === "DELETE") {
      const bestond = objecten.delete(sleutel);
      res.writeHead(bestond ? 204 : 404);
      res.end();
      return;
    }
    res.writeHead(405); res.end();
  });

  await new Promise((klaar) => server.listen(0, "127.0.0.1", klaar));
  const poort = server.address().port;
  return {
    bucket,
    endpoint: `http://127.0.0.1:${poort}`,
    objecten,
    verzoeken,
    aantal: () => objecten.size,
    async stop() { await new Promise((klaar) => server.close(klaar)); },
  };
}

// Zet de omgevingsvariabelen die opslag.js leest, en geef een functie terug die
// ze weer opruimt.
export function zetOpslagEnv(nep, extra = {}) {
  const oud = {};
  const waarden = {
    S3_ENDPOINT: nep.endpoint,
    S3_BUCKET: nep.bucket,
    S3_ACCESS_KEY_ID: "TESTSLEUTEL",
    S3_SECRET_ACCESS_KEY: "testgeheim0123456789",
    S3_REGION: "eu-central-1",
    ...extra,
  };
  for (const [k, v] of Object.entries(waarden)) { oud[k] = process.env[k]; if (v === null) delete process.env[k]; else process.env[k] = v; }
  return () => { for (const [k, v] of Object.entries(oud)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } };
}
