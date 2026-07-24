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
  return token;
}

function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`);
}

async function handlePostLogin(req, res, user) {
  const sessionToken = await createSession(user.id);
  const cookies = [`session=${sessionToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`];
  let redirect = "/";

  const { invite } = parseCookies(req);
  if (invite) {
    const { rows } = await query("SELECT * FROM trip_invites WHERE token = $1", [invite]);
    if (rows.length) {
      await query("INSERT INTO trip_members (trip_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [rows[0].trip_id, user.id]);
      redirect = `/?trip=${rows[0].trip_id}`;
    }
    cookies.push("invite=; HttpOnly; Path=/; Max-Age=0");
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
  // Verify signature and expiry only — audience validation left to app logic
  return jwt.verify(idToken, pubKey, { algorithms: ["RS256"] });
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
    // Never let the browser (esp. iOS standalone PWAs) cache the app shell —
    // without this, a device can silently keep serving an old index.html/app.js
    // after a fresh deploy.
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "no-cache, must-revalidate" });
    res.end(data);
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

  await query("INSERT INTO trip_members (trip_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [rows[0].trip_id, user.id]);
  res.writeHead(302, { Location: `/?trip=${rows[0].trip_id}` });
  res.end();
});

route("POST", "/api/trips/:id/invite", async (req, res, params) => {
  const { rows } = await query("SELECT id FROM trips WHERE id = $1 AND user_id = $2", [params.id, req.user.id]);
  if (!rows.length) return sendError(res, 403, "Alleen de eigenaar kan uitnodigen");
  const token = crypto.randomBytes(16).toString("hex");
  await query("INSERT INTO trip_invites (token, trip_id, created_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [token, params.id, req.user.id]);
  sendJson(res, 200, { link: `${appUrl(req)}/invite/${token}` });
});

// ---------- Admin routes ----------
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

route("PATCH", "/api/admin/trips/:id/assign", async (req, res, params, body) => {
  if (!req.user.is_admin) return sendError(res, 403, "Geen toegang");
  const { user_id } = body;
  const { rows } = await query("UPDATE trips SET user_id = $1 WHERE id = $2 RETURNING *", [user_id, params.id]);
  if (!rows.length) return sendError(res, 404, "Trip not found");
  sendJson(res, 200, rows[0]);
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

// ---------- Trip routes ----------
route("GET", "/api/trips", async (req, res) => {
  const { rows } = await query(`
    SELECT t.*, (t.user_id = $1) as is_owner,
      COALESCE(SUM(e.amount), 0) as total_spent,
      COUNT(DISTINCT a.id) as activity_count
    FROM trips t
    LEFT JOIN expenses e ON e.trip_id = t.id
    LEFT JOIN activities a ON a.trip_id = t.id
    WHERE t.user_id = $1 OR EXISTS (SELECT 1 FROM trip_members WHERE trip_id = t.id AND user_id = $1)
    GROUP BY t.id
    ORDER BY t.start_date DESC NULLS LAST, t.created_at DESC
  `, [req.user.id]);
  sendJson(res, 200, rows);
});

route("GET", "/api/trips/:id", async (req, res, params) => {
  const { rows } = await query(
    "SELECT *, (user_id = $2) as is_owner FROM trips WHERE id = $1 AND (user_id = $2 OR EXISTS (SELECT 1 FROM trip_members WHERE trip_id = $1 AND user_id = $2))",
    [params.id, req.user.id]
  );
  if (!rows.length) return sendError(res, 404, "Trip not found");
  sendJson(res, 200, rows[0]);
});

route("POST", "/api/trips", async (req, res, params, body) => {
  const { name, destination, start_date, end_date, budget, currency, status, notes, cover_color, cover_image } = body;
  if (!name) return sendError(res, 400, "Name is required");
  const { rows } = await query(
    `INSERT INTO trips (name, destination, start_date, end_date, budget, currency, status, notes, cover_color, cover_image, user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [name, destination||null, start_date||null, end_date||null, budget||null, currency||"EUR", status||"planning", notes||null, cover_color||"#7c3aed", cover_image||null, req.user.id]
  );
  // Auto-create day entries if dates are set
  if (start_date && end_date) {
    const trip = rows[0];
    const start = new Date(start_date);
    const end = new Date(end_date);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      await query("INSERT INTO days (trip_id, date) VALUES ($1, $2)", [trip.id, d.toISOString().slice(0, 10)]);
    }
  }
  sendJson(res, 201, rows[0]);
});

route("PUT", "/api/trips/:id", async (req, res, params, body) => {
  const { name, destination, start_date, end_date, budget, currency, status, notes, cover_color, cover_image } = body;
  const { rows } = await query(
    `UPDATE trips SET name=$1, destination=$2, start_date=$3, end_date=$4, budget=$5, currency=$6, status=$7, notes=$8, cover_color=$9, cover_image=$10
     WHERE id=$11 AND user_id=$12 RETURNING *`,
    [name, destination||null, start_date||null, end_date||null, budget||null, currency||"EUR", status||"planning", notes||null, cover_color||"#7c3aed", cover_image||null, params.id, req.user.id]
  );
  if (!rows.length) return sendError(res, 404, "Trip not found");
  sendJson(res, 200, rows[0]);
});

route("DELETE", "/api/trips/:id", async (req, res, params) => {
  await query("DELETE FROM trips WHERE id = $1 AND user_id = $2", [params.id, req.user.id]);
  res.writeHead(204); res.end();
});

// ---------- Days & activities ----------
route("GET", "/api/trips/:id/days", async (req, res, params) => {
  const { rows: days } = await query("SELECT * FROM days WHERE trip_id = $1 ORDER BY date ASC", [params.id]);
  const { rows: acts } = await query("SELECT * FROM activities WHERE trip_id = $1 ORDER BY time ASC NULLS LAST, id ASC", [params.id]);
  const result = days.map((d) => ({ ...d, activities: acts.filter((a) => a.day_id === d.id) }));
  sendJson(res, 200, result);
});

route("POST", "/api/trips/:id/days", async (req, res, params, body) => {
  const { date, title, notes } = body;
  const { rows } = await query(
    "INSERT INTO days (trip_id, date, title, notes) VALUES ($1,$2,$3,$4) RETURNING *",
    [params.id, date, title||null, notes||null]
  );
  sendJson(res, 201, { ...rows[0], activities: [] });
});

route("PUT", "/api/days/:id", async (req, res, params, body) => {
  const { title, notes } = body;
  const { rows } = await query("UPDATE days SET title=$1, notes=$2 WHERE id=$3 RETURNING *", [title||null, notes||null, params.id]);
  sendJson(res, 200, rows[0]);
});

route("DELETE", "/api/days/:id", async (req, res, params) => {
  await query("DELETE FROM days WHERE id = $1", [params.id]);
  res.writeHead(204); res.end();
});

route("POST", "/api/days/:id/activities", async (req, res, params, body) => {
  const { trip_id, time, title, location, notes, category, cost } = body;
  const { rows } = await query(
    "INSERT INTO activities (day_id, trip_id, time, title, location, notes, category, cost) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
    [params.id, trip_id, time||null, title, location||null, notes||null, category||"activity", cost||null]
  );
  sendJson(res, 201, rows[0]);
});

route("PUT", "/api/activities/:id", async (req, res, params, body) => {
  const { time, title, location, notes, category, cost } = body;
  const { rows } = await query(
    "UPDATE activities SET time=$1, title=$2, location=$3, notes=$4, category=$5, cost=$6 WHERE id=$7 RETURNING *",
    [time||null, title, location||null, notes||null, category||"activity", cost||null, params.id]
  );
  sendJson(res, 200, rows[0]);
});

route("DELETE", "/api/activities/:id", async (req, res, params) => {
  await query("DELETE FROM activities WHERE id = $1", [params.id]);
  res.writeHead(204); res.end();
});

// ---------- Date validation helper ----------
function checkDateInRange(dateStr, tripStart, tripEnd) {
  if (!dateStr || !tripStart || !tripEnd) return null;
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
  sendJson(res, 200, rows);
});

route("POST", "/api/trips/:id/accommodations", async (req, res, params, body) => {
  const { name, check_in, check_out, address, booking_ref, cost, notes } = body;
  const { rows: tripRows } = await query("SELECT start_date, end_date FROM trips WHERE id = $1", [params.id]);
  const trip = tripRows[0];
  const err = checkDateInRange(check_in, trip?.start_date, trip?.end_date) || checkDateInRange(check_out, trip?.start_date, trip?.end_date);
  if (err) return sendError(res, 400, err);
  const { rows } = await query(
    "INSERT INTO accommodations (trip_id, name, check_in, check_out, address, booking_ref, cost, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
    [params.id, name, check_in||null, check_out||null, address||null, booking_ref||null, cost||null, notes||null]
  );
  sendJson(res, 201, rows[0]);
});

route("PUT", "/api/accommodations/:id", async (req, res, params, body) => {
  const { name, check_in, check_out, address, booking_ref, cost, notes } = body;
  const { rows } = await query(
    "UPDATE accommodations SET name=$1, check_in=$2, check_out=$3, address=$4, booking_ref=$5, cost=$6, notes=$7 WHERE id=$8 RETURNING *",
    [name, check_in||null, check_out||null, address||null, booking_ref||null, cost||null, notes||null, params.id]
  );
  sendJson(res, 200, rows[0]);
});

route("DELETE", "/api/accommodations/:id", async (req, res, params) => {
  await query("DELETE FROM accommodations WHERE id = $1", [params.id]);
  res.writeHead(204); res.end();
});

route("GET", "/api/accommodations/:id/ai-tip", async (req, res, params) => {
  const { rows } = await query(
    `SELECT a.*, t.destination FROM accommodations a JOIN trips t ON t.id = a.trip_id WHERE a.id = $1`,
    [params.id]
  );
  if (!rows.length) return sendError(res, 404, "Niet gevonden");
  const acc = rows[0];
  const hotelName = acc.name || "dit hotel";
  const city = acc.destination || (acc.address ? acc.address.split(",").slice(-2).join(",").trim() : "");
  const priceInfo = acc.cost ? `De geboekte prijs is €${acc.cost}.` : "";

  const prompt = `Je bent een reisassistent. Geef een korte tip voor het hotel "${hotelName}"${city ? ` in ${city}` : ""}.
${priceInfo}
Geef:
1. De ligging van het hotel t.o.v. bekende bezienswaardigheden of wijken (bijv. afstand tot centrum, toeristische hotspots). Voeg een relevante URL toe (bijv. Google Maps of officiële hotelsite).
2. Twee vergelijkbare hotels in dezelfde stad en prijsklasse als alternatief, elk met een boekings-URL (booking.com, hotels.com of officiële site).
Return ONLY valid JSON, no markdown:
{"location_tip":"...","location_url":"https://...","alternatives":[{"name":"Hotel A","reason":"...","url":"https://..."},{"name":"Hotel B","reason":"...","url":"https://..."}]}`;

  const msg = await anthropicClient.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = msg.content[0].text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  try { sendJson(res, 200, JSON.parse(raw)); }
  catch { sendError(res, 500, "Kon tip niet verwerken"); }
});

// ---------- Transport ----------
route("GET", "/api/trips/:id/transports", async (req, res, params) => {
  const { rows } = await query("SELECT * FROM transports WHERE trip_id = $1 ORDER BY departure_time ASC NULLS LAST", [params.id]);
  sendJson(res, 200, rows);
});

route("POST", "/api/trips/:id/transports", async (req, res, params, body) => {
  const { type, from_location, to_location, departure_time, arrival_time, booking_ref, cost, notes, baggage_allowance } = body;
  const { rows: tripRows } = await query("SELECT start_date, end_date FROM trips WHERE id = $1", [params.id]);
  const trip = tripRows[0];
  const err = checkDateInRange(departure_time, trip?.start_date, trip?.end_date) || checkDateInRange(arrival_time, trip?.start_date, trip?.end_date);
  if (err) return sendError(res, 400, err);
  const { rows } = await query(
    "INSERT INTO transports (trip_id, type, from_location, to_location, departure_time, arrival_time, booking_ref, cost, notes, baggage_allowance) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
    [params.id, type, from_location||null, to_location||null, departure_time||null, arrival_time||null, booking_ref||null, cost||null, notes||null, baggage_allowance||null]
  );
  sendJson(res, 201, rows[0]);
});

route("PUT", "/api/transports/:id", async (req, res, params, body) => {
  const { type, from_location, to_location, departure_time, arrival_time, booking_ref, cost, notes, baggage_allowance } = body;
  const { rows } = await query(
    "UPDATE transports SET type=$1, from_location=$2, to_location=$3, departure_time=$4, arrival_time=$5, booking_ref=$6, cost=$7, notes=$8, baggage_allowance=$9 WHERE id=$10 RETURNING *",
    [type, from_location||null, to_location||null, departure_time||null, arrival_time||null, booking_ref||null, cost||null, notes||null, baggage_allowance||null, params.id]
  );
  sendJson(res, 200, rows[0]);
});

route("DELETE", "/api/transports/:id", async (req, res, params) => {
  await query("DELETE FROM transports WHERE id = $1", [params.id]);
  res.writeHead(204); res.end();
});

// ---------- Photos ----------
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

route("GET", "/api/trips/:id/photos", async (req, res, params) => {
  const { rows } = await query(
    "SELECT id, trip_id, day_id, activity_id, transport_id, accommodation_id, mime_type, caption, taken_at, latitude, longitude, created_at FROM photos WHERE trip_id = $1 ORDER BY created_at ASC",
    [params.id]
  );
  sendJson(res, 200, rows.map((r) => ({ ...r, url: `/api/photos/${r.id}/raw` })));
});

route("POST", "/api/trips/:id/photos", async (req, res, params, body) => {
  const { day_id, activity_id, transport_id, accommodation_id, image, caption, taken_at, latitude, longitude } = body;
  if (!image?.data || !image?.mediaType) return sendError(res, 400, "Geen afbeelding opgegeven");
  const buffer = Buffer.from(image.data, "base64");
  if (buffer.length > MAX_PHOTO_BYTES) return sendError(res, 413, "Afbeelding is te groot (max 8 MB)");
  const lat = typeof latitude === "number" && latitude >= -90 && latitude <= 90 ? latitude : null;
  const lon = typeof longitude === "number" && longitude >= -180 && longitude <= 180 ? longitude : null;
  // Content hash de-dupes identical photos within a trip: re-uploading the same
  // bytes reassigns the existing row's target instead of storing a duplicate blob.
  const contentHash = crypto.createHash("md5").update(buffer).digest("hex");
  const { rows } = await query(
    `INSERT INTO photos (trip_id, day_id, activity_id, transport_id, accommodation_id, mime_type, data, caption, taken_at, latitude, longitude, content_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (trip_id, content_hash) WHERE content_hash IS NOT NULL DO UPDATE SET
       day_id = EXCLUDED.day_id,
       activity_id = EXCLUDED.activity_id,
       transport_id = EXCLUDED.transport_id,
       accommodation_id = EXCLUDED.accommodation_id,
       caption = COALESCE(photos.caption, EXCLUDED.caption),
       taken_at = COALESCE(photos.taken_at, EXCLUDED.taken_at),
       latitude = COALESCE(photos.latitude, EXCLUDED.latitude),
       longitude = COALESCE(photos.longitude, EXCLUDED.longitude)
     RETURNING id, trip_id, day_id, activity_id, transport_id, accommodation_id, mime_type, caption, taken_at, latitude, longitude, created_at, (xmax = 0) AS inserted`,
    [params.id, day_id || null, activity_id || null, transport_id || null, accommodation_id || null, image.mediaType, buffer, caption || null, taken_at || null, lat, lon, contentHash]
  );
  const { inserted, ...photo } = rows[0];
  sendJson(res, inserted ? 201 : 200, { ...photo, url: `/api/photos/${photo.id}/raw` });
});

route("GET", "/api/photos/:id/raw", async (req, res, params) => {
  const { rows } = await query("SELECT data, mime_type FROM photos WHERE id = $1", [params.id]);
  if (!rows.length) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": rows[0].mime_type, "Cache-Control": "private, max-age=31536000" });
  res.end(rows[0].data);
});

route("PUT", "/api/photos/:id", async (req, res, params, body) => {
  const { day_id, activity_id, transport_id, accommodation_id } = body;
  const { rows } = await query(
    "UPDATE photos SET day_id=$1, activity_id=$2, transport_id=$3, accommodation_id=$4 WHERE id=$5 RETURNING id, trip_id, day_id, activity_id, transport_id, accommodation_id, mime_type, caption, taken_at, latitude, longitude, created_at",
    [day_id || null, activity_id || null, transport_id || null, accommodation_id || null, params.id]
  );
  if (!rows.length) return sendError(res, 404, "Foto niet gevonden");
  sendJson(res, 200, { ...rows[0], url: `/api/photos/${rows[0].id}/raw` });
});

route("DELETE", "/api/photos/:id", async (req, res, params) => {
  await query("DELETE FROM photos WHERE id = $1", [params.id]);
  res.writeHead(204); res.end();
});

// ---------- Journal (dagboek) ----------
function firstName(user) {
  if (!user) return null;
  if (user.given_name) return user.given_name;
  if (user.name) return user.name.trim().split(/\s+/)[0];
  return null;
}

route("GET", "/api/trips/:id/journal", async (req, res, params) => {
  const { rows } = await query(
    `SELECT je.*, u.given_name, u.name AS user_name
     FROM journal_entries je
     LEFT JOIN users u ON u.id = je.user_id
     WHERE je.trip_id = $1
     ORDER BY je.created_at ASC`,
    [params.id]
  );
  sendJson(res, 200, rows.map((r) => {
    const { given_name, user_name, ...entry } = r;
    return { ...entry, author: firstName({ given_name, name: user_name }) };
  }));
});

route("POST", "/api/trips/:id/journal", async (req, res, params, body) => {
  const { day_id, activity_id, transport_id, accommodation_id, title, body: text } = body;
  if (!text || !text.trim()) return sendError(res, 400, "Verhaal mag niet leeg zijn");
  const targets = [["day_id", day_id], ["activity_id", activity_id], ["transport_id", transport_id], ["accommodation_id", accommodation_id]].filter(([, v]) => v);
  if (targets.length !== 1) return sendError(res, 400, "Koppel het verhaal aan precies één dag, activiteit, vervoer of verblijf");
  const [col, val] = targets[0];
  const author = firstName(req.user);

  const existing = await query(`SELECT id FROM journal_entries WHERE ${col} = $1`, [val]);
  if (existing.rows.length) {
    const { rows } = await query(
      "UPDATE journal_entries SET title=$1, body=$2, user_id=$3, updated_at=NOW() WHERE id=$4 RETURNING *",
      [title || null, text, req.user.id, existing.rows[0].id]
    );
    return sendJson(res, 200, { ...rows[0], author });
  }
  const { rows } = await query(
    "INSERT INTO journal_entries (trip_id, day_id, activity_id, transport_id, accommodation_id, title, body, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
    [params.id, day_id || null, activity_id || null, transport_id || null, accommodation_id || null, title || null, text, req.user.id]
  );
  sendJson(res, 201, { ...rows[0], author });
});

route("DELETE", "/api/journal/:id", async (req, res, params) => {
  await query("DELETE FROM journal_entries WHERE id = $1", [params.id]);
  res.writeHead(204); res.end();
});

// ---------- Auth routes ----------
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

route("POST", "/auth/register", async (req, res, params, body) => {
  const { email, password, name } = body;
  if (!email || !password) return sendJson(res, 400, { error: "E-mail en wachtwoord zijn verplicht" });
  if (password.length < 8) return sendJson(res, 400, { error: "Wachtwoord moet minimaal 8 tekens zijn" });
  const existing = await query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
  if (existing.rows.length > 0) return sendJson(res, 409, { error: "Er bestaat al een account met dit e-mailadres" });
  const hash = await hashPassword(password);
  const displayName = name?.trim() || email.split("@")[0];
  const result = await query(
    "INSERT INTO users (email, name, password_hash, email_verified, last_login_at) VALUES ($1, $2, $3, false, NOW()) RETURNING id",
    [email.toLowerCase(), displayName, hash]
  );
  const userId = result.rows[0].id;
  const token = await createSession(userId);
  setSessionCookie(res, token);
  const cookies = parseCookies(req);
  const inviteToken = cookies["invite_token"];
  if (inviteToken) {
    const inv = await query("SELECT trip_id FROM trip_invites WHERE token = $1", [inviteToken]);
    if (inv.rows.length > 0) {
      await query("INSERT INTO trip_members (trip_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [inv.rows[0].trip_id, userId]);
    }
    res.setHeader("Set-Cookie", [...(Array.isArray(res.getHeader("Set-Cookie")) ? res.getHeader("Set-Cookie") : [res.getHeader("Set-Cookie")]), "invite_token=; Path=/; Max-Age=0; HttpOnly"]);
  }
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
  await query("UPDATE users SET last_login_at = NOW(), login_count = COALESCE(login_count, 0) + 1 WHERE id = $1", [user.id]);
  const token = await createSession(user.id);
  setSessionCookie(res, token);
  const cookies = parseCookies(req);
  const inviteToken = cookies["invite_token"];
  if (inviteToken) {
    const inv = await query("SELECT trip_id FROM trip_invites WHERE token = $1", [inviteToken]);
    if (inv.rows.length > 0) {
      await query("INSERT INTO trip_members (trip_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [inv.rows[0].trip_id, user.id]);
    }
    res.setHeader("Set-Cookie", [...(Array.isArray(res.getHeader("Set-Cookie")) ? res.getHeader("Set-Cookie") : [res.getHeader("Set-Cookie")]), "invite_token=; Path=/; Max-Age=0; HttpOnly"]);
  }
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
  const redirectUri = `${appUrl(req)}/auth/apple/callback`;
  const clientId = process.env.APPLE_CLIENT_ID || "(niet ingesteld)";
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
  console.log("Apple Sign In: redirecting to Apple with redirect_uri:", `${appUrl(req)}/auth/apple/callback`);
  res.writeHead(302, { Location: `https://appleid.apple.com/auth/authorize?${params}` });
  res.end();
});

route("GET", "/auth/apple/client-id", async (req, res) => {
  sendJson(res, 200, { clientId: process.env.APPLE_CLIENT_ID || null });
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

// ---------- App icon (SVG, used as PWA icon) ----------
route("GET", "/icon-192.png", async (req, res) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="40" fill="#0369a1"/><text x="96" y="130" font-size="100" text-anchor="middle">✈️</text></svg>`;
  res.writeHead(200, { "Content-Type": "image/svg+xml" });
  res.end(svg);
});
route("GET", "/icon-512.png", async (req, res) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="100" fill="#0369a1"/><text x="256" y="340" font-size="260" text-anchor="middle">✈️</text></svg>`;
  res.writeHead(200, { "Content-Type": "image/svg+xml" });
  res.end(svg);
});

// ---------- AI destination tips ----------
route("GET", "/api/trips/:id/tips", async (req, res, params) => {
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

  const client = anthropicClient;

  if (category) {
    const isEvents = category === "Evenementen & agenda";
    const itemCount = isEvents ? 3 : 2;
    const itemTemplate = `{"text":"tip","url":"https://... of null"}`;
    const prompt = isEvents
      ? `Geef ${itemCount} specifieke festivals, evenementen of markten in de buurt van "${destination}"${dateRange ? ` die plaatsvinden${dateRange}` : periodHint}. Als het een hotelnaam is, gebruik de stad/regio. Voeg per item een relevante website-URL toe (officiële site, ticketsite of informatiesite). Return ONLY valid JSON, no markdown: {"items":[${itemTemplate},${itemTemplate},${itemTemplate}]}`
      : `Geef ${itemCount} praktische reisTips over "${category.toLowerCase()}" voor een bezoeker van "${destination}" in het Nederlands.${periodHint} Als het een hotelnaam is, geef tips voor die stad/regio. Voeg per tip een relevante website-URL toe (app-store, boekingssite, informatiesite, etc.) indien beschikbaar, anders null. Return ONLY valid JSON, no markdown: {"items":[${itemTemplate},${itemTemplate}]}`;

    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = msg.content[0].text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    try {
      const parsed = JSON.parse(raw);
      sendJson(res, 200, { items: parsed.items || [] });
    } catch { sendError(res, 500, "Kon tips niet verwerken"); }
    return;
  }

  // No category — return only did_you_know (shown immediately on mount)
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 150,
    messages: [{ role: "user", content: `Geef één verrassend en weinig bekend feitje over "${destination}" in het Nederlands. Return ONLY valid JSON, no markdown: {"did_you_know":"feitje"}` }],
  });
  const raw = msg.content[0].text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  try { sendJson(res, 200, JSON.parse(raw)); }
  catch { sendError(res, 500, "Kon tips niet verwerken"); }
});

// ---------- Photo suggestion via Unsplash ----------
route("GET", "/api/photo-suggest", async (req, res, params, body) => {
  const url = new URL(req.url, "http://localhost");
  const destination = url.searchParams.get("destination") || "";
  if (!destination) return sendError(res, 400, "Geen bestemming opgegeven");
  if (!process.env.UNSPLASH_ACCESS_KEY) return sendError(res, 503, "UNSPLASH_ACCESS_KEY niet geconfigureerd");

  const apiUrl = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(destination + " travel landscape")}&orientation=landscape&content_filter=high&client_id=${process.env.UNSPLASH_ACCESS_KEY}`;
  const resp = await fetch(apiUrl);
  if (!resp.ok) return sendError(res, 502, "Unsplash API fout");
  const data = await resp.json();
  sendJson(res, 200, {
    url: data.urls.regular,
    thumb: data.urls.small,
    author: data.user.name,
    author_link: data.user.links.html,
  });
});

// ---------- Import (email parsing via Claude) ----------
route("POST", "/api/trips/:id/import", async (req, res, params, body) => {
  const { text, image } = body;
  if (!text?.trim() && !image) return sendError(res, 400, "Geen tekst of afbeelding opgegeven");
  if (!process.env.ANTHROPIC_API_KEY) return sendError(res, 500, "ANTHROPIC_API_KEY niet geconfigureerd");

  const tripRow2 = await query("SELECT start_date, end_date FROM trips WHERE id = $1", [params.id]);
  const toIso = (d) => d ? new Date(d).toISOString().slice(0, 10) : null;
  const tripStartStr = toIso(tripRow2.rows[0]?.start_date);
  const tripEndStr = toIso(tripRow2.rows[0]?.end_date);
  const tripYear = tripStartStr ? tripStartStr.slice(0, 4) : null;
  const tripYearHint = tripYear ? `\nIMPORTANT: This trip takes place from ${tripStartStr} to ${tripEndStr} (year: ${tripYear}). Any date without a year MUST use year ${tripYear}. Never use any other year.` : "";

  const client = anthropicClient;
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

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{ role: "user", content }],
  });

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
});

// ---------- Expenses ----------
route("GET", "/api/trips/:id/expenses", async (req, res, params) => {
  const { rows } = await query("SELECT * FROM expenses WHERE trip_id = $1 ORDER BY date ASC NULLS LAST, id ASC", [params.id]);
  sendJson(res, 200, rows);
});

route("POST", "/api/trips/:id/expenses", async (req, res, params, body) => {
  const { date, category, description, amount, paid_by } = body;
  const { rows } = await query(
    "INSERT INTO expenses (trip_id, date, category, description, amount, paid_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
    [params.id, date||null, category||null, description, amount, paid_by||null]
  );
  sendJson(res, 201, rows[0]);
});

route("PUT", "/api/expenses/:id", async (req, res, params, body) => {
  const { date, category, description, amount, paid_by } = body;
  const { rows } = await query(
    "UPDATE expenses SET date=$1, category=$2, description=$3, amount=$4, paid_by=$5 WHERE id=$6 RETURNING *",
    [date||null, category||null, description, amount, paid_by||null, params.id]
  );
  sendJson(res, 200, rows[0]);
});

route("DELETE", "/api/expenses/:id", async (req, res, params) => {
  await query("DELETE FROM expenses WHERE id = $1", [params.id]);
  res.writeHead(204); res.end();
});

// ---------- Packing list ----------
route("GET", "/api/trips/:id/packing", async (req, res, params) => {
  const { rows } = await query("SELECT * FROM packing_items WHERE trip_id = $1 ORDER BY category, created_at ASC", [params.id]);
  sendJson(res, 200, rows);
});

route("POST", "/api/trips/:id/packing", async (req, res, params, body) => {
  const { category, item } = body;
  if (!item) return sendError(res, 400, "Item is verplicht");
  const { rows } = await query(
    "INSERT INTO packing_items (trip_id, category, item) VALUES ($1,$2,$3) RETURNING *",
    [params.id, category || "Overig", item]
  );
  sendJson(res, 201, rows[0]);
});

route("PUT", "/api/packing/:id", async (req, res, params, body) => {
  const { category, item, checked } = body;
  const { rows } = await query(
    "UPDATE packing_items SET category=COALESCE($1,category), item=COALESCE($2,item), checked=COALESCE($3,checked) WHERE id=$4 RETURNING *",
    [category ?? null, item ?? null, checked ?? null, params.id]
  );
  sendJson(res, 200, rows[0]);
});

route("DELETE", "/api/packing/:id", async (req, res, params) => {
  await query("DELETE FROM packing_items WHERE id = $1", [params.id]);
  res.writeHead(204); res.end();
});

// ---------- Server ----------
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const url = new URL(req.url, `http://localhost`);
  const pathname = url.pathname;

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (pathname.startsWith("/auth/") || pathname.startsWith("/invite/")) {
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
    }
    catch (err) { console.error(err); if (!res.headersSent) { res.writeHead(302, { Location: "/login?error=1" }); res.end(); } }
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

  // Static files
  if (pathname === "/login") { serveStatic(res, path.join(PUBLIC_DIR, "login.html")); return; }
  let filePath = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(filePath)) filePath = path.join(PUBLIC_DIR, "index.html");
  serveStatic(res, filePath);
});

initDb()
  .then(() => {
    server.listen(PORT, () => console.log(`Reisplanner draait op http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("Database init failed:", err.message);
    process.exit(1);
  });
