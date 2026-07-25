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
const { query, initDb } = require("./db");
const Anthropic = require("@anthropic-ai/sdk");
const anthropicClient = new Anthropic();

const PORT = process.env.PORT || 3002;
const STARTED_AT = new Date();
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

// Photos arrive base64-encoded inside JSON (~33% overhead), so the cap has to
// clear MAX_PHOTO_BYTES with room to spare. Without a cap the whole body is
// buffered before any size check runs, so one large request can OOM the process.
const MAX_BODY_BYTES = 16 * 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        const err = new Error("Verzoek te groot");
        err.statusCode = 413;
        req.destroy(err);
        return reject(err);
      }
      chunks.push(c);
    });
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

// Must match the session cookie's Max-Age. The cookie lifetime is enforced only
// by the client, so without a server-side check a leaked token never expired.
const SESSION_TTL_DAYS = 30;

async function getSession(req) {
  const { session } = parseCookies(req);
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
  let redirect = "/";

  const { invite } = parseCookies(req);
  if (invite) {
    const { rows } = await query("SELECT * FROM trip_invites WHERE token = $1", [invite]);
    if (rows.length) {
      await query("INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [rows[0].trip_id, user.id, rows[0].role]);
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
  "photos", "journal_entries", "journal_comments", "expenses", "packing_items",
]);
function route(method, pattern, handler, opts) {
  const keys = [];
  const re = new RegExp("^" + pattern.replace(/:([^/]+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "$");
  // allowViewer opts a write out of the viewer block — commenting on someone's
  // journal entry is the one thing a read-only member is allowed to do.
  routes.push({ method, re, keys, handler, tripScope: opts?.tripScope, allowViewer: opts?.allowViewer === true });
}

function matchRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method && r.method !== "*") continue;
    const m = pathname.match(r.re);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    return { handler: r.handler, params, tripScope: r.tripScope, allowViewer: r.allowViewer };
  }
  return null;
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
const TARGET_TABLES = { day_id: "days", activity_id: "activities", transport_id: "transports", accommodation_id: "accommodations" };

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
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": cacheControl,
      ETag: etag,
    });
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

route("GET", "/api/trips/:id/share-stats", async (req, res, params) => {
  const { rows: tripRows } = await query("SELECT id FROM trips WHERE id = $1 AND user_id = $2", [params.id, req.user.id]);
  if (!tripRows.length) return sendError(res, 403, "Alleen de eigenaar kan dit inzien");

  const { rows: members } = await query(
    `SELECT u.id, u.name, u.given_name, u.email, u.avatar, tm.role,
       (SELECT COUNT(*) FROM trip_views v WHERE v.trip_id = $1 AND v.user_id = u.id) as view_count,
       (SELECT MAX(viewed_at) FROM trip_views v WHERE v.trip_id = $1 AND v.user_id = u.id) as last_viewed_at
     FROM trip_members tm JOIN users u ON u.id = tm.user_id
     WHERE tm.trip_id = $1
     ORDER BY tm.role ASC, u.name ASC NULLS LAST`,
    [params.id]
  );
  const { rows: countRows } = await query(
    `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE viewed_at > NOW() - INTERVAL '24 hours') as last_24h
     FROM trip_views WHERE trip_id = $1`,
    [params.id]
  );
  sendJson(res, 200, {
    members: members.map((m) => ({ ...m, view_count: Number(m.view_count) })),
    total_views: Number(countRows[0].total),
    views_24h: Number(countRows[0].last_24h),
  });
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
  // Without this, an omitted field became NULL and orphaned the trip: it then
  // vanished from every /api/trips listing and only an admin could still see it.
  if (!Number.isInteger(user_id)) return sendError(res, 400, "user_id is verplicht");
  const { rows: exists } = await query("SELECT 1 FROM users WHERE id = $1", [user_id]);
  if (!exists.length) return sendError(res, 400, "Onbekende gebruiker");
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
  const { name, destination, start_date, end_date, budget, currency, status, notes, cover_color, cover_image } = body;
  if (!name) return sendError(res, 400, "Name is required");
  const dateErr = invalidDates({ start_date, end_date });
  if (dateErr) return sendError(res, 400, dateErr);
  const { rows } = await query(
    `INSERT INTO trips (name, destination, start_date, end_date, budget, currency, status, notes, cover_color, cover_image, user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [name, destination||null, start_date||null, end_date||null, budget||null, currency||"EUR", status||"planning", notes||null, cover_color||"#7c3aed", cover_image||null, req.user.id]
  );
  // Auto-create day entries if dates are set. Generated in SQL rather than by
  // stepping a JS Date: "YYYY-MM-DD" parses as UTC midnight while setDate()
  // advances local time, so a daylight-saving transition advanced only 23 hours
  // and toISOString() repeated a date — producing a duplicate day card and
  // dropping the last day of the trip.
  if (start_date && end_date) {
    await query(
      `INSERT INTO days (trip_id, date)
       SELECT $1, gs::date FROM generate_series($2::date, $3::date, interval '1 day') gs`,
      [rows[0].id, start_date, end_date]
    );
  }
  sendJson(res, 201, rows[0]);
});

route("PUT", "/api/trips/:id", async (req, res, params, body) => {
  const { name, destination, start_date, end_date, budget, currency, status, notes, cover_color, cover_image } = body;
  const dateErr = invalidDates({ start_date, end_date });
  if (dateErr) return sendError(res, 400, dateErr);
  const { rows } = await query(
    `UPDATE trips SET name=$1, destination=$2, start_date=$3, end_date=$4, budget=$5, currency=$6, status=$7, notes=$8, cover_color=$9, cover_image=$10
     WHERE id=$11 AND user_id=$12 RETURNING *`,
    [name, destination||null, start_date||null, end_date||null, budget||null, currency||"EUR", status||"planning", notes||null, cover_color||"#7c3aed", cover_image||null, params.id, req.user.id]
  );
  if (!rows.length) return sendError(res, 404, "Trip not found");
  sendJson(res, 200, rows[0]);
}, { tripScope: "param" });

route("DELETE", "/api/trips/:id", async (req, res, params) => {
  await query("DELETE FROM trips WHERE id = $1 AND user_id = $2", [params.id, req.user.id]);
  res.writeHead(204); res.end();
}, { tripScope: "param" });

// ---------- Days & activities ----------
route("GET", "/api/trips/:id/days", async (req, res, params) => {
  const role = req.tripRole;
  const { rows: days } = await query("SELECT * FROM days WHERE trip_id = $1 ORDER BY date ASC", [params.id]);
  const { rows: acts } = await query("SELECT * FROM activities WHERE trip_id = $1 ORDER BY time ASC NULLS LAST, id ASC", [params.id]);
  const result = days.map((d) => ({ ...d, activities: acts.filter((a) => a.day_id === d.id).map((a) => stripCosts(role, a, ["cost"])) }));
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
  const { time, title, location, notes, category, cost } = body;
  if (!title || !String(title).trim()) return sendError(res, 400, "Titel is verplicht");
  // trip_id is derived from the day, never taken from the body — trusting the
  // client there let an editor drop rows into a trip they have no access to.
  const { rows } = await query(
    `INSERT INTO activities (day_id, trip_id, time, title, location, notes, category, cost)
     SELECT $1, d.trip_id, $2, $3, $4, $5, $6, $7 FROM days d WHERE d.id = $1
     RETURNING *`,
    [params.id, time||null, title, location||null, notes||null, category||"activity", cost||null]
  );
  if (!rows.length) return sendError(res, 404, "Dag niet gevonden");
  sendJson(res, 201, rows[0]);
}, { tripScope: "days" });

route("PUT", "/api/activities/:id", async (req, res, params, body) => {
  const { day_id, time, title, location, notes, category, cost } = body;
  if (day_id) {
    const { rows: valid } = await query(
      "SELECT 1 FROM activities a JOIN days d ON d.id = $2 WHERE a.id = $1 AND d.trip_id = a.trip_id",
      [params.id, day_id]
    );
    if (!valid.length) return sendError(res, 400, "Ongeldige dag voor deze reis");
  }
  const { rows } = await query(
    "UPDATE activities SET day_id=COALESCE($1, day_id), time=$2, title=$3, location=$4, notes=$5, category=$6, cost=$7 WHERE id=$8 RETURNING *",
    [day_id || null, time||null, title, location||null, notes||null, category||"activity", cost||null, params.id]
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
  sendJson(res, 200, rows.map((r) => stripCosts(req.tripRole, r, ["cost"])));
}, { tripScope: "param" });

route("POST", "/api/trips/:id/accommodations", async (req, res, params, body) => {
  const { name, check_in, check_out, address, booking_ref, cost, notes } = body;
  const dateErr = invalidDates({ check_in, check_out });
  if (dateErr) return sendError(res, 400, dateErr);
  const { rows: tripRows } = await query("SELECT start_date, end_date FROM trips WHERE id = $1", [params.id]);
  const trip = tripRows[0];
  const err = checkDateInRange(check_in, trip?.start_date, trip?.end_date) || checkDateInRange(check_out, trip?.start_date, trip?.end_date);
  if (err) return sendError(res, 400, err);
  const { rows } = await query(
    "INSERT INTO accommodations (trip_id, name, check_in, check_out, address, booking_ref, cost, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
    [params.id, name, check_in||null, check_out||null, address||null, booking_ref||null, cost||null, notes||null]
  );
  sendJson(res, 201, rows[0]);
}, { tripScope: "param" });

route("PUT", "/api/accommodations/:id", async (req, res, params, body) => {
  const { name, check_in, check_out, address, booking_ref, cost, notes } = body;
  const dateErr = invalidDates({ check_in, check_out });
  if (dateErr) return sendError(res, 400, dateErr);
  const { rows } = await query(
    "UPDATE accommodations SET name=$1, check_in=$2, check_out=$3, address=$4, booking_ref=$5, cost=$6, notes=$7 WHERE id=$8 RETURNING *",
    [name, check_in||null, check_out||null, address||null, booking_ref||null, cost||null, notes||null, params.id]
  );
  sendJson(res, 200, rows[0]);
}, { tripScope: "accommodations" });

route("DELETE", "/api/accommodations/:id", async (req, res, params) => {
  await query("DELETE FROM accommodations WHERE id = $1", [params.id]);
  res.writeHead(204); res.end();
}, { tripScope: "accommodations" });

// ---------- Transport ----------
route("GET", "/api/trips/:id/transports", async (req, res, params) => {
  const { rows } = await query("SELECT * FROM transports WHERE trip_id = $1 ORDER BY departure_time ASC NULLS LAST", [params.id]);
  sendJson(res, 200, rows.map((r) => stripCosts(req.tripRole, r, ["cost"])));
}, { tripScope: "param" });

route("POST", "/api/trips/:id/transports", async (req, res, params, body) => {
  const { type, from_location, to_location, departure_time, arrival_time, booking_ref, cost, notes, baggage_allowance } = body;
  const dateErr = invalidDates({ departure_time, arrival_time });
  if (dateErr) return sendError(res, 400, dateErr);
  const { rows: tripRows } = await query("SELECT start_date, end_date FROM trips WHERE id = $1", [params.id]);
  const trip = tripRows[0];
  const err = checkDateInRange(departure_time, trip?.start_date, trip?.end_date) || checkDateInRange(arrival_time, trip?.start_date, trip?.end_date);
  if (err) return sendError(res, 400, err);
  const { rows } = await query(
    "INSERT INTO transports (trip_id, type, from_location, to_location, departure_time, arrival_time, booking_ref, cost, notes, baggage_allowance) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
    [params.id, type, from_location||null, to_location||null, departure_time||null, arrival_time||null, booking_ref||null, cost||null, notes||null, baggage_allowance||null]
  );
  sendJson(res, 201, rows[0]);
}, { tripScope: "param" });

route("PUT", "/api/transports/:id", async (req, res, params, body) => {
  const { type, from_location, to_location, departure_time, arrival_time, booking_ref, cost, notes, baggage_allowance } = body;
  const dateErr = invalidDates({ departure_time, arrival_time });
  if (dateErr) return sendError(res, 400, dateErr);
  const { rows } = await query(
    "UPDATE transports SET type=$1, from_location=$2, to_location=$3, departure_time=$4, arrival_time=$5, booking_ref=$6, cost=$7, notes=$8, baggage_allowance=$9 WHERE id=$10 RETURNING *",
    [type, from_location||null, to_location||null, departure_time||null, arrival_time||null, booking_ref||null, cost||null, notes||null, baggage_allowance||null, params.id]
  );
  sendJson(res, 200, rows[0]);
}, { tripScope: "transports" });

route("DELETE", "/api/transports/:id", async (req, res, params) => {
  await query("DELETE FROM transports WHERE id = $1", [params.id]);
  res.writeHead(204); res.end();
}, { tripScope: "transports" });

// ---------- Photos ----------
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
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
  if (buffer.length < 12 || buffer.toString("ascii", 4, 8) !== "ftyp") return false;
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
function makeThumbnailPureJs(buffer) {
  const decoded = jpegJs.decode(buffer, { useTArray: true });
  const img = applyOrientation(decoded.data, decoded.width, decoded.height, readExifOrientation(buffer));
  const scale = Math.min(1, THUMB_MAX_EDGE / Math.max(img.width, img.height));
  if (scale >= 1) return jpegJs.encode(img, 75).data;
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
  return jpegJs.encode({ data: out, width: w, height: h }, 75).data;
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

route("GET", "/api/trips/:id/photos", async (req, res, params) => {
  const { rows } = await query(
    "SELECT id, trip_id, day_id, activity_id, transport_id, accommodation_id, mime_type, caption, taken_at, latitude, longitude, created_at FROM photos WHERE trip_id = $1 ORDER BY created_at ASC",
    [params.id]
  );
  sendJson(res, 200, rows.map((r) => ({ ...r, url: `/api/photos/${r.id}/raw`, thumb_url: `/api/photos/${r.id}/thumb` })));
}, { tripScope: "param" });

route("POST", "/api/trips/:id/photos", async (req, res, params, body) => {
  const { day_id, activity_id, transport_id, accommodation_id, image, caption, taken_at, latitude, longitude } = body;
  if (!image?.data || !image?.mediaType) return sendError(res, 400, "Geen afbeelding opgegeven");
  if (!(await targetsBelongToTrip(params.id, { day_id, activity_id, transport_id, accommodation_id }))) {
    return sendError(res, 400, "Ongeldige koppeling voor deze reis");
  }
  let buffer = Buffer.from(image.data, "base64");
  if (buffer.length > MAX_PHOTO_BYTES) return sendError(res, 413, "Afbeelding is te groot (max 8 MB)");
  let mimeType = image.mediaType;
  ({ buffer, mediaType: mimeType } = await normalizeImage(buffer, mimeType));
  if (buffer.length > MAX_PHOTO_BYTES) return sendError(res, 413, "Afbeelding is te groot (max 8 MB)");
  const lat = typeof latitude === "number" && latitude >= -90 && latitude <= 90 ? latitude : null;
  const lon = typeof longitude === "number" && longitude >= -180 && longitude <= 180 ? longitude : null;
  // Content hash de-dupes identical photos within a trip: re-uploading the same
  // bytes reuses the existing row instead of storing a duplicate blob, keeping
  // its current assignment (day/activity/transport/accommodation) if it has one.
  const contentHash = crypto.createHash("md5").update(buffer).digest("hex");
  const thumb = await makeThumbnail(buffer);
  const { rows } = await query(
    `INSERT INTO photos (trip_id, day_id, activity_id, transport_id, accommodation_id, mime_type, data, caption, taken_at, latitude, longitude, content_hash, thumb_data, thumb_rev)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (trip_id, content_hash) WHERE content_hash IS NOT NULL DO UPDATE SET
       day_id = COALESCE(photos.day_id, EXCLUDED.day_id),
       activity_id = COALESCE(photos.activity_id, EXCLUDED.activity_id),
       transport_id = COALESCE(photos.transport_id, EXCLUDED.transport_id),
       accommodation_id = COALESCE(photos.accommodation_id, EXCLUDED.accommodation_id),
       caption = COALESCE(photos.caption, EXCLUDED.caption),
       taken_at = COALESCE(photos.taken_at, EXCLUDED.taken_at),
       latitude = COALESCE(photos.latitude, EXCLUDED.latitude),
       longitude = COALESCE(photos.longitude, EXCLUDED.longitude),
       thumb_data = COALESCE(EXCLUDED.thumb_data, photos.thumb_data),
       thumb_rev = CASE WHEN EXCLUDED.thumb_data IS NOT NULL THEN EXCLUDED.thumb_rev ELSE photos.thumb_rev END
     RETURNING id, trip_id, day_id, activity_id, transport_id, accommodation_id, mime_type, caption, taken_at, latitude, longitude, created_at, (xmax = 0) AS inserted`,
    [params.id, day_id || null, activity_id || null, transport_id || null, accommodation_id || null, mimeType, buffer, caption || null, taken_at || null, lat, lon, contentHash, thumb, thumb ? THUMB_REV : 0]
  );
  const { inserted, ...photo } = rows[0];
  sendJson(res, inserted ? 201 : 200, { ...photo, url: `/api/photos/${photo.id}/raw`, thumb_url: `/api/photos/${photo.id}/thumb` });
}, { tripScope: "param" });

// Persist a converted photo. Changing the bytes changes the content hash, which
// can collide with an existing row under photos_trip_hash_unique (e.g. the same
// picture was re-uploaded after the converter started working). Falling back to
// a NULL hash — excluded from the partial index — keeps the converted JPEG
// instead of leaving the row as HEIC and re-converting it on every single view.
async function persistConvertedPhoto(id, mediaType, buffer) {
  const contentHash = crypto.createHash("md5").update(buffer).digest("hex");
  // Clear the thumbnail too: it was derived from the bytes being replaced, so
  // keeping it leaves a correct original next to a stale, differently-oriented
  // thumbnail.
  try {
    await query("UPDATE photos SET mime_type=$1, data=$2, content_hash=$3, thumb_data=NULL, thumb_rev=0 WHERE id=$4", [mediaType, buffer, contentHash, id]);
  } catch (err) {
    if (err.code !== "23505") throw err;
    await query("UPDATE photos SET mime_type=$1, data=$2, content_hash=NULL, thumb_data=NULL, thumb_rev=0 WHERE id=$3", [mediaType, buffer, id]);
  }
}

route("GET", "/api/photos/:id/raw", async (req, res, params) => {
  const { rows } = await query("SELECT data, mime_type, content_hash FROM photos WHERE id = $1", [params.id]);
  if (!rows.length) { res.writeHead(404); res.end(); return; }
  let { data, mime_type, content_hash } = rows[0];
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
  const { rows } = await query("SELECT thumb_data, thumb_rev, content_hash FROM photos WHERE id = $1", [params.id]);
  if (!rows.length) { res.writeHead(404); res.end(); return; }
  let thumb = rows[0].thumb_data;
  // Generated lazily for photos that predate thumbnails, whose generation failed
  // at upload, or that were built by an older generator. Only the first viewer
  // after the change pays for it.
  if (!thumb || rows[0].thumb_rev < THUMB_REV) {
    const full = await query("SELECT data, mime_type FROM photos WHERE id = $1", [params.id]);
    let { data, mime_type } = full.rows[0];
    if (looksLikeHeic(data, mime_type)) {
      const converted = await normalizeImage(data, mime_type);
      data = converted.buffer;
    }
    thumb = await makeThumbnail(data);
    if (!thumb) { res.writeHead(302, { Location: `/api/photos/${params.id}/raw` }); res.end(); return; }
    await query("UPDATE photos SET thumb_data = $1, thumb_rev = $2 WHERE id = $3", [thumb, THUMB_REV, params.id])
      .catch((err) => console.error(`Failed to persist thumbnail for photo ${params.id}:`, err.message));
  }
  const etag = rows[0].content_hash ? `"t${rows[0].content_hash}"` : null;
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
  const { rows } = await query("SELECT data, mime_type FROM photos WHERE id = $1", [params.id]);
  if (!rows.length) return sendError(res, 404, "Foto niet gevonden");
  let { data, mime_type } = rows[0];
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
    const contentHash = crypto.createHash("md5").update(rotated).digest("hex");
    try {
      await query("UPDATE photos SET data=$1, mime_type='image/jpeg', content_hash=$2, thumb_data=NULL, thumb_rev=0 WHERE id=$3",
        [rotated, contentHash, params.id]);
    } catch (err) {
      if (err.code !== "23505") throw err;
      await query("UPDATE photos SET data=$1, mime_type='image/jpeg', content_hash=NULL, thumb_data=NULL, thumb_rev=0 WHERE id=$2",
        [rotated, params.id]);
    }
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

// A dagboek block is a day, activity, transport or stay. Reactions hang off the
// block rather than off a particular person's entry, so a day nobody has written
// about — or one with only photos — can still be commented on and liked.
const SLOT_COLS = ["day_id", "activity_id", "transport_id", "accommodation_id"];
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
    query("SELECT day_id, activity_id, transport_id, accommodation_id, comment_id, user_id FROM journal_likes WHERE trip_id = $1", [params.id]),
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
  sendJson(res, 201, { liked: true });
}, { tripScope: "param", allowViewer: true });

route("DELETE", "/api/journal-comments/:id", async (req, res, params) => {
  const { rowCount } = await query("DELETE FROM journal_comments WHERE id = $1 AND user_id = $2", [params.id, req.user.id]);
  if (!rowCount) return sendError(res, 403, "Je kunt alleen je eigen reactie verwijderen");
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

  const existing = await query(`SELECT id FROM journal_entries WHERE ${col} = $1 AND user_id = $2`, [val, req.user.id]);
  if (existing.rows.length) {
    const { rows } = await query(
      "UPDATE journal_entries SET title=$1, body=$2, updated_at=NOW() WHERE id=$3 RETURNING *",
      [title || null, text, existing.rows[0].id]
    );
    return sendJson(res, 200, { ...rows[0], author });
  }
  const { rows } = await query(
    "INSERT INTO journal_entries (trip_id, day_id, activity_id, transport_id, accommodation_id, title, body, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
    [params.id, day_id || null, activity_id || null, transport_id || null, accommodation_id || null, title || null, text, req.user.id]
  );
  sendJson(res, 201, { ...rows[0], author });
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
}, { tripScope: "param" });

// ---------- Expenses ----------
route("GET", "/api/trips/:id/expenses", async (req, res, params) => {
  if (req.tripRole === "viewer") return sendJson(res, 200, []);
  const { rows } = await query("SELECT * FROM expenses WHERE trip_id = $1 ORDER BY date ASC NULLS LAST, id ASC", [params.id]);
  sendJson(res, 200, rows);
}, { tripScope: "param" });

route("POST", "/api/trips/:id/expenses", async (req, res, params, body) => {
  const { date, category, description, amount, paid_by } = body;
  const { rows } = await query(
    "INSERT INTO expenses (trip_id, date, category, description, amount, paid_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
    [params.id, date||null, category||null, description, amount, paid_by||null]
  );
  sendJson(res, 201, rows[0]);
}, { tripScope: "param" });

route("PUT", "/api/expenses/:id", async (req, res, params, body) => {
  const { date, category, description, amount, paid_by } = body;
  const { rows } = await query(
    "UPDATE expenses SET date=$1, category=$2, description=$3, amount=$4, paid_by=$5 WHERE id=$6 RETURNING *",
    [date||null, category||null, description, amount, paid_by||null, params.id]
  );
  sendJson(res, 200, rows[0]);
}, { tripScope: "expenses" });

route("DELETE", "/api/expenses/:id", async (req, res, params) => {
  await query("DELETE FROM expenses WHERE id = $1", [params.id]);
  res.writeHead(204); res.end();
}, { tripScope: "expenses" });

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

// ---------- Server ----------
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const url = new URL(req.url, `http://localhost`);
  const pathname = url.pathname;

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (pathname.startsWith("/auth/") || pathname.startsWith("/invite/")) {
    try {
      // matchRoute percent-decodes path params and throws URIError on malformed
      // input (e.g. "/invite/%"), so it must stay inside the try — an escaped
      // rejection from this async handler would terminate the process.
      const match = matchRoute(req.method, pathname);
      if (!match) { res.writeHead(404); res.end(); return; }
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
      if (!user) { sendError(res, 401, "Niet ingelogd"); return; }
      const match = matchRoute(req.method, pathname);
      if (!match) { sendError(res, 404, "Not found"); return; }
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
      if (!res.headersSent) sendError(res, err.statusCode || 500, err.message);
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

  // Static files
  if (pathname === "/login") { serveStatic(res, path.join(PUBLIC_DIR, "login.html")); return; }
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
  .then(() => {
    server.listen(PORT, () => console.log(`Reisplanner draait op http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("Database init failed:", err.message);
    process.exit(1);
  });
