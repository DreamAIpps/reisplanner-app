require("dotenv").config();
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
// sharp is a native module. If its prebuilt binary is unavailable on the host it
// must not take the whole app down — it is only used for thumbnails, and there is
// a pure-JS fallback below. It is an optionalDependency for the same reason: a
// hard dependency that fails to build makes `npm ci` fail and nothing deploys.
let sharp = null;
try { sharp = require("sharp"); }
catch (err) { console.warn("sharp unavailable, falling back to pure-JS thumbnails:", err.message); }
const jpegJs = require("jpeg-js");
const heicDecode = require("heic-decode");
const { query, transaction, initDb, pool } = require("./db");
const printapi = require("./printapi");
const opslag = require("./opslag");
const webPush = require("web-push");
const Anthropic = require("@anthropic-ai/sdk");
const PDFDocument = require("pdfkit");
const zlib = require("zlib");
const anthropicClient = new Anthropic();

// Elk AI-verzoek loopt hierlangs, zodat het tokenverbruik geteld wordt. De
// rekening komt per maand op één account binnen; zonder dit was niet te zien
// wie hem veroorzaakte of waaraan. Het wegschrijven gebeurt bewust náást het
// antwoord en niet ervoor: mislukt het loggen (tabel nog niet gemigreerd,
// database even weg), dan mag dat een reisplanner niet in de weg zitten.
async function aiVerzoek(opties, herkomst) {
  const msg = await anthropicClient.messages.create(opties);
  query(
    `INSERT INTO ai_usage (user_id, trip_id, doel, model, input_tokens, output_tokens)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      herkomst?.userId || null,
      herkomst?.tripId ? Number(herkomst.tripId) || null : null,
      herkomst?.doel || "onbekend",
      opties.model || null,
      msg.usage?.input_tokens || 0,
      msg.usage?.output_tokens || 0,
    ]
  ).catch((err) => console.error("AI-verbruik loggen mislukt:", err.message));
  return msg;
}

// Dezelfde ontwerp-tokens als PALETTE in app/01-tokens-en-iconen.js — hier alleen de paar
// waarden die de server nodig heeft (PDF-tekst en de standaard reiskleur),
// zodat een PDF er niet anders uitziet dan het scherm waar hij van komt.
const PALETTE = {
  primary: "#F3C2B5",
  textPrimary: "#373432",
};

const PORT = process.env.PORT || 3002;
const STARTED_AT = new Date();
const PUBLIC_DIR = path.join(__dirname, "public");

// ---------- App-assets: zelf hosten in plaats van via een CDN ----------
// De app haalde React, Leaflet, DOMPurify, exif-js, qrcode, Babel, Tailwind en
// het lettertype bij elke start op bij unpkg/cdn.tailwindcss/Google Fonts. Voor
// een reisapp is dat de verkeerde afhankelijkheid: in het vliegtuig, op slechte
// hotel-wifi, met roaming uit of in een land dat Google blokkeert, laadde er
// helemaal niets — en omdat de scripts nooit binnenkwamen, was er ook geen
// JavaScript meer om dat te melden. Je kreeg een leeg wit scherm.
//
// Alles komt nu uit node_modules (versies staan vast in package.json), en de
// twee dingen die vroeger in de browser gebeurden — JSX vertalen en de
// stylesheet genereren — gebeuren één keer bij het opstarten van de server.
// Dat scheelt de bezoeker ~3,6 MB downloaden en seconden rekenwerk per start,
// en houdt tegelijk de werkwijze van dit project intact: de bronbestanden in app/
// blijven gewoon de bestanden die je bewerkt, er is geen aparte bouwstap bijgekomen.
const VENDOR_FILES = {
  "react.js": "react/umd/react.production.min.js",
  "react-dom.js": "react-dom/umd/react-dom.production.min.js",
  "leaflet.js": "leaflet/dist/leaflet.js",
  "leaflet.css": "leaflet/dist/leaflet.css",
  "purify.js": "dompurify/dist/purify.min.js",
  "exif.js": "exif-js/exif.js",
  "qrcode.js": "qrcode-generator/qrcode.js",
  "font-400.woff2": "@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-400-normal.woff2",
  "font-500.woff2": "@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-500-normal.woff2",
  "font-600.woff2": "@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-600-normal.woff2",
  "font-700.woff2": "@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-700-normal.woff2",
};
const VENDOR_MIME = { ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".woff2": "font/woff2" };

// Gegenereerd bij het opstarten; tot die tijd leeg.
const built = { js: null, css: null, jsEtag: null, cssEtag: null };

// De app stond in één bestand van ruim tienduizend regels. Dat is nu opgedeeld
// in app/, met een nummer voorop: de volgorde waarin ze aan elkaar geplakt
// worden is dezelfde als in het oude bestand. Dat is geen detail maar de kern —
// alles deelt één scope, en een const die eerder gebruikt dan gedefinieerd wordt
// is meteen stuk. De splitsing is dan ook precies op regelgrenzen gedaan, zodat
// de samenvoeging letterlijk hetzelfde bestand oplevert.
const APP_DIR = path.join(__dirname, "app");

function appBronBestanden() {
  return fs.readdirSync(APP_DIR).filter((f) => f.endsWith(".js")).sort();
}

function buildAppScript() {
  const babel = require("@babel/core");
  const src = appBronBestanden()
    .map((f) => fs.readFileSync(path.join(APP_DIR, f), "utf8"))
    .join("\n");
  const out = babel.transformSync(src, {
    presets: [[require("@babel/preset-react"), { runtime: "classic" }]],
    configFile: false, babelrc: false, filename: "app.js",
  });
  return out.code;
}

async function buildStylesheet() {
  const postcss = require("postcss");
  const tailwind = require("tailwindcss");
  const src = fs.readFileSync(path.join(__dirname, "assets", "app.css"), "utf8");
  const result = await postcss([tailwind(require("./tailwind.config.js"))])
    .process(src, { from: path.join(__dirname, "assets", "app.css"), to: "/app.css" });
  return result.css;
}

async function buildAssets() {
  const t0 = Date.now();
  built.js = buildAppScript();
  built.jsEtag = `"${crypto.createHash("md5").update(built.js).digest("hex")}"`;
  built.css = await buildStylesheet();
  built.cssEtag = `"${crypto.createHash("md5").update(built.css).digest("hex")}"`;
  // Eén versiestempel over script + stylesheet samen. De service worker gebruikt
  // dit als cachenaam, zodat een uitrol automatisch een verse cache krijgt en er
  // nooit een oude versie kan blijven plakken.
  built.version = crypto.createHash("md5").update(built.js).update(built.css).digest("hex").slice(0, 12);
  built.sw = fs.readFileSync(path.join(PUBLIC_DIR, "sw.js"), "utf8").replace("__ASSET_VERSIE__", built.version);

  // Script en stylesheet worden hier één keer gebouwd en daarna duizenden keren
  // uitgeserveerd. Dus ook één keer inpakken, en niet bij elk verzoek opnieuw:
  // dat scheelt tientallen milliseconden rekenwerk per bezoeker. Omdat het
  // eenmalig is, mag brotli hier op zijn hoogste stand — dat pakt strakker in
  // dan de stand die we voor verzoeken onderweg gebruiken.
  built.ingepakt = {};
  for (const [naam, tekst] of [["js", built.js], ["css", built.css]]) {
    const buf = Buffer.from(tekst);
    built.ingepakt[naam] = {
      br: zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }),
      gzip: zlib.gzipSync(buf, { level: 9 }),
    };
  }
  const kb = (b) => Math.round(b.length / 1024);
  console.log(`App-assets gebouwd in ${Date.now() - t0} ms — script ${Math.round(built.js.length / 1024)} KB (brotli ${kb(built.ingepakt.js.br)} KB), stylesheet ${Math.round(built.css.length / 1024)} KB (brotli ${kb(built.ingepakt.css.br)} KB), versie ${built.version}.`);
}

function sendBuilt(req, res, body, etag, type, soort) {
  // Vary hoort er ook op een 304, anders kan een cache alsnog de verkeerde
  // variant vasthouden.
  const basis = {
    "Content-Type": type,
    // De inhoud zit in de ETag, dus de browser mag hard cachen zolang die klopt;
    // must-revalidate zorgt dat een nieuwe uitrol meteen wordt opgepikt.
    "Cache-Control": "public, max-age=0, must-revalidate",
    ETag: etag,
    Vary: "Accept-Encoding",
  };
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { ETag: etag, Vary: "Accept-Encoding" });
    res.end();
    return;
  }
  const klaar = soort && built.ingepakt && built.ingepakt[soort];
  const wijze = klaar ? kiesCompressie(req, type, Buffer.byteLength(body)) : null;
  if (wijze && klaar[wijze]) {
    res.writeHead(200, { ...basis, "Content-Encoding": wijze, "Content-Length": klaar[wijze].length });
    res.end(klaar[wijze]);
    return;
  }
  res.writeHead(200, { ...basis, "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
};

// Beveiligingsheaders op elke respons. De CSP is bewust afgestemd op wat deze
// app zonder buildstap nodig heeft en niet strenger: Babel transpileert de JSX
// in de browser (vandaar 'unsafe-eval'), index.html/login.html hebben inline
// scripts en de hele UI leunt op inline stijlen (vandaar 'unsafe-inline'). Die
// twee halen de scherpste XSS-bescherming eruit, maar de rest blijft zinvol —
// frame-ancestors/object-src/base-uri sluiten clickjacking, plugins en
// base-tag-kaping af, en de bronlijsten perken in wáár scripts/stijlen/fetches
// vandaan mogen komen. connect-src en img-src staan op 'https:' omdat de kaart
// (tegels van wisselende hosts), het weer en geocoding naar meerdere externe
// diensten gaan; enumereren zou hier alleen maar breken zonder veel te winnen
// zolang 'unsafe-inline' toch nodig is.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // 'unsafe-eval' is verdwenen: dat stond er alleen omdat Babel de JSX in de
  // browser vertaalde. Nu dat op de server gebeurt, mag de scherpste regel van
  // een CSP weer aan staan. De CDN-hosts zijn weg omdat alles zelf gehost wordt;
  // alleen Apple's aanmeld-SDK blijft extern — die hoort bij Sign in with Apple
  // en is niet zelf te hosten. 'unsafe-inline' blijft nodig voor de paar inline
  // scripts in index.html/login.html en de inline stijlen door de hele app.
  "script-src 'self' 'unsafe-inline' https://appleid.cdn-apple.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https:",
  "frame-src https://appleid.apple.com",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // Alleen zinvol over HTTPS (Railway); browsers negeren het over http, dus het
  // kan veilig altijd mee.
  res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  res.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
}

// ---------- Helpers ----------
// ---------- Antwoorden inpakken ----------
// De app ging onverpakt over de lijn: 618 KB script waar 161 KB hetzelfde doet.
// Dat telt op precies de verbindingen waar deze app voor is — hotelwifi,
// buitenland, twee streepjes bereik.
//
// Alleen tekst wordt ingepakt. Foto's, PDF's en lettertypen zijn al
// gecomprimeerd; die nog eens door gzip halen kost rekentijd en levert niets.
// En alleen boven een kilobyte, want onder die grens is de winst kleiner dan de
// paar bytes die de header zelf kost.
const COMPRIMEERBAAR = /^(?:text\/|application\/(?:json|javascript|xml|manifest)|image\/svg)/;
const COMPRESSIE_DREMPEL = 1024;

function kiesCompressie(req, contentType, lengte) {
  if (!req || lengte < COMPRESSIE_DREMPEL) return null;
  if (!COMPRIMEERBAAR.test(String(contentType || ""))) return null;
  const geaccepteerd = String(req.headers["accept-encoding"] || "");
  // Brotli pakt beter in dan gzip en elke browser die dit ondersteunt is nieuw
  // genoeg om er ook baat bij te hebben.
  if (/\bbr\b/.test(geaccepteerd)) return "br";
  if (/\bgzip\b/.test(geaccepteerd)) return "gzip";
  return null;
}

function pakIn(buf, wijze, klaar) {
  // Asynchroon, niet zlib.gzipSync: inpakken van een paar honderd kilobyte kost
  // tientallen milliseconden, en die zou de hele server stilzetten omdat Node
  // maar één draad heeft. Zo blijft hij intussen andere verzoeken afhandelen.
  if (wijze === "br") {
    zlib.brotliCompress(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }, (err, uit) => klaar(err ? null : uit));
  } else {
    zlib.gzip(buf, { level: 6 }, (err, uit) => klaar(err ? null : uit));
  }
}

// Verstuurt een antwoord, ingepakt als dat zin heeft. Vary hoort er altijd op,
// ook als er niets ingepakt is: zonder dat kan een cache een ingepakt antwoord
// teruggeven aan iemand die het niet kan uitpakken.
function verstuur(req, res, status, headers, body) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  const uit = { ...headers };
  uit.Vary = uit.Vary ? `${uit.Vary}, Accept-Encoding` : "Accept-Encoding";
  const wijze = kiesCompressie(req, uit["Content-Type"], buf.length);
  if (!wijze) {
    uit["Content-Length"] = buf.length;
    res.writeHead(status, uit);
    res.end(buf);
    return;
  }
  pakIn(buf, wijze, (ingepakt) => {
    // Mislukt het inpakken, dan gaat het gewoon onverpakt de deur uit. Een
    // reisplanner hoort niet stuk te gaan omdat zlib het even niet trok.
    if (ingepakt) { uit["Content-Encoding"] = wijze; uit["Content-Length"] = ingepakt.length; }
    else { uit["Content-Length"] = buf.length; }
    res.writeHead(status, uit);
    res.end(ingepakt || buf);
  });
}

function sendJson(res, status, data) {
  // res.req is het verzoek dat hierbij hoort. Dat scheelt het doorgeven van req
  // aan alle honderd aanroepplekken van sendJson.
  verstuur(res.req, res, status, { "Content-Type": "application/json; charset=utf-8" }, JSON.stringify(data));
}

function sendError(res, status, msg) {
  sendJson(res, status, { error: msg });
}

// Photos arrive base64-encoded inside JSON (~33% overhead), so the cap has to
// clear MAX_PHOTO_BYTES with room to spare. Without a cap the whole body is
// buffered before any size check runs, so one large request can OOM the process.
const MAX_BODY_BYTES = 16 * 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        // Niet meer opslaan zodra de grens is gehaald (dat houdt het geheugen
        // begrensd), maar de socket blijft leven: die deelt req en res, dus een
        // req.destroy() hier trok eerder ook de nog te versturen 413-respons
        // onderuit — zonder foutafhandeling op die kapotte socket crashte dat
        // het hele proces, en dat zag de gebruiker als "Fout 502" bij uploaden.
        tooLarge = true;
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (tooLarge) {
        const err = new Error("Verzoek te groot");
        err.statusCode = 413;
        return reject(err);
      }
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

// ---------- Auth helpers ----------
function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "").split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k, v.join("=")];
    }).filter(([k]) => k)
  );
}

// Must match the session cookie's Max-Age. The cookie lifetime is enforced only
// by the client, so without a server-side check a leaked token never expired.
const SESSION_TTL_DAYS = 30;

async function getSession(req) {
  // Twee manieren om te zeggen wie je bent, allebei met hetzelfde token uit
  // dezelfde sessions-tabel — er komt dus geen tweede soort inloggen bij.
  //
  // De webapp gebruikt de cookie: die is HttpOnly, dus JavaScript kan er niet
  // bij en een cross-site scripting-gat evenmin. Een app-schil kan dat niet
  // gebruiken, want daar is de pagina een lokaal bestand en is de cookie van
  // de server een third-party cookie — geblokkeerd op iOS. Die stuurt daarom
  // een Authorization-header.
  const koekje = parseCookies(req).session;
  const kop = req.headers.authorization || "";
  const uitKop = kop.startsWith("Bearer ") ? kop.slice(7).trim() : null;
  const session = koekje || uitKop;
  if (!session) return null;
  const { rows } = await query(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.created_at > NOW() - INTERVAL '${SESSION_TTL_DAYS} days'`,
    [session]
  );
  return rows[0] || null;
}

async function findOrCreateUser({ google_id, apple_id, email, name, given_name, family_name, avatar, locale, email_verified }) {
  let existing = null;

  if (google_id) {
    const { rows } = await query("SELECT * FROM users WHERE google_id = $1", [google_id]);
    existing = rows[0] || null;
  }
  if (!existing && apple_id) {
    const { rows } = await query("SELECT * FROM users WHERE apple_id = $1", [apple_id]);
    existing = rows[0] || null;
  }
  if (!existing && email) {
    const { rows } = await query("SELECT * FROM users WHERE email = $1", [email]);
    existing = rows[0] || null;
  }

  if (existing) {
    const { rows } = await query(
      `UPDATE users SET
        email = COALESCE($1, email),
        name = COALESCE($2, name),
        given_name = COALESCE($3, given_name),
        family_name = COALESCE($4, family_name),
        avatar = COALESCE($5, avatar),
        locale = COALESCE($6, locale),
        email_verified = COALESCE($7, email_verified),
        google_id = COALESCE($8, google_id),
        apple_id = COALESCE($9, apple_id),
        last_login_at = NOW(),
        login_count = COALESCE(login_count, 0) + 1
       WHERE id = $10 RETURNING *`,
      [email||null, name||null, given_name||null, family_name||null, avatar||null, locale||null, email_verified||null, google_id||null, apple_id||null, existing.id]
    );
    return rows[0];
  }

  const { rows } = await query(
    `INSERT INTO users (email, name, given_name, family_name, avatar, locale, email_verified, google_id, apple_id, last_login_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) RETURNING *`,
    [email||null, name||null, given_name||null, family_name||null, avatar||null, locale||null, email_verified||false, google_id||null, apple_id||null]
  );
  return rows[0];
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  await query("INSERT INTO sessions (token, user_id) VALUES ($1, $2)", [token, userId]);
  // Opportunistic prune so the table doesn't grow without bound.
  query(`DELETE FROM sessions WHERE created_at < NOW() - INTERVAL '${SESSION_TTL_DAYS} days'`)
    .catch((err) => console.error("Session prune failed:", err.message));
  return token;
}

function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_DAYS * 86400}`);
}

async function handlePostLogin(req, res, user) {
  const sessionToken = await createSession(user.id);
  const cookies = [`session=${sessionToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`];
  // De OAuth-state-cookie is nu verbruikt; ruim 'm meteen op.
  cookies.push("oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
  let redirect = "/";

  const { invite, quizjoin, evaljoin } = parseCookies(req);
  if (invite) {
    const { rows } = await query("SELECT * FROM trip_invites WHERE token = $1", [invite]);
    if (rows.length) {
      await query("INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [rows[0].trip_id, user.id, rows[0].role]);
      redirect = `/?trip=${rows[0].trip_id}`;
    }
    cookies.push("invite=; HttpOnly; Path=/; Max-Age=0");
  }
  if (quizjoin) {
    const { rows } = await query("SELECT * FROM quiz_sessions WHERE token = $1", [quizjoin]);
    if (rows.length) {
      const session = rows[0];
      await query("INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1,$2,'viewer') ON CONFLICT DO NOTHING", [session.trip_id, user.id]);
      await query("INSERT INTO quiz_participants (session_id, user_id, name) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
        [session.id, user.id, user.given_name || user.name || "Speler"]);
      redirect = `/?trip=${session.trip_id}&tab=quiz`;
    }
    cookies.push("quizjoin=; HttpOnly; Path=/; Max-Age=0");
  }
  if (evaljoin) {
    const { rows } = await query("SELECT trip_id FROM evaluatie_links WHERE token = $1", [evaljoin]);
    if (rows.length) {
      await schrijfEvaluatieDeelnemerIn(rows[0].trip_id, user.id);
      redirect = `/?trip=${rows[0].trip_id}&tab=reisvragen`;
    }
    cookies.push("evaljoin=; HttpOnly; Path=/; Max-Age=0");
  }

  res.setHeader("Set-Cookie", cookies);
  res.writeHead(302, { Location: redirect });
  res.end();
}

function appUrl(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

async function readFormBody(req) {
  // If body was already buffered by the auth middleware, reuse it
  if (req._rawBody) return new URLSearchParams(req._rawBody.toString());
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(new URLSearchParams(Buffer.concat(chunks).toString())));
    req.on("error", reject);
  });
}

async function generateAppleClientSecret() {
  const key = (process.env.APPLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  return jwt.sign(
    { iss: process.env.APPLE_TEAM_ID, aud: "https://appleid.apple.com", sub: process.env.APPLE_CLIENT_ID },
    key,
    { algorithm: "ES256", header: { alg: "ES256", kid: process.env.APPLE_KEY_ID }, expiresIn: "1h" }
  );
}

async function verifyAppleIdToken(idToken) {
  const { keys } = await (await fetch("https://appleid.apple.com/auth/keys")).json();
  const [headerB64] = idToken.split(".");
  // Convert base64url → base64 before decoding
  const headerJson = Buffer.from(headerB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();
  const header = JSON.parse(headerJson);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error(`Apple JWK niet gevonden (kid: ${header.kid})`);
  const pubKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
  // Audience MUST be pinned to our own Service ID: an Apple-signed id_token is
  // only a proof of identity *to the relying party it was minted for*. Without
  // this check, any site offering "Sign in with Apple" could replay its users'
  // tokens here and get a session. Issuer is pinned for the same reason.
  const audience = process.env.APPLE_CLIENT_ID;
  if (!audience) throw new Error("APPLE_CLIENT_ID niet geconfigureerd");
  return jwt.verify(idToken, pubKey, {
    algorithms: ["RS256"],
    audience,
    issuer: "https://appleid.apple.com",
  });
}

// ---------- E-mail notifications ----------
// Delivery goes through whichever provider is configured; with none set the
// feature stays dormant and only logs, so the app runs unchanged until a key is
// supplied. Both providers are plain REST, so there is no dependency to install
// and nothing that can fail to build.
const MAIL_FROM = process.env.MAIL_FROM || "Reisplanner <onboarding@resend.dev>";

function mailProvider() {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.POSTMARK_TOKEN) return "postmark";
  return null;
}

async function sendMail({ to, subject, text }) {
  const provider = mailProvider();
  if (!provider) {
    console.log(`[mail:dormant] would send to ${to}: ${subject}`);
    return false;
  }
  const endpoints = {
    resend: {
      url: "https://api.resend.com/emails",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: { from: MAIL_FROM, to: [to], subject, text },
    },
    postmark: {
      url: "https://api.postmarkapp.com/email",
      headers: { "X-Postmark-Server-Token": process.env.POSTMARK_TOKEN, "Content-Type": "application/json", Accept: "application/json" },
      body: { From: MAIL_FROM, To: to, Subject: subject, TextBody: text, MessageStream: "outbound" },
    },
  }[provider];

  const res = await fetch(endpoints.url, {
    method: "POST", headers: endpoints.headers, body: JSON.stringify(endpoints.body),
  });
  if (!res.ok) throw new Error(`${provider} responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return true;
}

// ---------- Push notifications ----------
// Same "dormant until configured" shape as e-mail: without VAPID keys set the
// feature just does nothing, so the app runs unchanged until they are added.
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:info@example.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}
function pushEnabled() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

// Pushes go to every subscribed device of one user. A subscription that the
// browser has revoked answers with 404/410 — that is the signal to forget it,
// not an error to retry.
async function sendPushToUser(userId, payload) {
  if (!pushEnabled()) return;
  const { rows } = await query("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1", [userId]);
  const body = JSON.stringify(payload);
  await Promise.all(rows.map(async (sub) => {
    try {
      await webPush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await query("DELETE FROM push_subscriptions WHERE endpoint = $1", [sub.endpoint]).catch(() => {});
      } else {
        console.error("Push versturen mislukt:", err.message);
      }
    }
  }));
}

// Notifications run both ways: viewers hear when the trip is updated, managers
// hear when someone reacts. Whoever caused the event is never told about it.
// One row feeds both channels: notify_email gates the mail digest, having a
// push subscription gates push — a row goes in for anyone eligible for
// either, and each flush marks only its own column (sent_at / push_sent_at).
async function notifyTripMembers(tripId, actorId, audience, kind, summary, actorName) {
  try {
    const sql = audience === "viewers"
      ? `SELECT user_id AS id FROM trip_members WHERE trip_id = $1 AND role = 'viewer'`
      : `SELECT user_id AS id FROM trips WHERE id = $1
         UNION
         SELECT user_id FROM trip_members WHERE trip_id = $1 AND role <> 'viewer'`;
    const { rows: recipients } = await query(
      `SELECT DISTINCT m.id FROM (${sql}) m WHERE m.id IS NOT NULL AND m.id <> $2`,
      [tripId, actorId]
    );
    if (!recipients.length) return;

    const { rows: notifyable } = await query(
      `SELECT DISTINCT u.id FROM users u
        WHERE u.id = ANY($1)
          AND (u.notify_email OR EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = u.id))`,
      [recipients.map((r) => r.id)]
    );
    // Reacties zijn het moment zelf waard — een eigenaar/editor wil meteen
    // weten wie er net iets zei, niet pas via de eerstvolgende gebundelde
    // push. Alleen-lezen kijkers houden de bestaande cooldown (ze krijgen nu
    // sowieso al geen reactie-meldingen, maar de rolcheck maakt dat expliciet
    // in plaats van toevallig).
    const bundleIds = [];
    for (const { id } of notifyable) {
      const { rows: inserted } = await query(
        "INSERT INTO notifications (user_id, trip_id, kind, actor_name, summary) VALUES ($1,$2,$3,$4,$5) RETURNING id",
        [id, tripId, kind, actorName || null, summary]
      );
      const role = kind === "comment" && pushEnabled() ? await getTripRole(tripId, id) : null;
      if (role && role !== "viewer") {
        await sendImmediateCommentPush(id, tripId, summary, inserted[0].id);
      } else {
        bundleIds.push(id);
      }
    }

    if (pushEnabled() && bundleIds.length) {
      await Promise.all(bundleIds.map((id) => maybeSendPush(id)));
    }
  } catch (err) {
    // A notification must never take down the action that triggered it.
    console.error("Queueing notification failed:", err.message);
  }
}

async function sendImmediateCommentPush(userId, tripId, summary, notificationId) {
  const { rows: subRows } = await query("SELECT 1 FROM push_subscriptions WHERE user_id = $1 LIMIT 1", [userId]);
  if (!subRows.length) return;
  const { rows: tripRows } = await query("SELECT name FROM trips WHERE id = $1", [tripId]);
  await sendPushToUser(userId, { title: tripRows[0]?.name || "Reisplanner", body: summary, tripId });
  await query("UPDATE notifications SET push_sent_at = NOW() WHERE id = $1", [notificationId]);
  await query("UPDATE users SET last_push_at = NOW() WHERE id = $1", [userId]);
}

const notifyTripManagers = (tripId, actorId, kind, summary, actorName) =>
  notifyTripMembers(tripId, actorId, "managers", kind, summary, actorName);
const notifyTripViewers = (tripId, actorId, kind, summary, actorName) =>
  notifyTripMembers(tripId, actorId, "viewers", kind, summary, actorName);

// One mail per recipient per 12 hours, covering every trip they follow. The
// short lull on top keeps a burst of activity out of the very first mail's
// blind spot: without it the first tap of an evening would send immediately and
// everything after it would wait half a day.
const NOTIFY_QUIET_MINUTES = 5;
const NOTIFY_WINDOW_HOURS = 12;
const NOTIFY_SWEEP_MS = 2 * 60 * 1000;

const countPhrase = (parts) =>
  parts.length > 1 ? parts.slice(0, -1).join(", ") + " en " + parts[parts.length - 1] : parts[0];

function describe({ entries, photos, comments, likes }) {
  return [
    [Number(entries), "nieuw verhaal", "nieuwe verhalen"],
    [Number(photos), "nieuwe foto", "nieuwe foto's"],
    [Number(comments), "reactie", "reacties"],
    [Number(likes), "duimpje", "duimpjes"],
  ].filter(([c]) => c > 0).map(([c, one, many]) => `${c} ${c === 1 ? one : many}`);
}

async function flushNotifications() {
  if (!mailProvider()) return;

  // Recipients who have something waiting, whose activity has settled, and who
  // have not been mailed inside the window.
  const { rows: due } = await query(
    `SELECT n.user_id, u.email, COALESCE(u.given_name, u.name, 'daar') AS greeting
       FROM notifications n
       JOIN users u ON u.id = n.user_id
      WHERE n.sent_at IS NULL AND u.email IS NOT NULL AND u.notify_email
      GROUP BY n.user_id, u.email, greeting
     HAVING MAX(n.created_at) < NOW() - INTERVAL '${NOTIFY_QUIET_MINUTES} minutes'
        AND NOT EXISTS (
          SELECT 1 FROM notifications s
           WHERE s.user_id = n.user_id
             AND s.sent_at > NOW() - INTERVAL '${NOTIFY_WINDOW_HOURS} hours'
        )`
  );

  for (const person of due) {
    const { rows: perTrip } = await query(
      `SELECT t.name AS trip_name,
              COUNT(*) FILTER (WHERE n.kind = 'comment') AS comments,
              COUNT(*) FILTER (WHERE n.kind = 'like') AS likes,
              COUNT(*) FILTER (WHERE n.kind = 'entry') AS entries,
              COUNT(*) FILTER (WHERE n.kind = 'photo') AS photos,
              ARRAY_AGG(n.summary ORDER BY n.created_at) AS lines
         FROM notifications n
         JOIN trips t ON t.id = n.trip_id
        WHERE n.user_id = $1 AND n.sent_at IS NULL
        GROUP BY t.id, t.name
        ORDER BY MAX(n.created_at) DESC`,
      [person.user_id]
    );
    if (!perTrip.length) continue;

    const totals = perTrip.reduce((acc, t) => ({
      entries: acc.entries + Number(t.entries), photos: acc.photos + Number(t.photos),
      comments: acc.comments + Number(t.comments), likes: acc.likes + Number(t.likes),
    }), { entries: 0, photos: 0, comments: 0, likes: 0 });
    const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);

    const sections = perTrip.flatMap((t) => {
      // Collapse repeats: twenty photos should read as one line with a count.
      const tally = new Map();
      for (const line of t.lines) tally.set(line, (tally.get(line) || 0) + 1);
      const bullets = [...tally].slice(0, 10)
        .map(([line, c]) => (c > 1 ? `• ${line} (${c}x)` : `• ${line}`));
      if (tally.size > 10) bullets.push(`• … en nog ${tally.size - 10}`);
      return [`${t.trip_name} — ${countPhrase(describe(t))}`, ...bullets, ""];
    });

    const subject = perTrip.length === 1
      ? `${countPhrase(describe(perTrip[0]))} bij "${perTrip[0].trip_name}"`
      : `${countPhrase(describe(totals))} bij je reizen`;

    const body = [
      `Hoi ${person.greeting},`,
      "",
      `Er ${grandTotal === 1 ? "is" : "zijn"} sinds je vorige bericht ${countPhrase(describe(totals))}:`,
      "",
      ...sections,
      `Bekijk het in Reisplanner: ${process.env.APP_URL || ""}`,
      "",
      `Je krijgt hoogstens één bericht per ${NOTIFY_WINDOW_HOURS} uur. Liever geen? Zet ze uit bij je account in de app.`,
    ].join("\n");

    try {
      await sendMail({ to: person.email, subject, text: body });
      await query("UPDATE notifications SET sent_at = NOW() WHERE user_id = $1 AND sent_at IS NULL", [person.user_id]);
    } catch (err) {
      // Leave them pending; the next sweep retries, and the window only counts
      // mail that actually went out.
      console.error(`Sending digest to ${person.email} failed:`, err.message);
    }
  }
}

// Push moves much faster than mail — at most one every 30 minutes per person
// instead of one per 12 hours — but the shape is the same: whatever piles up
// during the cooldown rides along in the next one rather than getting lost.
const PUSH_COOLDOWN_MINUTES = 30;

// Sends whatever is pending for this user right now, across all their trips,
// as one bundled push, and marks it all sent. Called both right after an
// event (when the cooldown has already elapsed) and by the sweep (once it
// elapses for whoever was mid-cooldown when their event came in).
async function sendBundledPush(userId) {
  const { rows: pending } = await query(
    `SELECT n.trip_id, t.name AS trip_name,
            COUNT(*) FILTER (WHERE n.kind = 'comment') AS comments,
            COUNT(*) FILTER (WHERE n.kind = 'like') AS likes,
            COUNT(*) FILTER (WHERE n.kind = 'entry') AS entries,
            COUNT(*) FILTER (WHERE n.kind = 'photo') AS photos
       FROM notifications n
       JOIN trips t ON t.id = n.trip_id
      WHERE n.user_id = $1 AND n.push_sent_at IS NULL
      GROUP BY n.trip_id, t.name`,
    [userId]
  );
  if (!pending.length) return;

  const totals = pending.reduce((acc, t) => ({
    entries: acc.entries + Number(t.entries), photos: acc.photos + Number(t.photos),
    comments: acc.comments + Number(t.comments), likes: acc.likes + Number(t.likes),
  }), { entries: 0, photos: 0, comments: 0, likes: 0 });

  const title = pending.length === 1 ? pending[0].trip_name : "Reisplanner";
  const body = pending.length === 1
    ? countPhrase(describe(pending[0]))
    : `${countPhrase(describe(totals))} bij je reizen`;

  await sendPushToUser(userId, { title, body, tripId: pending.length === 1 ? pending[0].trip_id : null });
  await query("UPDATE notifications SET push_sent_at = NOW() WHERE user_id = $1 AND push_sent_at IS NULL", [userId]);
  await query("UPDATE users SET last_push_at = NOW() WHERE id = $1", [userId]);
}

// Called right after an event is queued. Sends immediately if this person's
// cooldown has already elapsed (the common case — a lone event after a quiet
// stretch); otherwise leaves the row for the sweep to pick up once it has.
async function maybeSendPush(userId) {
  if (!pushEnabled()) return;
  const { rows: subRows } = await query("SELECT 1 FROM push_subscriptions WHERE user_id = $1 LIMIT 1", [userId]);
  if (!subRows.length) return;

  const { rows: userRows } = await query("SELECT last_push_at FROM users WHERE id = $1", [userId]);
  const lastPush = userRows[0]?.last_push_at;
  const cooldownElapsed = !lastPush || Date.now() - new Date(lastPush).getTime() >= PUSH_COOLDOWN_MINUTES * 60 * 1000;
  if (!cooldownElapsed) return;

  await sendBundledPush(userId);
}

// Catches what maybeSendPush left behind: anyone whose cooldown has since run
// out but who never triggered a fresh event to notice.
async function flushPushes() {
  if (!pushEnabled()) return;
  const { rows: due } = await query(
    `SELECT DISTINCT n.user_id
       FROM notifications n
       JOIN users u ON u.id = n.user_id
      WHERE n.push_sent_at IS NULL
        AND EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = n.user_id)
        AND (u.last_push_at IS NULL OR u.last_push_at < NOW() - INTERVAL '${PUSH_COOLDOWN_MINUTES} minutes')`
  );
  for (const { user_id } of due) {
    try { await sendBundledPush(user_id); }
    catch (err) { console.error(`Push-bundel versturen mislukt voor gebruiker ${user_id}:`, err.message); }
  }
}

// ---------- Router ----------
const routes = [];
// `tripScope` declares how to resolve the trip a request belongs to, so the
// dispatcher can authorise it before the handler runs. On writes it also rejects
// viewer-role (read-only) members; on reads it rejects non-members outright.
//   "param"   — the route's own :id IS the trip id (e.g. POST /api/trips/:id/days)
//   "<table>" — look up trip_id from that table using the route's :id (e.g. "activities")
// Only tables named here may be interpolated into resolveTripId's SQL.
const TRIP_SCOPE_TABLES = new Set([
  "days", "activities", "accommodations", "transports",
  "photos", "journal_entries", "journal_comments", "expenses", "packing_items", "photobooks",
]);
function route(method, pattern, handler, opts) {
  const keys = [];
  const re = new RegExp("^" + pattern.replace(/:([^/]+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "$");
  // allowViewer opts a write out of the viewer block — commenting on someone's
  // journal entry is the one thing a read-only member is allowed to do.
  // pattern zelf blijft bewaard (naast de gecompileerde regex) zodat de
  // performance-cockpit metrics per routepatroon kan groeperen (bijv.
  // "/api/trips/:id/photos") in plaats van per losse reis-/foto-id.
  routes.push({ method, pattern, re, keys, handler, tripScope: opts?.tripScope, allowViewer: opts?.allowViewer === true });
}

// :id en :sessionId zijn zonder uitzondering database-sleutels; alleen :token
// is een vrije tekst. Het patroon hierboven vangt echter alles wat geen schuine
// streep is, dus /api/trips/abc kwam gewoon binnen en belandde als "abc" in een
// vergelijking met een integer-kolom. Postgres weigert dat (22P02), de fout
// borrelde op tot de vangnet-handler en de aanroeper kreeg een 500 — terwijl
// hij zelf iets onmogelijks had gevraagd. Zo'n pad bestaat simpelweg niet, dus
// hier al afwijzen; matchRoute levert dan niets op en dat is een nette 404.
const ID_SLEUTEL = /^(id|.*Id)$/;
function geldigeSleutel(naam, waarde) {
  return !ID_SLEUTEL.test(naam) || /^[1-9][0-9]{0,17}$/.test(waarde);
}
function matchRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method && r.method !== "*") continue;
    const m = pathname.match(r.re);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    if (!r.keys.every((k) => geldigeSleutel(k, params[k]))) continue;
    return { handler: r.handler, pattern: r.pattern, params, tripScope: r.tripScope, allowViewer: r.allowViewer };
  }
  return null;
}

// ---------- Operationele metrics (in-memory) ----------
// Bewust niet in de database: dat zou juist de tabel belasten die je wilt
// monitoren, en een herstart van de Railway-dyno is toch al een moment
// waarop je met een schone lei begint — dus geen reden om dit persistent te
// maken. Alles hier leeft alleen zolang dit ene serverproces draait.
const METRICS_WINDOW_MS = 60 * 60 * 1000; // laatste uur aan losse requests
const METRICS_BUCKET_MS = 60 * 1000; // per-minuut voor de tijdlijn-grafiek
const METRICS_SLOW_THRESHOLD_MS = 200;
const metricsState = {
  totalRequests: 0,
  totalErrors: 0,
  recent: [], // { t, method, route, status, durationMs } — rollend venster van het laatste uur
  buckets: new Map(), // bucket-starttijd (ms) -> { count, errorCount, totalDuration }
  byRoute: new Map(), // "METHODE patroon" -> { count, errorCount, totalDuration, maxDuration } sinds het opstarten
  slowest: [], // traagste/foutieve requests uit het venster, voor de detailtabel
};

function recordMetric({ method, route, status, durationMs }) {
  const now = Date.now();
  const isError = status >= 500;
  const cutoff = now - METRICS_WINDOW_MS;

  metricsState.totalRequests++;
  if (isError) metricsState.totalErrors++;

  metricsState.recent.push({ t: now, method, route, status, durationMs });
  while (metricsState.recent.length && metricsState.recent[0].t < cutoff) metricsState.recent.shift();

  const bucketKey = Math.floor(now / METRICS_BUCKET_MS) * METRICS_BUCKET_MS;
  let bucket = metricsState.buckets.get(bucketKey);
  if (!bucket) { bucket = { count: 0, errorCount: 0, totalDuration: 0 }; metricsState.buckets.set(bucketKey, bucket); }
  bucket.count++;
  if (isError) bucket.errorCount++;
  bucket.totalDuration += durationMs;
  for (const key of metricsState.buckets.keys()) {
    if (key < cutoff) metricsState.buckets.delete(key);
  }

  const routeKey = `${method} ${route || "?"}`;
  let rs = metricsState.byRoute.get(routeKey);
  if (!rs) { rs = { count: 0, errorCount: 0, totalDuration: 0, maxDuration: 0 }; metricsState.byRoute.set(routeKey, rs); }
  rs.count++;
  if (isError) rs.errorCount++;
  rs.totalDuration += durationMs;
  rs.maxDuration = Math.max(rs.maxDuration, durationMs);

  if (durationMs > METRICS_SLOW_THRESHOLD_MS || isError) {
    metricsState.slowest.push({ t: now, method, route, status, durationMs });
    metricsState.slowest.sort((a, b) => b.durationMs - a.durationMs);
    metricsState.slowest = metricsState.slowest.filter((s) => s.t >= cutoff).slice(0, 20);
  }
}

// ---------- Begrenzing van de AI-aanroepen ----------
// De routes die Claude aanroepen (reistips, een reisbevestiging inlezen, een
// plaatsnaam afleiden, quizvragen maken) kostten per aanroep geld en stonden
// onbegrensd open voor iedere ingelogde gebruiker. Eén script of een vastgelopen
// client die blijft herhalen kon de rekening laten oplopen zonder dat er iets
// tegen ingaat. Dit is bewust een simpele teller in het geheugen: bij een
// herstart begint hij opnieuw, en dat is prima — het gaat om een bovengrens
// tegen doorslaan, niet om een boekhouding.
const AI_LIMIET_PER_UUR = 40;
const aiTellers = new Map(); // gebruiker-id -> { tot, aantal }

function aiLimietOverschreden(userId) {
  const nu = Date.now();
  const teller = aiTellers.get(userId);
  if (!teller || nu > teller.tot) {
    aiTellers.set(userId, { tot: nu + 60 * 60 * 1000, aantal: 1 });
    // Meteen opruimen wat verlopen is, zodat deze map niet ongemerkt volloopt.
    if (aiTellers.size > 500) {
      for (const [id, t] of aiTellers) if (nu > t.tot) aiTellers.delete(id);
    }
    return false;
  }
  teller.aantal += 1;
  return teller.aantal > AI_LIMIET_PER_UUR;
}

// Werpt een fout met statusCode, zodat de gewone foutafhandeling er een nette
// melding van maakt.
function bewaakAiGebruik(req) {
  if (aiLimietOverschreden(req.user.id)) {
    const err = new Error("Je hebt de slimme functies even te vaak gebruikt. Probeer het over een uurtje opnieuw.");
    err.statusCode = 429;
    throw err;
  }
}

// ---------- Trip role resolution (owner / editor / viewer / none) ----------
async function getTripRole(tripId, userId) {
  const { rows } = await query(
    `SELECT CASE WHEN t.user_id = $2 THEN 'owner' ELSE tm.role END AS role
     FROM trips t LEFT JOIN trip_members tm ON tm.trip_id = t.id AND tm.user_id = $2
     WHERE t.id = $1`,
    [tripId, userId]
  );
  return rows[0]?.role || null;
}

async function resolveTripId(tripScope, params) {
  if (tripScope === "param") return /^\d+$/.test(params.id) ? params.id : null;
  if (!TRIP_SCOPE_TABLES.has(tripScope)) throw new Error(`Unknown tripScope: ${tripScope}`);
  if (!/^\d+$/.test(params.id)) return null;
  const { rows } = await query(`SELECT trip_id FROM ${tripScope} WHERE id = $1`, [params.id]);
  return rows[0]?.trip_id || null;
}

// Guards against a request pinning a photo or journal entry to a day/activity/
// transport/stay that belongs to a different trip than the one just authorized.
const TARGET_TABLES = { day_id: "days", activity_id: "activities", transport_id: "transports", accommodation_id: "accommodations", photo_id: "photos" };

async function targetsBelongToTrip(tripId, targets) {
  for (const [field, table] of Object.entries(TARGET_TABLES)) {
    const id = targets[field];
    if (!id) continue;
    const { rows } = await query(`SELECT 1 FROM ${table} WHERE id = $1 AND trip_id = $2`, [id, tripId]);
    if (!rows.length) return false;
  }
  return true;
}

function stripCosts(role, row, fields) {
  if (role !== "viewer" || !row) return row;
  const copy = { ...row };
  fields.forEach((f) => { copy[f] = null; });
  return copy;
}

// ---------- Static files ----------
// The HTML shell must never be cached, so a deploy is picked up immediately even
// by an iOS standalone PWA. Everything it references carries a ?v=NN cache
// buster, so those can be cached hard: bumping the version in index.html (which
// is always fresh) is what invalidates them. Without this, every single app
// launch re-downloaded 200 KB of app.js over cellular and re-transpiled it.
function serveStatic(res, filePath, { versioned = false } = {}) {
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    const etag = `"${crypto.createHash("md5").update(data).digest("hex")}"`;
    const cacheControl = versioned
      ? "public, max-age=31536000, immutable"
      : "no-store, no-cache, must-revalidate";
    verstuur(res.req, res, 200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": cacheControl,
      ETag: etag,
    }, data);
  });
}

// ---------- Invite routes ----------
route("GET", "/invite/:token", async (req, res, params) => {
  const { rows } = await query("SELECT * FROM trip_invites WHERE token = $1", [params.token]);
  if (!rows.length) { res.writeHead(302, { Location: "/?error=invalid-invite" }); res.end(); return; }

  const user = await getSession(req);
  if (!user) {
    res.setHeader("Set-Cookie", `invite=${params.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600`);
    res.writeHead(302, { Location: "/login" });
    res.end();
    return;
  }

  await query("INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [rows[0].trip_id, user.id, rows[0].role]);
  res.writeHead(302, { Location: `/?trip=${rows[0].trip_id}` });
  res.end();
});

route("POST", "/api/trips/:id/invite", async (req, res, params, body) => {
  const { rows } = await query("SELECT id FROM trips WHERE id = $1 AND user_id = $2", [params.id, req.user.id]);
  if (!rows.length) return sendError(res, 403, "Alleen de eigenaar kan uitnodigen");
  const role = body?.role === "viewer" ? "viewer" : "editor";
  const token = crypto.randomBytes(16).toString("hex");
  await query("INSERT INTO trip_invites (token, trip_id, created_by, role) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [token, params.id, req.user.id, role]);
  sendJson(res, 200, { link: `${appUrl(req)}/invite/${token}`, role });
});

// Bewust een apart join-token van trip_invites: meedoen aan een quiz mag geen
// permanente "gedeelde reis"-uitnodiging betekenen los van de quiz om, en een
// gewone alleen-lezen uitnodiging mag omgekeerd geen toegang tot de quiz geven.
// De trip_members-rij hieronder is puur nodig zodat de quizfoto's (die achter
// dezelfde tripScope-check als de rest van de foto's zitten) opgehaald kunnen
// worden — de quiztab zelf blijft in de client verborgen tenzij isParticipant.
route("GET", "/quiz/:token", async (req, res, params) => {
  const { rows } = await query("SELECT * FROM quiz_sessions WHERE token = $1", [params.token]);
  if (!rows.length) { res.writeHead(302, { Location: "/?error=invalid-quiz" }); res.end(); return; }
  const session = rows[0];

  const user = await getSession(req);
  if (!user) {
    res.setHeader("Set-Cookie", `quizjoin=${params.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600`);
    res.writeHead(302, { Location: "/login" });
    res.end();
    return;
  }

  await query("INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1,$2,'viewer') ON CONFLICT DO NOTHING", [session.trip_id, user.id]);
  await query("INSERT INTO quiz_participants (session_id, user_id, name) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
    [session.id, user.id, user.given_name || user.name || "Speler"]);
  res.writeHead(302, { Location: `/?trip=${session.trip_id}&tab=quiz` });
  res.end();
});

// Meedoen aan de reisvragen, langs dezelfde weg als de quiz-QR. De
// trip_members-rij is nodig om überhaupt bij de reis te kunnen; de rij in
// evaluatie_deelnemers is wat hem onderscheidt van een gewone meekijker en hem
// de vragen laat beantwoorden.
route("GET", "/evaluatie/:token", async (req, res, params) => {
  const { rows } = await query("SELECT trip_id FROM evaluatie_links WHERE token = $1", [params.token]);
  if (!rows.length) { res.writeHead(302, { Location: "/?error=invalid-evaluatie" }); res.end(); return; }
  const tripId = rows[0].trip_id;

  const user = await getSession(req);
  if (!user) {
    res.setHeader("Set-Cookie", `evaljoin=${params.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600`);
    res.writeHead(302, { Location: "/login" });
    res.end();
    return;
  }

  await schrijfEvaluatieDeelnemerIn(tripId, user.id);
  res.writeHead(302, { Location: `/?trip=${tripId}&tab=reisvragen` });
  res.end();
});

async function schrijfEvaluatieDeelnemerIn(tripId, userId) {
  await query("INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1,$2,'viewer') ON CONFLICT DO NOTHING", [tripId, userId]);
  await query("INSERT INTO evaluatie_deelnemers (trip_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [tripId, userId]);
}

// Heartbeat from an open trip. Rounded to the minute and keyed on it, so the
// row count is the number of minutes spent regardless of how often the client
// pings or how many tabs are open.
route("POST", "/api/trips/:id/ping", async (req, res, params) => {
  await query(
    `INSERT INTO trip_pings (trip_id, user_id, minute)
     VALUES ($1, $2, date_trunc('minute', NOW())) ON CONFLICT DO NOTHING`,
    [params.id, req.user.id]
  );
  res.writeHead(204); res.end();
}, { tripScope: "param", allowViewer: true });

route("GET", "/api/trips/:id/share-stats", async (req, res, params) => {
  // Naast de eigenaar mag de beheerder erbij: deze cijfers staan nu in het
  // beheeroverzicht bij de gebruikers, en een beheerder is doorgaans geen lid
  // van de reis die hij bekijkt.
  const { rows: tripRows } = req.user.is_admin
    ? await query("SELECT id FROM trips WHERE id = $1", [params.id])
    : await query("SELECT id FROM trips WHERE id = $1 AND user_id = $2", [params.id, req.user.id]);
  if (!tripRows.length) return sendError(res, 403, "Alleen de eigenaar kan dit inzien");

  const { rows: members } = await query(
    `SELECT u.id, u.name, u.given_name, u.email, u.avatar, tm.role,
            (SELECT COUNT(*) FROM trip_views v WHERE v.trip_id = $1 AND v.user_id = u.id) AS view_count,
            (SELECT MAX(viewed_at) FROM trip_views v WHERE v.trip_id = $1 AND v.user_id = u.id) AS last_viewed_at,
            (SELECT COUNT(*) FROM trip_pings p WHERE p.trip_id = $1 AND p.user_id = u.id) AS minutes,
            (SELECT MAX(minute) FROM trip_pings p WHERE p.trip_id = $1 AND p.user_id = u.id) AS last_active_at,
            (SELECT MIN(minute) FROM trip_pings p WHERE p.trip_id = $1 AND p.user_id = u.id) AS first_active_at,
            (SELECT COUNT(*) FROM journal_comments c WHERE c.trip_id = $1 AND c.user_id = u.id) AS comments,
            (SELECT COUNT(*) FROM journal_likes l WHERE l.trip_id = $1 AND l.user_id = u.id) AS likes,
            (SELECT jr.last_seen_at FROM journal_reads jr WHERE jr.trip_id = $1 AND jr.user_id = u.id) AS dagboek_last_seen
       FROM trip_members tm JOIN users u ON u.id = tm.user_id
      WHERE tm.trip_id = $1
      ORDER BY tm.role ASC, u.name ASC NULLS LAST`,
    [params.id]
  );

  // A visit is a run of minutes with no gap longer than five, which turns a
  // column of timestamps into "came by six times" rather than "was here 47
  // separate minutes".
  const { rows: sessions } = await query(
    `SELECT user_id, COUNT(*) AS visits, MAX(len) AS longest_minutes
       FROM (
         SELECT user_id, grp, COUNT(*) AS len FROM (
           SELECT user_id, minute,
                  SUM(gap) OVER (PARTITION BY user_id ORDER BY minute) AS grp
             FROM (
               SELECT user_id, minute,
                      CASE WHEN minute - LAG(minute) OVER (PARTITION BY user_id ORDER BY minute)
                                <= INTERVAL '5 minutes' THEN 0 ELSE 1 END AS gap
                 FROM trip_pings WHERE trip_id = $1
             ) g
         ) grouped GROUP BY user_id, grp
       ) runs GROUP BY user_id`,
    [params.id]
  );
  const byUser = new Map(sessions.map((r) => [r.user_id, r]));

  // What they actually did, newest first — including which slot it hangs off,
  // so the client can jump straight to that day in het dagboek. Een like op
  // een reactie (journal_likes.comment_id) heeft zelf geen dag/activiteit/etc.
  // gezet — die zitten op de reactie waar 'm bij hoort, vandaar de join.
  const { rows: activity } = await query(
    `SELECT user_id, 'comment' AS kind, created_at AS at, body AS detail,
            day_id, activity_id, transport_id, accommodation_id
       FROM journal_comments WHERE trip_id = $1
     UNION ALL
     SELECT l.user_id, 'like', l.created_at, NULL,
            COALESCE(l.day_id, c.day_id), COALESCE(l.activity_id, c.activity_id),
            COALESCE(l.transport_id, c.transport_id), COALESCE(l.accommodation_id, c.accommodation_id)
       FROM journal_likes l
       LEFT JOIN journal_comments c ON c.id = l.comment_id
      WHERE l.trip_id = $1
     ORDER BY at DESC LIMIT 200`,
    [params.id]
  );
  const actionsByUser = new Map();
  for (const a of activity) {
    if (!actionsByUser.has(a.user_id)) actionsByUser.set(a.user_id, []);
    const list = actionsByUser.get(a.user_id);
    if (list.length < 10) {
      list.push({
        kind: a.kind, at: a.at, detail: a.detail,
        day_id: a.day_id, activity_id: a.activity_id, transport_id: a.transport_id, accommodation_id: a.accommodation_id,
      });
    }
  }

  const { rows: countRows } = await query(
    `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE viewed_at > NOW() - INTERVAL '24 hours') AS last_24h
       FROM trip_views WHERE trip_id = $1`,
    [params.id]
  );

  sendJson(res, 200, {
    members: members.map((m) => ({
      ...m,
      view_count: Number(m.view_count),
      minutes: Number(m.minutes),
      comments: Number(m.comments),
      likes: Number(m.likes),
      visits: Number(byUser.get(m.id)?.visits || 0),
      longest_minutes: Number(byUser.get(m.id)?.longest_minutes || 0),
      recent: actionsByUser.get(m.id) || [],
    })),
    total_views: Number(countRows[0].total),
    views_24h: Number(countRows[0].last_24h),
  });
});

// ---------- Admin routes ----------
// Lets an admin confirm the mail setup from the app, instead of waiting for a
// real comment to find out the key or sender is wrong.
route("POST", "/api/admin/test-mail", async (req, res) => {
  if (!req.user.is_admin) return sendError(res, 403, "Geen toegang");
  if (!req.user.email) return sendError(res, 400, "Je account heeft geen e-mailadres");
  const provider = mailProvider();
  if (!provider) return sendError(res, 400, "Geen mailprovider ingesteld (RESEND_API_KEY of POSTMARK_TOKEN ontbreekt)");
  try {
    await sendMail({
      to: req.user.email,
      subject: "Reisplanner: testmail",
      text: `Hoi,\n\nDeze testmail bevestigt dat notificaties werken via ${provider}.\nAfzender: ${MAIL_FROM}\n\nJe krijgt voortaan bericht als er een reactie of duimpje bij je dagboek komt.`,
    });
    sendJson(res, 200, { ok: true, provider, to: req.user.email, from: MAIL_FROM });
  } catch (err) {
    sendError(res, 502, `Versturen mislukt: ${err.message}`);
  }
});

route("GET", "/api/admin/users", async (req, res) => {
  if (!req.user.is_admin) return sendError(res, 403, "Geen toegang");
  const { rows } = await query(`
    SELECT u.id, u.name, u.given_name, u.family_name, u.email, u.avatar, u.is_admin,
           u.last_login_at, u.created_at, u.google_id, u.apple_id,
           u.password_hash IS NOT NULL as has_password,
           COALESCE(u.login_count, 0) as login_count,
           COUNT(s.token) FILTER (WHERE s.created_at > NOW() - INTERVAL '24 hours') as logins_24h
    FROM users u
    LEFT JOIN sessions s ON s.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at DESC`);
  sendJson(res, 200, rows);
});

// Per gebruiker: elke reis waar hij lid van is, met wanneer hij daar voor het
// laatst gekeken heeft. Dezelfde twee bronnen als de kijkcijfers per reis —
// trip_views legt vast dát een reis geopend werd, trip_pings per minuut dat hij
// openstond. De laatste ping is de scherpste "voor het laatst gezien"; is er
// geen ping (een kort bezoek van onder de minuut), dan valt hij terug op de
// laatste opening, zodat er niet ten onrechte "nooit" staat.
//
// Op verzoek pas, niet meegestuurd met de gebruikerslijst: dat zou bij elk
// openen van het beheerscherm een kruistabel over alle gebruikers en al hun
// reizen opleveren voor iets wat je per keer voor één iemand wilt weten.
route("GET", "/api/admin/users/:id/reizen", async (req, res, params) => {
  if (!req.user.is_admin) return sendError(res, 403, "Geen toegang");
  const { rows } = await query(
    `SELECT t.id, t.name, t.destination, t.start_date, t.end_date,
            tm.role, (t.user_id = $1) AS is_owner,
            v.aantal AS views, v.laatste AS last_viewed_at,
            p.laatste AS last_active_at, COALESCE(p.minuten, 0) AS minutes
       FROM trip_members tm
       JOIN trips t ON t.id = tm.trip_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS aantal, MAX(viewed_at) AS laatste
           FROM trip_views WHERE trip_id = t.id AND user_id = $1
       ) v ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS minuten, MAX(minute) AS laatste
           FROM trip_pings WHERE trip_id = t.id AND user_id = $1
       ) p ON true
      WHERE tm.user_id = $1
      ORDER BY GREATEST(COALESCE(p.laatste, '-infinity'::timestamptz),
                        COALESCE(v.laatste, '-infinity'::timestamptz)) DESC,
               t.start_date DESC NULLS LAST`,
    [params.id]
  );
  sendJson(res, 200, rows);
});

route("PATCH", "/api/admin/trips/:id/assign", async (req, res, params, body) => {
  if (!req.user.is_admin) return sendError(res, 403, "Geen toegang");
  const { user_id } = body;
  // Without this, an omitted field became NULL and orphaned the trip: it then
  // vanished from every /api/trips listing and only an admin could still see it.
  if (!Number.isInteger(user_id)) return sendError(res, 400, "user_id is verplicht");
  const { rows: exists } = await query("SELECT 1 FROM users WHERE id = $1", [user_id]);
  if (!exists.length) return sendError(res, 400, "Onbekende gebruiker");
  const { rows } = await query("UPDATE trips SET user_id = $1 WHERE id = $2 RETURNING *", [user_id, params.id]);
  if (!rows.length) return sendError(res, 404, "Trip not found");
  sendJson(res, 200, rows[0]);
});

// Eenmalige nabewerking voor foto's die al vóór de GPS-terugval zijn geüpload.
// Kan alleen iets vinden in rijen waarvan de opgeslagen bytes nog hun
// originele Exif hebben: een HEIC die bij upload al succesvol is omgezet naar
// JPEG heeft daarna geen Exif meer over (dezelfde reden waarom rotatie destijds
// apart in de pixels gebakken moest worden) — die blijven na deze nabewerking
// nog steeds zonder locatie, er is niets meer uit terug te halen.
route("POST", "/api/admin/backfill-photo-gps", async (req, res) => {
  if (!req.user.is_admin) return sendError(res, 403, "Geen toegang");
  const { rows } = await query("SELECT id, mime_type, data, storage_key FROM photos WHERE latitude IS NULL");
  let updated = 0;
  for (const row of rows) {
    let gps = null;
    try {
      const bytes = await fotoBytes(row);
      if (!bytes) continue;
      gps = looksLikeHeic(bytes, row.mime_type) ? readHeicGps(bytes) : readJpegGps(bytes);
    } catch (err) {
      console.error(`GPS-nabewerking mislukt voor foto ${row.id}:`, err.message);
    }
    if (!gps) continue;
    await query("UPDATE photos SET latitude=$1, longitude=$2 WHERE id=$3", [gps.latitude, gps.longitude, row.id]);
    updated++;
  }
  sendJson(res, 200, { checked: rows.length, updated });
});

// Eenmalige nabewerking voor foto's die al vóór de 2000px-cap zijn geüpload —
// die staan nog op hun volledige, vaak veel grotere formaat. In batches, niet
// in één keer: bij een paar honderd foto's duurt een volledige decodeer- en
// hercodeerslag per stuk lang genoeg om één groot verzoek over Railway's eigen
// proxy-timeout heen te trekken — de browser meldt dat dan als een kale
// "Load failed", niet als een nette foutmelding. De client roept deze route
// herhaald aan met een oplopende afterId tot hasMore false is.
const SHRINK_BATCH_SIZE = 15;
route("POST", "/api/admin/shrink-photos", async (req, res, params, body) => {
  if (!req.user.is_admin) return sendError(res, 403, "Geen toegang");
  const afterId = Number(body?.afterId) || 0;
  const { rows } = await query(
    "SELECT id, mime_type, data, storage_key, byte_size FROM photos WHERE id > $1 ORDER BY id LIMIT $2",
    [afterId, SHRINK_BATCH_SIZE + 1]
  );
  const hasMore = rows.length > SHRINK_BATCH_SIZE;
  const batch = hasMore ? rows.slice(0, SHRINK_BATCH_SIZE) : rows;
  let resized = 0, bytesBefore = 0, bytesAfter = 0;
  for (const row of batch) {
    try {
      let buffer = await fotoBytes(row), mediaType = row.mime_type;
      if (!buffer) continue;
      const origineleMaat = buffer.length;
      // Nog niet-omgezette HEIC eerst via dezelfde route als bij upload: die
      // bakt de EXIF-rotatie correct in de pixels. resizeFullPhoto gebruikt
      // sharp, dat voor HEIC alleen de container-rotatie kent, niet de
      // EXIF-rotatie waar iPhones 'm juist in zetten — precies de sideways-
      // foto-bug die voor nieuwe uploads al is opgelost, hier niet opnieuw
      // introduceren voor oude.
      if (looksLikeHeic(buffer, mediaType)) {
        ({ buffer, mediaType } = await normalizeImage(buffer, mediaType));
      }
      const out = await resizeFullPhoto(buffer, mediaType);
      if (out.buffer.length < origineleMaat) {
        // vervangFotoBytes zet de bytes op de juiste plek (bucket of kolom),
        // ruimt het oude object op en gooit de thumbnail weg — die wordt bij de
        // eerstvolgende weergave opnieuw gemaakt van de verkleinde foto.
        await vervangFotoBytes(row.id, out.mediaType, out.buffer);
        bytesBefore += origineleMaat;
        bytesAfter += out.buffer.length;
        resized++;
      }
    } catch (err) {
      console.error(`Verkleinen mislukt voor foto ${row.id}:`, err.message);
    }
  }
  sendJson(res, 200, {
    checked: batch.length, resized, bytesBefore, bytesAfter,
    lastId: batch.length ? batch[batch.length - 1].id : afterId,
    hasMore,
  });
});

// De verhuizing van bestaande foto's naar de objectopslag. In batches, want dit
// is precies het soort werk dat in één verzoek over elke proxy-timeout heen
// gaat: per foto een lees uit Postgres, een PUT naar de bucket en een UPDATE.
// De beheerder roept dit herhaald aan tot "resterend" nul is.
//
// Volgorde per foto: eerst naar de bucket, dan pas de rij bijwerken, en de bytes
// in de database gaan in diezelfde UPDATE leeg. Klapt het ertussenin, dan staat
// er hooguit een object in de bucket waar nog niets naar wijst — die wordt bij
// een volgende poging gewoon overschreven, want de sleutel volgt uit de inhoud.
// Andersom (rij eerst leegmaken) zou een foto onherstelbaar kwijtmaken.
const VERHUIS_BATCH = 25;
route("POST", "/api/admin/fotos-verhuizen", async (req, res, params, body) => {
  if (!req.user.is_admin) return sendError(res, 403, "Geen toegang");
  if (!opslag.actief()) return sendError(res, 400, "Er is geen objectopslag ingesteld (S3_BUCKET en verwanten ontbreken)");
  const aantal = Math.min(Math.max(Number(body?.aantal) || VERHUIS_BATCH, 1), 200);
  // Een cursor in plaats van steeds vooraan beginnen: een foto die om wat voor
  // reden dan ook niet mee wil zou anders elke ronde weer bovenaan staan en de
  // hele verhuizing tegenhouden. Nu schuift hij door; wat bleef liggen is
  // achteraf te zien aan het aantal dat nog in de database staat.
  const naId = Number(body?.naId) || 0;

  const { rows } = await query(
    `SELECT id, trip_id, mime_type, content_hash, data, thumb_data
       FROM photos WHERE storage_key IS NULL AND id > $1 ORDER BY id LIMIT $2`,
    [naId, aantal]
  );

  let verhuisd = 0, bytes = 0;
  const mislukt = [];
  for (const rij of rows) {
    try {
      if (!rij.data) {
        // Geen bytes en geen sleutel: hier valt niets te verhuizen. Zo'n rij zou
        // anders elke ronde opnieuw bovenaan komen en de verhuizing ophouden.
        mislukt.push({ id: rij.id, reden: "geen bytes" });
        continue;
      }
      const hash = rij.content_hash || crypto.createHash("md5").update(rij.data).digest("hex");
      const vol = await fotoVelden(rij.trip_id, rij.data, hash, { mediaType: rij.mime_type });
      const thumb = rij.thumb_data
        ? await fotoVelden(rij.trip_id, rij.thumb_data, hash, { soort: "thumb" })
        : { thumb_key: null, thumb_size: null };
      await query(
        `UPDATE photos SET data = NULL, storage_key = $1, byte_size = $2,
                thumb_data = NULL, thumb_key = $3, thumb_size = $4
          WHERE id = $5`,
        [vol.storage_key, vol.byte_size, thumb.thumb_key, thumb.thumb_size, rij.id]
      );
      bytes += rij.data.length + (rij.thumb_data ? rij.thumb_data.length : 0);
      verhuisd++;
    } catch (err) {
      console.error(`Verhuizen van foto ${rij.id} mislukt:`, err.message);
      mislukt.push({ id: rij.id, reden: err.message.slice(0, 120) });
    }
  }

  // Via de gedeeltelijke index photos_nog_in_db_idx, zodat dit een index-scan
  // over de rest blijft en niet elke ronde de hele fototabel doorloopt.
  const { rows: telling } = await query("SELECT COUNT(*)::int AS resterend FROM photos WHERE storage_key IS NULL");
  sendJson(res, 200, {
    bekeken: rows.length, verhuisd, bytes, mislukt,
    laatsteId: rows.length ? rows[rows.length - 1].id : naId,
    nogTeGaan: rows.length === aantal,
    resterend: telling[0].resterend,
  });
});

// De opruimronde nu draaien in plaats van bij de volgende ronde. Handig als je
// net veel hebt weggegooid en wilt zien dat de bucket ook echt leegloopt.
route("POST", "/api/admin/opslag-opruimen", async (req, res) => {
  if (!req.user.is_admin) return sendError(res, 403, "Geen toegang");
  await ruimObjectenOp();
  const { rows } = await query(
    `SELECT COUNT(*)::int AS wachtend,
            COUNT(*) FILTER (WHERE pogingen >= $1)::int AS opgegeven
       FROM opslag_opruimen`,
    [OPRUIM_MAX_POGINGEN]
  );
  sendJson(res, 200, rows[0]);
});

// Foto's staan als bytea in Postgres zelf, dus "geen ruimte meer" is een
// database-schijf die vol loopt, niet een losstaande foto-opslag. Dit geeft
// een beheerder zicht op wat daar de ruimte inneemt, zodat duidelijk is of
// opschonen genoeg is of dat de Postgres-schijf op Railway groter moet.
route("GET", "/api/admin/storage", async (req, res) => {
  if (!req.user.is_admin) return sendError(res, 403, "Geen toegang");
  const { rows } = await query(`
    SELECT
      COUNT(*)::int AS photo_count,
      -- byte_size is de waarheid zodra een foto in de objectopslag ligt (dan is
      -- data leeg); length(data) is de terugval voor rijen van voor die kolom.
      COALESCE(SUM(COALESCE(byte_size, length(data))), 0)::bigint AS photos_bytes,
      COALESCE(SUM(COALESCE(thumb_size, length(thumb_data))), 0)::bigint AS thumbs_bytes,
      COUNT(*) FILTER (WHERE storage_key IS NOT NULL)::int AS in_objectopslag,
      COALESCE(SUM(length(data)), 0)::bigint AS in_database_bytes
    FROM photos
  `);
  let databaseBytes = null;
  try {
    const dbSize = await query("SELECT pg_database_size(current_database()) AS bytes");
    databaseBytes = Number(dbSize.rows[0].bytes);
  } catch (err) {
    // Vereist rechten die een beperkte connectie-rol niet altijd heeft —
    // dan laten we dit veld gewoon weg in plaats van de hele route te laten
    // struikelen over een cijfer dat niet strikt nodig is.
    console.error("pg_database_size niet beschikbaar:", err.message);
  }
  sendJson(res, 200, {
    photoCount: rows[0].photo_count,
    photosBytes: Number(rows[0].photos_bytes),
    thumbsBytes: Number(rows[0].thumbs_bytes),
    databaseBytes,
    // Waar de foto's staan. Zolang hier nog bytes in de database zitten loopt de
    // verhuizing nog, en dan zegt de omvang van de database niets over de foto's.
    objectopslag: opslag.actief(),
    inObjectopslag: rows[0].in_objectopslag,
    inDatabaseBytes: Number(rows[0].in_database_bytes),
  });
});

// ---------- Foto's die op elkaar lijken ----------
//
// Byte-identieke foto's kunnen niet meer twee keer in een reis staan: daar zit
// een unieke index op content_hash, en bij het opstarten worden oudere gevallen
// samengevoegd. Toch staan er dubbelen in de lijst, en dat kan alleen als het
// dezelfde foto is met net andere bytes — bijvoorbeeld één keer geüpload op
// volle grootte en één keer al verkleind.
//
// Vandaar deze twee signalen, met erbij wélk signaal aansloeg, zodat er iets te
// zien valt in plaats van iets te raden:
//
//   exif  — hetzelfde opnametijdstip binnen één reis. Sterk: twee opnames op
//           precies dezelfde seconde zijn vrijwel altijd dezelfde foto. Een
//           serieopname kan het ook halen, dus dit is een aanwijzing en geen
//           bewijs; daarom staan de plaatjes erbij.
//   maat  — geen opnametijdstip, maar wel exact dezelfde afmetingen én een
//           bestandsgrootte die minder dan een procent uiteenloopt.
//
// Alleen kijken, niets aanraken: opruimen gebeurt in de route hieronder, met
// deze lijst als voorvertoning.
route("GET", "/api/admin/fotodubbels", async (req, res) => {
  if (!req.user.is_admin) return sendError(res, 403, "Geen toegang");
  const { rows } = await query(`
    SELECT p.id, p.trip_id, t.name AS trip_name, p.taken_at, p.width, p.height,
           COALESCE(p.byte_size, length(p.data)) AS bytes, p.caption, d.date AS day_date
      FROM photos p
      JOIN trips t ON t.id = p.trip_id
      LEFT JOIN days d ON d.id = p.day_id
     ORDER BY p.trip_id, p.created_at ASC
  `);

  const groepen = [];
  const perReis = new Map();
  for (const r of rows) {
    if (!perReis.has(r.trip_id)) perReis.set(r.trip_id, []);
    perReis.get(r.trip_id).push(r);
  }

  for (const fotos of perReis.values()) {
    const opTijd = new Map();
    for (const f of fotos) {
      if (!f.taken_at) continue;
      const sleutel = new Date(f.taken_at).toISOString();
      if (!opTijd.has(sleutel)) opTijd.set(sleutel, []);
      opTijd.get(sleutel).push(f);
    }
    const alGezien = new Set();
    for (const [sleutel, groep] of opTijd) {
      if (groep.length < 2) continue;
      groep.forEach((f) => alGezien.add(f.id));
      groepen.push({ signaal: "exif", sleutel, fotos: groep });
    }

    // Wat geen opnametijdstip heeft valt op maat te vergelijken. Bewust pas
    // hier, zodat een foto niet in twee groepen tegelijk belandt.
    const zonderTijd = fotos.filter((f) => !f.taken_at && !alGezien.has(f.id) && f.width && f.height && f.bytes);
    for (let i = 0; i < zonderTijd.length; i++) {
      if (alGezien.has(zonderTijd[i].id)) continue;
      const groep = [zonderTijd[i]];
      for (let j = i + 1; j < zonderTijd.length; j++) {
        const a = zonderTijd[i], b = zonderTijd[j];
        if (alGezien.has(b.id)) continue;
        if (a.width !== b.width || a.height !== b.height) continue;
        if (Math.abs(Number(a.bytes) - Number(b.bytes)) > Number(a.bytes) * 0.01) continue;
        groep.push(b);
      }
      if (groep.length < 2) continue;
      groep.forEach((f) => alGezien.add(f.id));
      groepen.push({ signaal: "maat", sleutel: `${zonderTijd[i].width}×${zonderTijd[i].height}`, fotos: groep });
    }
  }

  sendJson(res, 200, {
    aantalGroepen: groepen.length,
    aantalDubbel: groepen.reduce((n, g) => n + g.fotos.length - 1, 0),
    groepen: groepen.map((g) => ({
      signaal: g.signaal,
      sleutel: g.sleutel,
      tripId: g.fotos[0].trip_id,
      tripNaam: g.fotos[0].trip_name,
      fotos: g.fotos.map((f) => ({
        id: f.id, bytes: Number(f.bytes), width: f.width, height: f.height,
        takenAt: f.taken_at, caption: f.caption, dayDate: f.day_date,
      })),
    })),
  });
});

// Samenvoegen: van elke groep blijft er één over. Welke, dat bepaalt de
// beheerder — de voorvertoning hierboven laat de afmetingen en de
// bestandsgrootte zien, en de grootste is meestal het origineel.
//
// Wat de bestaande samenvoeging bij het opstarten níét doet en dit wel: alles
// wat naar de weg te gooien foto verwijst wordt eerst omgehangen. Zonder die
// stap ruimt de ON DELETE CASCADE een fotoboekpagina leeg en verdwijnt er een
// stem uit de evaluatie — dan ben je meer kwijt dan een dubbele.
route("POST", "/api/admin/fotodubbels/opruimen", async (req, res, params, body) => {
  if (!req.user.is_admin) return sendError(res, 403, "Geen toegang");
  const groepen = Array.isArray(body?.groepen) ? body.groepen : [];
  if (!groepen.length) return sendError(res, 400, "Geen groepen meegestuurd");

  let opgeruimd = 0;
  for (const groep of groepen) {
    const houd = Number(groep?.houd);
    const weg = (Array.isArray(groep?.weg) ? groep.weg : []).map(Number)
      .filter((id) => Number.isInteger(id) && id > 0 && id !== houd);
    if (!Number.isInteger(houd) || !weg.length) continue;

    // Alles moet bij dezelfde reis horen; anders zou een verkeerd meegestuurde
    // groep foto's uit twee reizen door elkaar husselen.
    const { rows: check } = await query(
      "SELECT id, trip_id FROM photos WHERE id = ANY($1::int[])", [[houd, ...weg]]);
    if (check.length !== weg.length + 1) return sendError(res, 400, "Een van de foto's bestaat niet meer");
    if (new Set(check.map((r) => r.trip_id)).size !== 1) return sendError(res, 400, "Foto's uit verschillende reizen");

    await transaction(async (client) => {
      for (const dupId of weg) {
        // Ontbrekende gegevens overnemen van de foto die weggaat.
        await client.query(
          `UPDATE photos p SET
             day_id = COALESCE(p.day_id, d.day_id),
             activity_id = COALESCE(p.activity_id, d.activity_id),
             transport_id = COALESCE(p.transport_id, d.transport_id),
             accommodation_id = COALESCE(p.accommodation_id, d.accommodation_id),
             caption = COALESCE(NULLIF(p.caption, ''), d.caption),
             taken_at = COALESCE(p.taken_at, d.taken_at),
             latitude = COALESCE(p.latitude, d.latitude),
             longitude = COALESCE(p.longitude, d.longitude)
           FROM (SELECT * FROM photos WHERE id = $2) d
           WHERE p.id = $1`,
          [houd, dupId]
        );

        // Fotoboek: plaatsingen en achtergronden omhangen.
        await client.query("UPDATE photobook_page_photos SET photo_id = $1 WHERE photo_id = $2", [houd, dupId]);
        await client.query("UPDATE photobook_pages SET background_photo_id = $1 WHERE background_photo_id = $2", [houd, dupId]);

        // Evaluatiestemmen. Stemde iemand op allebei, dan blijft zijn hoogste
        // plek staan en gaat de andere weg — anders botst het op de regel dat
        // je één keer op een foto mag stemmen.
        await client.query(
          `DELETE FROM trip_fotostemmen w
            WHERE w.photo_id = $2
              AND EXISTS (SELECT 1 FROM trip_fotostemmen h
                           WHERE h.trip_id = w.trip_id AND h.user_id = w.user_id AND h.photo_id = $1)`,
          [houd, dupId]
        );
        await client.query("UPDATE trip_fotostemmen SET photo_id = $1 WHERE photo_id = $2", [houd, dupId]);

        await client.query("DELETE FROM photos WHERE id = $1", [dupId]);
        opgeruimd++;
      }
    });
  }
  sendJson(res, 200, { ok: true, opgeruimd });
});

// Staan de koppelingen met de buitenwereld goed? "Ingesteld" is te weinig om
// op te vertrouwen — een token kan verlopen of ingetrokken zijn en dan blijft
// de variabele gewoon gevuld. Daarom wordt elke koppeling waar dat kan ook
// echt even aangeklopt, met een korte time-out zodat een trage dienst dit
// scherm niet ophoudt. Wat alleen bij een echte gebruikershandeling te testen
// is (inloggen via Google of Apple) blijft bij "ingesteld ja/nee".
const API_TIJDSLIMIET_MS = 6000;

async function klopAan(url, opties = {}) {
  const afbreken = new AbortController();
  const klok = setTimeout(() => afbreken.abort(), API_TIJDSLIMIET_MS);
  const begin = Date.now();
  try {
    const r = await fetch(url, { ...opties, signal: afbreken.signal });
    return { ok: r.ok, status: r.status, ms: Date.now() - begin };
  } catch (err) {
    return { ok: false, status: null, ms: Date.now() - begin, fout: err.name === "AbortError" ? "geen antwoord binnen 6 seconden" : err.message };
  } finally {
    clearTimeout(klok);
  }
}

route("GET", "/api/admin/api-status", async (req, res) => {
  if (!req.user.is_admin) return sendError(res, 403, "Geen toegang");

  const mailDienst = mailProvider();
  const checks = [
    {
      naam: "Anthropic (AI)",
      waarvoor: "Tips, hoogtepunten, boekingen inlezen, quizvragen",
      ingesteld: !!process.env.ANTHROPIC_API_KEY,
      test: () => klopAan("https://api.anthropic.com/v1/models?limit=1", {
        headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      }),
    },
    {
      naam: "Mapbox",
      waarvoor: "Kaarttegels en het opzoeken van adressen",
      ingesteld: !!MAPBOX_TOKEN,
      waarschuwing: MAPBOX_TOKEN_IS_SECRET ? "Dit is een geheim token (sk.). Gebruik een publiek token (pk.)." : null,
      test: () => klopAan(`https://api.mapbox.com/tokens/v2?access_token=${encodeURIComponent(MAPBOX_TOKEN)}`),
    },
    {
      naam: "Nominatim (OpenStreetMap)",
      waarvoor: "Adressen opzoeken als Mapbox niets vindt",
      ingesteld: true,
      // Open dienst zonder sleutel — een 403 betekent hier "geweigerd", niet
      // "verkeerde sleutel", en dat verschil hoort in de tekst terug te komen.
      zonderSleutel: true,
      test: () => klopAan("https://nominatim.openstreetmap.org/search?q=Amsterdam&format=json&limit=1", {
        headers: { "User-Agent": "Reisplanner/1.0" },
      }),
    },
    {
      naam: "Print API",
      waarvoor: "Fotoboek laten drukken en de prijsopgave",
      ingesteld: printapi.isConfigured(),
      test: () => klopAan(printapi.BASE_URL),
    },
    {
      naam: `E-mail (${mailDienst || "niet ingesteld"})`,
      waarvoor: "Uitnodigingen en meldingen versturen",
      ingesteld: !!mailDienst,
      test: () => klopAan(mailDienst === "resend" ? "https://api.resend.com/domains" : "https://api.postmarkapp.com/server", {
        headers: mailDienst === "resend"
          ? { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }
          : { "X-Postmark-Server-Token": process.env.POSTMARK_TOKEN, Accept: "application/json" },
      }),
    },
    { naam: "Google-inloggen", waarvoor: "Inloggen met een Google-account", ingesteld: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) },
    { naam: "Apple-inloggen", waarvoor: "Inloggen met een Apple-account", ingesteld: !!(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY) },
    { naam: "Pushmeldingen", waarvoor: "Meldingen naar de telefoon", ingesteld: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) },
  ];

  const uitkomsten = await Promise.all(checks.map(async (c) => {
    const basis = { naam: c.naam, waarvoor: c.waarvoor, ingesteld: c.ingesteld, waarschuwing: c.waarschuwing || null };
    const geweigerd = c.zonderSleutel ? "Bereikbaar, maar het verzoek wordt geweigerd" : "Bereikbaar, maar de sleutel wordt geweigerd";
    if (!c.ingesteld) return { ...basis, staat: "uit", detail: "Niet ingesteld" };
    if (!c.test) return { ...basis, staat: "ingesteld", detail: "Ingesteld — alleen te testen bij een echte inlogpoging" };
    const r = await c.test();
    // 401/403 betekent dat de dienst bereikbaar is maar de sleutel niet
    // accepteert. Dat is een ander probleem dan "de dienst ligt eruit", dus
    // dat onderscheid blijft staan.
    if (r.ok) return { ...basis, staat: "goed", detail: `Antwoord in ${r.ms} ms`, ms: r.ms };
    if (r.status === 401 || r.status === 403) return { ...basis, staat: "fout", detail: `${geweigerd} (${r.status})`, ms: r.ms };
    if (r.status) return { ...basis, staat: "fout", detail: `HTTP ${r.status}`, ms: r.ms };
    return { ...basis, staat: "fout", detail: r.fout || "Geen verbinding" };
  }));

  sendJson(res, 200, { checks: uitkomsten, database: { staat: "goed", detail: "In gebruik" } });
});

// Wie heeft hoeveel AI verbruikt? De rekening komt per maand op één account
// binnen; dit maakt zichtbaar waar hij vandaan komt. Aantallen tokens, geen
// bedragen: de prijs per token hoort niet in de code te staan waar hij stil
// veroudert zodra Anthropic zijn tarieven aanpast.
route("GET", "/api/admin/ai-verbruik", async (req, res) => {
  if (!req.user.is_admin) return sendError(res, 403, "Geen toegang");
  const dagen = Math.min(Math.max(Number(new URL(req.url, "http://x").searchParams.get("dagen")) || 30, 1), 365);
  const sinds = `${dagen} days`;

  const { rows: perGebruiker } = await query(
    `SELECT u.id, u.name, u.email,
            COUNT(*)::int AS verzoeken,
            COALESCE(SUM(a.input_tokens), 0)::bigint AS input_tokens,
            COALESCE(SUM(a.output_tokens), 0)::bigint AS output_tokens,
            MAX(a.created_at) AS laatst
       FROM ai_usage a LEFT JOIN users u ON u.id = a.user_id
      WHERE a.created_at > NOW() - $1::interval
      GROUP BY u.id, u.name, u.email
      ORDER BY SUM(a.input_tokens + a.output_tokens) DESC`,
    [sinds]
  );
  const { rows: perDoel } = await query(
    `SELECT doel, COUNT(*)::int AS verzoeken,
            COALESCE(SUM(input_tokens + output_tokens), 0)::bigint AS tokens
       FROM ai_usage
      WHERE created_at > NOW() - $1::interval
      GROUP BY doel ORDER BY SUM(input_tokens + output_tokens) DESC`,
    [sinds]
  );
  const { rows: totaal } = await query(
    `SELECT COUNT(*)::int AS verzoeken,
            COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
            COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens
       FROM ai_usage WHERE created_at > NOW() - $1::interval`,
    [sinds]
  );

  sendJson(res, 200, {
    dagen,
    totaal: {
      verzoeken: totaal[0].verzoeken,
      inputTokens: Number(totaal[0].input_tokens),
      outputTokens: Number(totaal[0].output_tokens),
    },
    gebruikers: perGebruiker.map((r) => ({
      id: r.id,
      naam: r.name || r.email || "Verwijderde gebruiker",
      email: r.email || null,
      verzoeken: r.verzoeken,
      inputTokens: Number(r.input_tokens),
      outputTokens: Number(r.output_tokens),
      laatst: r.laatst,
    })),
    doelen: perDoel.map((r) => ({ doel: r.doel, verzoeken: r.verzoeken, tokens: Number(r.tokens) })),
  });
});

// Operationele cockpit: requestvolume/foutpercentage/responstijd van dit ene
// serverproces sinds het opstarten (of het laatste uur voor de tijdlijn) —
// zie de metricsState-sectie bovenaan voor hoe dit wordt bijgehouden.
route("GET", "/api/admin/metrics", async (req, res) => {
  if (!req.user.is_admin) return sendError(res, 403, "Geen toegang");
  const now = Date.now();
  const cutoff = now - METRICS_WINDOW_MS;

  // Tijdlijn van de laatste 60 minuten, ontbrekende minuten (geen verkeer)
  // als nul-waarde — anders zou de grafiek gaten tonen als losse punten.
  const timeline = [];
  const firstBucket = Math.floor((now - 59 * METRICS_BUCKET_MS) / METRICS_BUCKET_MS) * METRICS_BUCKET_MS;
  for (let t = firstBucket; t <= now; t += METRICS_BUCKET_MS) {
    const b = metricsState.buckets.get(t);
    timeline.push({
      t: new Date(t).toISOString(),
      count: b?.count || 0,
      errorCount: b?.errorCount || 0,
      avgDuration: b && b.count ? Math.round(b.totalDuration / b.count) : 0,
    });
  }

  const recentWindow = metricsState.recent.filter((r) => r.t >= cutoff);
  const totalInWindow = recentWindow.length;
  const errorsInWindow = recentWindow.filter((r) => r.status >= 500).length;
  const avgDurationWindow = totalInWindow ? Math.round(recentWindow.reduce((s, r) => s + r.durationMs, 0) / totalInWindow) : 0;
  const sortedByDuration = [...recentWindow].sort((a, b) => a.durationMs - b.durationMs);
  const p95DurationWindow = sortedByDuration.length ? Math.round(sortedByDuration[Math.floor(sortedByDuration.length * 0.95)].durationMs) : 0;

  const byRoute = [...metricsState.byRoute.entries()]
    .map(([key, s]) => ({
      route: key, count: s.count, errorCount: s.errorCount,
      avgDuration: Math.round(s.totalDuration / s.count), maxDuration: Math.round(s.maxDuration),
    }))
    .sort((a, b) => b.avgDuration - a.avgDuration)
    .slice(0, 15);

  const mem = process.memoryUsage();

  let databaseBytes = null;
  try {
    const dbSize = await query("SELECT pg_database_size(current_database()) AS bytes");
    databaseBytes = Number(dbSize.rows[0].bytes);
  } catch (err) {
    console.error("pg_database_size niet beschikbaar:", err.message);
  }

  sendJson(res, 200, {
    startedAt: STARTED_AT.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    totalRequests: metricsState.totalRequests,
    totalErrors: metricsState.totalErrors,
    windowMinutes: METRICS_WINDOW_MS / 60000,
    requestsInWindow: totalInWindow,
    errorsInWindow,
    avgDurationWindow,
    p95DurationWindow,
    timeline,
    byRoute,
    slowest: metricsState.slowest.map((s) => ({ ...s, t: new Date(s.t).toISOString() })),
    memory: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
    },
    dbPool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
    databaseBytes,
    nodeVersion: process.version,
  });
});

route("GET", "/api/admin/trips", async (req, res) => {
  if (!req.user.is_admin) return sendError(res, 403, "Geen toegang");
  const { rows } = await query(`
    SELECT t.*, u.name as user_name, u.email as user_email, u.avatar as user_avatar,
      COALESCE(SUM(e.amount), 0) as total_spent,
      COUNT(DISTINCT a.id) as activity_count
    FROM trips t
    LEFT JOIN users u ON u.id = t.user_id
    LEFT JOIN expenses e ON e.trip_id = t.id
    LEFT JOIN activities a ON a.trip_id = t.id
    GROUP BY t.id, u.name, u.email, u.avatar
    ORDER BY u.name ASC, t.start_date DESC NULLS LAST
  `);
  sendJson(res, 200, rows);
});

// Alle trip_id-verwijzingen in het schema staan ON DELETE CASCADE, dus dit
// ruimt dagen/activiteiten/foto's/dagboek/quiz-sessies etc. vanzelf mee op.
route("DELETE", "/api/admin/trips/:id", async (req, res, params) => {
  if (!req.user.is_admin) return sendError(res, 403, "Geen toegang");
  await query("DELETE FROM trips WHERE id = $1", [params.id]);
  res.writeHead(204); res.end();
});

// trips.user_id heeft bewust geen foreign key (zie de tabeldefinitie) — een
// gebruiker verwijderen zou anders die reizen als wees achterlaten met een
// user_id die nergens meer naar wijst. Eerst ontkoppelen (net als de gewone
// "reis toewijzen"-actie hierboven) bewaart de reizen zelf, alleen de
// koppeling verdwijnt; de rest (sessies, quiz-deelnames, etc.) ruimt de
// database vanzelf op via de bestaande ON DELETE CASCADE/SET NULL-regels.
route("DELETE", "/api/admin/users/:id", async (req, res, params) => {
  if (!req.user.is_admin) return sendError(res, 403, "Geen toegang");
  if (Number(params.id) === req.user.id) return sendError(res, 400, "Je kunt jezelf niet verwijderen");
  await query("UPDATE trips SET user_id = NULL WHERE user_id = $1", [params.id]);
  await query("DELETE FROM users WHERE id = $1", [params.id]);
  res.writeHead(204); res.end();
});

// ---------- Trip routes ----------
route("GET", "/api/trips", async (req, res) => {
  const { rows } = await query(`
    SELECT t.*, (t.user_id = $1) as is_owner,
      CASE WHEN t.user_id = $1 THEN 'owner' ELSE COALESCE(tm.role, 'editor') END as role,
      (SELECT COUNT(*) FROM activities a WHERE a.trip_id = t.id) as activity_count
    FROM trips t
    LEFT JOIN trip_members tm ON tm.trip_id = t.id AND tm.user_id = $1
    WHERE t.user_id = $1 OR EXISTS (SELECT 1 FROM trip_members WHERE trip_id = t.id AND user_id = $1)
    ORDER BY t.start_date DESC NULLS LAST, t.created_at DESC
  `, [req.user.id]);
  sendJson(res, 200, rows.map((r) => stripCosts(r.role, r, ["budget"])));
});

route("GET", "/api/trips/:id", async (req, res, params) => {
  const { rows } = await query(
    `SELECT t.*, (t.user_id = $2) as is_owner, CASE WHEN t.user_id = $2 THEN 'owner' ELSE tm.role END as role
     FROM trips t LEFT JOIN trip_members tm ON tm.trip_id = t.id AND tm.user_id = $2
     WHERE t.id = $1 AND (t.user_id = $2 OR tm.user_id = $2)`,
    [params.id, req.user.id]
  );
  if (!rows.length) return sendError(res, 404, "Trip not found");
  if (rows[0].role === "viewer") await query("INSERT INTO trip_views (trip_id, user_id) VALUES ($1, $2)", [params.id, req.user.id]);
  sendJson(res, 200, stripCosts(rows[0].role, rows[0], ["budget"]));
});

route("POST", "/api/trips", async (req, res, params, body) => {
  const { name, destination, start_date, end_date, budget, currency, status, notes, cover_color, cover_image, timezone } = body;
  if (!name) return sendError(res, 400, "Name is required");
  const dateErr = invalidDates({ start_date, end_date });
  if (dateErr) return sendError(res, 400, dateErr);
  const { rows } = await query(
    `INSERT INTO trips (name, destination, start_date, end_date, budget, currency, status, notes, cover_color, cover_image, timezone, user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [name, destination||null, start_date||null, end_date||null, budget||null, currency||"EUR", status||"planning", notes||null, cover_color||PALETTE.primary, cover_image||null, timezone||null, req.user.id]
  );
  // Auto-create day entries if dates are set. Generated in SQL rather than by
  // stepping a JS Date: "YYYY-MM-DD" parses as UTC midnight while setDate()
  // advances local time, so a daylight-saving transition advanced only 23 hours
  // and toISOString() repeated a date — producing a duplicate day card and
  // dropping the last day of the trip.
  if (start_date && end_date) {
    await query(
      `INSERT INTO days (trip_id, date)
       SELECT $1, gs::date FROM generate_series($2::date, $3::date, interval '1 day') gs
       ON CONFLICT (trip_id, date) DO NOTHING`,
      [rows[0].id, start_date, end_date]
    );
  }
  sendJson(res, 201, rows[0]);
});

// Houdt de dagkaarten gelijk aan de reisperiode. Bij het aanmaken gebeurde dat
// al, bij het aanpassen niet: verschoof je de reis een week, dan bleven de oude
// dagen staan en kwamen de nieuwe er niet bij — de planning liep dan niet meer
// gelijk met de reis.
//
// Toevoegen kan altijd; de unieke index (trip_id, date) zorgt dat een datum die
// er al is niet nog een keer verschijnt. Weghalen gebeurt alleen bij dagen
// buiten de nieuwe periode die helemaal leeg zijn. Een dag met een activiteit,
// een foto of een verhaal blijft staan, ook al valt hij buiten de periode: die
// stilletjes weggooien zou echt werk van iemand wissen. Wie zo'n dag kwijt wil,
// haalt hem zelf weg.
async function synchroniseerDagen(tripId, startDate, endDate) {
  if (!startDate || !endDate) return;
  await query(
    `INSERT INTO days (trip_id, date)
     SELECT $1, gs::date FROM generate_series($2::date, $3::date, interval '1 day') gs
     ON CONFLICT (trip_id, date) DO NOTHING`,
    [tripId, startDate, endDate]
  );
  await query(
    `DELETE FROM days d
      WHERE d.trip_id = $1
        AND (d.date < $2::date OR d.date > $3::date)
        AND d.title IS NULL AND d.notes IS NULL
        AND NOT EXISTS (SELECT 1 FROM activities a WHERE a.day_id = d.id)
        AND NOT EXISTS (SELECT 1 FROM photos p WHERE p.day_id = d.id)
        AND NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j.day_id = d.id)`,
    [tripId, startDate, endDate]
  );
}

route("PUT", "/api/trips/:id", async (req, res, params, body) => {
  const { name, destination, start_date, end_date, budget, currency, status, notes, cover_color, cover_image, timezone } = body;
  const dateErr = invalidDates({ start_date, end_date });
  if (dateErr) return sendError(res, 400, dateErr);
  const { rows } = await query(
    `UPDATE trips SET name=$1, destination=$2, start_date=$3, end_date=$4, budget=$5, currency=$6, status=$7, notes=$8, cover_color=$9, cover_image=$10, timezone=$11
     WHERE id=$12 AND user_id=$13 RETURNING *`,
    [name, destination||null, start_date||null, end_date||null, budget||null, currency||"EUR", status||"planning", notes||null, cover_color||PALETTE.primary, cover_image||null, timezone||null, params.id, req.user.id]
  );
  if (!rows.length) return sendError(res, 404, "Trip not found");
  await synchroniseerDagen(params.id, start_date, end_date);
  sendJson(res, 200, rows[0]);
}, { tripScope: "param" });

route("DELETE", "/api/trips/:id", async (req, res, params) => {
  const { rowCount } = await query("DELETE FROM trips WHERE id = $1 AND user_id = $2", [params.id, req.user.id]);
  if (!rowCount) return sendError(res, 404, "Reis niet gevonden");
  res.writeHead(204); res.end();
}, { tripScope: "param" });

// ---------- Days & activities ----------
route("GET", "/api/trips/:id/days", async (req, res, params) => {
  const role = req.tripRole;
  const { rows: days } = await query("SELECT * FROM days WHERE trip_id = $1 ORDER BY date ASC", [params.id]);
  // "time" is vrije tekst, geen echt TIME-veld — handmatig ingevoerd via
  // <input type="time"> komt altijd al als "HH:MM" binnen, maar de AI-import
  // vanuit een reisbevestiging haalt er soms "9:00" (zonder voorloopnul) uit.
  // Alfabetisch sorteren zet zo'n "9:00" ná "14:30" i.p.v. ervoor — precies
  // waarom activiteiten soms niet op volgorde stonden. lpad(...,5,'0') dwingt
  // elke waarde naar "HH:MM" vóór het vergelijken.
  const { rows: acts } = await query(
    `SELECT * FROM activities WHERE trip_id = $1
     ORDER BY (CASE WHEN time IS NOT NULL AND time <> '' THEN LPAD(time, 5, '0') END) ASC NULLS LAST, id ASC`,
    [params.id]
  );
  // Privé items zijn er voor de eigenaar/editors nog gewoon, maar bestaan voor
  // een alleen-lezen kijker niet — dezelfde rol die ook geen kosten ziet.
  const visibleActs = role === "viewer" ? acts.filter((a) => !a.is_private) : acts;
  const result = days.map((d) => ({ ...d, activities: visibleActs.filter((a) => a.day_id === d.id).map((a) => stripCosts(role, a, ["cost"])) }));
  sendJson(res, 200, result);
}, { tripScope: "param" });

route("POST", "/api/trips/:id/days", async (req, res, params, body) => {
  const { date, title, notes } = body;
  const { rows } = await query(
    "INSERT INTO days (trip_id, date, title, notes) VALUES ($1,$2,$3,$4) RETURNING *",
    [params.id, date, title||null, notes||null]
  );
  sendJson(res, 201, { ...rows[0], activities: [] });
}, { tripScope: "param" });

route("PUT", "/api/days/:id", async (req, res, params, body) => {
  const { title, notes } = body;
  const { rows } = await query("UPDATE days SET title=$1, notes=$2 WHERE id=$3 RETURNING *", [title||null, notes||null, params.id]);
  sendJson(res, 200, rows[0]);
}, { tripScope: "days" });

route("DELETE", "/api/days/:id", async (req, res, params) => {
  await query("DELETE FROM days WHERE id = $1", [params.id]);
  res.writeHead(204); res.end();
}, { tripScope: "days" });

route("POST", "/api/days/:id/activities", async (req, res, params, body) => {
  const { time, title, location, notes, category, cost, is_private } = body;
  if (!title || !String(title).trim()) return sendError(res, 400, "Titel is verplicht");
  // trip_id is derived from the day, never taken from the body — trusting the
  // client there let an editor drop rows into a trip they have no access to.
  const { rows } = await query(
    `INSERT INTO activities (day_id, trip_id, time, title, location, notes, category, cost, is_private)
     SELECT $1, d.trip_id, $2, $3, $4, $5, $6, $7, $8 FROM days d WHERE d.id = $1
     RETURNING *`,
    [params.id, time||null, title, location||null, notes||null, category||"activity", cost||null, !!is_private]
  );
  if (!rows.length) return sendError(res, 404, "Dag niet gevonden");
  sendJson(res, 201, rows[0]);
}, { tripScope: "days" });

route("PUT", "/api/activities/:id", async (req, res, params, body) => {
  const { day_id, time, title, location, notes, category, cost, is_private } = body;
  if (day_id) {
    const { rows: valid } = await query(
      "SELECT 1 FROM activities a JOIN days d ON d.id = $2 WHERE a.id = $1 AND d.trip_id = a.trip_id",
      [params.id, day_id]
    );
    if (!valid.length) return sendError(res, 400, "Ongeldige dag voor deze reis");
  }
  const { rows } = await query(
    "UPDATE activities SET day_id=COALESCE($1, day_id), time=$2, title=$3, location=$4, notes=$5, category=$6, cost=$7, is_private=$8 WHERE id=$9 RETURNING *",
    [day_id || null, time||null, title, location||null, notes||null, category||"activity", cost||null, !!is_private, params.id]
  );
  sendJson(res, 200, rows[0]);
}, { tripScope: "activities" });

route("DELETE", "/api/activities/:id", async (req, res, params) => {
  await query("DELETE FROM activities WHERE id = $1", [params.id]);
  res.writeHead(204); res.end();
}, { tripScope: "activities" });

// ---------- Date validation helper ----------
// An unparseable date used to reach Postgres verbatim and surface as a 500
// ("invalid input syntax for type date"). Reject it as a 400 up front.
function invalidDates(fields) {
  const bad = Object.entries(fields).filter(([, v]) => v && Number.isNaN(new Date(v).getTime()));
  return bad.length ? `Ongeldige datum bij: ${bad.map(([k]) => k).join(", ")}` : null;
}

function checkDateInRange(dateStr, tripStart, tripEnd) {
  if (!dateStr || !tripStart || !tripEnd) return null;
  // An unparseable date threw RangeError here and surfaced as a generic 500.
  if ([dateStr, tripStart, tripEnd].some((d) => Number.isNaN(new Date(d).getTime()))) return null;
  const date = new Date(dateStr).toISOString().slice(0, 10);
  const start = new Date(tripStart).toISOString().slice(0, 10);
  const end = new Date(tripEnd).toISOString().slice(0, 10);
  if (date < start || date > end) {
    return `Deze datum (${new Date(date).toLocaleDateString("nl-NL", { day: "numeric", month: "long" })}) valt buiten de reisperiode (${new Date(start).toLocaleDateString("nl-NL", { day: "numeric", month: "long" })} – ${new Date(end).toLocaleDateString("nl-NL", { day: "numeric", month: "long" })}).`;
  }
  return null;
}

// ---------- Accommodation ----------
route("GET", "/api/trips/:id/accommodations", async (req, res, params) => {
  const { rows } = await query("SELECT * FROM accommodations WHERE trip_id = $1 ORDER BY check_in ASC NULLS LAST", [params.id]);
  const visible = req.tripRole === "viewer" ? rows.filter((r) => !r.is_private) : rows;
  sendJson(res, 200, visible.map((r) => stripCosts(req.tripRole, r, ["cost"])));
}, { tripScope: "param" });

route("POST", "/api/trips/:id/accommodations", async (req, res, params, body) => {
  const { name, check_in, check_out, address, booking_ref, cost, notes, is_private } = body;
  const dateErr = invalidDates({ check_in, check_out });
  if (dateErr) return sendError(res, 400, dateErr);
  const { rows: tripRows } = await query("SELECT start_date, end_date FROM trips WHERE id = $1", [params.id]);
  const trip = tripRows[0];
  const err = checkDateInRange(check_in, trip?.start_date, trip?.end_date) || checkDateInRange(check_out, trip?.start_date, trip?.end_date);
  if (err) return sendError(res, 400, err);
  const { rows } = await query(
    "INSERT INTO accommodations (trip_id, name, check_in, check_out, address, booking_ref, cost, notes, is_private) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
    [params.id, name, check_in||null, check_out||null, address||null, booking_ref||null, cost||null, notes||null, !!is_private]
  );
  sendJson(res, 201, rows[0]);
}, { tripScope: "param" });

route("PUT", "/api/accommodations/:id", async (req, res, params, body) => {
  const { name, check_in, check_out, address, booking_ref, cost, notes, is_private } = body;
  const dateErr = invalidDates({ check_in, check_out });
  if (dateErr) return sendError(res, 400, dateErr);
  const { rows } = await query(
    "UPDATE accommodations SET name=$1, check_in=$2, check_out=$3, address=$4, booking_ref=$5, cost=$6, notes=$7, is_private=$8 WHERE id=$9 RETURNING *",
    [name, check_in||null, check_out||null, address||null, booking_ref||null, cost||null, notes||null, !!is_private, params.id]
  );
  sendJson(res, 200, rows[0]);
}, { tripScope: "accommodations" });

route("DELETE", "/api/accommodations/:id", async (req, res, params) => {
  await query("DELETE FROM accommodations WHERE id = $1", [params.id]);
  res.writeHead(204); res.end();
}, { tripScope: "accommodations" });

// ---------- Transport ----------
// Een tijdzone komt van de client en moet dus gecontroleerd worden voordat hij
// de database in gaat. Intl kent de hele IANA-lijst en weigert alles daarbuiten,
// dus dat is meteen de complete controle — geen eigen lijst die veroudert.
function geldigeZone(naam) {
  if (!naam || typeof naam !== "string") return null;
  try {
    new Intl.DateTimeFormat("nl-NL", { timeZone: naam });
    return naam;
  } catch { return null; }
}

route("GET", "/api/trips/:id/transports", async (req, res, params) => {
  const { rows } = await query("SELECT * FROM transports WHERE trip_id = $1 ORDER BY departure_time ASC NULLS LAST", [params.id]);
  const visible = req.tripRole === "viewer" ? rows.filter((r) => !r.is_private) : rows;
  sendJson(res, 200, visible.map((r) => stripCosts(req.tripRole, r, ["cost"])));
}, { tripScope: "param" });

route("POST", "/api/trips/:id/transports", async (req, res, params, body) => {
  const { type, from_location, to_location, departure_time, arrival_time, departure_tz, arrival_tz, booking_ref, cost, notes, baggage_allowance, is_private } = body;
  const dateErr = invalidDates({ departure_time, arrival_time });
  if (dateErr) return sendError(res, 400, dateErr);
  const { rows: tripRows } = await query("SELECT start_date, end_date FROM trips WHERE id = $1", [params.id]);
  const trip = tripRows[0];
  const err = checkDateInRange(departure_time, trip?.start_date, trip?.end_date) || checkDateInRange(arrival_time, trip?.start_date, trip?.end_date);
  if (err) return sendError(res, 400, err);
  const { rows } = await query(
    "INSERT INTO transports (trip_id, type, from_location, to_location, departure_time, arrival_time, departure_tz, arrival_tz, booking_ref, cost, notes, baggage_allowance, is_private) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *",
    [params.id, type, from_location||null, to_location||null, departure_time||null, arrival_time||null, geldigeZone(departure_tz), geldigeZone(arrival_tz), booking_ref||null, cost||null, notes||null, baggage_allowance||null, !!is_private]
  );
  sendJson(res, 201, rows[0]);
}, { tripScope: "param" });

route("PUT", "/api/transports/:id", async (req, res, params, body) => {
  const { type, from_location, to_location, departure_time, arrival_time, departure_tz, arrival_tz, booking_ref, cost, notes, baggage_allowance, is_private } = body;
  const dateErr = invalidDates({ departure_time, arrival_time });
  if (dateErr) return sendError(res, 400, dateErr);
  const { rows } = await query(
    "UPDATE transports SET type=$1, from_location=$2, to_location=$3, departure_time=$4, arrival_time=$5, departure_tz=$6, arrival_tz=$7, booking_ref=$8, cost=$9, notes=$10, baggage_allowance=$11, is_private=$12 WHERE id=$13 RETURNING *",
    [type, from_location||null, to_location||null, departure_time||null, arrival_time||null, geldigeZone(departure_tz), geldigeZone(arrival_tz), booking_ref||null, cost||null, notes||null, baggage_allowance||null, !!is_private, params.id]
  );
  sendJson(res, 200, rows[0]);
}, { tripScope: "transports" });

route("DELETE", "/api/transports/:id", async (req, res, params) => {
  await query("DELETE FROM transports WHERE id = $1", [params.id]);
  res.writeHead(204); res.end();
}, { tripScope: "transports" });

// ---------- Photos ----------
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

// ---------- Waar de bytes van een foto staan ----------
//
// Twee mogelijkheden, en elke foto kan in een andere staan:
//
//   storage_key IS NULL  -> de bytes staan in photos.data, zoals altijd
//   storage_key gevuld   -> de bytes staan in de objectopslag, data is leeg
//
// Dat moet naast elkaar kunnen, want een bestaande installatie verhuist niet in
// één klap: de bucket wordt aangezet, nieuwe foto's gaan er meteen heen, en de
// oude schuiven er in eigen tempo achteraan (zie de verhuisroute). Zolang die
// twee door elkaar lopen mag geen enkel scherm het verschil merken.
//
// Alles wat fotobytes nodig heeft gaat daarom door fotoBytes(); alles wat ze
// wegschrijft door bewaarFotoBytes(). Rechtstreeks photos.data lezen is vanaf
// hier een fout, want dat werkt alleen zolang de bucket uit staat.

// Een lijst afwerken met hooguit zoveel dingen tegelijk. Nodig zodra de bytes
// buiten de database staan: een Promise.all over alle foto's van een fotoboek
// zet in één klap honderd verbindingen naar de bucket open.
async function parallelBeperkt(lijst, tegelijk, doe) {
  let volgende = 0;
  const werkers = Array.from({ length: Math.min(tegelijk, lijst.length) }, async () => {
    while (volgende < lijst.length) {
      const i = volgende++;
      await doe(lijst[i], i);
    }
  });
  await Promise.all(werkers);
}

// Haal de volle foto op, waar hij ook ligt. `rij` moet minstens data en
// storage_key bevatten.
async function fotoBytes(rij) {
  if (!rij) return null;
  if (rij.data) return rij.data;
  if (!rij.storage_key) return null;
  return opslag.haal(rij.storage_key);
}

// Idem voor de thumbnail.
async function thumbBytes(rij) {
  if (!rij) return null;
  if (rij.thumb_data) return rij.thumb_data;
  if (!rij.thumb_key) return null;
  return opslag.haal(rij.thumb_key);
}

// Schrijf nieuwe bytes voor een bestaande foto weg en geef terug wat er in de
// kolommen moet komen. Staat de bucket aan, dan gaat het daarheen en blijft de
// database leeg; staat hij uit, dan andersom. Eén functie, zodat elke plek die
// een foto vervangt (conversie, draaien, samenvoegen) automatisch meegaat.
async function fotoVelden(tripId, buffer, contentHash, { soort = "vol", mediaType = "image/jpeg" } = {}) {
  if (!opslag.actief()) {
    return soort === "thumb"
      ? { thumb_data: buffer, thumb_key: null, thumb_size: buffer ? buffer.length : null }
      : { data: buffer, storage_key: null, byte_size: buffer ? buffer.length : null };
  }
  const sleutel = opslag.fotoSleutel(tripId, contentHash, soort);
  await opslag.bewaar(sleutel, buffer, soort === "thumb" ? "image/jpeg" : mediaType);
  return soort === "thumb"
    ? { thumb_data: null, thumb_key: sleutel, thumb_size: buffer.length }
    : { data: null, storage_key: sleutel, byte_size: buffer.length };
}

// Een object aanmelden voor opruiming. Niet meteen weggooien: dat zou een
// gebruikershandeling laten wachten op een externe dienst, en mislukken als die
// dienst even weg is — terwijl er in de database dan al niets meer naar wijst.
// De opruimronde hieronder werkt het lijstje af, en blijft het proberen.
//
// Voor rijen die verdwijnen doet een trigger in de database dit al (zie db.js);
// deze functie is voor het andere geval: de rij blijft, maar wijst naar andere
// bytes dan eerst.
async function meldObjectenAan(sleutels) {
  const echte = sleutels.filter(Boolean);
  if (!echte.length) return;
  await query(
    "INSERT INTO opslag_opruimen (sleutel) SELECT unnest($1::text[])",
    [echte]
  ).catch((err) => console.error("Objectopslag: opruimen aanmelden mislukt:", err.message));
}

// Werk het opruimlijstje af. Draait vanuit dezelfde ronde als de
// notificatie-sweep, maar achter een advisory lock: draaien er meerdere
// instances, dan doet er precies één dit werk in plaats van dat ze elkaar
// dezelfde objecten uit handen trekken.
const OPRUIM_SLOT = 831_205;
const OPRUIM_BATCH = 200;
// Zoveel keer proberen; daarna blijft de rij staan met een hoog aantal pogingen
// zodat hij te vinden is, maar wordt hij niet meer opgepakt. Anders zou één
// object met een structureel probleem elke ronde vullen.
const OPRUIM_MAX_POGINGEN = 5;

async function ruimObjectenOp() {
  if (!opslag.actief()) return;
  const slot = await pool.connect();
  try {
    const { rows: gepakt } = await slot.query("SELECT pg_try_advisory_lock($1) AS gelukt", [OPRUIM_SLOT]);
    if (!gepakt[0].gelukt) return;
    const { rows } = await slot.query(
      "SELECT id, sleutel FROM opslag_opruimen WHERE pogingen < $1 ORDER BY id LIMIT $2",
      [OPRUIM_MAX_POGINGEN, OPRUIM_BATCH]
    );
    for (const rij of rows) {
      try {
        await opslag.verwijder(rij.sleutel);
        await slot.query("DELETE FROM opslag_opruimen WHERE id = $1", [rij.id]);
      } catch (err) {
        console.error(`Objectopslag: ${rij.sleutel} kon niet worden opgeruimd:`, err.message);
        await slot.query("UPDATE opslag_opruimen SET pogingen = pogingen + 1 WHERE id = $1", [rij.id]);
      }
    }
  } finally {
    await slot.query("SELECT pg_advisory_unlock($1)", [OPRUIM_SLOT]).catch(() => {});
    slot.release();
  }
}
// Only these are ever echoed back as Content-Type — an upload may claim any
// mediaType, and serving e.g. "text/html" from this origin would be stored XSS.
const SAFE_IMAGE_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "image/heic", "image/heif", "image/avif",
]);

// iPhones upload photos as HEIC/HEIF, which most browsers (and even iOS
// WKWebView-hosted PWAs in some cases) can't decode in an <img> tag. Convert
// to JPEG on upload so stored photos render everywhere.
function looksLikeHeic(buffer, mediaType) {
  if (/hei[cf]/i.test(mediaType || "")) return true;
  // Zonder bytes valt er alleen op het opgegeven type te oordelen: dat is het
  // geval bij een foto die in de objectopslag ligt en waarvan we (nog) niets
  // hebben opgehaald.
  if (!buffer || buffer.length < 12 || buffer.toString("ascii", 4, 8) !== "ftyp") return false;
  const brand = buffer.toString("ascii", 8, 12);
  return ["heic", "heix", "heim", "heis", "hevc", "hevx", "hevm", "hevs", "mif1", "msf1"].includes(brand);
}

async function normalizeImage(buffer, mediaType) {
  if (!looksLikeHeic(buffer, mediaType)) return { buffer, mediaType };
  const orientation = readHeicOrientation(buffer);
  // Decode and encode here rather than via heic-convert, so the Exif rotation
  // can be applied to the pixels in between. The stored JPEG carries no Exif of
  // its own, so if the rotation is not baked in now it is lost for good.
  try {
    const img = await heicDecode({ buffer });
    const oriented = applyOrientation(Buffer.from(img.data), img.width, img.height, orientation);
    const jpeg = jpegJs.encode({ data: oriented.data, width: oriented.width, height: oriented.height }, 90).data;
    return { buffer: Buffer.from(jpeg), mediaType: "image/jpeg" };
  } catch (err) {
    console.error("HEIC conversion failed:", err.message);
    return { buffer, mediaType };
  }
}

// Grids and strips render photos at ~150–300 CSS px. Serving the original there
// means a 150px square costs several megabytes, so a trip with a few hundred
// photos downloads hundreds of MB to draw one screen. 600px longest edge covers
// every thumbnail size in the UI at 2x density and lands around 30–60 KB.
const THUMB_MAX_EDGE = 600;
// Raise this whenever makeThumbnail's output changes; anything stored at a lower
// revision is regenerated on first view. Rev 1 baked in EXIF orientation, which
// the pure-JS path previously dropped. Rev 2 covers HEIC photos, whose rotation
// lives in embedded Exif that the decoder ignores — their thumbnails were built
// from sideways pixels and would otherwise never be rebuilt.
const THUMB_REV = 2;

// Phones store portrait shots as landscape pixels plus an EXIF Orientation tag.
// Browsers honour that tag on the original, but re-encoding drops it, so the
// rotation has to be baked into the pixels or thumbnails come out sideways.
// Walks a TIFF/Exif block for the Orientation tag (0x0112).
function readTiffOrientation(buf, tiff) {
  if (tiff < 0 || tiff + 8 > buf.length) return 1;
  const marker = buf.toString("ascii", tiff, tiff + 2);
  if (marker !== "II" && marker !== "MM") return 1;
  const le = marker === "II";
  const u16 = (p) => (le ? buf.readUInt16LE(p) : buf.readUInt16BE(p));
  const u32 = (p) => (le ? buf.readUInt32LE(p) : buf.readUInt32BE(p));
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > buf.length) return 1;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > buf.length) break;
    if (u16(e) !== 0x0112) continue;
    // SHORT sits in the first two bytes of the value field; LONG spans four.
    // Reading a big-endian LONG as a 16-bit word picks up the high half — zero —
    // and silently reported "no rotation".
    const type = u16(e + 2);
    const value = type === 4 ? u32(e + 8) : u16(e + 8);
    return value >= 1 && value <= 8 ? value : 1;
  }
  return 1;
}

function readExifOrientation(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return 1;
  let off = 2;
  while (off + 4 <= buf.length) {
    if (buf[off] !== 0xff) break;
    const marker = buf[off + 1];
    const size = buf.readUInt16BE(off + 2);
    if (marker === 0xe1 && buf.toString("ascii", off + 4, off + 10) === "Exif\0\0") {
      return readTiffOrientation(buf, off + 10);
    }
    if (marker === 0xda) break; // start of scan; no EXIF before the image data
    off += 2 + size;
  }
  return 1;
}

// iPhones record a HEIC's rotation in its embedded Exif, not as a container
// transform, and libheif only applies the latter — so a straight decode yields
// sideways pixels. Locate the Exif block in the HEIF boxes and read it.
function readHeicOrientation(buf) {
  const tag = buf.indexOf(Buffer.from("Exif\0\0", "binary"));
  if (tag >= 0) return readTiffOrientation(buf, tag + 6);
  const ii = buf.indexOf(Buffer.from([0x49, 0x49, 0x2a, 0x00]));
  const mm = buf.indexOf(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]));
  const tiff = ii >= 0 && (mm < 0 || ii < mm) ? ii : mm;
  return readTiffOrientation(buf, tiff);
}

// GPS lives in its own IFD, pointed to by tag 0x8825 in IFD0 — same
// byte-order-aware walk as readTiffOrientation, one level deeper. GPSLatitude/
// GPSLongitude are each three RATIONALs (degrees, minutes, seconds; a
// numerator/denominator pair per value), too big for an IFD entry's 4-byte
// value field, so the entry holds an offset to where they actually live.
function readGpsFromTiff(buf, tiff) {
  if (tiff < 0 || tiff + 8 > buf.length) return null;
  const marker = buf.toString("ascii", tiff, tiff + 2);
  if (marker !== "II" && marker !== "MM") return null;
  const le = marker === "II";
  const u16 = (p) => (le ? buf.readUInt16LE(p) : buf.readUInt16BE(p));
  const u32 = (p) => (le ? buf.readUInt32LE(p) : buf.readUInt32BE(p));

  const findTag = (ifdStart, wantedTag) => {
    if (ifdStart < 0 || ifdStart + 2 > buf.length) return null;
    const count = u16(ifdStart);
    for (let i = 0; i < count; i++) {
      const e = ifdStart + 2 + i * 12;
      if (e + 12 > buf.length) break;
      if (u16(e) === wantedTag) return e;
    }
    return null;
  };

  const ifd0 = tiff + u32(tiff + 4);
  const gpsEntry = findTag(ifd0, 0x8825);
  if (!gpsEntry) return null;
  const gpsIfd = tiff + u32(gpsEntry + 8);

  const readRational3 = (entry) => {
    // count is a 4-byte field (LONG); reading only its first 2 bytes picks up
    // the high half on big-endian data, which is zero for any small count —
    // the exact bug readTiffOrientation had to work around for Orientation.
    if (u32(entry + 4) < 3) return null;
    const offset = tiff + u32(entry + 8);
    if (offset < 0 || offset + 24 > buf.length) return null;
    const vals = [];
    for (let i = 0; i < 3; i++) {
      const num = u32(offset + i * 8);
      const den = u32(offset + i * 8 + 4);
      vals.push(den ? num / den : 0);
    }
    return vals;
  };

  const latEntry = findTag(gpsIfd, 0x0002);
  const lonEntry = findTag(gpsIfd, 0x0004);
  if (!latEntry || !lonEntry) return null;
  const latDms = readRational3(latEntry);
  const lonDms = readRational3(lonEntry);
  if (!latDms || !lonDms) return null;

  let lat = latDms[0] + latDms[1] / 60 + latDms[2] / 3600;
  let lon = lonDms[0] + lonDms[1] / 60 + lonDms[2] / 3600;
  const latRefEntry = findTag(gpsIfd, 0x0001);
  const lonRefEntry = findTag(gpsIfd, 0x0003);
  if (latRefEntry && String.fromCharCode(buf[latRefEntry + 8]) === "S") lat = -lat;
  if (lonRefEntry && String.fromCharCode(buf[lonRefEntry + 8]) === "W") lon = -lon;
  return { latitude: lat, longitude: lon };
}

function readHeicGps(buf) {
  const tag = buf.indexOf(Buffer.from("Exif\0\0", "binary"));
  if (tag >= 0) return readGpsFromTiff(buf, tag + 6);
  const ii = buf.indexOf(Buffer.from([0x49, 0x49, 0x2a, 0x00]));
  const mm = buf.indexOf(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]));
  const tiff = ii >= 0 && (mm < 0 || ii < mm) ? ii : mm;
  return readGpsFromTiff(buf, tiff);
}

function readJpegGps(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let off = 2;
  while (off + 4 <= buf.length) {
    if (buf[off] !== 0xff) break;
    const marker = buf[off + 1];
    const size = buf.readUInt16BE(off + 2);
    if (marker === 0xe1 && buf.toString("ascii", off + 4, off + 10) === "Exif\0\0") {
      return readGpsFromTiff(buf, off + 10);
    }
    if (marker === 0xda) break; // start of scan; no EXIF before the image data
    off += 2 + size;
  }
  return null;
}

// Applies EXIF orientations 1-8 to an RGBA buffer.
function applyOrientation(data, width, height, orientation) {
  if (orientation === 1) return { data, width, height };
  const swap = orientation >= 5;
  const w = swap ? height : width;
  const h = swap ? width : height;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let nx, ny;
      switch (orientation) {
        case 2: nx = width - 1 - x; ny = y; break;
        case 3: nx = width - 1 - x; ny = height - 1 - y; break;
        case 4: nx = x; ny = height - 1 - y; break;
        case 5: nx = y; ny = x; break;
        case 6: nx = height - 1 - y; ny = x; break;
        case 7: nx = height - 1 - y; ny = width - 1 - x; break;
        case 8: nx = y; ny = width - 1 - x; break;
        default: nx = x; ny = y;
      }
      const src = (y * width + x) * 4;
      const dst = (ny * w + nx) * 4;
      out[dst] = data[src]; out[dst + 1] = data[src + 1];
      out[dst + 2] = data[src + 2]; out[dst + 3] = data[src + 3];
    }
  }
  return { data: out, width: w, height: h };
}

// Box-average downscale of a JPEG, no native code. Slower than sharp, but it
// keeps thumbnails working on a host where the native binary is missing rather
// than serving multi-megabyte originals.
// Gedeeld door de thumbnail (600px) en de opgeslagen "volledige" foto (2000px)
// — zelfde box-downscale, andere randen. Zie resizeFullPhoto voor waarom de
// tweede pas bestaat.
function resizeJpegPureJs(buffer, maxEdge, quality) {
  const decoded = jpegJs.decode(buffer, { useTArray: true });
  const img = applyOrientation(decoded.data, decoded.width, decoded.height, readExifOrientation(buffer));
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  if (scale >= 1) return jpegJs.encode(img, quality).data;
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const out = Buffer.alloc(w * h * 4);
  const bx = img.width / w, by = img.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * by), y1 = Math.min(img.height, Math.max(y0 + 1, Math.floor((y + 1) * by)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * bx), x1 = Math.min(img.width, Math.max(x0 + 1, Math.floor((x + 1) * bx)));
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * img.width + sx) * 4;
          r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
  return jpegJs.encode({ data: out, width: w, height: h }, quality).data;
}

function makeThumbnailPureJs(buffer) {
  return resizeJpegPureJs(buffer, THUMB_MAX_EDGE, 75);
}

async function makeThumbnail(buffer) {
  if (sharp) {
    try {
      return await sharp(buffer)
        .rotate() // honour EXIF orientation, otherwise phone photos come out sideways
        .resize(THUMB_MAX_EDGE, THUMB_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toBuffer();
    } catch (err) {
      console.error("Thumbnail generation failed:", err.message);
      return null;
    }
  }
  try { return makeThumbnailPureJs(buffer); }
  catch (err) {
    console.error("Pure-JS thumbnail failed:", err.message);
    return null;
  }
}

// Een foto bekijk je op een scherm, niet op papier — 2000px op de lange kant
// vult zelfs een groot beeldscherm ruimschoots, terwijl telefooncamera's
// tegenwoordig 3000-4000px+ schieten. Alleen de thumbnail cappen loste "no
// space left on device" niet op: de volledige foto ging alsnog ongewijzigd de
// database in. Dit is de daadwerkelijke bottleneck voor de Postgres-schijf.
const FULL_MAX_EDGE = 2000;

async function resizeFullPhoto(buffer, mediaType) {
  if (sharp) {
    try {
      // Eerst alleen de afmetingen opvragen (goedkoop, geen volledige decode).
      // Zonder deze check herschreef "Verkleinen" in Beheer élke foto bij elke
      // klik opnieuw op kwaliteit 85 — ook een foto die al binnen de grens
      // paste kreeg dan een zinloze extra generatie JPEG-verlies, keer op keer,
      // zonder dat er ook maar iets aan formaat gewonnen werd.
      const meta = await sharp(buffer).metadata();
      const alreadyFits = Math.max(meta.width || 0, meta.height || 0) <= FULL_MAX_EDGE;
      if (alreadyFits && /jpe?g/i.test(mediaType)) return { buffer, mediaType };
      const out = await sharp(buffer).rotate()
        .resize(FULL_MAX_EDGE, FULL_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      return { buffer: out, mediaType: "image/jpeg" };
    } catch (err) {
      console.error("Foto verkleinen mislukt (sharp):", err.message);
      return { buffer, mediaType };
    }
  }
  // Het pure-JS pad kan alleen JPEG decoderen. PNG/WebP komen hier zelden voor
  // (schermafbeeldingen zijn zeldzaam in een reisdagboek) en blijven ongemoeid
  // in plaats van risico te lopen op een zelfgeschreven decoder.
  if (!/jpe?g/i.test(mediaType)) return { buffer, mediaType };
  try {
    const decoded = jpegJs.decode(buffer, { useTArray: true });
    if (Math.max(decoded.width, decoded.height) <= FULL_MAX_EDGE) return { buffer, mediaType };
    return { buffer: Buffer.from(resizeJpegPureJs(buffer, FULL_MAX_EDGE, 85)), mediaType: "image/jpeg" };
  } catch (err) {
    console.error("Foto verkleinen mislukt (pure JS):", err.message);
    return { buffer, mediaType };
  }
}

// Pixelafmetingen van de uiteindelijk opgeslagen foto (ná resizeFullPhoto) —
// voor de lage-resolutie-waarschuwing in het fotoboek. Faalt stil (null/null)
// als geen van beide decoders overweg kan met het formaat; dat is dan gewoon
// een foto waarvoor de waarschuwing niet getoond kan worden, geen harde fout.
async function getImageDimensions(buffer, mediaType) {
  if (sharp) {
    try {
      const meta = await sharp(buffer).metadata();
      return { width: meta.width || null, height: meta.height || null };
    } catch (err) {
      console.error("Kon foto-afmetingen niet bepalen (sharp):", err.message);
    }
  }
  if (/jpe?g/i.test(mediaType)) {
    try {
      const decoded = jpegJs.decode(buffer, { useTArray: true });
      return { width: decoded.width || null, height: decoded.height || null };
    } catch (err) {
      console.error("Kon foto-afmetingen niet bepalen (jpeg-js):", err.message);
    }
  }
  return { width: null, height: null };
}

route("GET", "/api/trips/:id/photos", async (req, res, params) => {
  // Op wanneer de foto daadwerkelijk genomen is (EXIF), niet op wanneer 'm
  // toevallig geüpload is — anders staat een later toegevoegde foto van
  // eerder op de dag alsnog achteraan. Foto's zonder EXIF-tijdstip (taken_at
  // NULL) vallen terug op de uploadvolgorde, onderaan.
  // De LEFT JOINs zijn puur om `label` te kunnen vullen (waar de foto bij
  // hoort) — handig als zoekterm bij het kiezen van foto's, bijv. in het
  // fotoboek.
  const { rows } = await query(
    `SELECT p.id, p.trip_id, p.day_id, p.activity_id, p.transport_id, p.accommodation_id, p.mime_type, p.caption, p.taken_at, p.latitude, p.longitude, p.created_at, p.width, p.height,
            a.title AS activity_title, a.location AS activity_location,
            tr.type AS transport_type, tr.from_location, tr.to_location,
            ac.name AS accommodation_name,
            d.title AS day_title, d.date AS day_date
     FROM photos p
     LEFT JOIN activities a ON a.id = p.activity_id
     LEFT JOIN transports tr ON tr.id = p.transport_id
     LEFT JOIN accommodations ac ON ac.id = p.accommodation_id
     LEFT JOIN days d ON d.id = p.day_id
     WHERE p.trip_id = $1
     ORDER BY p.sort_key ASC, p.taken_at ASC NULLS LAST, p.created_at ASC`,
    [params.id]
  );
  sendJson(res, 200, rows.map((r) => ({
    id: r.id, trip_id: r.trip_id, day_id: r.day_id, activity_id: r.activity_id, transport_id: r.transport_id, accommodation_id: r.accommodation_id,
    mime_type: r.mime_type, caption: r.caption, taken_at: r.taken_at, latitude: r.latitude, longitude: r.longitude, created_at: r.created_at,
    width: r.width, height: r.height,
    label: photobookCaption(r),
    // Dag en activiteit erbij zodat de fotokiezer in het fotoboek daarop kan
    // groeperen zonder daarvoor apart de dagen/activiteiten op te halen.
    day_date: r.day_date, day_title: r.day_title, activity_title: r.activity_title,
    url: `/api/photos/${r.id}/raw`, thumb_url: `/api/photos/${r.id}/thumb`,
  })));
}, { tripScope: "param" });

// Eén foto vooraan zetten binnen zijn eigen groepje (dezelfde dag, activiteit,
// vervoer of verblijf). Geen volledige herordening: dit is de vraag die mensen
// stellen — "die ene moet vooraan" — en daar hoort één tik bij, geen sleepwerk.
//
// De gekozen foto krijgt één minder dan de laagste sleutel in zijn groepje. Zo
// verandert er aan de andere foto's niets, en werkt het ook als je het een paar
// keer achter elkaar doet.
route("PUT", "/api/photos/:id/voorop", async (req, res, params) => {
  const { rows } = await query("SELECT * FROM photos WHERE id = $1", [params.id]);
  if (!rows.length) return sendError(res, 404, "Foto niet gevonden");
  const foto = rows[0];
  // Hetzelfde groepje: precies dezelfde koppeling, inclusief de lege velden.
  // Anders zou "vooraan" bij een dagfoto ook de activiteitfoto's meenemen.
  const { rows: laagste } = await query(
    `SELECT MIN(sort_key) AS laagste FROM photos
      WHERE trip_id = $1
        AND day_id IS NOT DISTINCT FROM $2
        AND activity_id IS NOT DISTINCT FROM $3
        AND transport_id IS NOT DISTINCT FROM $4
        AND accommodation_id IS NOT DISTINCT FROM $5`,
    [foto.trip_id, foto.day_id, foto.activity_id, foto.transport_id, foto.accommodation_id]
  );
  const nieuw = (Number(laagste[0]?.laagste) || 0) - 1;
  await query("UPDATE photos SET sort_key = $1 WHERE id = $2", [nieuw, params.id]);
  sendJson(res, 200, { ok: true, sort_key: nieuw });
}, { tripScope: "photos" });

route("POST", "/api/trips/:id/photos", async (req, res, params, body) => {
  const { day_id, activity_id, transport_id, accommodation_id, image, caption, taken_at, latitude, longitude } = body;
  if (!image?.data || !image?.mediaType) return sendError(res, 400, "Geen afbeelding opgegeven");
  if (!(await targetsBelongToTrip(params.id, { day_id, activity_id, transport_id, accommodation_id }))) {
    return sendError(res, 400, "Ongeldige koppeling voor deze reis");
  }
  let buffer = Buffer.from(image.data, "base64");
  if (buffer.length > MAX_PHOTO_BYTES) return sendError(res, 413, "Afbeelding is te groot (max 8 MB)");
  const originalBuffer = buffer;
  const originalMediaType = image.mediaType;
  let mimeType = image.mediaType;
  ({ buffer, mediaType: mimeType } = await normalizeImage(buffer, mimeType));
  if (buffer.length > MAX_PHOTO_BYTES) return sendError(res, 413, "Afbeelding is te groot (max 8 MB)");
  let lat = typeof latitude === "number" && latitude >= -90 && latitude <= 90 ? latitude : null;
  let lon = typeof longitude === "number" && longitude >= -180 && longitude <= 180 ? longitude : null;
  // De browser's exif-js kan geen HEIC lezen (dat is geen JPEG/TIFF-structuur),
  // dus bij iPhone-foto's die als HEIC binnenkomen mist de client altijd de
  // GPS-tags — niet omdat de foto geen locatie heeft, maar omdat er client-side
  // niets uit te lezen viel. Lees de GPS daarom hier alsnog uit de originele
  // bytes (vóór de HEIC->JPEG-conversie, die geen Exif meeneemt), maar alleen
  // als de client zelf niets meegaf — die blijft de snelle eerste keuze.
  if (lat === null && lon === null) {
    try {
      const gps = looksLikeHeic(originalBuffer, originalMediaType)
        ? readHeicGps(originalBuffer)
        : readJpegGps(originalBuffer);
      if (gps) { lat = gps.latitude; lon = gps.longitude; }
    } catch (err) {
      console.error("Server-side GPS-extractie mislukt:", err.message);
    }
  }
  ({ buffer, mediaType: mimeType } = await resizeFullPhoto(buffer, mimeType));
  // Content hash de-dupes identical photos within a trip: re-uploading the same
  // bytes reuses the existing row instead of storing a duplicate blob, keeping
  // its current assignment (day/activity/transport/accommodation) if it has one.
  const contentHash = crypto.createHash("md5").update(buffer).digest("hex");
  const thumb = await makeThumbnail(buffer);
  const { width: imgWidth, height: imgHeight } = await getImageDimensions(buffer, mimeType);
  // De bytes gaan naar de objectopslag als die aanstaat, en anders gewoon mee in
  // de INSERT hieronder. Eerst schrijven, dan pas de rij: gaat de bucket mis,
  // dan is er nog niets aangemaakt en krijgt de gebruiker een echte fout in
  // plaats van een foto die wel in de lijst staat maar nergens te bekijken is.
  // Andersom (rij eerst) zou een half aangemaakte foto achterlaten.
  let volVeld, thumbVeld;
  try {
    volVeld = await fotoVelden(params.id, buffer, contentHash, { mediaType: mimeType });
    thumbVeld = thumb
      ? await fotoVelden(params.id, thumb, contentHash, { soort: "thumb" })
      : { thumb_data: null, thumb_key: null, thumb_size: null };
  } catch (err) {
    console.error("Objectopslag: foto kon niet worden weggeschreven:", err.message);
    return sendError(res, 503, "De foto kon niet worden opgeslagen. Probeer het zo nog eens.");
  }
  let rows;
  try {
    ({ rows } = await query(
      `INSERT INTO photos (trip_id, day_id, activity_id, transport_id, accommodation_id, mime_type, data, caption, taken_at, latitude, longitude, content_hash, thumb_data, thumb_rev, width, height, storage_key, byte_size, thumb_key, thumb_size)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT (trip_id, content_hash) WHERE content_hash IS NOT NULL DO UPDATE SET
         day_id = COALESCE(photos.day_id, EXCLUDED.day_id),
         activity_id = COALESCE(photos.activity_id, EXCLUDED.activity_id),
         transport_id = COALESCE(photos.transport_id, EXCLUDED.transport_id),
         accommodation_id = COALESCE(photos.accommodation_id, EXCLUDED.accommodation_id),
         caption = COALESCE(photos.caption, EXCLUDED.caption),
         taken_at = COALESCE(photos.taken_at, EXCLUDED.taken_at),
         latitude = COALESCE(photos.latitude, EXCLUDED.latitude),
         longitude = COALESCE(photos.longitude, EXCLUDED.longitude),
         -- Dezelfde foto nog eens: de bytes zijn per definitie identiek (de
         -- inhoudshash is de sleutel van dit conflict), dus de opslagplek van de
         -- volle foto blijft staan zoals hij stond. De miniatuur wél vervangen,
         -- maar alleen als er deze keer echt een gemaakt is — dat is precies wat
         -- thumb_rev > 0 zegt. Zo blijft een bestaande miniatuur staan als het
         -- maken nu mislukte, en schuift een miniatuur van een oudere generator
         -- wél op naar de nieuwe, mét het bijbehorende revisienummer.
         thumb_data = CASE WHEN EXCLUDED.thumb_rev > 0 THEN EXCLUDED.thumb_data ELSE photos.thumb_data END,
         thumb_key = CASE WHEN EXCLUDED.thumb_rev > 0 THEN EXCLUDED.thumb_key ELSE photos.thumb_key END,
         thumb_size = CASE WHEN EXCLUDED.thumb_rev > 0 THEN EXCLUDED.thumb_size ELSE photos.thumb_size END,
         thumb_rev = CASE WHEN EXCLUDED.thumb_rev > 0 THEN EXCLUDED.thumb_rev ELSE photos.thumb_rev END,
         width = COALESCE(photos.width, EXCLUDED.width),
         height = COALESCE(photos.height, EXCLUDED.height)
       RETURNING id, trip_id, day_id, activity_id, transport_id, accommodation_id, mime_type, caption, taken_at, latitude, longitude, created_at, width, height, (xmax = 0) AS inserted`,
      [params.id, day_id || null, activity_id || null, transport_id || null, accommodation_id || null, mimeType,
       volVeld.data ?? null, caption || null, taken_at || null, lat, lon, contentHash,
       thumbVeld.thumb_data ?? null, thumb ? THUMB_REV : 0, imgWidth, imgHeight,
       volVeld.storage_key ?? null, volVeld.byte_size ?? null, thumbVeld.thumb_key ?? null, thumbVeld.thumb_size ?? null]
    ));
  } catch (err) {
    // Postgres geeft hier een letterlijke bestandssysteemfout terug ("could not
    // extend file... No space left on device") die als ruwe tekst naar de
    // gebruiker lekte — onbegrijpelijk en niet iets waar zij iets aan kunnen
    // doen. Dit is de schijf van de database zelf die vol zit, niet deze foto.
    if (/no space left on device/i.test(err.message)) {
      return sendError(res, 507, "De opslag van de reisplanner zit vol. Er kunnen nu geen foto's bij — laat het weten aan wie de app beheert.");
    }
    throw err;
  }
  const { inserted, ...photo } = rows[0];
  if (inserted) {
    const who = firstName(req.user) || "Iemand";
    notifyTripViewers(params.id, req.user.id, "photo", `${who} voegde een foto toe`, who);
  }
  sendJson(res, inserted ? 201 : 200, { ...photo, url: `/api/photos/${photo.id}/raw`, thumb_url: `/api/photos/${photo.id}/thumb` });
}, { tripScope: "param" });

// Persist a converted photo. Changing the bytes changes the content hash, which
// can collide with an existing row under photos_trip_hash_unique (e.g. the same
// picture was re-uploaded after the converter started working). Falling back to
// a NULL hash — excluded from the partial index — keeps the converted JPEG
// instead of leaving the row as HEIC and re-converting it on every single view.
async function persistConvertedPhoto(id, mediaType, buffer) {
  await vervangFotoBytes(id, mediaType, buffer);
}

// De bytes van een bestaande foto vervangen (omzetten van HEIC, draaien,
// verkleinen). Andere bytes betekent een andere inhoudshash, dus in de
// objectopslag ook een ander object: het nieuwe wordt weggeschreven, de rij
// wijst ernaar, en pas daarna gaat het oude weg — die volgorde, want een foto
// die even dubbel in de bucket staat is niets, en een rij die naar een al
// verwijderd object wijst is een kapotte foto.
//
// De thumbnail wordt hoe dan ook weggegooid: die was van de oude bytes gemaakt,
// dus hem laten staan levert een correct origineel naast een verouderde (of
// scheve) miniatuur.
async function vervangFotoBytes(id, mediaType, buffer) {
  const { rows } = await query("SELECT trip_id, storage_key, thumb_key FROM photos WHERE id = $1", [id]);
  if (!rows.length) return;
  const { trip_id, storage_key: oudeSleutel, thumb_key: oudeThumbSleutel } = rows[0];
  const contentHash = crypto.createHash("md5").update(buffer).digest("hex");
  const veld = await fotoVelden(trip_id, buffer, contentHash, { mediaType });

  const zet = async (hash) => query(
    `UPDATE photos SET mime_type=$1, data=$2, storage_key=$3, byte_size=$4, content_hash=$5,
            thumb_data=NULL, thumb_key=NULL, thumb_size=NULL, thumb_rev=0
      WHERE id=$6`,
    [mediaType, veld.data ?? null, veld.storage_key ?? null, veld.byte_size ?? null, hash, id]
  );
  try {
    await zet(contentHash);
  } catch (err) {
    // Botst de nieuwe hash met een andere foto in dezelfde reis (dezelfde plaat
    // was al eens omgezet geüpload), dan blijft de hash leeg — die staat buiten
    // de gedeeltelijke unieke index. Beter dan de rij als HEIC laten staan en
    // hem bij elke weergave opnieuw omzetten.
    if (err.code !== "23505") throw err;
    await zet(null);
  }
  // Het oude object alleen aanmelden als het echt een ander object was — bij
  // identieke bytes wijst de nieuwe sleutel naar hetzelfde bestand.
  await meldObjectenAan([
    oudeSleutel && oudeSleutel !== veld.storage_key ? oudeSleutel : null,
    oudeThumbSleutel,
  ]);
}

// Ligt de foto in de objectopslag, dan stuurt de app de browser daarheen in
// plaats van de bytes zelf door te geven. Dat is de hele winst van de
// verhuizing: het serverproces raakt megabytes aan foto's niet meer aan, en het
// verkeer gaat via de bucket (of het CDN ervoor) rechtstreeks naar het toestel.
//
// De rechtencontrole gebeurt nog steeds hier — je komt alleen bij deze route
// als je bij de reis mag — en de getekende URL die je dan krijgt is tijdelijk.
// De omleiding zelf mag korter gecachet worden dan de handtekening geldig is,
// anders wijst een uit de browsercache opgediepte omleiding naar een
// handtekening die al verlopen is.
function stuurNaarOpslag(req, res, sleutel, { contentType = null, etag = null } = {}) {
  const geldig = opslag.geldigheidSeconden();
  const url = opslag.getekendeUrl(sleutel, { contentType });
  const headers = {
    Location: url,
    "Cache-Control": `private, max-age=${Math.max(60, Math.floor(geldig / 2))}`,
  };
  if (etag) headers.ETag = etag;
  res.writeHead(302, headers);
  res.end();
}

route("GET", "/api/photos/:id/raw", async (req, res, params) => {
  const { rows } = await query("SELECT data, mime_type, content_hash, storage_key FROM photos WHERE id = $1", [params.id]);
  if (!rows.length) { res.writeHead(404); res.end(); return; }
  if (rows[0].storage_key) {
    const type = SAFE_IMAGE_TYPES.has(rows[0].mime_type) ? rows[0].mime_type : "application/octet-stream";
    // HEIC dat nog in de bucket ligt hoort niet doorverwezen te worden: de
    // browser kan er niets mee. Die valt terug op het gewone pad hieronder, dat
    // hem omzet en het resultaat bewaart — daarna is hij wel gewoon te sturen.
    if (!looksLikeHeic(null, rows[0].mime_type)) {
      const etag = rows[0].content_hash ? `"${rows[0].content_hash}"` : null;
      if (etag && req.headers["if-none-match"] === etag) { res.writeHead(304); res.end(); return; }
      return stuurNaarOpslag(req, res, rows[0].storage_key, { contentType: type, etag });
    }
  }
  let { data, mime_type, content_hash } = rows[0];
  data = await fotoBytes(rows[0]);
  if (!data) { res.writeHead(404); res.end(); return; }
  // Safety net: convert on first view for any HEIC photo the upload-time
  // conversion or startup backfill missed (e.g. a legacy row whose stored
  // mime_type didn't look HEIC even though its bytes are), and persist the
  // result so later requests are served directly.
  if (looksLikeHeic(data, mime_type)) {
    try {
      const converted = await normalizeImage(data, mime_type);
      if (converted.mediaType !== mime_type) {
        data = converted.buffer;
        mime_type = converted.mediaType;
        content_hash = null;
        await persistConvertedPhoto(params.id, mime_type, data)
          .catch((err) => console.error(`Failed to persist HEIC conversion for photo ${params.id}:`, err.message));
      }
    } catch (err) {
      console.error(`On-the-fly HEIC conversion failed for photo ${params.id}:`, err.message);
    }
  }
  // mime_type is attacker-supplied at upload time; echoing it verbatim would let
  // a stored "text/html" photo execute script on this origin.
  const contentType = SAFE_IMAGE_TYPES.has(mime_type) ? mime_type : "application/octet-stream";
  const etag = content_hash ? `"${content_hash}"` : null;
  if (etag && req.headers["if-none-match"] === etag) { res.writeHead(304); res.end(); return; }
  const headers = { "Content-Type": contentType, "Content-Length": data.length, "Cache-Control": "private, max-age=31536000" };
  if (etag) headers.ETag = etag;
  res.writeHead(200, headers);
  res.end(data);
}, { tripScope: "photos" });

route("GET", "/api/photos/:id/thumb", async (req, res, params) => {
  const { rows } = await query(
    "SELECT trip_id, thumb_data, thumb_key, thumb_rev, content_hash FROM photos WHERE id = $1",
    [params.id]
  );
  if (!rows.length) { res.writeHead(404); res.end(); return; }
  const etag = rows[0].content_hash ? `"t${rows[0].content_hash}"` : null;
  const actueel = rows[0].thumb_rev >= THUMB_REV;

  // Ligt de miniatuur al in de objectopslag en is hij van de huidige generator,
  // dan hoeft er hier niets meer te gebeuren dan de weg wijzen.
  if (actueel && rows[0].thumb_key) {
    if (etag && req.headers["if-none-match"] === etag) { res.writeHead(304); res.end(); return; }
    return stuurNaarOpslag(req, res, rows[0].thumb_key, { contentType: "image/jpeg", etag });
  }

  let thumb = actueel ? rows[0].thumb_data : null;
  // Generated lazily for photos that predate thumbnails, whose generation failed
  // at upload, or that were built by an older generator. Only the first viewer
  // after the change pays for it.
  if (!thumb) {
    const full = await query("SELECT data, mime_type, storage_key FROM photos WHERE id = $1", [params.id]);
    let data = await fotoBytes(full.rows[0]);
    if (!data) { res.writeHead(404); res.end(); return; }
    const mime_type = full.rows[0].mime_type;
    if (looksLikeHeic(data, mime_type)) {
      const converted = await normalizeImage(data, mime_type);
      data = converted.buffer;
    }
    thumb = await makeThumbnail(data);
    if (!thumb) { res.writeHead(302, { Location: `/api/photos/${params.id}/raw` }); res.end(); return; }
    // De verse miniatuur belandt op dezelfde plek als de foto zelf: in de bucket
    // als die aanstaat, anders in de kolom. Mislukt dat, dan gaat hij hieronder
    // gewoon één keer rechtstreeks de deur uit en probeert de volgende kijker
    // het opnieuw — vervelend, niet fataal.
    await fotoVelden(rows[0].trip_id, thumb, rows[0].content_hash, { soort: "thumb" })
      .then((veld) => query(
        "UPDATE photos SET thumb_data = $1, thumb_key = $2, thumb_size = $3, thumb_rev = $4 WHERE id = $5",
        [veld.thumb_data ?? null, veld.thumb_key ?? null, veld.thumb_size ?? null, THUMB_REV, params.id]
      ))
      .catch((err) => console.error(`Failed to persist thumbnail for photo ${params.id}:`, err.message));
  }
  if (etag && req.headers["if-none-match"] === etag) { res.writeHead(304); res.end(); return; }
  const headers = { "Content-Type": "image/jpeg", "Content-Length": thumb.length, "Cache-Control": "private, max-age=31536000" };
  if (etag) headers.ETag = etag;
  res.writeHead(200, headers);
  res.end(thumb);
}, { tripScope: "photos" });

// Rotate a stored photo a quarter turn. HEIC uploads converted before the Exif
// rotation was applied are stored sideways with no orientation tag left to read,
// so there is nothing to detect and correct automatically — this lets them be
// fixed without re-uploading.
route("POST", "/api/photos/:id/rotate", async (req, res, params, body) => {
  const quarterTurns = ((Number(body?.turns) || 1) % 4 + 4) % 4;
  if (!quarterTurns) return sendJson(res, 200, { ok: true });
  const { rows } = await query("SELECT data, storage_key, mime_type FROM photos WHERE id = $1", [params.id]);
  if (!rows.length) return sendError(res, 404, "Foto niet gevonden");
  let data = await fotoBytes(rows[0]);
  if (!data) return sendError(res, 404, "Foto niet gevonden");
  let mime_type = rows[0].mime_type;
  if (looksLikeHeic(data, mime_type)) {
    const converted = await normalizeImage(data, mime_type);
    data = converted.buffer; mime_type = converted.mediaType;
  }
  try {
    const img = jpegJs.decode(data, { useTArray: true });
    // Orientation 6 is a quarter turn clockwise; apply it as many times as asked.
    let cur = { data: Buffer.from(img.data), width: img.width, height: img.height };
    for (let i = 0; i < quarterTurns; i++) cur = applyOrientation(cur.data, cur.width, cur.height, 6);
    const rotated = Buffer.from(jpegJs.encode({ data: cur.data, width: cur.width, height: cur.height }, 90).data);
    await vervangFotoBytes(params.id, "image/jpeg", rotated);
    sendJson(res, 200, { ok: true });
  } catch (err) {
    console.error(`Rotating photo ${params.id} failed:`, err.message);
    sendError(res, 500, "Foto kon niet gedraaid worden");
  }
}, { tripScope: "photos" });

// Separate from PUT /api/photos/:id on purpose: that route sets all four target
// columns from the body, so folding the caption in would blank it every time a
// photo is reassigned.
route("PUT", "/api/photos/:id/caption", async (req, res, params, body) => {
  const caption = typeof body?.caption === "string" ? body.caption.trim() : "";
  if (caption.length > 500) return sendError(res, 400, "Tekst is te lang (max 500 tekens)");
  const { rows } = await query(
    "UPDATE photos SET caption = $1 WHERE id = $2 RETURNING id, caption",
    [caption || null, params.id]
  );
  if (!rows.length) return sendError(res, 404, "Foto niet gevonden");
  sendJson(res, 200, rows[0]);
}, { tripScope: "photos" });

route("PUT", "/api/photos/:id", async (req, res, params, body) => {
  const { day_id, activity_id, transport_id, accommodation_id } = body;
  const { rows: owner } = await query("SELECT trip_id FROM photos WHERE id = $1", [params.id]);
  if (!owner.length) return sendError(res, 404, "Foto niet gevonden");
  // A photo may only be pinned to targets inside its own trip — otherwise it
  // could be attached to a stranger's day/activity by id.
  if (!(await targetsBelongToTrip(owner[0].trip_id, { day_id, activity_id, transport_id, accommodation_id }))) {
    return sendError(res, 400, "Ongeldige koppeling voor deze reis");
  }
  const { rows } = await query(
    "UPDATE photos SET day_id=$1, activity_id=$2, transport_id=$3, accommodation_id=$4 WHERE id=$5 RETURNING id, trip_id, day_id, activity_id, transport_id, accommodation_id, mime_type, caption, taken_at, latitude, longitude, created_at",
    [day_id || null, activity_id || null, transport_id || null, accommodation_id || null, params.id]
  );
  if (!rows.length) return sendError(res, 404, "Foto niet gevonden");
  sendJson(res, 200, { ...rows[0], url: `/api/photos/${rows[0].id}/raw`, thumb_url: `/api/photos/${rows[0].id}/thumb` });
}, { tripScope: "photos" });

route("DELETE", "/api/photos/:id", async (req, res, params) => {
  // Eerst de rij weg, dan pas het object: valt het opruimen van de bucket om,
  // dan blijft er hooguit een verweesd bestand achter (op te ruimen), terwijl
  // andersom een foto in de lijst zou blijven staan die nergens meer te zien is.
  // De objecten in de bucket worden door een trigger aangemeld voor opruiming
  // (zie db.js) — ook als deze foto langs een heel ander pad verdwijnt, zoals
  // het weggooien van de hele reis.
  await query("DELETE FROM photos WHERE id = $1", [params.id]);
  res.writeHead(204); res.end();
}, { tripScope: "photos" });

// ---------- Journal (dagboek) ----------
function firstName(user) {
  if (!user) return null;
  if (user.given_name) return user.given_name;
  if (user.name) return user.name.trim().split(/\s+/)[0];
  return null;
}

// A "visit" ends once someone has been away this long. Refreshing or navigating
// around inside one sitting keeps the same marker, so the "nieuw" badges don't
// disappear the moment the page reloads; come back tomorrow and the marker moves
// up to where you left off.
const JOURNAL_VISIT_GAP_MINUTES = 30;

// Returns the boundary to mark entries against, then records this visit.
// Deliberately independent of login: people stay signed in for weeks, so a
// login timestamp would mark everything as seen forever.
async function advanceJournalRead(tripId, userId) {
  const { rows } = await query("SELECT marker_at, last_seen_at FROM journal_reads WHERE trip_id = $1 AND user_id = $2", [tripId, userId]);
  if (!rows.length) {
    // First ever visit: start the clock now rather than flagging the whole
    // trip's backlog as new.
    await query("INSERT INTO journal_reads (trip_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [tripId, userId]);
    return new Date();
  }
  const { marker_at, last_seen_at } = rows[0];
  const gapMs = Date.now() - new Date(last_seen_at).getTime();
  const newVisit = gapMs > JOURNAL_VISIT_GAP_MINUTES * 60 * 1000;
  // On a new visit the boundary becomes the end of the previous visit, so
  // "new" means everything written since you last had this page open.
  const marker = newVisit ? last_seen_at : marker_at;
  await query(
    "UPDATE journal_reads SET marker_at = $3, last_seen_at = NOW() WHERE trip_id = $1 AND user_id = $2",
    [tripId, userId, marker]
  );
  return marker;
}

// A dagboek block is a day, activity, transport, stay, or one specific photo.
// Reactions hang off the block rather than off a particular person's entry, so
// a day nobody has written about — or one with only photos — can still be
// commented on and liked, and now a single photo can be too.
const SLOT_COLS = ["day_id", "activity_id", "transport_id", "accommodation_id", "photo_id"];
const slotKey = (row) => {
  const col = SLOT_COLS.find((c) => row[c]);
  return col ? `${col}:${row[col]}` : null;
};

function slotFromBody(body) {
  const present = SLOT_COLS.filter((c) => body[c]);
  if (present.length !== 1) return null;
  return { col: present[0], id: body[present[0]] };
}

route("GET", "/api/trips/:id/journal", async (req, res, params) => {
  const marker = await advanceJournalRead(params.id, req.user.id);
  const [{ rows: entries }, { rows: comments }, { rows: likes }] = await Promise.all([
    query(
      `SELECT je.*, u.given_name, u.name AS user_name
       FROM journal_entries je
       LEFT JOIN users u ON u.id = je.user_id
       WHERE je.trip_id = $1
       ORDER BY je.created_at ASC`,
      [params.id]
    ),
    query(
      `SELECT c.*, u.given_name, u.name AS user_name
       FROM journal_comments c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.trip_id = $1
       ORDER BY c.created_at ASC`,
      [params.id]
    ),
    query("SELECT day_id, activity_id, transport_id, accommodation_id, photo_id, comment_id, user_id FROM journal_likes WHERE trip_id = $1", [params.id]),
  ]);

  const isNew = (ts, authorId) =>
    authorId !== req.user.id && !!ts && new Date(ts) > new Date(marker);

  const slotLikes = new Map();
  const commentLikes = new Map();
  for (const l of likes) {
    const [map, key] = l.comment_id ? [commentLikes, l.comment_id] : [slotLikes, slotKey(l)];
    if (!key) continue;
    if (!map.has(key)) map.set(key, { count: 0, mine: false });
    const agg = map.get(key);
    agg.count += 1;
    if (l.user_id === req.user.id) agg.mine = true;
  }
  const likesOf = (map, key) => {
    const agg = map.get(key);
    return { like_count: agg ? agg.count : 0, liked_by_me: agg ? agg.mine : false };
  };

  sendJson(res, 200, {
    entries: entries.map((r) => {
      const { given_name, user_name, ...entry } = r;
      return {
        ...entry,
        author: firstName({ given_name, name: user_name }),
        // updated_at, not created_at: the journal upserts per (slot, author), so
        // someone adding to a story they already started is an edit, not a new
        // row — flagging only creations would silently miss most of the writing.
        is_new: isNew(r.updated_at || r.created_at, r.user_id),
      };
    }),
    comments: comments.map((c) => {
      const { given_name, user_name, ...comment } = c;
      return {
        ...comment,
        author: firstName({ given_name, name: user_name }),
        is_new: isNew(c.created_at, c.user_id),
        ...likesOf(commentLikes, c.id),
      };
    }),
    slot_likes: Object.fromEntries([...slotLikes].map(([k, v]) => [k, { like_count: v.count, liked_by_me: v.mine }])),
  });
}, { tripScope: "param" });

// Alles wat er de afgelopen dagen op de reis gereageerd en geliket is, door
// elkaar en op tijd gesorteerd. Reacties en duimpjes staan in twee tabellen en
// hangen bovendien aan verschillende soorten plekken (een dag, een activiteit,
// een vervoer, een verblijf, een foto, of aan een andere reactie); ze hier
// samenvoegen en meteen van een leesbaar onderwerp voorzien scheelt de client
// een hoop uitzoekwerk — en het is precies wat je wilt zien als je even weg
// bent geweest.
route("GET", "/api/trips/:id/reacties", async (req, res, params) => {
  const url = new URL(req.url, "http://localhost");
  // Zeven dagen als standaard, met een grens: dit is een terugblik, geen archief.
  const dagen = Math.min(90, Math.max(1, parseInt(url.searchParams.get("dagen"), 10) || 7));

  const { rows } = await query(
    `SELECT x.*,
            COALESCE(d.date, ad.date, pd.date) AS dag_datum,
            -- De dag waar dit bij hoort: rechtstreeks, via de activiteit, of via
            -- de foto. Zonder die omweg had een reactie op een activiteit geen
            -- dag en dus geen terugvaloptie om naartoe te springen.
            COALESCE(x.day_id, a.day_id, pd.id) AS anker_dag_id,
            COALESCE(d.title, pd.title) AS dag_titel,
            COALESCE(a.id, pa.id) AS anker_activiteit_id,
            COALESCE(a.title, pa.title) AS activiteit,
            t.type AS vervoer_type, t.from_location, t.to_location,
            acc.name AS verblijf
       FROM (
         SELECT c.id, 'reactie' AS soort, c.created_at AS wanneer, c.body AS tekst,
                c.user_id, u.given_name, u.name AS user_name,
                c.day_id, c.activity_id, c.transport_id, c.accommodation_id, c.photo_id,
                NULL::text AS op_reactie, NULL::text AS op_reactie_van
           FROM journal_comments c
           LEFT JOIN users u ON u.id = c.user_id
          WHERE c.trip_id = $1 AND c.created_at > NOW() - ($2 || ' days')::interval
         UNION ALL
         -- Een duimpje op een reactie erft de plek van die reactie, zodat het
         -- onderwerp ook dan klopt.
         SELECT l.id, 'duimpje', l.created_at, NULL,
                l.user_id, u.given_name, u.name,
                COALESCE(l.day_id, c.day_id), COALESCE(l.activity_id, c.activity_id),
                COALESCE(l.transport_id, c.transport_id), COALESCE(l.accommodation_id, c.accommodation_id),
                COALESCE(l.photo_id, c.photo_id),
                c.body, COALESCE(cu.given_name, cu.name)
           FROM journal_likes l
           LEFT JOIN users u ON u.id = l.user_id
           LEFT JOIN journal_comments c ON c.id = l.comment_id
           LEFT JOIN users cu ON cu.id = c.user_id
          WHERE l.trip_id = $1 AND l.created_at > NOW() - ($2 || ' days')::interval
       ) x
       LEFT JOIN days d ON d.id = x.day_id
       LEFT JOIN activities a ON a.id = x.activity_id
       LEFT JOIN days ad ON ad.id = a.day_id
       LEFT JOIN transports t ON t.id = x.transport_id
       LEFT JOIN accommodations acc ON acc.id = x.accommodation_id
       LEFT JOIN photos p ON p.id = x.photo_id
       LEFT JOIN days pd ON pd.id = p.day_id
       LEFT JOIN activities pa ON pa.id = p.activity_id
      ORDER BY x.wanneer DESC
      LIMIT 300`,
    [params.id, dagen]
  );

  sendJson(res, 200, {
    dagen,
    items: rows.map((r) => ({
      id: r.id,
      soort: r.soort,
      wanneer: r.wanneer,
      tekst: r.tekst,
      wie: firstName({ given_name: r.given_name, name: r.user_name }) || "Iemand",
      vanMij: r.user_id === req.user.id,
      opReactie: r.op_reactie,
      // COALESCE hierboven levert de voornaam óf de volledige naam; firstName
      // knipt in dat tweede geval alsnog de voornaam eraf.
      opReactieVan: firstName({ name: r.op_reactie_van }) || null,
      // Waar de app naartoe moet springen. Een reactie op een foto krijgt de
      // activiteit of dag van die foto mee, want de foto zelf staat in een
      // horizontaal schuivende strook en is geen plek om naartoe te springen.
      dagId: r.anker_dag_id,
      activiteitId: r.anker_activiteit_id,
      dagDatum: r.dag_datum,
      // Waar het over gaat, van specifiek naar algemeen. De client hoeft dan
      // alleen nog maar te tonen wat hier staat.
      onderwerp: r.activiteit
        || (r.vervoer_type ? [r.vervoer_type, [r.from_location, r.to_location].filter(Boolean).join(" → ")].filter(Boolean).join(": ") : null)
        || r.verblijf
        || (r.photo_id ? "een foto" : null)
        || r.dag_titel
        || null,
    })),
  });
}, { tripScope: "param" });

route("POST", "/api/trips/:id/journal-comments", async (req, res, params, body) => {
  const { body: text } = body;
  if (!text || !text.trim()) return sendError(res, 400, "Reactie mag niet leeg zijn");
  if (String(text).length > 2000) return sendError(res, 400, "Reactie is te lang (max 2000 tekens)");
  const slot = slotFromBody(body);
  if (!slot) return sendError(res, 400, "Koppel de reactie aan precies één dag, activiteit, vervoer of verblijf");
  if (!(await targetsBelongToTrip(params.id, body))) return sendError(res, 400, "Ongeldige koppeling voor deze reis");
  const { rows } = await query(
    `INSERT INTO journal_comments (trip_id, user_id, body, ${slot.col}) VALUES ($1,$2,$3,$4) RETURNING *`,
    [params.id, req.user.id, text.trim(), slot.id]
  );
  const who = firstName(req.user) || "Iemand";
  const excerpt = text.trim().length > 80 ? text.trim().slice(0, 80) + "…" : text.trim();
  notifyTripManagers(params.id, req.user.id, "comment", `${who} reageerde: "${excerpt}"`, who);
  sendJson(res, 201, { ...rows[0], author: firstName(req.user), is_new: false, like_count: 0, liked_by_me: false });
}, { tripScope: "param", allowViewer: true });

// Toggle a thumbs-up on a dagboek block or on a reaction. Viewers may like, same
// as they may comment — it is the point of sharing a trip read-only.
route("POST", "/api/trips/:id/journal-likes", async (req, res, params, body) => {
  let col, id;
  if (body.comment_id) {
    const { rows } = await query("SELECT 1 FROM journal_comments WHERE id = $1 AND trip_id = $2", [body.comment_id, params.id]);
    if (!rows.length) return sendError(res, 404, "Reactie niet gevonden");
    col = "comment_id"; id = body.comment_id;
  } else {
    const slot = slotFromBody(body);
    if (!slot) return sendError(res, 400, "Geef precies één doel op");
    if (!(await targetsBelongToTrip(params.id, body))) return sendError(res, 400, "Ongeldige koppeling voor deze reis");
    col = slot.col; id = slot.id;
  }
  const { rowCount } = await query(`DELETE FROM journal_likes WHERE ${col} = $1 AND user_id = $2`, [id, req.user.id]);
  if (rowCount) return sendJson(res, 200, { liked: false });
  await query(
    `INSERT INTO journal_likes (trip_id, user_id, ${col}) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
    [params.id, req.user.id, id]
  );
  const liker = firstName(req.user) || "Iemand";
  notifyTripManagers(params.id, req.user.id, "like",
    col === "comment_id" ? `${liker} vond een reactie leuk` : `${liker} gaf een duimpje`, liker);
  sendJson(res, 201, { liked: true });
}, { tripScope: "param", allowViewer: true });

// De eigenaar van de reis mag ook reacties van anderen verwijderen — anders
// kan een misplaatste of verkeerd-op-de-dag-terechtgekomen reactie nooit meer
// opgeruimd worden zonder degene die 'm plaatste erbij te halen.
route("DELETE", "/api/journal-comments/:id", async (req, res, params) => {
  const result = req.tripRole === "owner"
    ? await query("DELETE FROM journal_comments WHERE id = $1", [params.id])
    : await query("DELETE FROM journal_comments WHERE id = $1 AND user_id = $2", [params.id, req.user.id]);
  if (!result.rowCount) return sendError(res, 403, "Je kunt alleen je eigen reactie verwijderen");
  res.writeHead(204); res.end();
}, { tripScope: "journal_comments", allowViewer: true });

route("POST", "/api/trips/:id/journal", async (req, res, params, body) => {
  const { day_id, activity_id, transport_id, accommodation_id, title, body: text } = body;
  if (!text || !text.trim()) return sendError(res, 400, "Verhaal mag niet leeg zijn");
  const targets = [["day_id", day_id], ["activity_id", activity_id], ["transport_id", transport_id], ["accommodation_id", accommodation_id]].filter(([, v]) => v);
  if (targets.length !== 1) return sendError(res, 400, "Koppel het verhaal aan precies één dag, activiteit, vervoer of verblijf");
  const [col, val] = targets[0];
  if (!(await targetsBelongToTrip(params.id, { day_id, activity_id, transport_id, accommodation_id }))) {
    return sendError(res, 400, "Ongeldige koppeling voor deze reis");
  }
  const author = firstName(req.user);

  // Atomic upsert: the previous check-then-branch (SELECT, then UPDATE or
  // INSERT) left a window where two near-simultaneous requests for the same
  // slot (a double-tap, or two open tabs) could both miss the SELECT and both
  // try to INSERT — the second hit the unique index below and surfaced as an
  // unhandled 500 instead of taking the update path. `col` is one of the four
  // fixed column names checked above, never raw user input.
  const { rows } = await query(
    `INSERT INTO journal_entries (trip_id, day_id, activity_id, transport_id, accommodation_id, title, body, user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (${col}, user_id) WHERE ${col} IS NOT NULL DO UPDATE SET
       title = EXCLUDED.title, body = EXCLUDED.body, updated_at = NOW()
     RETURNING *, (xmax = 0) AS inserted`,
    [params.id, day_id || null, activity_id || null, transport_id || null, accommodation_id || null, title || null, text, req.user.id]
  );
  const { inserted, ...entry } = rows[0];
  notifyTripViewers(params.id, req.user.id, "entry", `${author || "Iemand"} ${inserted ? "schreef een nieuw verhaal" : "werkte een verhaal bij"}`, author);
  sendJson(res, inserted ? 201 : 200, { ...entry, author });
}, { tripScope: "param" });

route("DELETE", "/api/journal/:id", async (req, res, params) => {
  // Scoped to the author: deleting someone else's entry must not silently
  // report success, so report 403 rather than a 204 that did nothing.
  const { rowCount } = await query("DELETE FROM journal_entries WHERE id = $1 AND user_id = $2", [params.id, req.user.id]);
  if (!rowCount) return sendError(res, 403, "Je kunt alleen je eigen verhaal verwijderen");
  res.writeHead(204); res.end();
}, { tripScope: "journal_entries" });

// ---------- Auth routes ----------

// Sign-in is Google or Apple only. These two remain so a page still holding the
// old form gets a clear message instead of an opaque 404. Existing password
// accounts are not orphaned: findOrCreateUser matches on email, so signing in
// with Google using the same address lands on the same account and its trips.
const PASSWORD_AUTH_GONE = "Inloggen met wachtwoord is niet meer mogelijk. Gebruik Google of Apple — met hetzelfde e-mailadres kom je op je bestaande account.";

route("POST", "/auth/register", async (req, res) => {
  sendJson(res, 410, { error: PASSWORD_AUTH_GONE });
});

route("POST", "/auth/login/password", async (req, res) => {
  sendJson(res, 410, { error: PASSWORD_AUTH_GONE });
});

route("GET", "/auth/me", async (req, res) => {
  const user = await getSession(req);
  if (!user) return sendError(res, 401, "Niet ingelogd");
  sendJson(res, 200, {
    id: user.id, name: user.name, email: user.email, avatar: user.avatar, is_admin: user.is_admin,
    linked: { google: !!user.google_id, apple: !!user.apple_id },
    notify_email: user.notify_email !== false,
  });
});

// Attach an Apple ID to the account you are already signed in to.
//
// Apple's `sub` is stable per user per app, so repeat sign-ins always find the
// right account — that part needs nothing. The gap is the first Apple sign-in by
// someone who already had an account: with "hide my e-mail" Apple sends a relay
// address that matches nothing, so they land on a new empty account instead of
// their trips. There is no way to recover the real address from the relay one,
// so the link has to be made deliberately from inside an authenticated session.
// Recipients can turn notification mail off for themselves.
route("PUT", "/auth/notify-email", async (req, res, params, body) => {
  const user = await getSession(req);
  if (!user) return sendError(res, 401, "Niet ingelogd");
  const enabled = body?.enabled !== false;
  await query("UPDATE users SET notify_email = $1 WHERE id = $2", [enabled, user.id]);
  sendJson(res, 200, { notify_email: enabled });
});

// Public key alone, never the private one — the browser needs it to build a
// subscription. Null when no VAPID keys are configured, so the client can hide
// the toggle instead of offering a switch that silently does nothing.
route("GET", "/api/push/public-key", async (req, res) => {
  sendJson(res, 200, { key: pushEnabled() ? process.env.VAPID_PUBLIC_KEY : null });
});

route("POST", "/api/push/subscribe", async (req, res, params, body) => {
  const { endpoint, keys } = body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) return sendError(res, 400, "Ongeldige subscriptie");
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1,$2,$3,$4)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, p256dh = $3, auth = $4`,
    [req.user.id, endpoint, keys.p256dh, keys.auth]
  );
  sendJson(res, 201, { subscribed: true });
});

route("POST", "/api/push/unsubscribe", async (req, res, params, body) => {
  if (body?.endpoint) await query("DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2", [body.endpoint, req.user.id]);
  sendJson(res, 200, { subscribed: false });
});

route("POST", "/auth/apple/link", async (req, res, params, body) => {
  const user = await getSession(req);
  if (!user) return sendError(res, 401, "Niet ingelogd");
  if (!body?.id_token) return sendError(res, 400, "Geen id_token ontvangen");

  let payload;
  try { payload = await verifyAppleIdToken(body.id_token); }
  catch (err) { return sendError(res, 401, "Apple-token kon niet worden geverifieerd"); }

  const { rows: owner } = await query("SELECT id FROM users WHERE apple_id = $1", [payload.sub]);
  if (owner.length && owner[0].id !== user.id) {
    return sendError(res, 409, "Dit Apple-account is al aan een andere gebruiker gekoppeld.");
  }
  if (user.apple_id && user.apple_id !== payload.sub) {
    return sendError(res, 409, "Er is al een ander Apple-account aan dit profiel gekoppeld.");
  }
  await query("UPDATE users SET apple_id = $1 WHERE id = $2", [payload.sub, user.id]);
  sendJson(res, 200, { ok: true, linked: { google: !!user.google_id, apple: true } });
});

// Wat gaat er weg als ik mijn account verwijder? Zonder dit zou de bevestiging
// moeten zeggen "al je gegevens", en dat is precies het soort zin waar niemand
// iets aan heeft. Nu staan de aantallen er: zoveel eigen reizen, zoveel foto's.
route("GET", "/auth/me/verwijderoverzicht", async (req, res) => {
  // Routes onder /auth/ lopen buiten de sessiecontrole die /api/ wel heeft, dus
  // die halen we hier zelf op — net als GET /auth/me hierboven.
  const gebruiker = await getSession(req);
  if (!gebruiker) return sendError(res, 401, "Niet ingelogd");
  const { rows } = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM trips WHERE user_id = $1) AS eigen_reizen,
       (SELECT COUNT(*)::int FROM photos p JOIN trips t ON t.id = p.trip_id WHERE t.user_id = $1) AS eigen_fotos,
       (SELECT COUNT(*)::int FROM trip_members m JOIN trips t ON t.id = m.trip_id
         WHERE m.user_id = $1 AND t.user_id IS DISTINCT FROM $1) AS gedeelde_reizen,
       (SELECT COUNT(*)::int FROM journal_entries e JOIN trips t ON t.id = e.trip_id
         WHERE e.user_id = $1 AND t.user_id IS DISTINCT FROM $1) AS verhalen_elders`,
    [gebruiker.id]
  );
  sendJson(res, 200, {
    eigenReizen: rows[0].eigen_reizen,
    eigenFotos: rows[0].eigen_fotos,
    gedeeldeReizen: rows[0].gedeelde_reizen,
    verhalenElders: rows[0].verhalen_elders,
  });
});

// Je eigen account opheffen. Apple eist dit voor elke app waarin je een account
// kunt aanmaken (richtlijn 5.1.1(v)), en de AVG vraagt hetzelfde — maar het is
// ook gewoon fatsoenlijk dat je eruit kunt zonder een beheerder te moeten
// mailen.
//
// Wat er gebeurt, en waarom:
//
// - Reizen die van jou zijn gaan écht weg, met alles eraan: dagen,
//   activiteiten, foto's, verhalen, fotoboeken. De foreign keys staan op
//   cascade vanaf trips, dus één DELETE volstaat. Dit moet expliciet, want de
//   verwijzing van trips naar users staat op SET NULL: zonder deze regel
//   bleven je reizen als eigenaarloze wezen in de database achter.
//
// - Reizen van iemand anders waar je in meekeek raak je alleen kwijt als
//   deelnemer. Die zijn niet van jou om weg te gooien.
//
// - Wat je in andermans dagboek schreef blijft staan, maar zonder je naam
//   eronder (user_id gaat op NULL, zoals het schema al deed). Iemands
//   vakantieherinneringen uit zijn dagboek trekken omdat jij vertrekt is een
//   te grote bijwerking; anoniem maken haalt de koppeling met jou weg, en dat
//   is waar het om gaat.
//
// Alles in één transactie: half verwijderd is erger dan niet verwijderd.
route("DELETE", "/auth/me", async (req, res) => {
  const gebruiker = await getSession(req);
  if (!gebruiker) return sendError(res, 401, "Niet ingelogd");
  const userId = gebruiker.id;
  await transaction(async (client) => {
    await client.query("DELETE FROM trips WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM users WHERE id = $1", [userId]);
  });
  res.setHeader("Set-Cookie", "session=; HttpOnly; Path=/; Max-Age=0");
  sendJson(res, 200, { ok: true });
});

route("POST", "/auth/logout", async (req, res) => {
  const { session } = parseCookies(req);
  if (session) await query("DELETE FROM sessions WHERE token = $1", [session]);
  res.setHeader("Set-Cookie", "session=; HttpOnly; Path=/; Max-Age=0");
  sendJson(res, 200, { ok: true });
});

route("GET", "/auth/google", async (req, res) => {
  // CSRF-bescherming voor de inlogflow: een willekeurige state gaat mee naar
  // Google én in een kortlevende cookie. De callback vergelijkt de twee, zodat
  // een aanvaller een slachtoffer niet met een gestuurde callback-URL in het
  // account van de aanvaller kan laten inloggen. SameSite=Lax volstaat: Google
  // keert terug via een top-level GET, waarbij een Lax-cookie meegestuurd wordt.
  const state = crypto.randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${appUrl(req)}/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
  });
  res.setHeader("Set-Cookie", `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`);
  res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  res.end();
});

route("GET", "/auth/google/callback", async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const code = url.searchParams.get("code");
  if (!code) { res.writeHead(302, { Location: "/login?error=1" }); res.end(); return; }
  // State moet overeenkomen met de cookie die /auth/google zette — anders is deze
  // callback niet door deze browser gestart (login-CSRF) en weigeren we hem.
  const { oauth_state } = parseCookies(req);
  const returnedState = url.searchParams.get("state");
  if (!oauth_state || !returnedState || oauth_state !== returnedState) {
    res.setHeader("Set-Cookie", "oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
    res.writeHead(302, { Location: "/login?error=state" }); res.end(); return;
  }

  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, grant_type: "authorization_code",
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${appUrl(req)}/auth/google/callback`,
    }),
  });
  const tokenData = await tokenResp.json();
  if (!tokenData.access_token) { res.writeHead(302, { Location: "/login?error=1" }); res.end(); return; }

  const userResp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const u = await userResp.json();
  if (!u.sub) { res.writeHead(302, { Location: "/login?error=1" }); res.end(); return; }

  const user = await findOrCreateUser({
    google_id: u.sub,
    email: u.email,
    name: u.name,
    given_name: u.given_name,
    family_name: u.family_name,
    avatar: u.picture,
    locale: u.locale,
    email_verified: u.email_verified,
  });
  await handlePostLogin(req, res, user);
});

route("GET", "/auth/apple/config-check", async (req, res) => {
  // Diagnostic page: admin-only. It discloses the Service ID and reflects the
  // Host header into HTML, neither of which belongs on a public endpoint.
  const user = await getSession(req);
  if (!user?.is_admin) { res.writeHead(404); res.end("Not found"); return; }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const redirectUri = esc(`${appUrl(req)}/auth/apple/callback`);
  const clientId = esc(process.env.APPLE_CLIENT_ID || "(niet ingesteld)");
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!DOCTYPE html><html><body style="font-family:monospace;padding:24px;max-width:600px">
    <h2>Apple Sign In configuratie</h2>
    <p><b>APPLE_CLIENT_ID:</b> ${clientId}</p>
    <p><b>redirect_uri die naar Apple wordt gestuurd:</b><br><code style="background:#f0f0f0;padding:4px 8px;border-radius:4px;word-break:break-all">${redirectUri}</code></p>
    <hr>
    <p>Controleer in <a href="https://developer.apple.com/account/resources/identifiers/list/serviceId">Apple Developer Console</a> of:</p>
    <ul>
      <li>Er een <b>Service ID</b> bestaat met identifier <b>${clientId}</b></li>
      <li>De Return URL exact is: <b>${redirectUri}</b></li>
    </ul>
  </body></html>`);
});

route("GET", "/auth/apple", async (req, res) => {
  if (!process.env.APPLE_CLIENT_ID) {
    console.error("Apple Sign In: APPLE_CLIENT_ID is not set");
    res.writeHead(302, { Location: "/login?error=apple-config" });
    res.end();
    return;
  }
  const state = crypto.randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: process.env.APPLE_CLIENT_ID,
    redirect_uri: `${appUrl(req)}/auth/apple/callback`,
    response_type: "code id_token",
    scope: "name email",
    response_mode: "form_post",
    state,
  });
  // SameSite=None, niet Lax: Apple keert terug via een cross-site POST
  // (response_mode=form_post), en een Lax-cookie zou daarbij niet meegestuurd
  // worden — de statecontrole in de callback zou dan altijd falen. Het is enkel
  // een korte, willekeurige nonce (geen sessie), dus None is hier veilig.
  res.setHeader("Set-Cookie", `oauth_state=${state}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=600`);
  console.log("Apple Sign In: redirecting to Apple with redirect_uri:", `${appUrl(req)}/auth/apple/callback`);
  res.writeHead(302, { Location: `https://appleid.apple.com/auth/authorize?${params}` });
  res.end();
});

route("GET", "/auth/apple/client-id", async (req, res) => {
  sendJson(res, 200, { clientId: process.env.APPLE_CLIENT_ID || null });
});

// Mapbox-token voor de kaart. De naam van de omgevingsvariabele kan per
// installatie verschillen, dus we accepteren de gangbare varianten.
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || process.env.MAPBOX_ACCESS_TOKEN
  || process.env.MAPBOX_PUBLIC_TOKEN || process.env.MAPBOX_API_KEY || "";

// Mapbox kent twee soorten tokens. Een publiek token (pk.) hoort in de browser
// thuis en wordt beschermd met een URL-restrictie. Een geheim token (sk.) mag
// daar nooit komen: dat geeft toegang tot het account zelf. Liever een kaart
// die terugvalt op de gratis tegels dan een gelekt token.
const MAPBOX_TOKEN_IS_SECRET = MAPBOX_TOKEN.startsWith("sk.");
if (!MAPBOX_TOKEN) {
  console.log("Mapbox niet ingesteld — de kaart gebruikt de standaard tegels.");
} else if (MAPBOX_TOKEN_IS_SECRET) {
  console.warn("MAPBOX-token is een geheim token (sk.). Dat wordt niet aan de browser gegeven; gebruik een publiek token (pk.).");
} else {
  console.log("Mapbox-token gevonden, de kaart gebruikt Mapbox-tegels.");
}

// GET-routes onder /api/ die zonder sessie bereikbaar zijn. Bewust een korte,
// expliciete lijst — alles wat er niet in staat blijft achter de inlogplicht.
const PUBLIC_API_GETS = new Set(["/api/config/map"]);

route("GET", "/api/config/map", async (req, res) => {
  sendJson(res, 200, {
    mapboxToken: MAPBOX_TOKEN && !MAPBOX_TOKEN_IS_SECRET ? MAPBOX_TOKEN : null,
    secretTokenRejected: MAPBOX_TOKEN_IS_SECRET,
  });
});

route("POST", "/auth/apple/js-callback", async (req, res, params, body) => {
  const { id_token, name } = body;
  if (!id_token) return sendJson(res, 400, { error: "Geen id_token ontvangen" });

  let payload;
  try {
    payload = await verifyAppleIdToken(id_token);
  } catch (err) {
    console.error("Apple JS callback: token verification failed:", err.message);
    const code = err.message.includes("expired") ? "expired" : err.message.includes("JWK") ? "jwk" : "invalid";
    return sendJson(res, 401, { error: `apple-verify-${code}` });
  }

  const given_name = name?.firstName || null;
  const family_name = name?.lastName || null;
  const fullName = [given_name, family_name].filter(Boolean).join(" ") || null;

  try {
    const user = await findOrCreateUser({
      apple_id: payload.sub,
      email: payload.email || null,
      email_verified: payload.email_verified === "true" || payload.email_verified === true,
      name: fullName,
      given_name,
      family_name,
    });
    const sessionToken = await createSession(user.id);
    setSessionCookie(res, sessionToken);
    sendJson(res, 200, { ok: true });
  } catch (err) {
    console.error("Apple JS callback: findOrCreateUser failed:", err.message);
    sendJson(res, 500, { error: "apple-db" });
  }
});

route("POST", "/auth/apple/callback", async (req, res) => {
  const body = await readFormBody(req);
  console.log("Apple callback received. Keys in body:", [...body.keys()].join(", "));
  const appleError = body.get("error");
  if (appleError) {
    console.error("Apple callback error from Apple:", appleError);
    res.writeHead(302, { Location: `/login?error=apple-${appleError}` });
    res.end();
    return;
  }
  // State moet overeenkomen met de cookie die /auth/apple zette (login-CSRF).
  // Apple stuurt de state terug in de form_post-body.
  const returnedState = body.get("state");
  const { oauth_state } = parseCookies(req);
  if (!oauth_state || !returnedState || oauth_state !== returnedState) {
    console.error("Apple callback: state komt niet overeen");
    res.writeHead(302, { Location: "/login?error=apple-state" });
    res.end();
    return;
  }
  const idToken = body.get("id_token");
  if (!idToken) {
    console.error("Apple callback: no id_token in body");
    res.writeHead(302, { Location: "/login?error=apple-no-token" });
    res.end();
    return;
  }

  let payload;
  try {
    payload = await verifyAppleIdToken(idToken);
  } catch (err) {
    console.error("Apple id_token verification failed:", err.message);
    const code = err.message.includes("expired") ? "expired" : err.message.includes("JWK") ? "jwk" : "invalid";
    res.writeHead(302, { Location: `/login?error=apple-verify-${code}` });
    res.end();
    return;
  }

  let given_name = null, family_name = null;
  try {
    const u = JSON.parse(body.get("user") || "{}");
    given_name = u.name?.firstName || null;
    family_name = u.name?.lastName || null;
  } catch {}
  const name = [given_name, family_name].filter(Boolean).join(" ") || null;

  try {
    const user = await findOrCreateUser({
      apple_id: payload.sub,
      email: payload.email || null,
      email_verified: payload.email_verified === "true" || payload.email_verified === true,
      name,
      given_name,
      family_name,
    });
    await handlePostLogin(req, res, user);
  } catch (err) {
    console.error("Apple callback: findOrCreateUser/handlePostLogin failed:", err.message);
    res.writeHead(302, { Location: "/login?error=apple-db" });
    res.end();
  }
});

// ---------- AI destination tips ----------
route("GET", "/api/trips/:id/tips", async (req, res, params) => {
  bewaakAiGebruik(req);
  const tripResult = await query("SELECT destination, start_date, end_date FROM trips WHERE id = $1 AND (user_id = $2 OR EXISTS (SELECT 1 FROM trip_members WHERE trip_id = $1 AND user_id = $2))", [params.id, req.user.id]);
  if (!tripResult.rows.length) return sendError(res, 404, "Reis niet gevonden");
  const urlObj = new URL(req.url, "http://localhost");
  const destination = urlObj.searchParams.get("location") || tripResult.rows[0]?.destination;
  if (!destination) return sendError(res, 400, "Geen bestemming opgegeven");
  if (!process.env.ANTHROPIC_API_KEY) return sendError(res, 500, "ANTHROPIC_API_KEY niet geconfigureerd");

  const { start_date, end_date } = tripResult.rows[0];
  const MONTHS_NL = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
  let periodHint = "";
  let dateRange = "";
  if (start_date) {
    const s = new Date(start_date);
    const e = end_date ? new Date(end_date) : s;
    const startMonth = MONTHS_NL[s.getUTCMonth()];
    const endMonth = MONTHS_NL[e.getUTCMonth()];
    periodHint = startMonth === endMonth
      ? ` De reis is in ${startMonth}.`
      : ` De reis is van ${startMonth} tot ${endMonth}.`;
    dateRange = ` van ${s.getUTCDate()} ${startMonth} tot ${e.getUTCDate()} ${endMonth} ${e.getUTCFullYear()}`;
  }

  const category = urlObj.searchParams.get("category");

  if (category) {
    const isEvents = category === "Evenementen & agenda";
    const itemCount = isEvents ? 3 : 2;
    const itemTemplate = `{"text":"tip","url":"https://... of null"}`;
    const prompt = isEvents
      ? `Geef ${itemCount} specifieke festivals, evenementen of markten in de buurt van "${destination}"${dateRange ? ` die plaatsvinden${dateRange}` : periodHint}. Als het een hotelnaam is, gebruik de stad/regio. Voeg per item een relevante website-URL toe (officiële site, ticketsite of informatiesite). Return ONLY valid JSON, no markdown: {"items":[${itemTemplate},${itemTemplate},${itemTemplate}]}`
      : `Geef ${itemCount} praktische reisTips over "${category.toLowerCase()}" voor een bezoeker van "${destination}" in het Nederlands.${periodHint} Als het een hotelnaam is, geef tips voor die stad/regio. Voeg per tip een relevante website-URL toe (app-store, boekingssite, informatiesite, etc.) indien beschikbaar, anders null. Return ONLY valid JSON, no markdown: {"items":[${itemTemplate},${itemTemplate}]}`;

    const msg = await aiVerzoek({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    }, { userId: req.user?.id, tripId: params.id, doel: "tips" });
    const raw = msg.content[0].text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    try {
      const parsed = JSON.parse(raw);
      sendJson(res, 200, { items: parsed.items || [] });
    } catch { sendError(res, 500, "Kon tips niet verwerken"); }
    return;
  }

  // No category — return only did_you_know (shown immediately on mount)
  const msg = await aiVerzoek({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 150,
    messages: [{ role: "user", content: `Geef één verrassend en weinig bekend feitje over "${destination}" in het Nederlands. Return ONLY valid JSON, no markdown: {"did_you_know":"feitje"}` }],
  }, { userId: req.user?.id, tripId: params.id, doel: "wist-je-datje" });
  const raw = msg.content[0].text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  try { sendJson(res, 200, JSON.parse(raw)); }
  catch { sendError(res, 500, "Kon tips niet verwerken"); }
});

// ---------- Top 3 hoogtepunten voor één dag ----------
// De tips hierboven gaan over de reis als geheel en leveren tekst om te lezen.
// Dit levert dingen om te dóen, op één dag, in een vorm die zo de planning in
// kan: titel, categorie, adres en een tijd.
//
// De plaats komt uit het verblijf van die nacht en niet uit de bestemming van de
// reis: bij "Japan" heb je aan hoogtepunten niets, bij het hotel in Kyoto wel.
// Wat er al gepland staat gaat mee als "niet herhalen" — anders krijg je op een
// dag met het Fushimi Inari-heiligdom prompt datzelfde heiligdom voorgesteld.
route("POST", "/api/trips/:id/highlights", async (req, res, params, body) => {
  bewaakAiGebruik(req);
  if (!process.env.ANTHROPIC_API_KEY) return sendError(res, 500, "ANTHROPIC_API_KEY niet geconfigureerd");
  const dagId = body?.day_id;
  if (!/^\d+$/.test(String(dagId ?? ""))) return sendError(res, 400, "Geen geldige dag opgegeven");

  const { rows: dagen } = await query(
    `SELECT d.id, d.date, d.title, t.destination
       FROM days d JOIN trips t ON t.id = d.trip_id
      WHERE d.id = $1 AND d.trip_id = $2`,
    [dagId, params.id]
  );
  if (!dagen.length) return sendError(res, 404, "Dag niet gevonden");
  const dag = dagen[0];

  const { rows: verblijven } = await query(
    `SELECT name, address FROM accommodations
      WHERE trip_id = $1 AND check_in <= $2 AND (check_out IS NULL OR check_out >= $2)
      ORDER BY check_in DESC LIMIT 1`,
    [params.id, dag.date]
  );
  const { rows: bestaand } = await query("SELECT title, location FROM activities WHERE day_id = $1", [dagId]);

  const verblijf = verblijven[0];
  const plaats = verblijf?.address || verblijf?.name || dag.destination;
  if (!plaats) return sendError(res, 400, "Deze dag heeft geen verblijf en de reis geen bestemming, dus er is geen plek om vanuit te zoeken");

  const alGepland = bestaand.map((a) => a.title).filter(Boolean);
  const datum = dag.date ? new Date(dag.date).toISOString().slice(0, 10) : null;
  const CATEGORIEEN = "Bezienswaardigheid, Restaurant, Museum, Natuur, Sport, Shopping, Anders";
  const prompt = [
    `Noem de drie beste dingen om te doen op één dag in of vlak bij "${plaats}".`,
    datum ? `Het gaat om ${datum}; houd rekening met het seizoen en met openingsdagen.` : "",
    alGepland.length ? `Deze staan al gepland en mag je NIET herhalen of variëren: ${alGepland.join("; ")}.` : "",
    `Kies dingen die op één dag te combineren zijn en niet ver uit elkaar liggen.`,
    `Schrijf in het Nederlands. Gebruik voor "category" precies één van: ${CATEGORIEEN}.`,
    `"location" moet een adres of plaatsaanduiding zijn waarop een kaartendienst de plek kan vinden — dus straat en stad, geen losse naam.`,
    `"time" is een suggestie in HH:MM, oplopend over de dag. "notes" is één korte zin waarom het de moeite waard is.`,
    `Return ONLY valid JSON, no markdown: {"items":[{"title":"","category":"","location":"","time":"","notes":""}]}`,
  ].filter(Boolean).join(" ");

  const msg = await aiVerzoek({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 900,
    messages: [{ role: "user", content: prompt }],
  }, { userId: req.user?.id, tripId: params.id, doel: "hoogtepunten" });
  const raw = msg.content[0].text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { return sendError(res, 502, "Kon de hoogtepunten niet verwerken"); }

  // Het model levert vrije tekst; alles wat de planning in gaat wordt hier op
  // vorm en lengte gesnoeid, en een categorie buiten de lijst wordt "Anders" —
  // anders staat er straks een activiteit met een icoon dat niet bestaat.
  const TOEGESTAAN = new Set(CATEGORIEEN.split(", "));
  const kort = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const items = (Array.isArray(parsed.items) ? parsed.items : [])
    .map((it) => ({
      title: kort(it?.title, 120),
      category: TOEGESTAAN.has(kort(it?.category, 40)) ? kort(it.category, 40) : "Anders",
      location: kort(it?.location, 300),
      time: /^\d{1,2}:\d{2}$/.test(kort(it?.time, 5)) ? kort(it.time, 5) : "",
      notes: kort(it?.notes, 400),
    }))
    .filter((it) => it.title)
    .slice(0, 3);

  sendJson(res, 200, { plaats: verblijf?.name || plaats, items });
}, { tripScope: "param" });

// ---------- Import (email parsing via Claude) ----------
route("POST", "/api/trips/:id/import", async (req, res, params, body) => {
  bewaakAiGebruik(req);
  const { text, image } = body;
  if (!text?.trim() && !image) return sendError(res, 400, "Geen tekst of afbeelding opgegeven");
  if (!process.env.ANTHROPIC_API_KEY) return sendError(res, 500, "ANTHROPIC_API_KEY niet geconfigureerd");

  const tripRow2 = await query("SELECT start_date, end_date FROM trips WHERE id = $1", [params.id]);
  const toIso = (d) => d ? new Date(d).toISOString().slice(0, 10) : null;
  const tripStartStr = toIso(tripRow2.rows[0]?.start_date);
  const tripEndStr = toIso(tripRow2.rows[0]?.end_date);
  const tripYear = tripStartStr ? tripStartStr.slice(0, 4) : null;
  const tripYearHint = tripYear ? `\nIMPORTANT: This trip takes place from ${tripStartStr} to ${tripEndStr} (year: ${tripYear}). Any date without a year MUST use year ${tripYear}. Never use any other year.` : "";

  const prompt = `Parse this travel confirmation and extract structured data. Return ONLY valid JSON with this exact structure, no markdown, no explanation:
{
  "transports": [{"type": "Vliegtuig|Trein|Bus|Huurauto|Taxi|Boot|Anders", "from_location": "", "to_location": "", "departure_time": "ISO 8601 datetime or null", "arrival_time": "ISO 8601 datetime or null", "booking_ref": "", "cost": null, "notes": ""}],
  "accommodations": [{"name": "", "check_in": "YYYY-MM-DD or null", "check_out": "YYYY-MM-DD or null", "address": "", "booking_ref": "", "cost": null, "notes": ""}],
  "activities": [{"date": "YYYY-MM-DD or null", "time": "HH:MM or null", "title": "", "location": "", "category": "Bezienswaardigheid|Restaurant|Museum|Natuur|Sport|Shopping|Anders", "cost": null, "notes": ""}]
}
Only include items actually present. Use null for missing values. Return empty arrays if nothing found. Activities are things like museum tickets, restaurant reservations, tours, events, excursions.${tripYearHint}`;

  const content = image
    ? [{ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } }, { type: "text", text: prompt }]
    : [{ type: "text", text: `${prompt}\n\nEmail text:\n${text}` }];

  const message = await aiVerzoek({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{ role: "user", content }],
  }, { userId: req.user?.id, tripId: params.id, doel: "boeking importeren" });

  const raw = message.content[0].text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  try {
    const parsed = JSON.parse(raw);

    // Force correct year on all dates if trip year is known
    const forceYear = (dateStr) => {
      if (!dateStr || !tripYear) return dateStr;
      return tripYear + "-" + String(dateStr).slice(5, 10);
    };
    const forceDtYear = (dtStr) => {
      if (!dtStr || !tripYear) return dtStr;
      return tripYear + "-" + String(dtStr).slice(5);
    };

    const transports = (parsed.transports || []).map((t) => ({
      ...t,
      departure_time: t.departure_time ? forceDtYear(t.departure_time) : null,
      arrival_time: t.arrival_time ? forceDtYear(t.arrival_time) : null,
    }));
    const accommodations = (parsed.accommodations || []).map((a) => ({
      ...a,
      check_in: a.check_in ? forceYear(a.check_in) : null,
      check_out: a.check_out ? forceYear(a.check_out) : null,
    }));
    const activities = (parsed.activities || []).map((a) => ({
      ...a,
      date: a.date ? forceYear(a.date) : null,
    }));

    sendJson(res, 200, { transports, accommodations, activities });
  } catch {
    sendError(res, 500, "Kon gegevens niet verwerken uit de bevestiging");
  }
}, { tripScope: "param" });

// ---------- Plaatsnaam uit verblijfsinfo (Claude) ----------
// Nominatim's addressdetails geeft niet altijd het juiste niveau terug (soms
// een wijk, soms een regio) en niet elke plek heeft een vertaalde naam. Laat
// Claude de plaatsnaam distilleren uit de ruwe naam/adrestekst van een
// verblijf — geen tripScope nodig, dit hangt niet van een specifieke reis af.
route("POST", "/api/geocode/place-name", async (req, res, params, body) => {
  bewaakAiGebruik(req);
  const { query: q } = body || {};
  if (!q?.trim()) return sendError(res, 400, "Geen zoekterm opgegeven");
  if (!process.env.ANTHROPIC_API_KEY) return sendError(res, 500, "ANTHROPIC_API_KEY niet geconfigureerd");

  const msg = await aiVerzoek({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 20,
    messages: [{ role: "user", content: `Wat is de plaatsnaam (stad/dorp) waar dit verblijf zich bevindt: "${q}"? Antwoord met alleen de gangbare Nederlandse of internationaal gebruikelijke naam van die plaats, zonder aanhalingstekens, uitleg of extra tekst.` }],
  }, { userId: req.user?.id, doel: "plaatsnaam opzoeken" });
  const city = msg.content[0].text.trim().replace(/^["']|["']$/g, "");
  sendJson(res, 200, { city: city || null });
});

// ---------- Fotoquiz ----------
// Een Kahoot-achtige quizsessie: één set vragen, gedeeld door alle deelnemers,
// waarbij de voortgang puur op verstreken tijd loopt (zie computeQuizPhase) —
// er is geen host die per vraag op "volgende" moet klikken en niets dat continu
// gepolld hoeft te worden op de server naast wat de deelnemers toch al doen.
// Meedoen kan alleen via het session-specifieke join-token (de QR-code), nooit
// via het gewone alleen-lezen-uitnodigingslink van de reis.
const QUIZ_QUESTION_SECONDS_DEFAULT = 20;
const QUIZ_QUESTION_SECONDS_MIN = 5;
const QUIZ_QUESTION_SECONDS_MAX = 60;
const QUIZ_INTERVAL_SECONDS = 6;
const QUIZ_QUESTION_COUNT_DEFAULT = 15;
const QUIZ_QUESTION_COUNT_MIN = 2;
const QUIZ_QUESTION_COUNT_MAX = 15;
// Moet gelijk zijn aan OPENING_SCREEN_MS/1000 in app.js — de client toont dat
// openingsscherm los van de kloktijd, dus zonder deze vertraging zou vraag 1
// al voor een flink deel verstreken zijn tegen de tijd dat spelers hem te
// zien krijgen.
const QUIZ_OPENING_SCREEN_SECONDS = 6.5;
// Korte "dit was het goede antwoord"-pauze ná iedere vraag, ook als het geen
// tussenstand-ronde is (die krijgt de langere QUIZ_INTERVAL_SECONDS).
// Vier tellen tussen twee vragen. Was drie, maar daar staat sinds kort meer:
// het goede antwoord én de namen van wie het goed had. Drie seconden was net
// te kort om dat rijtje namen te lezen en er nog iets van te vinden — en dat
// laatste is precies waar je het voor doet.
const QUIZ_REVEAL_SECONDS = 4;
// Tien tellen tussen "start" en de eerste vraag. Zonder die pauze staat de
// eerste vraag er al terwijl de helft van de tafel nog naar zijn telefoon zoekt
// — en die eerste vraag telt net zo zwaar als de rest. Nu is er tijd om erbij
// te gaan zitten, en bouwt het aftellen meteen wat spanning op.
const QUIZ_INTRO_SECONDS = 10;

// `.sort(() => Math.random() - 0.5)` is een bekende valse vriend: geen echte
// shuffle, en met kleine arrays (zoals 4 meerkeuze-opties) systematisch
// bevooroordeeld richting de oorspronkelijke volgorde — precies waarom het
// juiste antwoord hier te vaak vooraan bleef staan. Fisher-Yates is wel echt
// uniform verdeeld.
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Zelfde aanpak als dateIsoInTimezone/todayIso in app.js: geeft YYYY-MM-DD
// terug in de tijdzone van de reis. Gebruikt om toekomstige activiteiten
// (die nog moeten gebeuren) buiten de quiz te houden — anders zou de quiz
// zelf een verrassing kunnen verklappen.
function quizTodayIso(timezone) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// Foto's bij een activiteit, vervoer of verblijf leveren een zinnige vraag
// op — een foto die alleen aan de dag zelf hangt heeft geen naam om te raden.
// Foute antwoorden komen zoveel mogelijk uit de reis zelf (andere echte
// activiteiten/vervoer/verblijf) — pas als een reis daar te weinig van heeft,
// verzint Claude het ontbrekende aantal erbij, in dezelfde stijl als de
// bestemming. Activiteiten die nog moeten gebeuren (toekomstige dagen) tellen
// niet mee — nog niet ervaren, en mogelijk een verrassing.
// Van elke 4 vragen is er 1 een tekstvraag zonder foto, gebaseerd op de
// planning/het dagboek/reacties in plaats van een fotopool.
const TEXT_QUESTION_EVERY = 4;
// Vraag 5 (0-indexed dus index 4) telt dubbele punten.
const QUIZ_DOUBLER_INDEX = 4;

async function generateQuizQuestions(tripId, count, userId) {
  const textCount = Math.floor(count / TEXT_QUESTION_EVERY);
  const photoCount = count - textCount;

  // Niet alleen foto's bij een activiteit — ook foto's die aan een vervoer
  // of verblijf hangen horen ergens bij en mogen dus ook in de quiz
  // voorkomen. Foto's die alleen aan een dag hangen (nergens specifiek aan
  // gekoppeld) blijven terecht buiten beeld: daar is geen zinnig "waar
  // hoort deze foto bij"-antwoord voor te bedenken.
  const [{ rows: photos }, { rows: activities }, { rows: days }, { rows: transports }, { rows: accommodations }, { rows: tripRows }] = await Promise.all([
    query(
      "SELECT id, activity_id, transport_id, accommodation_id FROM photos WHERE trip_id = $1 AND (activity_id IS NOT NULL OR transport_id IS NOT NULL OR accommodation_id IS NOT NULL)",
      [tripId]
    ),
    query("SELECT id, day_id, title FROM activities WHERE trip_id = $1", [tripId]),
    query("SELECT id, date FROM days WHERE trip_id = $1", [tripId]),
    query("SELECT id, type, from_location, to_location FROM transports WHERE trip_id = $1", [tripId]),
    query("SELECT id, name FROM accommodations WHERE trip_id = $1", [tripId]),
    query("SELECT name, destination, timezone FROM trips WHERE id = $1", [tripId]),
  ]);

  const dayDateById = new Map(days.map((d) => [d.id, new Date(d.date).toISOString().slice(0, 10)]));
  const todayStr = quizTodayIso(tripRows[0]?.timezone);
  const pastActivities = activities.filter((a) => {
    const dayDate = dayDateById.get(a.day_id);
    return !dayDate || dayDate <= todayStr;
  });

  const transportLabel = (t) => (t.from_location && t.to_location ? `${t.type}: ${t.from_location} → ${t.to_location}` : t.type);
  const actMap = new Map(pastActivities.map((a) => [a.id, a.title]));
  const transMap = new Map(transports.map((t) => [t.id, transportLabel(t)]));
  const accMap = new Map(accommodations.map((a) => [a.id, a.name]));
  const allTitles = [...new Set([
    ...pastActivities.map((a) => a.title),
    ...transports.map(transportLabel),
    ...accommodations.map((a) => a.name),
  ].filter(Boolean))];

  const candidates = photos
    .map((p) => {
      const answer = p.activity_id != null ? actMap.get(p.activity_id)
        : p.transport_id != null ? transMap.get(p.transport_id)
        : p.accommodation_id != null ? accMap.get(p.accommodation_id)
        : null;
      if (!answer) return null;
      return { photoId: p.id, answer };
    })
    .filter(Boolean);

  if (!candidates.length) return [];

  // Eerst zoveel mogelijk unieke antwoorden (anders is de quiz al opgelost
  // zodra je 'm de tweede keer ziet), pas daarna dubbele antwoorden toestaan
  // om alsnog aan het gevraagde aantal vragen te komen.
  const shuffled = shuffle(candidates);
  const picked = [];
  const seenAnswers = new Set();
  for (const c of shuffled) {
    if (picked.length >= photoCount) break;
    if (seenAnswers.has(c.answer)) continue;
    seenAnswers.add(c.answer);
    picked.push(c);
  }
  for (const c of shuffled) {
    if (picked.length >= photoCount) break;
    if (!picked.includes(c)) picked.push(c);
  }

  const withRealDistractors = picked.map((p) => {
    const pool = shuffle(allTitles.filter((t) => t !== p.answer));
    return { ...p, real: pool.slice(0, 3) };
  });

  const needsFiller = withRealDistractors.filter((p) => p.real.length < 3);
  const fillerByPhoto = new Map();
  if (needsFiller.length) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY niet geconfigureerd");
    const destination = tripRows[0]?.destination || tripRows[0]?.name || "deze reis";
    const prompt = `Voor een fotoquiz over een reis naar "${destination}" heb ik per juist antwoord 3 verzonnen maar geloofwaardige foute meerkeuze-opties nodig — andere activiteiten/locaties, in het Nederlands en in dezelfde stijl (bezienswaardigheden/plaatsnamen passend bij deze bestemming). Ze mogen niet gelijk zijn aan het juiste antwoord.
Juiste antwoorden, in deze volgorde:
${needsFiller.map((p, i) => `${i + 1}. ${p.answer}`).join("\n")}
Return ONLY valid JSON, no markdown: {"items":[{"distractors":["...","...","..."]}, ...]} — exact ${needsFiller.length} items, in dezelfde volgorde.`;

    const msg = await aiVerzoek({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    }, { userId, tripId, doel: "quiz: foutantwoorden" });
    const raw = msg.content[0].text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw new Error("Kon quizvragen niet genereren"); }
    needsFiller.forEach((p, i) => {
      const invented = (parsed.items?.[i]?.distractors || []).filter((d) => d && d !== p.answer && !p.real.includes(d));
      fillerByPhoto.set(p.photoId, invented);
    });
  }

  // Om en om wheel/blur i.p.v. willekeurig — vastgelegd bij het aanmaken van
  // de sessie, niet toevallig per pollende deelnemer, anders zou de ene
  // speler een rad zien en de andere een blur-foto voor dezelfde vraag.
  const MODE_ORDER = ["wheel", "blur"];
  const photoQuestions = withRealDistractors.map((p, i) => {
    const missing = 3 - p.real.length;
    const invented = missing > 0 ? (fillerByPhoto.get(p.photoId) || []).slice(0, missing) : [];
    const distractors = [...p.real, ...invented];
    while (distractors.length < 3) distractors.push(`Optie ${distractors.length + 1}`);
    const options = shuffle([p.answer, ...distractors]);
    return {
      type: "photo",
      photo_id: p.photoId,
      url: `/api/photos/${p.photoId}/raw`,
      thumb_url: `/api/photos/${p.photoId}/thumb`,
      options,
      correct: p.answer,
      mode: MODE_ORDER[i % MODE_ORDER.length],
    };
  });

  const textQuestions = textCount > 0 ? await generateQuizTextQuestions(tripId, textCount, userId) : [];

  // Elke 4e vraag (positie 4, 8, 12, ...) is een tekstvraag, de rest blijft
  // fotovragen in hun eigen volgorde.
  const merged = [];
  let photoIdx = 0, textIdx = 0;
  for (let i = 0; i < count; i++) {
    if ((i + 1) % TEXT_QUESTION_EVERY === 0 && textIdx < textQuestions.length) merged.push(textQuestions[textIdx++]);
    else if (photoIdx < photoQuestions.length) merged.push(photoQuestions[photoIdx++]);
  }
  while (photoIdx < photoQuestions.length) merged.push(photoQuestions[photoIdx++]);
  while (textIdx < textQuestions.length) merged.push(textQuestions[textIdx++]);

  // Vraag 5 is een "verdubbelaar" (dubbele punten) — alleen relevant als de
  // quiz er daadwerkelijk 5 heeft. De client toont dit expliciet aan de hand
  // van dit veld, en de antwoord-route verdubbelt de score ernaar.
  if (merged[QUIZ_DOUBLER_INDEX]) merged[QUIZ_DOUBLER_INDEX] = { ...merged[QUIZ_DOUBLER_INDEX], doubler: true };

  return merged;
}

// Tekstvragen zonder foto, gebaseerd op de dagplanning, het dagboek en
// reacties — Claude bedenkt zowel de vraag, het juiste antwoord (rechtstreeks
// afgeleid uit de meegegeven informatie) als 3 verzonnen foute opties.
// Haversine — de enige manier om een écht juiste afstand tussen twee plekken
// te garanderen: Claude zelf laten schatten zou verzonnen kilometers
// opleveren die niemand kan checken. Alleen activiteiten met minstens één
// foto met GPS-locatie (uit EXIF) doen mee, want dat is de enige coördinaat
// die deze app al heeft — er wordt niets extra gegeocodeerd.
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function generateQuizTextQuestions(tripId, textCount, userId) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY niet geconfigureerd");

  const [{ rows: tripRows }, { rows: days }, { rows: activities }, { rows: transports }, { rows: accommodations }, { rows: entries }, { rows: comments }, { rows: geoPhotos }] = await Promise.all([
    query("SELECT name, destination, start_date, end_date, timezone FROM trips WHERE id = $1", [tripId]),
    query("SELECT id, date FROM days WHERE trip_id = $1 ORDER BY date", [tripId]),
    query("SELECT id, day_id, title, time, location FROM activities WHERE trip_id = $1 ORDER BY day_id, time", [tripId]),
    query("SELECT from_location, to_location, type FROM transports WHERE trip_id = $1", [tripId]),
    query("SELECT name FROM accommodations WHERE trip_id = $1", [tripId]),
    query("SELECT body FROM journal_entries WHERE trip_id = $1 AND body IS NOT NULL", [tripId]),
    query("SELECT body FROM journal_comments WHERE trip_id = $1 AND body IS NOT NULL", [tripId]),
    query(
      `SELECT p.activity_id, p.latitude, p.longitude, a.title FROM photos p
       JOIN activities a ON a.id = p.activity_id
       WHERE p.trip_id = $1 AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL`,
      [tripId]
    ),
  ]);

  const dayNumberById = new Map(days.map((d, i) => [d.id, i + 1]));
  const dayDateById = new Map(days.map((d) => [d.id, new Date(d.date).toISOString().slice(0, 10)]));
  const trip = tripRows[0] || {};
  const todayStr = quizTodayIso(trip.timezone);
  // Nog niet gebeurde activiteiten (toekomstige dagen) horen niet in de
  // trivia thuis — nog niet ervaren, en mogelijk een verrassing.
  const pastActivities = activities.filter((a) => {
    const dayDate = dayDateById.get(a.day_id);
    return !dayDate || dayDate <= todayStr;
  });
  const pastActivityIds = new Set(pastActivities.map((a) => a.id));
  const lines = [`Reis: ${trip.name || "reis"} naar ${trip.destination || "onbekende bestemming"}`];
  if (trip.start_date) lines.push(`Periode: ${trip.start_date} t/m ${trip.end_date}`);
  for (const a of pastActivities) {
    const dayNum = dayNumberById.get(a.day_id);
    lines.push(`Dag ${dayNum || "?"}${a.time ? " " + a.time : ""}: ${a.title}${a.location ? ` (${a.location})` : ""}`);
  }
  for (const t of transports) {
    if (t.from_location && t.to_location) lines.push(`Vervoer (${t.type}): ${t.from_location} → ${t.to_location}`);
  }
  for (const acc of accommodations) lines.push(`Verblijf: ${acc.name}`);
  for (const e of entries) lines.push(`Dagboek: "${e.body.slice(0, 200)}"`);
  for (const c of comments) lines.push(`Reactie: "${c.body.slice(0, 200)}"`);

  const activityCoords = new Map();
  for (const p of geoPhotos) {
    if (!pastActivityIds.has(p.activity_id)) continue;
    if (!activityCoords.has(p.activity_id)) activityCoords.set(p.activity_id, { title: p.title, lat: Number(p.latitude), lng: Number(p.longitude) });
  }
  const geoEntries = [...activityCoords.values()];
  const distanceLines = [];
  for (let i = 0; i < geoEntries.length; i++) {
    for (let j = i + 1; j < geoEntries.length; j++) {
      const km = haversineKm(geoEntries[i].lat, geoEntries[i].lng, geoEntries[j].lat, geoEntries[j].lng);
      const formatted = km < 1 ? `${Math.round(km * 1000)} m` : `${Math.round(km)} km`;
      distanceLines.push(`Afstand ${geoEntries[i].title} - ${geoEntries[j].title}: ${formatted}`);
    }
  }
  // Niet alle mogelijke paren meegeven bij veel locaties — anders domineren
  // afstanden de hele prompt. Willekeurige selectie, gewoon een handvol.
  lines.push(...shuffle(distanceLines).slice(0, 6));

  // Ruwe cap tegen een onwerkbaar lange prompt bij een uitgebreide reis.
  const context = lines.slice(0, 150).join("\n");

  const prompt = `Hier is de planning, het dagboek, de reacties en (indien aanwezig) een paar echte afstanden tussen locaties van een reis:
${context}

Bedenk ${textCount} verschillende meerkeuzevragen over deze reis, gebaseerd op bovenstaande informatie (data, volgorde van activiteiten, locaties, wie iets schreef, wat er gebeurde) — geen vragen over foto's. Gebruik, als er afstanden hierboven staan, af en toe (niet elke vraag) ook zo'n afstand — bijvoorbeeld welke twee plekken het dichtst bij elkaar lagen, of hoeveel kilometer ergens ongeveer tussen zat. Voor elke vraag: een kort, ondubbelzinnig juist antwoord dat rechtstreeks uit de informatie hierboven volgt, plus 3 geloofwaardige maar foute opties in dezelfde stijl, allemaal kort (max ~6 woorden). In het Nederlands.
Return ONLY valid JSON, no markdown: {"items":[{"question":"...","correct":"...","distractors":["...","...","..."]}, ...]} — exact ${textCount} items.`;

  const msg = await aiVerzoek({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1200,
    messages: [{ role: "user", content: prompt }],
  }, { userId, tripId, doel: "quiz: vragen" });
  const raw = msg.content[0].text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error("Kon quizvragen niet genereren"); }

  return (parsed.items || []).slice(0, textCount).map((item) => {
    const distractors = (item.distractors || []).filter((d) => d && d !== item.correct).slice(0, 3);
    while (distractors.length < 3) distractors.push(`Optie ${distractors.length + 1}`);
    const options = shuffle([item.correct, ...distractors]);
    return { type: "text", question: item.question, options, correct: item.correct };
  });
}

// Vertaalt started_at + de vaste vraag-/tussenstand-duur naar "waar is
// iedereen nu" — puur een functie van de klok, dus elke deelnemer die op
// hetzelfde moment pollt krijgt exact dezelfde vraag te zien zonder dat de
// server een lopende timer hoeft bij te houden.
// Niet na élke vraag een tussenstand — dat onderbrak het tempo te vaak — maar
// pas na elke 3e vraag (dus na vraag 3, 6, 9, ...).
// Om de hoeveel vragen de volle ranglijst verschijnt. Na de andere vragen komt
// alleen de korte "dit was het goede antwoord"-pauze. Met vijftien vragen als
// standaard zou elke derde vraag de ranglijst vijf keer onderbreken; om de vijf
// zijn het er twee, en dat houdt het tempo erin.
const QUIZ_STANDINGS_EVERY = 5;
// De verdubbelaar-vraag krijgt een paar seconden extra bedenktijd bovenop de
// ingestelde tijd per vraag — dubbele punten mogen ook wat meer tijd kosten.
const QUIZ_DOUBLER_BONUS_SECONDS = 5;

function questionDuration(session, index) {
  return session.question_seconds + (session.questions[index]?.doubler ? QUIZ_DOUBLER_BONUS_SECONDS : 0);
}

// Cumulatief start/eind-tijdstip (in seconden sinds started_at) van één
// specifieke vraag — gebruikt door de antwoord-route om een net-op-tijd
// verstuurd antwoord nog aan de juiste vraag te kunnen toewijzen, ook als
// de vraag zelf inmiddels (net) gesloten is.
function questionWindow(session, index) {
  // De hele quiz schuift op met de introductie: vraag één begint pas als het
  // aftellen voorbij is.
  let acc = QUIZ_INTRO_SECONDS;
  for (let i = 0; i < index; i++) {
    const showsStandings = (i + 1) % QUIZ_STANDINGS_EVERY === 0;
    acc += questionDuration(session, i) + (showsStandings ? session.interval_seconds : QUIZ_REVEAL_SECONDS);
  }
  return { start: acc, end: acc + questionDuration(session, index) };
}

function computeQuizPhase(session) {
  const total = session.questions.length;
  // De gastheer kan de quiz voortijdig stoppen (zie de /stop-route) — dat zet
  // status expliciet op 'done', wat hier voorrang krijgt op de tijd-afgeleide
  // berekening hieronder.
  if (session.status === "done") return { phase: "done", index: total - 1, remainingSeconds: null };
  if (session.status === "lobby" || !session.started_at) {
    return { phase: "lobby", index: 0, remainingSeconds: null };
  }
  const elapsed = (Date.now() - new Date(session.started_at).getTime()) / 1000;
  // Eerst het aftellen: iedereen aan tafel de kans geven erbij te komen zitten
  // voordat de eerste vraag begint.
  if (elapsed < QUIZ_INTRO_SECONDS) {
    return { phase: "intro", index: 0, remainingSeconds: Math.ceil(QUIZ_INTRO_SECONDS - elapsed) };
  }
  // Vragen hebben niet allemaal dezelfde slotlengte: elke vraag krijgt een
  // korte "dit was het goede antwoord"-pauze, en na elke vijfde vraag is dat de
  // langere tussenstand-pauze in plaats daarvan. De verdubbelaar-vraag duurt
  // zelf ook langer. Dit loopt daarom cumulatief door de vragen heen in plaats
  // van een vaste deling te doen.
  let acc = QUIZ_INTRO_SECONDS;
  for (let i = 0; i < total; i++) {
    const showsStandings = (i + 1) % QUIZ_STANDINGS_EVERY === 0;
    const qDuration = questionDuration(session, i);
    if (elapsed < acc + qDuration) {
      return { phase: "question", index: i, remainingSeconds: Math.ceil(acc + qDuration - elapsed) };
    }
    const revealSeconds = showsStandings ? session.interval_seconds : QUIZ_REVEAL_SECONDS;
    const slot = qDuration + revealSeconds;
    if (elapsed < acc + slot) {
      return { phase: "standings", index: i, remainingSeconds: Math.ceil(acc + slot - elapsed), showsLeaderboard: showsStandings };
    }
    acc += slot;
  }
  return { phase: "done", index: total - 1, remainingSeconds: null };
}

async function loadQuizSessionForUser(tripId, userId) {
  const { rows } = await query("SELECT * FROM quiz_sessions WHERE trip_id = $1 ORDER BY created_at DESC LIMIT 1", [tripId]);
  if (!rows.length) return null;
  const session = rows[0];
  const { rows: participants } = await query("SELECT user_id, name, score FROM quiz_participants WHERE session_id = $1 ORDER BY score DESC, joined_at ASC", [session.id]);
  const isHost = session.host_user_id === userId;
  const isParticipant = isHost || participants.some((p) => p.user_id === userId);
  return { session, participants, isHost, isParticipant };
}

function quizSessionSummary(loaded, req) {
  const { session, participants, isHost, isParticipant } = loaded;
  return {
    id: session.id,
    status: session.status,
    isHost,
    isParticipant,
    participantCount: participants.length,
    totalQuestions: session.questions.length,
    joinLink: isHost ? `${appUrl(req)}/quiz/${session.token}` : null,
  };
}

route("POST", "/api/trips/:id/quiz/sessions", async (req, res, params, body) => {
  bewaakAiGebruik(req);
  // Elk reislid mag een quiz aanmaken, ook alleen-lezen bezoekers — wie 'm
  // aanmaakt wordt vanzelf de gastheer van déze sessie (host_user_id), los
  // van wie de reis zelf bezit.
  // "done" bestaat niet als kolomwaarde (status blijft 'active'), dus of de
  // bestaande sessie nog leeft wordt met dezelfde tijd-afgeleide logica bepaald
  // als /state gebruikt — anders zou "nieuwe quiz starten" na afloop de allang
  // afgelopen sessie blijven hergebruiken in plaats van een nieuwe te maken.
  const { rows: existing } = await query("SELECT * FROM quiz_sessions WHERE trip_id = $1 ORDER BY created_at DESC LIMIT 1", [params.id]);
  if (existing.length && computeQuizPhase(existing[0]).phase !== "done") {
    const loaded = await loadQuizSessionForUser(params.id, req.user.id);
    return sendJson(res, 200, { session: quizSessionSummary(loaded, req) });
  }

  const questionSeconds = Math.min(QUIZ_QUESTION_SECONDS_MAX, Math.max(QUIZ_QUESTION_SECONDS_MIN, Number(body?.questionSeconds) || QUIZ_QUESTION_SECONDS_DEFAULT));
  const questionCount = Math.min(QUIZ_QUESTION_COUNT_MAX, Math.max(QUIZ_QUESTION_COUNT_MIN, Number(body?.questionCount) || QUIZ_QUESTION_COUNT_DEFAULT));

  let questions;
  try { questions = await generateQuizQuestions(params.id, questionCount, req.user?.id); }
  catch (err) { return sendError(res, 500, err.message); }
  if (!questions.length) return sendError(res, 400, "Nog niet genoeg foto's gekoppeld aan een activiteit, vervoer of verblijf om een quiz van te maken.");

  const token = crypto.randomBytes(16).toString("hex");
  const { rows } = await query(
    `INSERT INTO quiz_sessions (trip_id, host_user_id, token, questions, question_seconds, interval_seconds)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [params.id, req.user.id, token, JSON.stringify(questions), questionSeconds, QUIZ_INTERVAL_SECONDS]
  );
  await query("INSERT INTO quiz_participants (session_id, user_id, name) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
    [rows[0].id, req.user.id, req.user.given_name || req.user.name || "Gastheer"]);

  const loaded = await loadQuizSessionForUser(params.id, req.user.id);
  sendJson(res, 200, { session: quizSessionSummary(loaded, req) });
}, { tripScope: "param", allowViewer: true });

route("GET", "/api/trips/:id/quiz/session", async (req, res, params) => {
  let loaded = await loadQuizSessionForUser(params.id, req.user.id);
  // Wie al gewone (ook alleen-lezen) toegang tot de reis heeft en de
  // fotoquiz-tab opent, doet daarmee impliciet mee — geen aparte QR-link meer
  // nodig. Alleen zinvol zolang de sessie nog leeft; een allang afgelopen
  // sessie hoeft niemand er nog bij te trekken.
  //
  // Met ?kijk=1 gebeurt dat inschrijven niet. Dat is nodig sinds de app aan een
  // alleen-lezen bezoeker vraagt óf hij meespeelt, om te bepalen of de quiz
  // getoond moet worden: zonder deze uitzondering zou juist die vraag hem
  // inschrijven, en dan speelt iedereen die de reis opent automatisch mee.
  const alleenKijken = new URL(req.url, "http://localhost").searchParams.get("kijk") === "1";
  if (!alleenKijken && loaded && !loaded.isParticipant && computeQuizPhase(loaded.session).phase !== "done") {
    await query("INSERT INTO quiz_participants (session_id, user_id, name) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
      [loaded.session.id, req.user.id, req.user.given_name || req.user.name || "Speler"]);
    loaded = await loadQuizSessionForUser(params.id, req.user.id);
  }
  sendJson(res, 200, { session: loaded ? quizSessionSummary(loaded, req) : null });
}, { tripScope: "param", allowViewer: true });

route("POST", "/api/trips/:id/quiz/sessions/:sessionId/start", async (req, res, params) => {
  const { rows } = await query("SELECT * FROM quiz_sessions WHERE id = $1 AND trip_id = $2", [params.sessionId, params.id]);
  if (!rows.length || rows[0].host_user_id !== req.user.id) return sendError(res, 403, "Alleen de gastheer kan de quiz starten");
  if (rows[0].status !== "lobby") return sendJson(res, 200, { ok: true });
  // started_at ligt bewust een stukje in de toekomst: de client toont dan nog
  // het openingsscherm (los van de kloktijd), en zonder deze marge liep vraag
  // 1 daar al voor een flink deel doorheen tegen de tijd dat spelers hem
  // daadwerkelijk te zien kregen.
  await query(
    `UPDATE quiz_sessions SET status = 'active', started_at = NOW() + INTERVAL '${QUIZ_OPENING_SCREEN_SECONDS} seconds' WHERE id = $1`,
    [params.sessionId]
  );
  sendJson(res, 200, { ok: true });
}, { tripScope: "param", allowViewer: true });

route("POST", "/api/trips/:id/quiz/sessions/:sessionId/stop", async (req, res, params) => {
  const { rows } = await query("SELECT * FROM quiz_sessions WHERE id = $1 AND trip_id = $2", [params.sessionId, params.id]);
  if (!rows.length || rows[0].host_user_id !== req.user.id) return sendError(res, 403, "Alleen de gastheer kan de quiz stoppen");
  await query("UPDATE quiz_sessions SET status = 'done' WHERE id = $1", [params.sessionId]);
  sendJson(res, 200, { ok: true });
}, { tripScope: "param", allowViewer: true });

route("GET", "/api/quiz-sessions/:sessionId/state", async (req, res, params) => {
  const { rows } = await query("SELECT * FROM quiz_sessions WHERE id = $1", [params.sessionId]);
  if (!rows.length) return sendError(res, 404, "Quiz niet gevonden");
  const session = rows[0];
  const { rows: participants } = await query("SELECT id, user_id, name, score FROM quiz_participants WHERE session_id = $1 ORDER BY score DESC, joined_at ASC", [session.id]);
  const me = participants.find((p) => p.user_id === req.user.id);
  if (!me) return sendError(res, 403, "Je doet niet mee aan deze quiz");

  const { phase, index, remainingSeconds, showsLeaderboard } = computeQuizPhase(session);
  // status blijft anders voor altijd 'active' staan voor een quiz die gewoon
  // is uitgespeeld (nooit expliciet gestopt) — de historische statistieken
  // (zie /quiz/stats) tellen alleen sessies met status 'done' mee, dus zonder
  // dit zou zo'n potje daar nooit in meetellen.
  if (phase === "done" && session.status !== "done") {
    query("UPDATE quiz_sessions SET status = 'done' WHERE id = $1 AND status != 'done'", [session.id])
      .catch((err) => console.error("Quiz status-afronding mislukt:", err.message));
  }
  const payload = {
    phase, currentIndex: index, remainingSeconds,
    totalQuestions: session.questions.length,
    // De effectieve duur van déze vraag (inclusief eventuele verdubbelaar-
    // bonus), niet zomaar de sessie-brede instelling — anders klopt de
    // blur-aftelling op de client niet meer voor de verdubbelaar-vraag.
    questionSeconds: questionDuration(session, index),
    isHost: session.host_user_id === req.user.id,
    // Alleen bij elke vijfde vraag de volle tussenstand (ranglijst) — de korte
    // "dit was het goede antwoord"-pauze na de andere vragen toont alleen het
    // antwoord, geen ranglijst.
    showsLeaderboard: phase === "standings" ? !!showsLeaderboard : true,
    participants: participants.map((p) => ({ id: p.user_id, name: p.name, score: p.score, isMe: p.user_id === req.user.id })),
  };

  if (phase === "question") {
    const q = session.questions[index];
    payload.question = { type: q.type, question: q.question, photo_id: q.photo_id, url: q.url, thumb_url: q.thumb_url, options: q.options, mode: q.mode, doubler: !!q.doubler };
    const { rows: mine } = await query("SELECT choice, correct, points FROM quiz_answers WHERE participant_id = $1 AND question_index = $2", [me.id, index]);
    payload.myAnswer = mine[0] || null;
  } else if (phase === "standings" || phase === "done") {
    const q = session.questions[index];
    payload.question = { type: q.type, question: q.question, photo_id: q.photo_id, url: q.url, thumb_url: q.thumb_url, options: q.options, correct: q.correct, doubler: !!q.doubler };
    const { rows: mine } = await query("SELECT choice, correct, points FROM quiz_answers WHERE participant_id = $1 AND question_index = $2", [me.id, index]);
    payload.myAnswer = mine[0] || null;

    // Wie had 'm goed? Dat is het leukste moment van een quiz aan tafel, en het
    // stond er niet: je zag alleen of jíj het goed had. Op volgorde van
    // antwoorden, want wie het snelst was hoort vooraan te staan — dat is ook de
    // volgorde waarin de punten zijn toegekend.
    const { rows: goed } = await query(
      `SELECT p.user_id, p.name
         FROM quiz_answers a JOIN quiz_participants p ON p.id = a.participant_id
        WHERE a.session_id = $1 AND a.question_index = $2 AND a.correct = TRUE
        ORDER BY a.answered_at ASC`,
      [session.id, index]
    );
    payload.goedeAntwoorden = goed.map((r) => ({ id: r.user_id, naam: r.name, isMe: r.user_id === req.user.id }));
    // Hoeveel er meededen aan déze vraag, zodat "3 van de 5" te tonen is.
    const { rows: totaal } = await query(
      "SELECT COUNT(*)::int AS n FROM quiz_answers WHERE session_id = $1 AND question_index = $2",
      [session.id, index]
    );
    payload.aantalGeantwoord = totaal[0].n;
  }

  sendJson(res, 200, payload);
});

route("POST", "/api/quiz-sessions/:sessionId/answer", async (req, res, params, body) => {
  const { rows } = await query("SELECT * FROM quiz_sessions WHERE id = $1", [params.sessionId]);
  if (!rows.length) return sendError(res, 404, "Quiz niet gevonden");
  const session = rows[0];
  const { rows: meRows } = await query("SELECT id FROM quiz_participants WHERE session_id = $1 AND user_id = $2", [session.id, req.user.id]);
  if (!meRows.length) return sendError(res, 403, "Je doet niet mee aan deze quiz");
  const participantId = meRows[0].id;

  const questionIndex = Number(body?.questionIndex);
  if (!Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex >= session.questions.length) {
    return sendError(res, 400, "Ongeldige vraag");
  }
  if (session.status !== "active" || !session.started_at) return sendError(res, 400, "Deze vraag is al gesloten");

  // Een antwoord dat de speler nét op tijd verstuurde kan door netwerk- of
  // verwerkingstijd pas ná het echte sluiten van de vraag bij de server
  // aankomen — zonder een korte genadetermijn zou zo'n antwoord ten onrechte
  // worden afgewezen als "niet meer actief" terwijl de speler wel op tijd was.
  const ANSWER_GRACE_SECONDS = 4;
  // En een kleine marge aan de ónderkant, om een andere reden. De verstreken
  // tijd wordt hier met de klok van Node gemeten, terwijl started_at van de
  // database komt. Lopen die een fractie uit de pas, dan is "verstreken" bij de
  // allereerste vraag net negatief en werd een antwoord geweigerd dat prima op
  // tijd was. Anderhalve seconde dekt dat verschil ruim, en is te kort om de
  // volgende vraag alvast te kunnen beantwoorden — die kent de speler dan nog
  // niet eens.
  const KLOKMARGE_SECONDS = 1.5;
  const elapsed = (Date.now() - new Date(session.started_at).getTime()) / 1000;
  const { start, end } = questionWindow(session, questionIndex);
  if (elapsed < start - KLOKMARGE_SECONDS || elapsed > end + ANSWER_GRACE_SECONDS) {
    return sendError(res, 400, "Deze vraag is niet meer actief");
  }
  const remainingSeconds = Math.max(0, end - elapsed);

  const q = session.questions[questionIndex];
  const choice = typeof body?.choice === "string" ? body.choice : null;
  const correct = choice === q.correct;
  // Snelheidsbonus zoals Kahoot: hoe eerder in het antwoordvenster, hoe meer
  // punten, met een bodem van 500 zodat een goed antwoord op het laatste
  // moment nog steeds ruim meer oplevert dan een fout antwoord (0 punten).
  // Vraag 5 (q.doubler) telt dubbel én heeft zelf ook een langere duur (zie
  // questionDuration) — die langere duur is hier de juiste noemer, anders zou
  // de snelheidsbonus verkeerd uitpakken (remainingSeconds kan dan groter
  // zijn dan session.question_seconds).
  const basePoints = correct ? Math.round(500 + 500 * (remainingSeconds / questionDuration(session, questionIndex))) : 0;
  const points = q.doubler ? basePoints * 2 : basePoints;

  try {
    await query(
      "INSERT INTO quiz_answers (session_id, participant_id, question_index, choice, correct, points) VALUES ($1,$2,$3,$4,$5,$6)",
      [session.id, participantId, questionIndex, choice, correct, points]
    );
  } catch (err) {
    if (err.code === "23505") return sendError(res, 400, "Je hebt deze vraag al beantwoord");
    throw err;
  }
  await query("UPDATE quiz_participants SET score = score + $1 WHERE id = $2", [points, participantId]);

  sendJson(res, 200, { correct, points, correctOption: q.correct });
});

// Alleen echt afgelopen potjes (status 'done') tellen mee — een sessie die
// nog loopt zou het gemiddelde met een onvolledige score vertekenen. Zie de
// /state-route hierboven, die status lazy op 'done' zet zodra een sessie
// volgens de kloktijd is uitgespeeld (ook als niemand ooit op "stoppen" klikt).
// Én: alleen deelnemers die ook echt minstens één vraag hebben beantwoord —
// wie de fotoquiz-tab alleen maar opende terwijl een ander al aan het spelen
// was, wordt automatisch als deelnemer toegevoegd (zie GET .../quiz/session)
// maar heeft dan nooit meegespeeld. Die zonder deze voorwaarde meetellen als
// "gespeeld potje" met score 0 trok het gemiddelde scheef.
route("GET", "/api/trips/:id/quiz/stats", async (req, res, params) => {
  const { rows } = await query(
    `SELECT qp.user_id, u.name, u.given_name,
            SUM(qp.score)::int AS total_score,
            COUNT(*)::int AS games_played,
            ROUND(AVG(qp.score))::int AS avg_score
     FROM quiz_participants qp
     JOIN quiz_sessions qs ON qs.id = qp.session_id
     JOIN users u ON u.id = qp.user_id
     WHERE qs.trip_id = $1 AND qs.status = 'done'
       AND EXISTS (SELECT 1 FROM quiz_answers qa WHERE qa.participant_id = qp.id)
     GROUP BY qp.user_id, u.name, u.given_name
     ORDER BY total_score DESC`,
    [params.id]
  );
  sendJson(res, 200, rows.map((r) => ({
    userId: r.user_id, name: r.given_name || r.name || "Speler",
    totalScore: r.total_score, gamesPlayed: r.games_played, avgScore: r.avg_score,
  })));
}, { tripScope: "param", allowViewer: true });

// ---------- Fotoboek ----------
// Het gezin stelt zelf een fotoboek samen uit de foto's van de reis: bij het
// aanmaken krijgen ze een voorgestelde selectie/volgorde/bijschrift (alle
// foto's, chronologisch, bijschrift afgeleid uit activiteit/vervoer/verblijf/
// dag), die ze daarna zelf verder aanpassen. Bestellen bij een drukkerij is
// een latere stap — dit is puur het samenstellen.

function photobookCaption(p) {
  if (p.activity_title) return p.activity_location ? `${p.activity_title} — ${p.activity_location}` : p.activity_title;
  if (p.transport_type) return p.from_location && p.to_location ? `${p.transport_type}: ${p.from_location} → ${p.to_location}` : p.transport_type;
  if (p.accommodation_name) return p.accommodation_name;
  if (p.day_title) return p.day_title;
  if (p.day_date) return new Date(p.day_date).toLocaleDateString("nl-NL", { day: "numeric", month: "long" });
  return null;
}

// Het fotoboek is niets voor een alleen-lezen bezoeker. Zo iemand krijgt een
// deel-link om mee te kijken met de reis; het fotoboek is wat je dáárna van die
// reis maakt — een eigen ontwerp, en bij bestellen ook een eigen rekening.
// Belangrijk: de rolcontrole bij de routetabel houdt kijkers alleen tegen bij
// schrijven; lezen mag elk lid van de reis. Daarom staat de grens hier in de
// route zelf, en niet in de opties. De lijst geeft leeg terug (net als het
// budget: er is niets te zien, geen foutmelding nodig), de losse routes een 403.
route("GET", "/api/trips/:id/photobooks", async (req, res, params) => {
  if (req.tripRole === "viewer") return sendJson(res, 200, []);
  const { rows } = await query(
    `SELECT b.id, b.title, b.status, b.created_at,
            (SELECT COUNT(*) FROM photobook_pages pp WHERE pp.photobook_id = b.id) AS page_count,
            (SELECT pgp.photo_id FROM photobook_page_photos pgp
             JOIN photobook_pages pp2 ON pp2.id = pgp.page_id
             WHERE pp2.photobook_id = b.id ORDER BY pp2.position ASC, pgp.position ASC LIMIT 1) AS cover_photo_id
     FROM photobooks b WHERE b.trip_id = $1 ORDER BY b.created_at DESC`,
    [params.id]
  );
  sendJson(res, 200, rows.map((r) => ({
    id: r.id, title: r.title, status: r.status, pageCount: Number(r.page_count),
    coverThumbUrl: r.cover_photo_id ? `/api/photos/${r.cover_photo_id}/thumb` : null,
  })));
}, { tripScope: "param" });

// Zelfde indelingen als de "Pagina sjablonen" in de editor (app/11-fotoboek.js,
// PHOTOBOOK_LAYOUTS) — bij het automatisch vullen krijgt elke pagina meteen
// dezelfde verzorgde indeling die je er later ook zelf op zou kunnen zetten.
const PHOTOBOOK_AUTOFILL_LAYOUTS = {
  1: [{ x: 0.05, y: 0.05, width: 0.9, height: 0.9 }],
  2: [
    { x: 0.05, y: 0.05, width: 0.44, height: 0.9 },
    { x: 0.51, y: 0.05, width: 0.44, height: 0.9 },
  ],
  3: [
    { x: 0.05, y: 0.05, width: 0.56, height: 0.9 },
    { x: 0.64, y: 0.05, width: 0.31, height: 0.43 },
    { x: 0.64, y: 0.52, width: 0.31, height: 0.43 },
  ],
  4: [
    { x: 0.05, y: 0.05, width: 0.44, height: 0.44 },
    { x: 0.51, y: 0.05, width: 0.44, height: 0.44 },
    { x: 0.05, y: 0.51, width: 0.44, height: 0.44 },
    { x: 0.51, y: 0.51, width: 0.44, height: 0.44 },
  ],
};

// Hoekafronding is een fractie van de kortste zijde van de pagina (zie
// PHOTOBOOK_CORNER_PRESETS in app/11-fotoboek.js). 0.05 is op A4 zo'n 10 mm — ruim
// boven de sterkste keuze die de app aanbiedt, en de grens waarboven het geen
// afwerking meer is maar een vorm.
const PHOTOBOOK_MAX_CORNER = 0.05;

// Achtergrondkleuren gaan als losse tekst de database in en komen er als CSS
// weer uit. Alleen een letterlijke hexkleur toelaten houdt daar alles buiten
// wat in een style-attribuut iets anders zou kunnen betekenen.
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

// De reisnaam gaat als tekst een HTML-veld in (titels en tekstvakken zijn rich
// text), dus een reis met een & of < erin moet hier ontsnapt worden — anders
// staat er straks kapotte opmaak in het boek, of erger.
function escapeHtmlText(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// "5 – 11 augustus 2026", of over de maandgrens heen "28 juli – 11 augustus
// 2026". Jaartal en maandnaam één keer noemen waar dat kan: op een kaft telt
// elke regel, en "5 augustus 2026 – 11 augustus 2026" leest als een formulier.
function reisPeriodeTekst(start, eind) {
  if (!start) return null;
  const MAANDEN = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
  const s = new Date(start);
  const e = eind ? new Date(eind) : null;
  const deel = (d, metMaand, metJaar) =>
    `${d.getUTCDate()}${metMaand ? ` ${MAANDEN[d.getUTCMonth()]}` : ""}${metJaar ? ` ${d.getUTCFullYear()}` : ""}`;
  if (!e || e.getTime() === s.getTime()) return deel(s, true, true);
  const zelfdeJaar = s.getUTCFullYear() === e.getUTCFullYear();
  const zelfdeMaand = zelfdeJaar && s.getUTCMonth() === e.getUTCMonth();
  return `${deel(s, !zelfdeMaand, !zelfdeJaar)} – ${deel(e, true, true)}`;
}

// De standaardkaft: de reisnaam groot in het midden, met de reisperiode eronder.
// Los van de smaak is dit het enige ontwerp dat meteen ergens op slaat zonder
// dat iemand iets invult — en het maakt in één blik duidelijk dat een kaft over
// tekst gaat en niet over een foto die toevallig de eerste was.
async function maakKaftPaginas(bookId, boekTitel, periode, achtergrondkleur, laatstePositie) {
  const titelHtml = `<font style="font-size: 32pt">${escapeHtmlText(boekTitel)}</font>`;
  const achterkantHtml = `<font style="font-size: 12pt">${escapeHtmlText(boekTitel)}</font>`;
  const kaften = [
    { positie: 0, role: "cover_front", titel: titelHtml, sub: periode ? `<font style="font-size: 14pt">${escapeHtmlText(periode)}</font>` : null,
      titelVak: { x: 0.1, y: 0.32, w: 0.8, h: 0.18 }, subVak: { x: 0.15, y: 0.53, w: 0.7, h: 0.08 } },
    // De achterkant krijgt dezelfde naam klein onderaan: een boek dat op de
    // plank ligt hoort ook op zijn rug te zeggen wat het is. Verder leeg — daar
    // is juist ruimte voor een slotfoto of een paar woorden.
    { positie: laatstePositie, role: "cover_back", titel: achterkantHtml, sub: null,
      titelVak: { x: 0.15, y: 0.82, w: 0.7, h: 0.07 }, subVak: null },
  ];
  for (const k of kaften) {
    const { rows } = await query(
      `INSERT INTO photobook_pages
         (photobook_id, position, role, title, title_align, title_x, title_y, title_width, title_height,
          background_type, background_color)
       VALUES ($1,$2,$3,$4,'center',$5,$6,$7,$8,$9,$10) RETURNING id`,
      [bookId, k.positie, k.role, k.titel, k.titelVak.x, k.titelVak.y, k.titelVak.w, k.titelVak.h,
       achtergrondkleur ? "color" : null, achtergrondkleur]
    );
    if (k.sub) {
      await query(
        "INSERT INTO photobook_page_textboxes (page_id, position, html, x, y, width, height, align) VALUES ($1,0,$2,$3,$4,$5,$6,'center')",
        [rows[0].id, k.sub, k.subVak.x, k.subVak.y, k.subVak.w, k.subVak.h]
      );
    }
  }
}

route("POST", "/api/trips/:id/photobooks", async (req, res, params, body) => {
  const title = (body?.title && String(body.title).trim()) || "Fotoboek";
  const autofill = body?.autofill !== false;
  const photosPerPage = Math.min(4, Math.max(1, parseInt(body?.photosPerPage, 10) || 1));
  const orientation = body?.orientation === "landscape" ? "landscape" : "portrait";
  const cornerRadius = Math.min(PHOTOBOOK_MAX_CORNER, Math.max(0, Number(body?.cornerRadius) || 0));
  // Paginatitels uit het dagboek halen. Standaard aan, zodat een aanroep zonder
  // deze sleutel zich gedraagt zoals het altijd deed: wel een paginatitel.
  const useJournalTitles = body?.useJournalTitles !== false;
  const backgroundColor = HEX_COLOR.test(String(body?.backgroundColor || "")) ? body.backgroundColor : null;

  const { rows: reisRows } = await query("SELECT name, start_date, end_date FROM trips WHERE id = $1", [params.id]);
  const reis = reisRows[0] || {};
  // De reisnaam is een betere kaft-titel dan "Fotoboek": dat laatste is hoe je
  // het bestand noemt, niet wat er op de voorkant hoort te staan.
  const kaftTitel = title !== "Fotoboek" ? title : (reis.name || title);
  const periode = reisPeriodeTekst(reis.start_date, reis.end_date);

  const { rows: bookRows } = await query(
    "INSERT INTO photobooks (trip_id, title, created_by, orientation, corner_radius, background_color) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
    [params.id, title, req.user.id, orientation, cornerRadius, backgroundColor]
  );
  const bookId = bookRows[0].id;

  // Ook een leeg boek krijgt zijn twee kaften: je begint met een voorkant en een
  // achterkant en vult de rest aan, niet andersom.
  if (!autofill) {
    await maakKaftPaginas(bookId, kaftTitel, periode, backgroundColor, 1);
    return sendJson(res, 201, { id: bookId, title, status: "draft", pageCount: 2, orientation, cornerRadius, backgroundColor });
  }

  const { rows: photos } = await query(
    `SELECT p.id, p.caption,
            a.title AS activity_title, a.location AS activity_location,
            tr.type AS transport_type, tr.from_location, tr.to_location,
            ac.name AS accommodation_name,
            d.title AS day_title, d.date AS day_date
     FROM photos p
     LEFT JOIN activities a ON a.id = p.activity_id
     LEFT JOIN transports tr ON tr.id = p.transport_id
     LEFT JOIN accommodations ac ON ac.id = p.accommodation_id
     LEFT JOIN days d ON d.id = p.day_id
     WHERE p.trip_id = $1
     ORDER BY p.taken_at ASC NULLS LAST, p.created_at ASC`,
    [params.id]
  );

  // Voorgesteld: `photosPerPage` foto's per pagina, in de bijpassende
  // indeling; bij precies één foto per pagina krijgt de pagina ook meteen de
  // afgeleide bijschrift-tekst als titel — een simpele, veilige start die de
  // gebruiker daarna zelf verder aanpast (samenvoegen, beschrijvingen, een
  // eigen achtergrond).
  // Positie 0 is de voorkant, dus de fotopagina's beginnen op 1 en de
  // achterkant sluit de rij.
  let pageCount = 1;
  for (let i = 0; i < photos.length; i += photosPerPage) {
    const group = photos.slice(i, i + photosPerPage);
    // Het eigen onderschrift uit het dagboek gaat voor, want dat heeft iemand
    // zelf getypt. Bij meerdere foto's op een pagina zijn er meerdere
    // onderschriften en zou één ervan willekeurig zijn; dan wint de afgeleide
    // naam (activiteit/dag) van de eerste foto, die voor de hele groep opgaat.
    const pageTitle = !useJournalTitles ? null
      : group.length === 1
        ? ((group[0].caption && String(group[0].caption).trim()) || photobookCaption(group[0]))
        : photobookCaption(group[0]);
    const { rows: pageRows } = await query(
      "INSERT INTO photobook_pages (photobook_id, position, title, background_type, background_color) VALUES ($1,$2,$3,$4,$5) RETURNING id",
      [bookId, pageCount, pageTitle, backgroundColor ? "color" : null, backgroundColor]
    );
    const pageId = pageRows[0].id;
    const rects = PHOTOBOOK_AUTOFILL_LAYOUTS[group.length];
    for (let j = 0; j < group.length; j++) {
      const r = rects[j];
      await query(
        "INSERT INTO photobook_page_photos (page_id, photo_id, position, x, y, width, height, corner_radius) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        [pageId, group[j].id, j, r.x, r.y, r.width, r.height, cornerRadius]
      );
    }
    pageCount++;
  }

  await maakKaftPaginas(bookId, kaftTitel, periode, backgroundColor, pageCount);
  sendJson(res, 201, { id: bookId, title, status: "draft", pageCount: pageCount + 1, orientation, cornerRadius, backgroundColor });
}, { tripScope: "param" });

// Elke foto op een pagina staat vrij gepositioneerd/geschaald (fractie van
// de pagina) — geklemd tussen redelijke grenzen zodat een corrupte of
// geknoeide waarde een pagina niet onbruikbaar (bijv. negatieve breedte of
// ver buiten beeld) kan maken.
// De tekst uit fotoboek-tekstvakken en -titels ging tot nu toe ongesaneerd de
// database in: de veiligheid leunde volledig op de sanitizer die de client bij
// het tónen nog eens draait. Dat klopt vandaag, maar het is een wankele afspraak
// — één toekomstig scherm dat de opgeslagen HTML rechtstreeks gebruikt, en er
// staat opgeslagen XSS in. Daarom hier dezelfde beperkte set als in de client
// (zie RICH_TEXT_ALLOWED_TAGS/ATTR in app/03-ui-bouwstenen.js).
//
// Bewust een eigen kleine schoonmaker en geen volwaardige HTML-parser: het is
// een vaste, piepkleine tagset, en dezelfde die de PDF-generator hieronder al
// aankan. Alles wat er niet in staat verdwijnt, inclusief de tag zelf.
const PHOTOBOOK_TOEGESTANE_TAGS = new Set(["b", "i", "font", "br", "div"]);
const PHOTOBOOK_TOEGESTANE_ATTR = new Set(["face", "color", "size", "style"]);

function sanitizePhotobookHtml(html) {
  if (typeof html !== "string" || !html) return null;
  // Eerst script/style compleet weg, inhoud en al. Alleen de tags strippen zou
  // de code als gewone tekst laten staan ("alert(1)") — ongevaarlijk, maar dat
  // is niet wat iemand in zijn fotoboek wil zien.
  const zonderCode = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*$/gi, "");
  const schoon = zonderCode.replace(/<\/?([a-zA-Z0-9-]+)([^>]*)>/g, (heel, tag, attrTekst) => {
    const naam = tag.toLowerCase();
    if (!PHOTOBOOK_TOEGESTANE_TAGS.has(naam)) return "";
    if (heel.startsWith("</")) return `</${naam}>`;
    const attrs = [];
    // Alleen naam="waarde" met rechte of enkele aanhalingstekens; alles zonder
    // aanhalingstekens (waar de meeste injectietrucs op leunen) valt af.
    const re = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = re.exec(attrTekst))) {
      const attr = m[1].toLowerCase();
      if (!PHOTOBOOK_TOEGESTANE_ATTR.has(attr)) continue;
      const waarde = (m[3] ?? m[4] ?? "");
      // Geen url(), geen javascript:, geen expressie-trucs in style.
      if (/[<>]|javascript:|expression\(|url\s*\(/i.test(waarde)) continue;
      attrs.push(`${attr}="${waarde.replace(/"/g, "&quot;")}"`);
    }
    return `<${naam}${attrs.length ? " " + attrs.join(" ") : ""}>`;
  });
  return schoon.trim() ? schoon : null;
}

function clampPhotoRect(p) {
  const n = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  return {
    x: Math.min(1, Math.max(0, n(p.x, 0.1))),
    y: Math.min(1, Math.max(0, n(p.y, 0.1))),
    width: Math.min(1, Math.max(0.03, n(p.width, 0.4))),
    height: Math.min(1, Math.max(0.03, n(p.height, 0.4))),
    opacity: Math.min(1, Math.max(0, n(p.opacity, 1))),
    cornerRadius: Math.min(PHOTOBOOK_MAX_CORNER, Math.max(0, n(p.cornerRadius, 0))),
    cropX: Math.min(1, Math.max(0, n(p.cropX, 0.5))),
    cropY: Math.min(1, Math.max(0, n(p.cropY, 0.5))),
    cropZoom: Math.min(2.5, Math.max(1, n(p.cropZoom, 1))),
  };
}

function clampTextBoxRect(t) {
  const n = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  return {
    x: Math.min(1, Math.max(0, n(t.x, 0.15))),
    y: Math.min(1, Math.max(0, n(t.y, 0.4))),
    width: Math.min(1, Math.max(0.05, n(t.width, 0.7))),
    height: Math.min(1, Math.max(0.03, n(t.height, 0.15))),
    align: ["left", "center", "right"].includes(t.align) ? t.align : "center",
  };
}

// De pixelmaat gaat mee, net als bij de foto's op de pagina: de scherptecheck
// in de app kan er anders niets over zeggen, en juist een achtergrondfoto vult
// de hele bladzijde en heeft dus de meeste pixels nodig.
function photobookBackground(page, maten) {
  if (page.background_type === "color" && page.background_color) return { type: "color", value: page.background_color };
  if (page.background_type === "photo" && page.background_photo_id) {
    const maat = maten?.get(page.background_photo_id);
    return {
      type: "photo", photoId: page.background_photo_id,
      url: `/api/photos/${page.background_photo_id}/raw`,
      overlay: page.background_overlay || 0,
      spread: !!page.background_spread,
      nativeWidth: maat?.width ?? null, nativeHeight: maat?.height ?? null,
    };
  }
  return null;
}

route("GET", "/api/photobooks/:id", async (req, res, params) => {
  if (req.tripRole === "viewer") return sendError(res, 403, "Het fotoboek is niet gedeeld");
  const { rows: bookRows } = await query("SELECT * FROM photobooks WHERE id = $1", [params.id]);
  if (!bookRows.length) return sendError(res, 404, "Fotoboek niet gevonden");
  const { rows: pages } = await query(
    "SELECT * FROM photobook_pages WHERE photobook_id = $1 ORDER BY position ASC",
    [params.id]
  );
  // Eén vraag voor alle achtergrondfoto's samen, niet één per pagina.
  const achtergrondIds = [...new Set(pages.filter((p) => p.background_photo_id).map((p) => p.background_photo_id))];
  const achtergrondMaten = new Map();
  if (achtergrondIds.length) {
    const { rows } = await query("SELECT id, width, height FROM photos WHERE id = ANY($1::int[])", [achtergrondIds]);
    rows.forEach((r) => achtergrondMaten.set(r.id, { width: r.width, height: r.height }));
  }
  const { rows: pagePhotos } = await query(
    `SELECT pgp.*, ph.width AS native_width, ph.height AS native_height
     FROM photobook_page_photos pgp
     JOIN photobook_pages pp ON pp.id = pgp.page_id
     JOIN photos ph ON ph.id = pgp.photo_id
     WHERE pp.photobook_id = $1 ORDER BY pgp.page_id ASC, pgp.position ASC`,
    [params.id]
  );
  const photosByPage = new Map();
  for (const p of pagePhotos) {
    if (!photosByPage.has(p.page_id)) photosByPage.set(p.page_id, []);
    photosByPage.get(p.page_id).push({
      id: p.id, photoId: p.photo_id,
      x: p.x, y: p.y, width: p.width, height: p.height,
      opacity: p.opacity, cornerRadius: p.corner_radius,
      cropX: p.crop_x, cropY: p.crop_y, cropZoom: p.crop_zoom,
      nativeWidth: p.native_width, nativeHeight: p.native_height,
      url: `/api/photos/${p.photo_id}/raw`, thumbUrl: `/api/photos/${p.photo_id}/thumb`,
    });
  }
  const { rows: pageTextBoxes } = await query(
    `SELECT * FROM photobook_page_textboxes WHERE page_id IN (
       SELECT id FROM photobook_pages WHERE photobook_id = $1
     ) ORDER BY page_id ASC, position ASC`,
    [params.id]
  );
  const textBoxesByPage = new Map();
  for (const t of pageTextBoxes) {
    if (!textBoxesByPage.has(t.page_id)) textBoxesByPage.set(t.page_id, []);
    textBoxesByPage.get(t.page_id).push({
      id: t.id, html: t.html, x: t.x, y: t.y, width: t.width, height: t.height,
      align: t.align, backgroundColor: t.background_color,
    });
  }
  sendJson(res, 200, {
    id: bookRows[0].id, title: bookRows[0].title, status: bookRows[0].status, orientation: bookRows[0].orientation,
    cornerRadius: bookRows[0].corner_radius ?? 0,
    backgroundColor: bookRows[0].background_color ?? null,
    pages: pages.map((pg) => ({
      id: pg.id, title: pg.title, titleAlign: pg.title_align, role: pg.role || null,
      titleX: pg.title_x, titleY: pg.title_y, titleWidth: pg.title_width, titleHeight: pg.title_height,
      background: photobookBackground(pg, achtergrondMaten),
      photos: photosByPage.get(pg.id) || [],
      textBoxes: textBoxesByPage.get(pg.id) || [],
    })),
  });
}, { tripScope: "photobooks" });

route("PUT", "/api/photobooks/:id", async (req, res, params, body) => {
  const title = body?.title && String(body.title).trim();
  if (!title) return sendError(res, 400, "Titel is verplicht");
  await query("UPDATE photobooks SET title = $1 WHERE id = $2", [title, params.id]);
  sendJson(res, 200, { ok: true });
}, { tripScope: "photobooks" });

route("DELETE", "/api/photobooks/:id", async (req, res, params) => {
  await query("DELETE FROM photobooks WHERE id = $1", [params.id]);
  res.writeHead(204); res.end();
}, { tripScope: "photobooks" });

// Eén bulk-vervanging van de hele paginalijst — simpeler dan losse routes
// voor toevoegen/verwijderen/herordenen/bewerken van pagina's, foto's en
// achtergronden, en de client stuurt toch altijd de complete actuele
// structuur na elke wijziging.
route("PUT", "/api/photobooks/:id/pages", async (req, res, params, body) => {
  const items = Array.isArray(body?.pages) ? body.pages : null;
  if (!items) return sendError(res, 400, "Ongeldige paginalijst");

  const { rows: bookRows } = await query("SELECT trip_id FROM photobooks WHERE id = $1", [params.id]);
  if (!bookRows.length) return sendError(res, 404, "Fotoboek niet gevonden");
  const tripId = bookRows[0].trip_id;

  const allPhotoIds = new Set();
  for (const page of items) {
    if (!Array.isArray(page.photos)) return sendError(res, 400, "Ongeldige pagina");
    for (const p of page.photos) {
      const id = Number(p.photo_id);
      if (!Number.isInteger(id)) return sendError(res, 400, "Ongeldige foto in paginalijst");
      allPhotoIds.add(id);
    }
    if (page.background?.type === "photo") {
      const id = Number(page.background.photo_id);
      if (!Number.isInteger(id)) return sendError(res, 400, "Ongeldige achtergrondfoto");
      allPhotoIds.add(id);
    }
  }
  // Eén controle voor alle foto's samen in plaats van één per foto. Bij een boek
  // van dertig pagina's scheelde dat alleen hier al zestig rondjes naar de
  // database.
  if (allPhotoIds.size) {
    const { rows: eigen } = await query(
      "SELECT id FROM photos WHERE trip_id = $1 AND id = ANY($2::int[])",
      [tripId, [...allPhotoIds]]
    );
    if (eigen.length !== allPhotoIds.size) {
      return sendError(res, 400, "Eén of meer foto's horen niet bij deze reis");
    }
  }

  const validAlign = (v) => (["left", "center", "right"].includes(v) ? v : "left");
  const n = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

  // Alles wat de database in moet eerst hier klaarzetten, daarna in drie
  // gebundelde inserts wegschrijven. Dit ging per pagina, per foto en per
  // tekstvak apart: voor een boek van dertig pagina's 181 rondjes naar de
  // database, en lineair oplopend met de omvang van het boek. Nu vier.
  //
  // En binnen één transactie, wat het eigenlijk altijd al had moeten zijn: de
  // route gooit eerst alle pagina's weg en bouwt ze daarna opnieuw op. Ging daar
  // iets mis — een wegvallende verbinding, een fout op pagina twintig — dan bleef
  // je fotoboek half leeg achter, zonder weg terug.
  const paginaRijen = items.map((page, i) => {
    let bgType = null, bgColor = null, bgPhotoId = null, bgOverlay = 0, bgSpread = false;
    if (page.background?.type === "color" && typeof page.background.value === "string") {
      bgType = "color"; bgColor = page.background.value;
    } else if (page.background?.type === "photo") {
      bgType = "photo"; bgPhotoId = Number(page.background.photo_id);
      const overlay = Number(page.background.overlay);
      bgOverlay = Number.isFinite(overlay) ? Math.min(0.75, Math.max(0, overlay)) : 0;
      bgSpread = !!page.background.spread;
    }
    return [
      params.id, i,
      sanitizePhotobookHtml(typeof page.title === "string" ? page.title.trim() : null),
      bgType, bgColor, bgPhotoId, bgOverlay, bgSpread, validAlign(page.titleAlign),
      // Titel is vrij versleepbaar/vergrootbaar zoals een tekstvak — zelfde
      // klem-logica (fractie 0-1, met een minimale breedte/hoogte).
      Math.min(1, Math.max(0, n(page.titleX, 0.15))),
      Math.min(1, Math.max(0, n(page.titleY, 0.14))),
      Math.min(1, Math.max(0.05, n(page.titleWidth, 0.7))),
      Math.min(1, Math.max(0.03, n(page.titleHeight, 0.1))),
      // De rol reist mee met de pagina. Verplaats je de achterkant naar voren,
      // dan blijft het de achterkant — dat is een keuze van de gebruiker, niet
      // iets wat de positie mag bepalen. Alles buiten de twee kaftrollen wordt
      // een gewone pagina.
      page.role === "cover_front" || page.role === "cover_back" ? page.role : null,
    ];
  });

  await transaction(async (client) => {
    await client.query("DELETE FROM photobook_pages WHERE photobook_id = $1", [params.id]);
    if (!paginaRijen.length) return;

    // unnest() zet parallelle arrays om in rijen: één statement, ongeacht hoeveel
    // pagina's het boek heeft. De volgorde blijft die van de arrays, dus de
    // teruggegeven id's horen bij items[0], items[1], ...
    const kolommen = (rijen, aantal) =>
      Array.from({ length: aantal }, (_, k) => rijen.map((r) => r[k]));
    const pk = kolommen(paginaRijen, 14);
    const { rows: nieuwePaginas } = await client.query(
      `INSERT INTO photobook_pages
         (photobook_id, position, title, background_type, background_color, background_photo_id,
          background_overlay, background_spread, title_align, title_x, title_y, title_width, title_height, role)
       SELECT * FROM unnest(
         $1::int[], $2::int[], $3::text[], $4::text[], $5::text[], $6::int[],
         $7::real[], $8::boolean[], $9::text[], $10::real[], $11::real[], $12::real[], $13::real[], $14::text[])
       RETURNING id`,
      pk
    );
    const paginaIds = nieuwePaginas.map((r) => r.id);

    const fotoRijen = [];
    const tekstRijen = [];
    items.forEach((page, i) => {
      const pageId = paginaIds[i];
      page.photos.forEach((foto, j) => {
        const rect = clampPhotoRect(foto);
        fotoRijen.push([pageId, Number(foto.photo_id), j, rect.x, rect.y, rect.width, rect.height,
          rect.opacity, rect.cornerRadius, rect.cropX, rect.cropY, rect.cropZoom]);
      });
      (Array.isArray(page.textBoxes) ? page.textBoxes : []).forEach((tb, j) => {
        const rect = clampTextBoxRect(tb);
        tekstRijen.push([pageId, j, sanitizePhotobookHtml(tb.html), rect.x, rect.y, rect.width, rect.height,
          rect.align, typeof tb.backgroundColor === "string" ? tb.backgroundColor : null]);
      });
    });

    if (fotoRijen.length) {
      await client.query(
        `INSERT INTO photobook_page_photos
           (page_id, photo_id, position, x, y, width, height, opacity, corner_radius, crop_x, crop_y, crop_zoom)
         SELECT * FROM unnest(
           $1::int[], $2::int[], $3::int[], $4::real[], $5::real[], $6::real[], $7::real[],
           $8::real[], $9::real[], $10::real[], $11::real[], $12::real[])`,
        kolommen(fotoRijen, 12)
      );
    }
    if (tekstRijen.length) {
      await client.query(
        `INSERT INTO photobook_page_textboxes
           (page_id, position, html, x, y, width, height, align, background_color)
         SELECT * FROM unnest(
           $1::int[], $2::int[], $3::text[], $4::real[], $5::real[], $6::real[], $7::real[], $8::text[], $9::text[])`,
        kolommen(tekstRijen, 9)
      );
    }
  });

  sendJson(res, 200, { ok: true, pageCount: items.length });
}, { tripScope: "photobooks" });

// A4 in PDF-punten (72 punten per inch): 210mm x 297mm.
const PDF_PAGE_WIDTH = 595.28;
const PDF_PAGE_HEIGHT = 841.89;

// Titel, beschrijving en bijschriften komen uit de editor als een beperkte
// HTML-substring (b/i/font[face]/br/div — precies wat de contentEditable-
// opmaakknoppen produceren, zie app/03-ui-bouwstenen.js RICH_TEXT_ALLOWED_TAGS). Geen
// echte HTML-parser nodig voor zo'n kleine, vaste tagset: een simpele
// stack-based tag-walker volstaat. <br> en <div> worden allebei als
// regeleinde behandeld.
function pdfParseRichHtml(html) {
  const lines = [[]];
  const styleStack = [{ bold: false, italic: false, font: null, color: null, size: null }];
  // "br" vóór "b" — regex-alternatie kiest de eerste match, niet de langste,
  // dus "b" zou anders <br> al aftappen (met de "r" als restjunk-attribuut)
  // en het als een (nooit gesloten) <b>-tag behandelen.
  const tagRe = /<(\/?)(br|b|strong|i|em|font|div)([^>]*)>/gi;
  const decodeEntities = (s) => s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  let last = 0, m;
  const pushText = (text) => { if (text) lines[lines.length - 1].push({ text, ...styleStack[styleStack.length - 1] }); };
  while ((m = tagRe.exec(html))) {
    if (m.index > last) pushText(decodeEntities(html.slice(last, m.index)));
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (tag === "br") {
      lines.push([]);
    } else if (tag === "div") {
      if (!closing && lines[lines.length - 1].length > 0) lines.push([]);
    } else if (closing) {
      if (styleStack.length > 1) styleStack.pop();
    } else {
      const next = { ...styleStack[styleStack.length - 1] };
      if (tag === "b" || tag === "strong") next.bold = true;
      else if (tag === "i" || tag === "em") next.italic = true;
      else if (tag === "font") {
        const faceMatch = /face="([^"]*)"/i.exec(m[3] || "");
        if (faceMatch) next.font = faceMatch[1];
        const colorMatch = /color="([^"]*)"/i.exec(m[3] || "");
        if (colorMatch) next.color = colorMatch[1];
        // Nieuwe boeken zetten de grootte als font-size in punten; dat is
        // dezelfde eenheid als pdfkit gebruikt, dus die waarde kan er zo in.
        // Oudere tekst heeft nog size="1..7" — die schaal blijft werken.
        const ptMatch = /font-size:\s*([\d.]+)pt/i.exec(m[3] || "");
        if (ptMatch) next.sizePt = Number(ptMatch[1]);
        const sizeMatch = /size="([^"]*)"/i.exec(m[3] || "");
        if (sizeMatch) next.size = Number(sizeMatch[1]);
      }
      styleStack.push(next);
    }
    last = tagRe.lastIndex;
  }
  if (last < html.length) pushText(decodeEntities(html.slice(last)));
  return lines;
}
// pdfkit's .fill(kleur) accepteert wel een "rgba(...)"-string zonder te
// klagen, maar negeert het alpha-kanaal stilletjes (getest: geen /ca in de
// content-stream, dus altijd volledig dekkend) — het alfakanaal moet zelf
// via fillOpacity() worden toegepast, net als elders in dit bestand.
function parseRgbaColor(str) {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i.exec(str || "");
  if (!m) return { color: str, alpha: 1 };
  const [, r, g, b, a] = m;
  const hex = "#" + [r, g, b].map((v) => Number(v).toString(16).padStart(2, "0")).join("");
  return { color: hex, alpha: a !== undefined ? Number(a) : 1 };
}
// pdfkit heeft zonder embedden alleen de 14 standaard PDF-fonts (Helvetica/
// Times/Courier, elk in vet/cursief) — elke lettertype-keuze uit de editor
// valt terug op de dichtstbijzijnde van die drie. "Rond" en "Script" hebben
// geen echt serif/mono-equivalent en landen daarom bewust bij Helvetica.
function pdfBaseFontFamily(face) {
  if (!face) return "Helvetica";
  if (face.includes("mono")) return "Courier";
  if (face.includes("Iowan") || face.includes("Didot")) return "Times";
  return "Helvetica";
}
function pdfFontFor(run) {
  const base = pdfBaseFontFamily(run.font);
  if (base === "Times") return run.bold && run.italic ? "Times-BoldItalic" : run.bold ? "Times-Bold" : run.italic ? "Times-Italic" : "Times-Roman";
  if (base === "Courier") return run.bold && run.italic ? "Courier-BoldOblique" : run.bold ? "Courier-Bold" : run.italic ? "Courier-Oblique" : "Courier";
  return run.bold && run.italic ? "Helvetica-BoldOblique" : run.bold ? "Helvetica-Bold" : run.italic ? "Helvetica-Oblique" : "Helvetica";
}
// De oude HTML-schaal (<font size="N">, 1 t/m 7, 3 = standaard) omgerekend
// naar een factor t.o.v. de basisgrootte — dezelfde verhoudingen die
// browsers zelf gebruiken voor size 1..7 bij een 16px-basis.
const HTML_FONT_SIZE_RATIOS = { 1: 10 / 16, 2: 13 / 16, 3: 1, 4: 18 / 16, 5: 24 / 16, 6: 32 / 16, 7: 48 / 16 };
// pdfkit's "continued" runs laten losse stukken tekst met een eigen font achter
// elkaar doorlopen (en samen netjes binnen `width` afbreken) alsof het één
// paragraaf is — zo blijft vet/cursief/lettertype/grootte binnen dezelfde
// alinea werken.
function drawFormattedText(doc, html, x, y, opts = {}) {
  const { width, height, fontSize = 10, color = PALETTE.textPrimary, ellipsis, align } = opts;
  doc.fontSize(fontSize);
  const lines = pdfParseRichHtml(String(html || ""));
  let first = true;
  lines.forEach((lineRuns, li) => {
    const runs = lineRuns.length ? lineRuns : [{ text: "", bold: false, italic: false, font: null, color: null, size: null, sizePt: null }];
    runs.forEach((run, ri) => {
      const lastRunOfLine = ri === runs.length - 1;
      const lastRunOverall = li === lines.length - 1 && lastRunOfLine;
      // Een gekozen puntgrootte is absoluut en gaat vóór op de oude
      // verhoudingsschaal, die alleen nog voor bestaande tekst geldt.
      const runSize = run.sizePt || fontSize * (HTML_FONT_SIZE_RATIOS[run.size] || 1);
      doc.font(pdfFontFor(run)).fontSize(runSize).fillColor(run.color || color);
      const textOpts = { continued: !lastRunOfLine, width, align, ellipsis: lastRunOverall ? ellipsis : undefined };
      if (first) { doc.text(run.text, x, y, { ...textOpts, height }); first = false; }
      else doc.text(run.text, textOpts);
    });
  });
  doc.font("Helvetica").fontSize(fontSize);
}

// Zelfde crop-wiskunde als de CSS object-position/transform in de editor:
// schaal de foto zodat 'm het kader precies vult ("cover"), vermenigvuldig
// met de extra inzoom, en schuif 'm zo dat het brandpunt (cropX/cropY,
// 0-1) op dezelfde relatieve plek in het kader blijft staan.
function pdfCoverPlacement(imgW, imgH, boxW, boxH, cropX, cropY, zoom) {
  const coverScale = Math.max(boxW / imgW, boxH / imgH);
  const scale = coverScale * (zoom || 1);
  const drawW = imgW * scale, drawH = imgH * scale;
  const offsetX = (drawW - boxW) * (cropX ?? 0.5);
  const offsetY = (drawH - boxH) * (cropY ?? 0.5);
  return { drawX: -offsetX, drawY: -offsetY, drawW, drawH };
}

route("GET", "/api/photobooks/:id/pdf", async (req, res, params) => {
  if (req.tripRole === "viewer") return sendError(res, 403, "Het fotoboek is niet gedeeld");
  const { rows: bookRows } = await query("SELECT * FROM photobooks WHERE id = $1", [params.id]);
  if (!bookRows.length) return sendError(res, 404, "Fotoboek niet gevonden");
  const book = bookRows[0];

  const { rows: pages } = await query(
    "SELECT * FROM photobook_pages WHERE photobook_id = $1 ORDER BY position ASC",
    [params.id]
  );
  const { rows: pagePhotoRows } = await query(
    `SELECT pgp.page_id, pgp.x, pgp.y, pgp.width, pgp.height, pgp.opacity, pgp.corner_radius,
            pgp.crop_x, pgp.crop_y, pgp.crop_zoom, p.data, p.storage_key, p.width AS native_width, p.height AS native_height
     FROM photobook_page_photos pgp
     JOIN photobook_pages pp ON pp.id = pgp.page_id
     JOIN photos p ON p.id = pgp.photo_id
     WHERE pp.photobook_id = $1 ORDER BY pgp.page_id ASC, pgp.position ASC`,
    [params.id]
  );
  // Foto's die in de objectopslag liggen moeten hier wel echt opgehaald worden:
  // een PDF verwijst nergens heen, die bevat de bytes zelf. Naast elkaar, want
  // achter elkaar duurt een boek van veertig pagina's onnodig lang — maar niet
  // allemaal tegelijk, want dan opent een boek van honderdtwintig foto's ook
  // honderdtwintig verbindingen naar de bucket.
  await parallelBeperkt(pagePhotoRows, 8, async (p) => { p.data = await fotoBytes(p); });
  const photosByPage = new Map();
  for (const p of pagePhotoRows) {
    if (!p.data) continue;
    if (!photosByPage.has(p.page_id)) photosByPage.set(p.page_id, []);
    photosByPage.get(p.page_id).push(p);
  }
  // Een achtergrondfoto staat los van de gewone paginafoto's (die zijn er
  // juist bewust uit gehaald toen 'm als achtergrond werd gekozen) — die
  // moeten dus apart opgehaald worden.
  const bgPhotoIds = pages.filter((p) => p.background_type === "photo" && p.background_photo_id).map((p) => p.background_photo_id);
  const bgPhotosById = new Map();
  if (bgPhotoIds.length) {
    const { rows: bgRows } = await query("SELECT id, data, storage_key FROM photos WHERE id = ANY($1)", [bgPhotoIds]);
    await parallelBeperkt(bgRows, 8, async (r) => {
      const bytes = await fotoBytes(r);
      if (bytes) bgPhotosById.set(r.id, bytes);
    });
  }
  const { rows: pageTextBoxRows } = await query(
    `SELECT tb.* FROM photobook_page_textboxes tb
     JOIN photobook_pages pp ON pp.id = tb.page_id
     WHERE pp.photobook_id = $1 ORDER BY tb.page_id ASC, tb.position ASC`,
    [params.id]
  );
  const textBoxesByPage = new Map();
  for (const t of pageTextBoxRows) {
    if (!textBoxesByPage.has(t.page_id)) textBoxesByPage.set(t.page_id, []);
    textBoxesByPage.get(t.page_id).push(t);
  }

  const filename = (book.title || "Fotoboek").replace(/[^a-z0-9 _-]/gi, "").trim() || "Fotoboek";
  // Liggend wisselt gewoon breedte/hoogte om — pdfkit's "layout"-optie doet
  // dat zelf ook zo voor de paginagrootte (zie doc/addPage hieronder).
  const landscape = book.orientation === "landscape";
  const pageW = landscape ? PDF_PAGE_HEIGHT : PDF_PAGE_WIDTH;
  const pageH = landscape ? PDF_PAGE_WIDTH : PDF_PAGE_HEIGHT;

  // Welke pagina ligt links en welke rechts in het opengeslagen boek? Dezelfde
  // indeling als in de app: de kaft staat alleen, daarna liggen ze twee aan
  // twee. Alleen nodig voor een achtergrondfoto die over beide bladzijden
  // loopt — die moet weten welke helft hij hier laat zien.
  const spreadKant = new Map();
  {
    const binnenwerk = pages.filter((p) => p.role !== "cover_front" && p.role !== "cover_back");
    // Boeken van vóór de losse kaftpagina's: pagina één stond alleen.
    const zonderKaft = binnenwerk.length === pages.length ? binnenwerk.slice(1) : binnenwerk;
    zonderKaft.forEach((p, i) => spreadKant.set(p.id, i % 2 === 0 ? "links" : "rechts"));
  }

  const doc = new PDFDocument({ size: "A4", layout: landscape ? "landscape" : "portrait", autoFirstPage: false, margin: 0 });
  // Eerst volledig in het geheugen opbouwen (in plaats van doc.pipe(res)) zodat
  // we een Content-Length kunnen meesturen — de client heeft dat nodig om een
  // echte downloadpercentage-voortgangsbalk te kunnen tonen.
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));

  for (const page of pages) {
    doc.addPage({ size: "A4", layout: landscape ? "landscape" : "portrait", margin: 0 });

    if (page.background_type === "color" && page.background_color) {
      doc.rect(0, 0, pageW, pageH).fill(page.background_color);
    } else if (page.background_type === "photo" && page.background_photo_id) {
      const bgData = bgPhotosById.get(page.background_photo_id);
      if (bgData) {
        try {
          if (page.background_spread) {
            // Eén foto over het opengeslagen boek. Hij wordt over de dubbele
            // breedte gelegd en per pagina schuift hij op, zodat de rechterhelft
            // precies verdergaat waar de linker ophoudt. Buiten de bladzijde
            // afknippen, anders loopt de andere helft over deze pagina heen.
            // Gecentreerd, net als het "center/cover" op het scherm — anders
            // valt de vouw hier op een andere plek in de foto dan in de editor.
            const linkerpagina = spreadKant.get(page.id) !== "rechts";
            doc.save();
            doc.rect(0, 0, pageW, pageH).clip();
            doc.image(bgData, linkerpagina ? 0 : -pageW, 0, { cover: [pageW * 2, pageH], align: "center", valign: "center" });
            doc.restore();
          } else {
            doc.save();
            doc.rect(0, 0, pageW, pageH).clip();
            doc.image(bgData, 0, 0, { cover: [pageW, pageH], align: "center", valign: "center" });
            doc.restore();
          }
          if (page.background_overlay > 0) {
            doc.rect(0, 0, pageW, pageH).fillOpacity(page.background_overlay).fill("#ffffff").fillOpacity(1);
          }
        } catch (err) {
          console.error("Fotoboek-PDF: achtergrondfoto kon niet worden ingevoegd:", err?.message || err);
        }
      }
    }

    for (const ph of (photosByPage.get(page.id) || [])) {
      const x = ph.x * pageW, y = ph.y * pageH;
      const w = ph.width * pageW, h = ph.height * pageH;
      try {
        doc.save();
        // Fractie van de kortste zijde van de pagina, niet van de foto — zo is
        // de ronding op papier voor elke foto even groot, precies zoals de
        // cqmin-eenheid dat in de editor doet. De begrenzing op de halve
        // kortste fotozijde vangt alleen het randgeval af waarin een heel
        // klein fotootje anders een radius groter dan zichzelf zou krijgen.
        const radius = Math.min((ph.corner_radius || 0) * Math.min(pageW, pageH), Math.min(w, h) / 2);
        if (radius > 0) doc.roundedRect(x, y, w, h, radius).clip();
        else doc.rect(x, y, w, h).clip();
        doc.opacity(ph.opacity ?? 1);
        // Zonder bekende pixelafmetingen (oudere foto's van vóór deze kolom
        // bestond) valt terug op pdfkit's eigen gecentreerde cover-crop.
        if (ph.native_width && ph.native_height) {
          const { drawX, drawY, drawW, drawH } = pdfCoverPlacement(ph.native_width, ph.native_height, w, h, ph.crop_x, ph.crop_y, ph.crop_zoom);
          doc.image(ph.data, x + drawX, y + drawY, { width: drawW, height: drawH });
        } else {
          doc.image(ph.data, x, y, { cover: [w, h], align: "center", valign: "center" });
        }
        doc.restore();
      } catch (err) {
        console.error("Fotoboek-PDF: foto kon niet worden ingevoegd:", err?.message || err);
      }
    }

    for (const tb of (textBoxesByPage.get(page.id) || [])) {
      if (!tb.html) continue;
      const x = tb.x * pageW, y = tb.y * pageH;
      const w = tb.width * pageW, h = tb.height * pageH;
      if (tb.background_color && tb.background_color !== "transparent") {
        const { color, alpha } = parseRgbaColor(tb.background_color);
        // Zelfde afgeronde hoeken als de editor/preview (rounded-xl).
        try { doc.roundedRect(x, y, w, h, 8).fillOpacity(alpha).fill(color).fillOpacity(1); } catch { /* ongeldige kleur negeren, tekst gaat gewoon door */ }
      }
      drawFormattedText(doc, tb.html, x + 2, y + 2, { width: Math.max(1, w - 4), height: Math.max(1, h - 4), fontSize: 10, color: PALETTE.textPrimary, align: tb.align });
    }

    if (page.title) {
      // Vrij gepositioneerd zoals een tekstvak (i.p.v. een vaste band
      // bovenaan) — zelfde wit-transparante achtergrond voor leesbaarheid
      // op een drukke foto, alleen niet zelf te kiezen.
      const x = page.title_x * pageW, y = page.title_y * pageH;
      const w = page.title_width * pageW, h = page.title_height * pageH;
      doc.roundedRect(x, y, w, h, 8).fillOpacity(0.85).fill("#ffffff").fillOpacity(1);
      drawFormattedText(doc, page.title, x + 2, y + 2, { width: Math.max(1, w - 4), height: Math.max(1, h - 4), fontSize: 14, color: PALETTE.textPrimary, align: page.title_align });
    }
  }

  await new Promise((resolve) => { doc.on("end", resolve); doc.end(); });
  const buffer = Buffer.concat(chunks);
  res.writeHead(200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}.pdf"`,
    "Content-Length": buffer.length,
  });
  res.end(buffer);
}, { tripScope: "photobooks" });

// Prijsopgave voor drukwerk bij Print API. Bewust een aparte route en geen
// onderdeel van GET /api/photobooks/:id: dit gaat naar een externe partij, mag
// dus traag zijn of falen, en het openen van de editor hoort daar niet op te
// wachten. Een fout hier is geen 500 maar een nette "niet beschikbaar", zodat
// het fotoboek zelf blijft werken als Print API plat ligt of niet is ingesteld.
route("GET", "/api/photobooks/:id/print-quote", async (req, res, params) => {
  if (req.tripRole === "viewer") return sendError(res, 403, "Het fotoboek is niet gedeeld");
  const url = new URL(req.url, "http://localhost");
  const { rows: bookRows } = await query("SELECT orientation FROM photobooks WHERE id = $1", [params.id]);
  if (!bookRows.length) return sendError(res, 404, "Fotoboek niet gevonden");

  const { rows: countRows } = await query(
    "SELECT COUNT(*)::int AS n FROM photobook_pages WHERE photobook_id = $1",
    [params.id]
  );
  const pageCount = countRows[0]?.n || 0;
  if (!pageCount) return sendJson(res, 200, { available: false, reason: "Dit fotoboek heeft nog geen pagina's." });
  if (!printapi.isConfigured()) {
    return sendJson(res, 200, { available: false, reason: "Drukwerk is nog niet ingesteld." });
  }

  const quantity = Math.min(50, Math.max(1, parseInt(url.searchParams.get("quantity"), 10) || 1));
  const country = (url.searchParams.get("country") || "NL").toUpperCase().slice(0, 2);
  try {
    const quote = await printapi.getQuote({
      orientation: bookRows[0].orientation || "portrait",
      pageCount, quantity, country,
    });
    sendJson(res, 200, {
      available: quote.total !== null,
      reason: quote.total === null ? "Print API gaf geen prijs terug." : undefined,
      total: quote.total, currency: quote.currency,
      pageCount: quote.pageCount, quantity: quote.quantity, country: quote.country,
    });
  } catch (err) {
    console.error("Print API prijsopgave mislukt:", err.message);
    sendJson(res, 200, { available: false, reason: "Prijs kon niet worden opgehaald." });
  }
}, { tripScope: "photobooks" });

// ---------- Expenses ----------
route("GET", "/api/trips/:id/expenses", async (req, res, params) => {
  if (req.tripRole === "viewer") return sendJson(res, 200, []);
  const { rows } = await query("SELECT * FROM expenses WHERE trip_id = $1 ORDER BY date ASC NULLS LAST, id ASC", [params.id]);
  sendJson(res, 200, rows);
}, { tripScope: "param" });

// bedrag en datum gingen ongezien door naar een numeric- en een date-kolom.
// Een leeg bedrag (het invoerveld is `required`, maar dat leunt volledig op de
// browser) of een datum als "gisteren" liet Postgres de fout gooien, en die
// kwam als een 500 terug — een serverfout voor iets wat de aanvraag zelf fout
// deed. Nu een 400 met een leesbare reden.
function leesBedrag(waarde) {
  const bedrag = Number(waarde);
  return Number.isFinite(bedrag) && waarde !== "" && waarde !== null && waarde !== undefined ? bedrag : null;
}
function leesDatum(waarde) {
  if (!waarde) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(String(waarde)) ? String(waarde) : undefined;
}
route("POST", "/api/trips/:id/expenses", async (req, res, params, body) => {
  const { category, description, paid_by } = body;
  const amount = leesBedrag(body?.amount);
  if (amount === null) return sendError(res, 400, "Bedrag is verplicht en moet een getal zijn");
  const date = leesDatum(body?.date);
  if (date === undefined) return sendError(res, 400, "Datum moet als jjjj-mm-dd worden meegegeven");
  const { rows } = await query(
    "INSERT INTO expenses (trip_id, date, category, description, amount, paid_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
    [params.id, date, category||null, description, amount, paid_by||null]
  );
  sendJson(res, 201, rows[0]);
}, { tripScope: "param" });

route("PUT", "/api/expenses/:id", async (req, res, params, body) => {
  const { category, description, paid_by } = body;
  const amount = leesBedrag(body?.amount);
  if (amount === null) return sendError(res, 400, "Bedrag is verplicht en moet een getal zijn");
  const date = leesDatum(body?.date);
  if (date === undefined) return sendError(res, 400, "Datum moet als jjjj-mm-dd worden meegegeven");
  const { rows } = await query(
    "UPDATE expenses SET date=$1, category=$2, description=$3, amount=$4, paid_by=$5 WHERE id=$6 RETURNING *",
    [date, category||null, description, amount, paid_by||null, params.id]
  );
  sendJson(res, 200, rows[0]);
}, { tripScope: "expenses" });

route("DELETE", "/api/expenses/:id", async (req, res, params) => {
  await query("DELETE FROM expenses WHERE id = $1", [params.id]);
  res.writeHead(204); res.end();
}, { tripScope: "expenses" });

// ---------- Evaluatie aan het eind van de reis ----------
// De vragen liggen hier vast, niet in de database: ze zijn voor elke reis
// hetzelfde, en een sleutel per vraag maakt het samenvatten mogelijk zonder een
// tabel met vraagteksten erbij.
const EVALUATIE_VRAGEN = [
  { sleutel: "plaats", vraag: "Wat was de leukste plaats?" },
  { sleutel: "hotel", vraag: "Wat was het fijnste hotel?" },
  { sleutel: "restaurant", vraag: "Wat was het leukste restaurant?" },
  { sleutel: "bezichtiging", vraag: "Wat was de leukste bezichtiging?" },
  { sleutel: "shoppen", vraag: "Wat was het leukste shoppen?" },
];
const EVALUATIE_SLEUTELS = new Set(EVALUATIE_VRAGEN.map((v) => v.sleutel));
const EVALUATIE_MAX_TEKEN = 300;
const FOTO_TOP = 5;
// Plek 1 telt vijf punten, plek 5 er één. Zo wint een foto die bij twee mensen
// bovenaan staat het van een foto die bij vijf mensen vijfde staat — dat is wat
// "de mooiste" betekent.
const FOTO_PUNTEN = (positie) => FOTO_TOP + 1 - positie;

// Bij een reis met honderden foto's is een top vijf kiezen geen spel meer maar
// werk: je scrollt een kwartier en geeft het op. Daarom een greep van honderd.
//
// Voor iedereen dezelfde greep, anders stemt de een over foto's die de ander
// nooit gezien heeft en telt de uitslag appels bij peren. "Willekeurig" is
// daarom md5(id + reis): geen echte toevalsgenerator maar een vaste ordening
// die er willekeurig uitziet. Bij elke aanroep dezelfde uitkomst, zonder dat de
// keuze ergens bewaard hoeft te worden — en verdeeld over de hele reis in
// plaats van de eerste honderd dagen.
//
// Foto's waar al op gestemd is blijven er altijd bij, ook als ze buiten de
// greep vallen. Komt er later nog een foto bij, dan verschuift de greep een
// beetje, en zonder deze uitzondering zou er een foto uit de uitslag
// verdwijnen waar iemand zijn nummer één van had gemaakt.
const FOTO_KEUZE_MAX = 100;

async function evaluatieFotoKeuze(tripId) {
  const [{ rows: totaal }, { rows: gestemd }] = await Promise.all([
    query("SELECT COUNT(*)::int AS n FROM photos WHERE trip_id = $1", [tripId]),
    query("SELECT DISTINCT photo_id FROM trip_fotostemmen WHERE trip_id = $1", [tripId]),
  ]);
  if (totaal[0].n <= FOTO_KEUZE_MAX) return { ids: null, totaal: totaal[0].n, max: FOTO_KEUZE_MAX };
  const { rows } = await query(
    `SELECT id FROM photos WHERE trip_id = $1
      ORDER BY md5(id::text || '-' || $1::text) ASC
      LIMIT $2`,
    [tripId, FOTO_KEUZE_MAX]
  );
  const ids = [...new Set([...rows.map((r) => r.id), ...gestemd.map((r) => r.photo_id)])];
  return { ids, totaal: totaal[0].n, max: FOTO_KEUZE_MAX };
}

function schoonAntwoorden(ruw) {
  const uit = {};
  if (!ruw || typeof ruw !== "object") return uit;
  for (const [sleutel, waarde] of Object.entries(ruw)) {
    if (!EVALUATIE_SLEUTELS.has(sleutel)) continue;
    const tekst = String(waarde ?? "").trim().slice(0, EVALUATIE_MAX_TEKEN);
    if (tekst) uit[sleutel] = tekst;
  }
  return uit;
}

// De uitslag: per foto de opgetelde punten, en per vraag ieders antwoord.
// De antwoorden staan al in de reis: de hotels zijn de verblijven, de
// restaurants zijn de activiteiten met die categorie. Een keuzelijst daaruit
// scheelt tikwerk én zorgt dat iedereen dezelfde naam kiest — anders wordt
// "Ryokan Sakura" en "ryokan sakura" twee verschillende antwoorden en telt de
// uitslag ze los.
//
// Er staat altijd "Anders, namelijk…" onder: wie iets bedoelt dat nooit in de
// planning terechtkwam moet dat gewoon kunnen opschrijven.
async function evaluatieKeuzes(tripId) {
  const [{ rows: acts }, { rows: verblijven }, { rows: reis }] = await Promise.all([
    query("SELECT title, location, category FROM activities WHERE trip_id = $1", [tripId]),
    query("SELECT name, address FROM accommodations WHERE trip_id = $1", [tripId]),
    query("SELECT destination FROM trips WHERE id = $1", [tripId]),
  ]);
  const schoon = (lijst) => [...new Set(lijst.map((x) => String(x || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "nl"));
  const titelsVan = (categorieen) =>
    schoon(acts.filter((a) => categorieen.includes(a.category)).map((a) => a.title));

  return {
    // Plaatsen zijn de locatievelden van activiteiten, de adressen waar je
    // sliep, en de bestemming van de reis (die staat er niet altijd als losse
    // activiteit in). Dit zijn nog de rúwe teksten: "Gionmachi, Higashiyama,
    // Kyoto 605-0862". De app maakt er "Kyoto" van met dezelfde opzoeker die
    // het dagboek gebruikt — daar zit de cache, en dat is de enige manier om
    // zeker te weten dat er in de lijst hetzelfde staat als in het dagboek.
    //
    // Van een verblijf alleen het adres, niet de naam: het dagboek valt bij een
    // verblijf zonder adres terug op de naam, maar daar wordt hij daarna alsnog
    // opgezocht. Hier zou "Ryokan Sakura" onopgezocht in de plaatsenlijst
    // blijven staan als het opzoeken niet lukt, en een hotel is geen plaats.
    plaats: schoon([...acts.map((a) => a.location), ...verblijven.map((v) => v.address), reis[0]?.destination]),
    hotel: schoon(verblijven.map((v) => v.name)),
    restaurant: titelsVan(["Restaurant"]),
    bezichtiging: titelsVan(["Bezienswaardigheid", "Museum", "Natuur"]),
    shoppen: titelsVan(["Shopping", "Winkelen"]),
  };
}

async function evaluatieUitslag(tripId) {
  const [{ rows: fotoRijen }, { rows: antwoordRijen }] = await Promise.all([
    query(
      `SELECT v.photo_id, SUM($2 + 1 - v.positie)::int AS punten, COUNT(*)::int AS stemmen,
              MIN(v.positie)::int AS beste_plek
         FROM trip_fotostemmen v
        WHERE v.trip_id = $1
        GROUP BY v.photo_id
        ORDER BY SUM($2 + 1 - v.positie) DESC, COUNT(*) DESC, MIN(v.positie) ASC`,
      [tripId, FOTO_TOP]
    ),
    query(
      `SELECT e.antwoorden, u.id AS user_id, u.name
         FROM trip_evaluaties e JOIN users u ON u.id = e.user_id
        WHERE e.trip_id = $1 AND e.vragen_op IS NOT NULL
        ORDER BY e.vragen_op ASC`,
      [tripId]
    ),
  ]);
  return {
    fotos: fotoRijen.map((r) => ({ photoId: r.photo_id, punten: r.punten, stemmen: r.stemmen, bestePlek: r.beste_plek })),
    vragen: EVALUATIE_VRAGEN.map((v) => ({
      sleutel: v.sleutel,
      vraag: v.vraag,
      antwoorden: antwoordRijen
        .map((r) => ({ naam: firstName({ name: r.name }) || r.name || "Iemand", userId: r.user_id, tekst: (r.antwoorden || {})[v.sleutel] }))
        .filter((a) => a.tekst),
    })),
    aantalIngediend: antwoordRijen.length,
  };
}

// Hoeveel mensen hebben elk onderdeel afgerond? Twee losse tellers, want de
// twee onderdelen staan los van elkaar.
async function evaluatieVoortgang(tripId) {
  const { rows } = await query(
    `SELECT COUNT(*) FILTER (WHERE fotos_op IS NOT NULL)::int AS fotos,
            COUNT(*) FILTER (WHERE vragen_op IS NOT NULL)::int AS vragen
       FROM trip_evaluaties WHERE trip_id = $1`,
    [tripId]
  );
  return { fotos: rows[0].fotos, vragen: rows[0].vragen };
}

// Wie via de deel-link binnenkwam mag de vragen beantwoorden, ook al staat hij
// verder als meekijker in de reis. Dat is het hele punt van die link: de vragen
// zijn leuker met de vrienden erbij die niet mee waren op reis maar wel het
// dagboek hebben gelezen.
async function magVragenDoen(tripId, userId, tripRole) {
  if (tripRole !== "viewer") return true;
  const { rows } = await query(
    "SELECT 1 FROM evaluatie_deelnemers WHERE trip_id = $1 AND user_id = $2", [tripId, userId]);
  return rows.length > 0;
}

route("GET", "/api/trips/:id/evaluatie", async (req, res, params) => {
  const [{ rows: eigen }, { rows: stemmen }, { rows: leden }, keuzes, voortgang, magVragen, { rows: link }, fotoKeuze] = await Promise.all([
    query("SELECT antwoorden, fotos_op, vragen_op FROM trip_evaluaties WHERE trip_id = $1 AND user_id = $2", [params.id, req.user.id]),
    query("SELECT photo_id, positie FROM trip_fotostemmen WHERE trip_id = $1 AND user_id = $2 ORDER BY positie ASC", [params.id, req.user.id]),
    query(
      `SELECT COUNT(*)::int AS n FROM (
         SELECT user_id FROM trip_members WHERE trip_id = $1
         UNION SELECT user_id FROM trips WHERE id = $1 AND user_id IS NOT NULL
       ) x`,
      [params.id]
    ),
    evaluatieKeuzes(params.id),
    evaluatieVoortgang(params.id),
    magVragenDoen(params.id, req.user.id, req.tripRole),
    query("SELECT token FROM evaluatie_links WHERE trip_id = $1", [params.id]),
    evaluatieFotoKeuze(params.id),
  ]);

  // Een meekijker stemt wél mee voor de mooiste foto — die heeft hij allemaal
  // langs zien komen. De vijf vragen zijn dat niet: "het fijnste hotel" kun je
  // alleen beantwoorden als je er geslapen hebt. Tenzij hij via de deel-link
  // binnenkwam: dan is hij juist uitgenodigd om ze te beantwoorden.
  const meekijker = req.tripRole === "viewer";
  const fotosKlaar = !!eigen[0]?.fotos_op;
  const vragenKlaar = !!eigen[0]?.vragen_op;

  // De twee uitslagen staan los van elkaar: wie zijn foto's heeft ingeleverd
  // ziet de fotouitslag, ook als hij de vragen nog niet heeft gedaan. Voor
  // allebei geldt wel: eerst zelf, dan pas kijken.
  const uitslag = (fotosKlaar || vragenKlaar) ? await evaluatieUitslag(params.id) : null;

  sendJson(res, 200, {
    vragen: EVALUATIE_VRAGEN,
    keuzes,
    maxTeken: EVALUATIE_MAX_TEKEN,
    fotoTop: FOTO_TOP,
    fotoKeuze,
    magVragenBeantwoorden: magVragen,
    // Delen is voor wie de reis draait, niet voor wie is uitgenodigd: anders
    // nodigt een genodigde de volgende uit en groeit de kring buiten het zicht
    // van de eigenaar om.
    magDelen: !meekijker,
    deelLink: !meekijker && link[0] ? `${appUrl(req)}/evaluatie/${link[0].token}` : null,
    aantalLeden: leden[0].n,
    voortgang,
    mijn: {
      antwoorden: eigen[0]?.antwoorden || {},
      top: stemmen.map((r) => ({ photoId: r.photo_id, positie: r.positie })),
      fotosOp: eigen[0]?.fotos_op || null,
      vragenOp: eigen[0]?.vragen_op || null,
    },
    uitslagFotos: fotosKlaar ? uitslag.fotos : null,
    uitslagVragen: vragenKlaar ? uitslag.vragen : null,
    aantalVragenIngediend: uitslag ? uitslag.aantalIngediend : 0,
  });
}, { tripScope: "param", allowViewer: true });

// Twee losse onderdelen, dus twee losse routes. Je top vijf inleveren zonder de
// vragen in te vullen moet kunnen, en andersom.
route("PUT", "/api/trips/:id/evaluatie/fotos", async (req, res, params, body) => {
  const ruweTop = Array.isArray(body?.top) ? body.top.slice(0, FOTO_TOP) : [];
  // Alleen foto's van déze reis, en geen dubbele. Zonder deze controle kon je
  // een foto uit een andere reis in je top vijf zetten.
  const fotoIds = [...new Set(ruweTop.map((id) => Number(id)).filter((n) => Number.isInteger(n) && n > 0))];
  let geldigeIds = [];
  if (fotoIds.length) {
    const { rows } = await query("SELECT id FROM photos WHERE trip_id = $1 AND id = ANY($2::int[])", [params.id, fotoIds]);
    const bestaat = new Set(rows.map((r) => r.id));
    geldigeIds = fotoIds.filter((id) => bestaat.has(id));
    if (geldigeIds.length !== fotoIds.length) return sendError(res, 400, "Eén of meer foto's horen niet bij deze reis");

    // Bij een grote reis mag je alleen kiezen uit de greep die iedereen ziet.
    // Anders stemt wie de lijst omzeilt op een foto die de rest nooit onder
    // ogen kreeg, en dat is geen eerlijke uitslag meer.
    const keuze = await evaluatieFotoKeuze(params.id);
    if (keuze.ids && geldigeIds.some((id) => !keuze.ids.includes(id))) {
      return sendError(res, 400, "Eén of meer foto's staan niet in de selectie");
    }
  }

  // In één transactie: eerst de oude stemmen weg, dan de nieuwe erin. Knapt er
  // iets halverwege, dan houd je je oude lijst in plaats van een halve nieuwe.
  await transaction(async (client) => {
    await client.query(
      `INSERT INTO trip_evaluaties (trip_id, user_id, fotos_op, updated_at)
       VALUES ($1,$2,NOW(),NOW())
       ON CONFLICT (trip_id, user_id) DO UPDATE SET
         fotos_op = COALESCE(trip_evaluaties.fotos_op, NOW()), updated_at = NOW()`,
      [params.id, req.user.id]
    );
    await client.query("DELETE FROM trip_fotostemmen WHERE trip_id = $1 AND user_id = $2", [params.id, req.user.id]);
    for (let i = 0; i < geldigeIds.length; i++) {
      await client.query(
        "INSERT INTO trip_fotostemmen (trip_id, user_id, photo_id, positie) VALUES ($1,$2,$3,$4)",
        [params.id, req.user.id, geldigeIds[i], i + 1]
      );
    }
  });

  const uitslag = await evaluatieUitslag(params.id);
  sendJson(res, 200, { ok: true, uitslagFotos: uitslag.fotos, voortgang: await evaluatieVoortgang(params.id) });
}, { tripScope: "param", allowViewer: true });

route("PUT", "/api/trips/:id/evaluatie/vragen", async (req, res, params, body) => {
  // allowViewer staat aan, maar niet voor iedere meekijker: wie alleen een
  // deel-link naar de reis heeft, heeft er niet geslapen en niet gegeten. Wie
  // de QR van de vragen scande wél — die is er expres voor uitgenodigd.
  if (!await magVragenDoen(params.id, req.user.id, req.tripRole)) {
    return sendError(res, 403, "De vragen zijn voor wie mee is geweest");
  }
  const antwoorden = schoonAntwoorden(body?.antwoorden);
  await query(
    `INSERT INTO trip_evaluaties (trip_id, user_id, antwoorden, vragen_op, updated_at)
     VALUES ($1,$2,$3,NOW(),NOW())
     ON CONFLICT (trip_id, user_id) DO UPDATE SET
       antwoorden = EXCLUDED.antwoorden,
       vragen_op = COALESCE(trip_evaluaties.vragen_op, NOW()),
       updated_at = NOW()`,
    [params.id, req.user.id, JSON.stringify(antwoorden)]
  );
  const uitslag = await evaluatieUitslag(params.id);
  sendJson(res, 200, { ok: true, uitslagVragen: uitslag.vragen, aantalVragenIngediend: uitslag.aantalIngediend, voortgang: await evaluatieVoortgang(params.id) });
}, { tripScope: "param", allowViewer: true });

// Opnieuw beginnen. Alleen je eigen inzending: iemand anders uit de uitslag
// halen hoort niet te kunnen, ook niet als je de reis bezit.
//
// Blijft er na het wissen niets van je inzending over, dan gaat de hele rij weg
// in plaats van een lege achter te laten. Anders blijft er een spook in
// trip_evaluaties staan dat in geen enkele teller nog meedoet.
const GEEN_INZENDING_MEER =
  "DELETE FROM trip_evaluaties WHERE trip_id = $1 AND user_id = $2 AND fotos_op IS NULL AND vragen_op IS NULL";

route("DELETE", "/api/trips/:id/evaluatie/fotos", async (req, res, params) => {
  await transaction(async (client) => {
    await client.query("DELETE FROM trip_fotostemmen WHERE trip_id = $1 AND user_id = $2", [params.id, req.user.id]);
    await client.query(
      "UPDATE trip_evaluaties SET fotos_op = NULL, updated_at = NOW() WHERE trip_id = $1 AND user_id = $2",
      [params.id, req.user.id]
    );
    await client.query(GEEN_INZENDING_MEER, [params.id, req.user.id]);
  });
  sendJson(res, 200, { ok: true, voortgang: await evaluatieVoortgang(params.id) });
}, { tripScope: "param", allowViewer: true });

route("DELETE", "/api/trips/:id/evaluatie/vragen", async (req, res, params) => {
  if (!await magVragenDoen(params.id, req.user.id, req.tripRole)) {
    return sendError(res, 403, "De vragen zijn voor wie mee is geweest");
  }
  await transaction(async (client) => {
    await client.query(
      "UPDATE trip_evaluaties SET antwoorden = '{}'::jsonb, vragen_op = NULL, updated_at = NOW() WHERE trip_id = $1 AND user_id = $2",
      [params.id, req.user.id]
    );
    await client.query(GEEN_INZENDING_MEER, [params.id, req.user.id]);
  });
  sendJson(res, 200, { ok: true, voortgang: await evaluatieVoortgang(params.id) });
}, { tripScope: "param", allowViewer: true });

// De deel-link, net als de QR van de fotoquiz. Eén link per reis, en hij blijft
// dezelfde: deel je hem in de familiegroep, dan hoort een tweede keer delen
// niet de eerste link dood te maken.
route("POST", "/api/trips/:id/evaluatie/deellink", async (req, res, params) => {
  const token = crypto.randomBytes(16).toString("hex");
  const { rows } = await query(
    `INSERT INTO evaluatie_links (trip_id, token, created_by) VALUES ($1,$2,$3)
     ON CONFLICT (trip_id) DO UPDATE SET trip_id = EXCLUDED.trip_id
     RETURNING token`,
    [params.id, token, req.user.id]
  );
  sendJson(res, 200, { link: `${appUrl(req)}/evaluatie/${rows[0].token}` });
}, { tripScope: "param" });

// ---------- Spelletjes voor onderweg ----------
//
// Snake en Pong draaien helemaal in de browser; de server houdt alleen bij wie
// de hoogste score heeft. Dat is het punt van spelletjes op een gedeelde reis:
// niet het spelen zelf maar het verslaan van je broer.
const SPELLEN = new Set(["snake", "pong"]);
// Een bovengrens tegen onzin. Niet als beveiliging — de score komt uit de
// browser en is dus per definitie niet te vertrouwen — maar zodat één grap met
// de console de ranglijst niet voorgoed onbruikbaar maakt.
const SPEL_MAX_SCORE = 100000;

route("GET", "/api/trips/:id/spellen", async (req, res, params) => {
  const { rows } = await query(
    `SELECT s.spel, s.score, s.behaald_op, u.id AS user_id, u.name
       FROM spel_scores s JOIN users u ON u.id = s.user_id
      WHERE s.trip_id = $1
      ORDER BY s.spel, s.score DESC, s.behaald_op ASC`,
    [params.id]
  );
  const perSpel = {};
  for (const spel of SPELLEN) perSpel[spel] = [];
  for (const r of rows) {
    if (!perSpel[r.spel]) continue;
    perSpel[r.spel].push({
      userId: r.user_id,
      naam: firstName({ name: r.name }) || r.name || "Iemand",
      score: r.score,
      behaaldOp: r.behaald_op,
    });
  }
  sendJson(res, 200, { ranglijsten: perSpel });
}, { tripScope: "param", allowViewer: true });

route("POST", "/api/trips/:id/spellen/:spel", async (req, res, params, body) => {
  if (!SPELLEN.has(params.spel)) return sendError(res, 404, "Onbekend spel");
  // Eerst het type, dan pas de waarde: Number(null) is 0 en zou als een keurige
  // score van nul binnenkomen, terwijl er in werkelijkheid iets misging bij het
  // versturen. Een echte nul (afgegaan zonder te scoren) komt als getal binnen.
  const ruw = body?.score;
  if (typeof ruw !== "number" || !Number.isFinite(ruw)) return sendError(res, 400, "Ongeldige score");
  const score = Math.floor(ruw);
  if (score < 0 || score > SPEL_MAX_SCORE) return sendError(res, 400, "Ongeldige score");
  // GREATEST in plaats van een vergelijking vooraf: twee tabbladen die na
  // elkaar iets insturen kunnen elkaar anders overschrijven, en dan verliest de
  // hoogste van de twee. behaald_op verspringt alleen als de score echt beter
  // is, zodat "wanneer haalde je dat" bij de juiste poging blijft staan.
  const { rows } = await query(
    `INSERT INTO spel_scores (trip_id, user_id, spel, score) VALUES ($1,$2,$3,$4)
     ON CONFLICT (trip_id, user_id, spel) DO UPDATE SET
       score = GREATEST(spel_scores.score, EXCLUDED.score),
       behaald_op = CASE WHEN EXCLUDED.score > spel_scores.score THEN NOW() ELSE spel_scores.behaald_op END
     RETURNING score`,
    [params.id, req.user.id, params.spel, score]
  );
  // Alleen de stand terug. Of dit een persoonlijk record was weet de app zelf
  // het beste: die had de ranglijst al opgehaald voordat het spel begon.
  sendJson(res, 200, { ok: true, beste: rows[0].score });
}, { tripScope: "param", allowViewer: true });

// ---------- Packing list ----------
route("GET", "/api/trips/:id/packing", async (req, res, params) => {
  const { rows } = await query("SELECT * FROM packing_items WHERE trip_id = $1 ORDER BY category, created_at ASC", [params.id]);
  sendJson(res, 200, rows);
}, { tripScope: "param" });

route("POST", "/api/trips/:id/packing", async (req, res, params, body) => {
  const { category, item } = body;
  if (!item) return sendError(res, 400, "Item is verplicht");
  const { rows } = await query(
    "INSERT INTO packing_items (trip_id, category, item) VALUES ($1,$2,$3) RETURNING *",
    [params.id, category || "Overig", item]
  );
  sendJson(res, 201, rows[0]);
}, { tripScope: "param" });

route("PUT", "/api/packing/:id", async (req, res, params, body) => {
  const { category, item, checked } = body;
  const { rows } = await query(
    "UPDATE packing_items SET category=COALESCE($1,category), item=COALESCE($2,item), checked=COALESCE($3,checked) WHERE id=$4 RETURNING *",
    [category ?? null, item ?? null, checked ?? null, params.id]
  );
  sendJson(res, 200, rows[0]);
}, { tripScope: "packing_items" });

route("DELETE", "/api/packing/:id", async (req, res, params) => {
  await query("DELETE FROM packing_items WHERE id = $1", [params.id]);
  res.writeHead(204); res.end();
}, { tripScope: "packing_items" });

// Cross-origin toegang, alleen voor herkomsten die hier expliciet genoemd zijn.
// Dit stond bewust helemaal dicht toen app en API op dezelfde herkomst draaiden.
// Een app-schil draait dat niet: daar is de pagina een lokaal bestand met een
// eigen herkomst (capacitor://localhost op iOS, https://localhost op Android),
// en zonder deze headers weigert de webview elk verzoek naar de server.
//
// Nog steeds geen "*": met credentials verbiedt de browser dat sowieso, maar
// belangrijker is dat een lijst iets anders is dan een deur die openstaat. Wat
// er niet in APP_HERKOMSTEN staat, komt er niet in. Zonder die variabele
// verandert er niets aan de huidige situatie.
const APP_HERKOMSTEN = new Set(
  String(process.env.APP_HERKOMSTEN || process.env.APP_ORIGINS || "")
    .split(",").map((h) => h.trim()).filter(Boolean)
);

function zetHerkomstHeaders(req, res) {
  const herkomst = req.headers.origin;
  if (!herkomst || !APP_HERKOMSTEN.has(herkomst)) return;
  res.setHeader("Access-Control-Allow-Origin", herkomst);
  // Zonder Vary zou een cache het antwoord voor de ene herkomst aan de andere
  // kunnen geven.
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "600");
}

// ---------- Server ----------
const server = http.createServer(async (req, res) => {
  // Geen Access-Control-Allow-Origin meer: de app en de API draaien op
  // dezelfde herkomst, dus er is niets dat cross-origin hoeft te lezen.
  // "*" stond er breed open; zonder credentials viel er weinig mee te
  // halen, maar niets openzetten is nog altijd minder dan alles.
  setSecurityHeaders(res);
  zetHerkomstHeaders(req, res);
  const url = new URL(req.url, `http://localhost`);
  const pathname = url.pathname;

  // Timing voor de performance-cockpit — bewust vóór elke branch, zodat ook
  // een 401/404/statische respons meetelt. "finish" vuurt ongeacht welk
  // codepad de respons daadwerkelijk verstuurde (sendJson, sendError, of een
  // rechtstreekse res.writeHead), dus dit hoeft nergens anders aangeraakt te
  // worden. req._routePattern wordt hieronder gezet zodra matchRoute iets
  // vindt; zonder match valt het terug op het pad zelf.
  const metricsStartNs = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - metricsStartNs) / 1e6;
    recordMetric({ method: req.method, route: req._routePattern || pathname, status: res.statusCode, durationMs });
  });

  // De voorvraag die de browser stelt voordat hij een cross-origin verzoek met
  // sessie mag sturen. De headers zijn er hierboven al opgezet.
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (pathname.startsWith("/auth/") || pathname.startsWith("/invite/")
      || pathname.startsWith("/quiz/") || pathname.startsWith("/evaluatie/")) {
    try {
      // matchRoute percent-decodes path params and throws URIError on malformed
      // input (e.g. "/invite/%"), so it must stay inside the try — an escaped
      // rejection from this async handler would terminate the process.
      const match = matchRoute(req.method, pathname);
      if (!match) { res.writeHead(404); res.end(); return; }
      req._routePattern = match.pattern;
      let body = {};
      if (["POST", "PUT", "PATCH"].includes(req.method)) {
        const raw = await new Promise((resolve, reject) => {
          const chunks = [];
          req.on("data", (c) => chunks.push(c));
          req.on("end", () => resolve(Buffer.concat(chunks)));
          req.on("error", reject);
        });
        req._rawBody = raw;
        const ct = req.headers["content-type"] || "";
        if (ct.includes("application/x-www-form-urlencoded")) {
          body = Object.fromEntries(new URLSearchParams(raw.toString()));
        } else {
          try { body = raw.length ? JSON.parse(raw.toString("utf8")) : {}; } catch {}
        }
      }
      await match.handler(req, res, match.params, body);
    }
    catch (err) { console.error(err); if (!res.headersSent) { res.writeHead(302, { Location: "/login?error=1" }); res.end(); } }
    return;
  }

  if (pathname.startsWith("/api/")) {
    try {
      // getSession hits the DB and matchRoute can throw URIError on malformed
      // percent-encoding; both must stay inside the try so a transient DB error
      // or a crafted URL returns 500 instead of killing the process.
      const user = await getSession(req);
      // Eén uitzondering op de inlogplicht: de kaartinstellingen. Gasten gebruiken
      // de app zonder account, en zonder deze waarden valt hun kaart terug op de
      // standaard tegels. Het gaat om een publiek Mapbox-token, dat hoort in de
      // browser thuis; geheime tokens worden hierboven al geweigerd.
      if (!user && !(req.method === "GET" && PUBLIC_API_GETS.has(pathname))) {
        sendError(res, 401, "Niet ingelogd");
        return;
      }
      const match = matchRoute(req.method, pathname);
      if (!match) { sendError(res, 404, "Not found"); return; }
      req._routePattern = match.pattern;
      const body = ["POST", "PUT", "PATCH"].includes(req.method) ? await readBody(req) : {};
      req.user = user;
      if (match.tripScope) {
        const tripId = await resolveTripId(match.tripScope, match.params);
        const role = tripId ? await getTripRole(tripId, user.id) : null;
        // Reads require membership; writes additionally require more than viewer.
        if (!role) return sendError(res, 403, "Geen toegang tot deze reis");
        if (role === "viewer" && req.method !== "GET" && !match.allowViewer) {
          return sendError(res, 403, "Alleen-lezen toegang: wijzigen kan niet");
        }
        req.tripRole = role;
      }
      await match.handler(req, res, match.params, body);
    } catch (err) {
      console.error(err);
      // Alleen fouten die bewust met een statuscode zijn opgeworpen dragen een
      // tekst die voor de gebruiker bedoeld is (bijvoorbeeld "Verzoek te groot").
      // Al het andere is onverwacht — daarvan lekte de ruwe foutmelding naar
      // buiten, inclusief database- en schemadetails waar niemand iets aan heeft
      // en die een aanvaller juist wél helpen. Die blijft nu in het log staan.
      if (!res.headersSent) {
        if (err.statusCode) sendError(res, err.statusCode, err.message);
        else sendError(res, 500, "Er ging iets mis op de server. Probeer het opnieuw.");
      }
    }
    return;
  }

  // Tells you at a glance which build is actually live — a failed deploy leaves
  // the previous release serving, which is otherwise hard to spot from outside.
  if (pathname === "/version") {
    let assetVersion = null;
    try {
      const shell = fs.readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf8");
      assetVersion = (shell.match(/app\.js\?v=(\d+)/) || [])[1] || null;
    } catch {}
    sendJson(res, 200, {
      asset_version: assetVersion,
      started_at: STARTED_AT.toISOString(),
      uptime_seconds: Math.round(process.uptime()),
      node: process.version,
    });
    return;
  }

  // Bij het opstarten gebouwde app-assets (zie buildAssets hierboven).
  if (pathname === "/app.js" && built.js) {
    sendBuilt(req, res, built.js, built.jsEtag, "application/javascript; charset=utf-8", "js");
    return;
  }
  if (pathname === "/app.css" && built.css) {
    sendBuilt(req, res, built.css, built.cssEtag, "text/css; charset=utf-8", "css");
    return;
  }
  // De service worker met de versie van deze uitrol erin. Nooit cachen: dit is
  // het bestand waarmee de browser mérkt dat er een nieuwe versie is.
  if (pathname === "/sw.js" && built.sw) {
    // Mag nooit gecacht worden — dit is het bestand dat bepaalt wat er verder
    // wél gecacht wordt — maar inpakken mag wel, en het wordt bij elke start
    // opgehaald.
    verstuur(req, res, 200, {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    }, built.sw);
    return;
  }
  // Bibliotheken uit node_modules. Alleen wat in VENDOR_FILES staat — de sleutel
  // is een vaste naam, dus er valt niets uit het pad te construeren.
  if (pathname.startsWith("/vendor/")) {
    const naam = pathname.slice("/vendor/".length);
    const doel = VENDOR_FILES[naam];
    if (!doel) { res.writeHead(404); res.end("Not found"); return; }
    fs.readFile(path.join(__dirname, "node_modules", doel), (err, data) => {
      if (err) { res.writeHead(404); res.end("Not found"); return; }
      verstuur(req, res, 200, {
        "Content-Type": VENDOR_MIME[path.extname(naam)] || "application/octet-stream",
        // Vaste versies uit package.json, dus deze mogen lang gecacht worden.
        "Cache-Control": "public, max-age=31536000, immutable",
      }, data);
    });
    return;
  }

  // Static files
  if (pathname === "/login") { serveStatic(res, path.join(PUBLIC_DIR, "login.html")); return; }
  // Zonder deze regel valt /privacy terug op de app-schil (geen bestandsextensie
  // = onbekende route = index.html), en dan krijgt de App Store-reviewer die de
  // privacylink aanklikt de inlogpagina te zien.
  if (pathname === "/privacy") { serveStatic(res, path.join(PUBLIC_DIR, "privacy.html")); return; }
  let filePath = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(filePath)) {
    // Only unknown *routes* fall back to the SPA shell. Asset paths must 404, or
    // a missing file (e.g. an icon) silently returns HTML with a 200 and the
    // failure is invisible.
    if (path.extname(pathname)) { res.writeHead(404); res.end("Not found"); return; }
    filePath = path.join(PUBLIC_DIR, "index.html");
  }
  // ?v=NN makes the URL content-addressed, so the response can be cached forever.
  serveStatic(res, filePath, { versioned: url.searchParams.has("v") });
});

// Legacy HEIC photos and missing thumbnails are repaired lazily on first view
// by the /raw and /thumb handlers, so there is deliberately no startup backfill:
// HEIC decoding is pure JS and blocks the event loop for seconds per photo, which
// made every deploy stall the server for minutes and retried permanent failures
// on every single boot.
initDb()
  .then(buildAssets)
  .then(() => {
    server.listen(PORT, () => console.log(`Reisplanner draait op http://localhost:${PORT}`));
    console.log(mailProvider()
      ? `E-mailnotificaties actief via ${mailProvider()}.`
      : "E-mailnotificaties staan uit (geen RESEND_API_KEY of POSTMARK_TOKEN ingesteld).");
    setInterval(() => {
      flushNotifications().catch((err) => console.error("Notification sweep failed:", err.message));
      flushPushes().catch((err) => console.error("Push sweep failed:", err.message));
      ruimObjectenOp().catch((err) => console.error("Opruimen objectopslag mislukt:", err.message));
    }, NOTIFY_SWEEP_MS).unref();
    console.log(opslag.actief()
      ? `Foto's gaan naar de objectopslag (${opslag.config().bucket}).`
      : "Foto's staan in de database (geen S3_BUCKET ingesteld).");
  })
  .catch((err) => {
    console.error("Database init failed:", err.message);
    process.exit(1);
  });
