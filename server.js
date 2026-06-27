require("dotenv").config();
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { query, initDb } = require("./db");
const Anthropic = require("@anthropic-ai/sdk");
const anthropicClient = new Anthropic();

const PORT = process.env.PORT || 3002;
const PUBLIC_DIR = path.join(__dirname, "public");

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

// ---------- Helpers ----------
function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

function sendError(res, status, msg) {
  sendJson(res, status, { error: msg });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
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

async function getSession(req) {
  const { session } = parseCookies(req);
  if (!session) return null;
  const { rows } = await query(
    "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1",
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
      `UPDATE users SET email=COALESCE($1,email), name=COALESCE($2,name), given_name=COALESCE($3,given_name),
       family_name=COALESCE($4,family_name), avatar=COALESCE($5,avatar), locale=COALESCE($6,locale),
       email_verified=COALESCE($7,email_verified), google_id=COALESCE($8,google_id), apple_id=COALESCE($9,apple_id),
       last_login_at=NOW(), login_count=COALESCE(login_count,0)+1 WHERE id=$10 RETURNING *`,
      [email||null, name||null, given_name||null, family_name||null, avatar||null, locale||null,
       email_verified||null, google_id||null, apple_id||null, existing.id]
    );
    return rows[0];
  }
  const { rows } = await query(
    `INSERT INTO users (email, name, given_name, family_name, avatar, locale, email_verified, google_id, apple_id, last_login_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) RETURNING *`,
    [email||null, name||null, given_name||null, family_name||null, avatar||null, locale||null,
     email_verified||false, google_id||null, apple_id||null]
  );
  return rows[0];
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  await query("INSERT INTO sessions (token, user_id) VALUES ($1, $2)", [token, userId]);
  return token;
}

function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`);
}

async function handlePostLogin(req, res, user) {
  const sessionToken = await createSession(user.id);
  res.setHeader("Set-Cookie", `session=${sessionToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`);
  res.writeHead(302, { Location: "/" });
  res.end();
}

function appUrl(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

async function readFormBody(req) {
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
  const headerJson = Buffer.from(headerB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();
  const header = JSON.parse(headerJson);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error(`Apple JWK niet gevonden (kid: ${header.kid})`);
  const pubKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
  return jwt.verify(idToken, pubKey, { algorithms: ["RS256"] });
}

// ---------- Password helpers ----------
function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, hash) => {
      if (err) reject(err);
      else resolve(`${salt}:${hash.toString("hex")}`);
    });
  });
}

function verifyPassword(password, stored) {
  return new Promise((resolve, reject) => {
    const [salt, hash] = stored.split(":");
    crypto.scrypt(password, salt, 64, (err, derived) => {
      if (err) reject(err);
      else resolve(derived.toString("hex") === hash);
    });
  });
}

// ---------- Router ----------
const routes = [];
function route(method, pattern, handler) {
  const keys = [];
  const re = new RegExp("^" + pattern.replace(/:([^/]+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "$");
  routes.push({ method, re, keys, handler });
}

function matchRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method && r.method !== "*") continue;
    const m = pathname.match(r.re);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    return { handler: r.handler, params };
  }
  return null;
}

// ---------- Static files ----------
function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

// ---------- Wine routes ----------
route("GET", "/api/wines/stats", async (req, res) => {
  const { rows: totals } = await query(`
    SELECT
      COUNT(*)::int as total_labels,
      COALESCE(SUM(bottles), 0)::int as total_bottles,
      COALESCE(SUM(CASE WHEN price IS NOT NULL THEN price * bottles ELSE 0 END), 0)::numeric as total_value
    FROM wines WHERE user_id = $1
  `, [req.user.id]);

  const { rows: byType } = await query(`
    SELECT type, COUNT(*)::int as labels, COALESCE(SUM(bottles),0)::int as bottles
    FROM wines WHERE user_id = $1
    GROUP BY type ORDER BY bottles DESC
  `, [req.user.id]);

  const currentYear = new Date().getFullYear();
  const { rows: readyToDrink } = await query(`
    SELECT w.*, ROUND(AVG(t.rating),1)::float as avg_rating
    FROM wines w LEFT JOIN tastings t ON t.wine_id = w.id
    WHERE w.user_id = $1
      AND w.drink_from <= $2
      AND (w.drink_until IS NULL OR w.drink_until >= $2)
      AND w.bottles > 0
    GROUP BY w.id
    ORDER BY w.drink_from ASC
    LIMIT 10
  `, [req.user.id, currentYear]);

  sendJson(res, 200, { ...totals[0], by_type: byType, ready_to_drink: readyToDrink });
});

route("GET", "/api/wines", async (req, res) => {
  const { rows } = await query(`
    SELECT w.*,
      ROUND(AVG(t.rating),1)::float as avg_rating,
      COUNT(t.id)::int as tasting_count
    FROM wines w
    LEFT JOIN tastings t ON t.wine_id = w.id
    WHERE w.user_id = $1
    GROUP BY w.id
    ORDER BY w.created_at DESC
  `, [req.user.id]);
  sendJson(res, 200, rows);
});

route("POST", "/api/wines", async (req, res, params, body) => {
  const { name, producer, vintage_year, region, country, grape_variety, type, price, purchase_date, bottles, rack, notes, label_image, drink_from, drink_until } = body;
  if (!name) return sendError(res, 400, "Naam is verplicht");
  const { rows } = await query(`
    INSERT INTO wines (user_id, name, producer, vintage_year, region, country, grape_variety, type, price, purchase_date, bottles, rack, notes, label_image, drink_from, drink_until)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *
  `, [req.user.id, name, producer||null, vintage_year||null, region||null, country||null, grape_variety||null, type||"Rood", price||null, purchase_date||null, bottles||1, rack||null, notes||null, label_image||null, drink_from||null, drink_until||null]);
  sendJson(res, 201, rows[0]);
});

route("GET", "/api/wines/:id", async (req, res, params) => {
  const { rows } = await query(`
    SELECT w.*, ROUND(AVG(t.rating),1)::float as avg_rating, COUNT(t.id)::int as tasting_count
    FROM wines w LEFT JOIN tastings t ON t.wine_id = w.id
    WHERE w.id = $1 AND w.user_id = $2 GROUP BY w.id
  `, [params.id, req.user.id]);
  if (!rows.length) return sendError(res, 404, "Wijn niet gevonden");
  sendJson(res, 200, rows[0]);
});

route("PUT", "/api/wines/:id", async (req, res, params, body) => {
  const { name, producer, vintage_year, region, country, grape_variety, type, price, purchase_date, bottles, rack, notes, label_image, drink_from, drink_until } = body;
  if (!name) return sendError(res, 400, "Naam is verplicht");
  const { rows } = await query(`
    UPDATE wines SET name=$1, producer=$2, vintage_year=$3, region=$4, country=$5, grape_variety=$6,
      type=$7, price=$8, purchase_date=$9, bottles=$10, rack=$11, notes=$12, label_image=$13, drink_from=$14, drink_until=$15
    WHERE id=$16 AND user_id=$17 RETURNING *
  `, [name, producer||null, vintage_year||null, region||null, country||null, grape_variety||null, type||"Rood", price||null, purchase_date||null, bottles||1, rack||null, notes||null, label_image||null, drink_from||null, drink_until||null, params.id, req.user.id]);
  if (!rows.length) return sendError(res, 404, "Wijn niet gevonden");
  sendJson(res, 200, rows[0]);
});

route("DELETE", "/api/wines/:id", async (req, res, params) => {
  await query("DELETE FROM wines WHERE id = $1 AND user_id = $2", [params.id, req.user.id]);
  res.writeHead(204); res.end();
});

// ---------- Tastings ----------
route("GET", "/api/wines/:id/tastings", async (req, res, params) => {
  const { rows } = await query(
    "SELECT * FROM tastings WHERE wine_id = $1 ORDER BY tasting_date DESC NULLS LAST, created_at DESC",
    [params.id]
  );
  sendJson(res, 200, rows);
});

route("POST", "/api/wines/:id/tastings", async (req, res, params, body) => {
  const { tasting_date, rating, notes, nose, palate, finish } = body;
  const { rows } = await query(`
    INSERT INTO tastings (wine_id, user_id, tasting_date, rating, notes, nose, palate, finish)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
  `, [params.id, req.user.id, tasting_date||null, rating||null, notes||null, nose||null, palate||null, finish||null]);
  sendJson(res, 201, rows[0]);
});

route("PUT", "/api/tastings/:id", async (req, res, params, body) => {
  const { tasting_date, rating, notes, nose, palate, finish } = body;
  const { rows } = await query(`
    UPDATE tastings SET tasting_date=$1, rating=$2, notes=$3, nose=$4, palate=$5, finish=$6
    WHERE id=$7 AND user_id=$8 RETURNING *
  `, [tasting_date||null, rating||null, notes||null, nose||null, palate||null, finish||null, params.id, req.user.id]);
  if (!rows.length) return sendError(res, 404, "Notitie niet gevonden");
  sendJson(res, 200, rows[0]);
});

route("DELETE", "/api/tastings/:id", async (req, res, params) => {
  await query("DELETE FROM tastings WHERE id = $1 AND user_id = $2", [params.id, req.user.id]);
  res.writeHead(204); res.end();
});

// ---------- AI tips ----------
route("GET", "/api/wines/:id/ai-tip", async (req, res, params) => {
  if (!process.env.ANTHROPIC_API_KEY) return sendError(res, 500, "ANTHROPIC_API_KEY niet geconfigureerd");
  const { rows } = await query("SELECT * FROM wines WHERE id = $1 AND user_id = $2", [params.id, req.user.id]);
  if (!rows.length) return sendError(res, 404, "Wijn niet gevonden");
  const wine = rows[0];

  const url = new URL(req.url, "http://localhost");
  const tipType = url.searchParams.get("type") || "pairing";

  const wineDesc = [
    wine.vintage_year,
    wine.producer,
    wine.name,
    wine.region ? `uit ${wine.region}` : null,
    wine.grape_variety ? `(${wine.grape_variety})` : null,
  ].filter(Boolean).join(" ");

  let prompt;
  if (tipType === "pairing") {
    prompt = `Geef 3 specifieke spijscombinaties voor ${wine.type || "wijn"} "${wineDesc}". Return ONLY valid JSON, no markdown: {"pairings":[{"dish":"...","reason":"..."},{"dish":"...","reason":"..."},{"dish":"...","reason":"..."}]}`;
  } else if (tipType === "window") {
    prompt = `Geef advies over het drinkmoment voor ${wine.type || "wijn"} "${wineDesc}"${wine.drink_from ? `. Aangegeven periode: ${wine.drink_from}–${wine.drink_until || "?"}` : ""}. Return ONLY valid JSON, no markdown: {"advice":"...","optimal_year":"...","peak":"..."}`;
  } else {
    prompt = `Geef 3 vergelijkbare wijnen als "${wineDesc}" die de gebruiker kan proberen. Return ONLY valid JSON, no markdown: {"wines":[{"name":"...","producer":"...","region":"...","reason":"..."},{"name":"...","producer":"...","region":"...","reason":"..."},{"name":"...","producer":"...","region":"...","reason":"..."}]}`;
  }

  const msg = await anthropicClient.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = msg.content[0].text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  try { sendJson(res, 200, JSON.parse(raw)); }
  catch { sendError(res, 500, "Kon tip niet verwerken"); }
});

// ---------- Admin ----------
route("GET", "/api/admin/users", async (req, res) => {
  if (!req.user.is_admin) return sendError(res, 403, "Geen toegang");
  const { rows } = await query(`
    SELECT id, name, email, avatar, is_admin, last_login_at, created_at,
           COALESCE(login_count, 0) as login_count
    FROM users ORDER BY created_at DESC
  `);
  sendJson(res, 200, rows);
});

// ---------- Auth routes ----------
route("POST", "/auth/register", async (req, res, params, body) => {
  const { email, password, name } = body;
  if (!email || !password) return sendJson(res, 400, { error: "E-mail en wachtwoord zijn verplicht" });
  if (password.length < 8) return sendJson(res, 400, { error: "Wachtwoord moet minimaal 8 tekens zijn" });
  const existing = await query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
  if (existing.rows.length > 0) return sendJson(res, 409, { error: "Er bestaat al een account met dit e-mailadres" });
  const hash = await hashPassword(password);
  const displayName = name?.trim() || email.split("@")[0];
  const result = await query(
    "INSERT INTO users (email, name, password_hash, email_verified, last_login_at) VALUES ($1,$2,$3,false,NOW()) RETURNING id",
    [email.toLowerCase(), displayName, hash]
  );
  const token = await createSession(result.rows[0].id);
  setSessionCookie(res, token);
  sendJson(res, 200, { ok: true });
});

route("POST", "/auth/login/password", async (req, res, params, body) => {
  const { email, password } = body;
  if (!email || !password) return sendJson(res, 400, { error: "E-mail en wachtwoord zijn verplicht" });
  const result = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
  const user = result.rows[0];
  if (!user || !user.password_hash) return sendJson(res, 401, { error: "Onbekend e-mailadres of onjuist wachtwoord" });
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return sendJson(res, 401, { error: "Onbekend e-mailadres of onjuist wachtwoord" });
  await query("UPDATE users SET last_login_at=NOW(), login_count=COALESCE(login_count,0)+1 WHERE id=$1", [user.id]);
  const token = await createSession(user.id);
  setSessionCookie(res, token);
  sendJson(res, 200, { ok: true });
});

route("GET", "/auth/me", async (req, res) => {
  const user = await getSession(req);
  if (!user) return sendError(res, 401, "Niet ingelogd");
  sendJson(res, 200, { id: user.id, name: user.name, email: user.email, avatar: user.avatar, is_admin: user.is_admin });
});

route("POST", "/auth/logout", async (req, res) => {
  const { session } = parseCookies(req);
  if (session) await query("DELETE FROM sessions WHERE token = $1", [session]);
  res.setHeader("Set-Cookie", "session=; HttpOnly; Path=/; Max-Age=0");
  sendJson(res, 200, { ok: true });
});

route("GET", "/auth/google", async (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${appUrl(req)}/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
  });
  res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  res.end();
});

route("GET", "/auth/google/callback", async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const code = url.searchParams.get("code");
  if (!code) { res.writeHead(302, { Location: "/login?error=1" }); res.end(); return; }
  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, grant_type: "authorization_code", client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: `${appUrl(req)}/auth/google/callback` }),
  });
  const tokenData = await tokenResp.json();
  if (!tokenData.access_token) { res.writeHead(302, { Location: "/login?error=1" }); res.end(); return; }
  const userResp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
  const u = await userResp.json();
  if (!u.sub) { res.writeHead(302, { Location: "/login?error=1" }); res.end(); return; }
  const user = await findOrCreateUser({ google_id: u.sub, email: u.email, name: u.name, given_name: u.given_name, family_name: u.family_name, avatar: u.picture, locale: u.locale, email_verified: u.email_verified });
  await handlePostLogin(req, res, user);
});

route("GET", "/auth/apple", async (req, res) => {
  if (!process.env.APPLE_CLIENT_ID) { res.writeHead(302, { Location: "/login?error=apple-config" }); res.end(); return; }
  const state = crypto.randomBytes(16).toString("hex");
  const params = new URLSearchParams({ client_id: process.env.APPLE_CLIENT_ID, redirect_uri: `${appUrl(req)}/auth/apple/callback`, response_type: "code id_token", scope: "name email", response_mode: "form_post", state });
  res.writeHead(302, { Location: `https://appleid.apple.com/auth/authorize?${params}` });
  res.end();
});

route("POST", "/auth/apple/callback", async (req, res) => {
  const body = await readFormBody(req);
  const appleError = body.get("error");
  if (appleError) { res.writeHead(302, { Location: `/login?error=apple-${appleError}` }); res.end(); return; }
  const idToken = body.get("id_token");
  if (!idToken) { res.writeHead(302, { Location: "/login?error=apple-no-token" }); res.end(); return; }
  let payload;
  try { payload = await verifyAppleIdToken(idToken); }
  catch (err) {
    const code = err.message.includes("expired") ? "expired" : err.message.includes("JWK") ? "jwk" : "invalid";
    res.writeHead(302, { Location: `/login?error=apple-verify-${code}` }); res.end(); return;
  }
  let given_name = null, family_name = null;
  try { const u = JSON.parse(body.get("user") || "{}"); given_name = u.name?.firstName || null; family_name = u.name?.lastName || null; } catch {}
  const name = [given_name, family_name].filter(Boolean).join(" ") || null;
  try {
    const user = await findOrCreateUser({ apple_id: payload.sub, email: payload.email || null, email_verified: payload.email_verified === "true" || payload.email_verified === true, name, given_name, family_name });
    await handlePostLogin(req, res, user);
  } catch { res.writeHead(302, { Location: "/login?error=apple-db" }); res.end(); }
});

// ---------- App icons ----------
route("GET", "/icon-192.png", async (req, res) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="40" fill="#7c2d12"/><text x="96" y="130" font-size="100" text-anchor="middle">🍷</text></svg>`;
  res.writeHead(200, { "Content-Type": "image/svg+xml" }); res.end(svg);
});
route("GET", "/icon-512.png", async (req, res) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="100" fill="#7c2d12"/><text x="256" y="340" font-size="260" text-anchor="middle">🍷</text></svg>`;
  res.writeHead(200, { "Content-Type": "image/svg+xml" }); res.end(svg);
});

// ---------- Server ----------
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const url = new URL(req.url, "http://localhost");
  const pathname = url.pathname;

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (pathname.startsWith("/auth/")) {
    const match = matchRoute(req.method, pathname);
    if (!match) { res.writeHead(404); res.end(); return; }
    try {
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
    } catch (err) {
      console.error(err);
      if (!res.headersSent) { res.writeHead(302, { Location: "/login?error=1" }); res.end(); }
    }
    return;
  }

  if (pathname.startsWith("/api/")) {
    const user = await getSession(req);
    if (!user) { sendError(res, 401, "Niet ingelogd"); return; }
    const match = matchRoute(req.method, pathname);
    if (!match) { sendError(res, 404, "Not found"); return; }
    try {
      const body = ["POST", "PUT", "PATCH"].includes(req.method) ? await readBody(req) : {};
      req.user = user;
      await match.handler(req, res, match.params, body);
    } catch (err) {
      console.error(err);
      sendError(res, 500, err.message);
    }
    return;
  }

  if (pathname === "/login") { serveStatic(res, path.join(PUBLIC_DIR, "login.html")); return; }
  let filePath = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(filePath)) filePath = path.join(PUBLIC_DIR, "index.html");
  serveStatic(res, filePath);
});

initDb()
  .then(() => {
    server.listen(PORT, () => console.log(`Wijnkelder draait op http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("Database init failed:", err.message);
    process.exit(1);
  });
