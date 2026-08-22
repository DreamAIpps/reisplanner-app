// Start de echte server op een vrije poort tegen een echte database, en geeft
// een verzoek-helper terug. Bewust de echte server en geen namaak: de bugs die
// er dit jaar uit kwamen — dubbele dagen, een gebruiker die niet te verwijderen
// was, tijden in de verkeerde zone — waren allemaal alleen zichtbaar met
// Postgres erachter.
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import net from "node:net";
import pg from "pg";

// Dezelfde behandeling van bigint als in db.js: node-postgres geeft een int8
// standaard als tékst terug, de app zet dat om naar een getal. Zonder deze
// regel geeft de pool hier "42" waar de server 42 teruggeeft, en dan faalt een
// vergelijking tussen die twee op een verschil dat in de app niet bestaat.
pg.types.setTypeParser(pg.types.builtins.INT8, (waarde) => Number(waarde));

export const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || "";

// Zonder database kunnen deze tests niets bewijzen. Ze overslaan is beter dan
// ze laten slagen op niets — maar dan wél luid, zodat niemand denkt dat het
// getest is.
export const redenOvergeslagen = DATABASE_URL
  ? null
  : "Geen TEST_DATABASE_URL of DATABASE_URL ingesteld — API-tests overgeslagen.";

async function vrijePoort() {
  return new Promise((klaar) => {
    const s = net.createServer();
    s.listen(0, () => { const { port } = s.address(); s.close(() => klaar(port)); });
  });
}

async function wachtTotHijLuistert(basis, tijdslimietMs = 60000) {
  const eind = Date.now() + tijdslimietMs;
  while (Date.now() < eind) {
    try {
      const r = await fetch(`${basis}/api/config/map`);
      if (r.ok) return;
    } catch { /* nog niet op */ }
    await new Promise((k) => setTimeout(k, 250));
  }
  throw new Error(`Server kwam niet op binnen ${tijdslimietMs} ms`);
}

export async function startServer({ env = {} } = {}) {
  const poort = await vrijePoort();
  const kind = spawn(process.execPath, ["server.js"], {
    cwd: new URL("../..", import.meta.url).pathname,
    env: {
      ...process.env,
      DATABASE_URL,
      PORT: String(poort),
      SESSION_SECRET: "test-" + randomBytes(8).toString("hex"),
      // Uit, anders praat een test met de buitenwereld.
      ANTHROPIC_API_KEY: "",
      RESEND_API_KEY: "",
      POSTMARK_TOKEN: "",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logregels = [];
  kind.stdout.on("data", (d) => logregels.push(String(d)));
  kind.stderr.on("data", (d) => logregels.push(String(d)));

  const basis = `http://127.0.0.1:${poort}`;
  try {
    await wachtTotHijLuistert(basis);
  } catch (err) {
    kind.kill();
    throw new Error(`${err.message}\n--- serveruitvoer ---\n${logregels.join("")}`);
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  // Een gebruiker met een geldige sessie, rechtstreeks in de database. Inloggen
  // gaat via Google of Apple en dat is in een test niet na te spelen; het token
  // dat eruit komt is gewoon een rij in sessions, dus die maken we zelf.
  async function maakGebruiker(naam) {
    const email = `${naam}-${randomBytes(4).toString("hex")}@test.invalid`;
    const { rows } = await pool.query(
      "INSERT INTO users (email, name, email_verified) VALUES ($1,$2,true) RETURNING id",
      [email, naam]
    );
    const token = randomBytes(16).toString("hex");
    await pool.query("INSERT INTO sessions (token, user_id) VALUES ($1,$2)", [token, rows[0].id]);
    return { id: rows[0].id, email, naam, token };
  }

  async function req(methode, pad, { body, gebruiker, headers = {} } = {}) {
    const r = await fetch(basis + pad, {
      method: methode,
      headers: {
        "content-type": "application/json",
        ...(gebruiker ? { cookie: `session=${gebruiker.token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    const tekst = await r.text();
    let data = null;
    try { data = tekst ? JSON.parse(tekst) : null; } catch { data = tekst; }
    return { status: r.status, data, headers: r.headers };
  }

  // Het fotoboek als PDF. Dat is geen verzoek meer maar een taak (zie taken.js),
  // dus: klaarzetten, wachten tot de werker klaar is, en dan het bestand
  // ophalen. Hier gebundeld zodat elke test die de inhoud van een PDF nakijkt
  // dat niet opnieuw hoeft uit te schrijven.
  async function maakPdf(gebruiker, boekId, tijdslimiet = 90000) {
    const start = await req("POST", `/api/photobooks/${boekId}/pdf`, { gebruiker, body: {} });
    if (start.status !== 202) throw new Error(`PDF starten gaf ${start.status}: ${JSON.stringify(start.data)}`);
    const eind = Date.now() + tijdslimiet;
    let taak = start.data;
    while (Date.now() < eind && (taak.status === "wachtend" || taak.status === "bezig")) {
      await new Promise((k) => setTimeout(k, 150));
      taak = (await req("GET", `/api/taken/${taak.id}`, { gebruiker })).data;
    }
    if (taak.status !== "klaar") throw new Error(`PDF-taak bleef op ${taak.status}: ${taak.fout || ""}`);
    const r = await fetch(`${basis}/api/taken/${taak.id}/bestand`, {
      headers: { Cookie: `session=${gebruiker.token}` }, redirect: "follow",
    });
    if (!r.ok) throw new Error(`PDF ophalen gaf ${r.status}`);
    return { taak, status: r.status, pdf: Buffer.from(await r.arrayBuffer()) };
  }

  async function stop() {
    await pool.end().catch(() => {});
    kind.kill();
    await new Promise((k) => kind.on("exit", k));
  }

  return { basis, req, maakGebruiker, maakPdf, pool, stop, logregels, hash: (s) => createHash("md5").update(s).digest("hex") };
}
