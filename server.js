require("dotenv").config();
const http = require("http");
const path = require("path");
const fs = require("fs");
const { query, initDb } = require("./db");
const Anthropic = require("@anthropic-ai/sdk");

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

// ---------- Trip routes ----------
route("GET", "/api/trips", async (req, res) => {
  const { rows } = await query(`
    SELECT t.*,
      COALESCE(SUM(e.amount), 0) as total_spent,
      COUNT(DISTINCT a.id) as activity_count
    FROM trips t
    LEFT JOIN expenses e ON e.trip_id = t.id
    LEFT JOIN activities a ON a.trip_id = t.id
    GROUP BY t.id
    ORDER BY t.start_date DESC NULLS LAST, t.created_at DESC
  `);
  sendJson(res, 200, rows);
});

route("GET", "/api/trips/:id", async (req, res, params) => {
  const { rows } = await query("SELECT * FROM trips WHERE id = $1", [params.id]);
  if (!rows.length) return sendError(res, 404, "Trip not found");
  sendJson(res, 200, rows[0]);
});

route("POST", "/api/trips", async (req, res, params, body) => {
  const { name, destination, start_date, end_date, budget, currency, status, notes, cover_color, cover_image } = body;
  if (!name) return sendError(res, 400, "Name is required");
  const { rows } = await query(
    `INSERT INTO trips (name, destination, start_date, end_date, budget, currency, status, notes, cover_color, cover_image)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [name, destination||null, start_date||null, end_date||null, budget||null, currency||"EUR", status||"planning", notes||null, cover_color||"#7c3aed", cover_image||null]
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
     WHERE id=$11 RETURNING *`,
    [name, destination||null, start_date||null, end_date||null, budget||null, currency||"EUR", status||"planning", notes||null, cover_color||"#7c3aed", cover_image||null, params.id]
  );
  if (!rows.length) return sendError(res, 404, "Trip not found");
  sendJson(res, 200, rows[0]);
});

route("DELETE", "/api/trips/:id", async (req, res, params) => {
  await query("DELETE FROM trips WHERE id = $1", [params.id]);
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

// ---------- Accommodation ----------
route("GET", "/api/trips/:id/accommodations", async (req, res, params) => {
  const { rows } = await query("SELECT * FROM accommodations WHERE trip_id = $1 ORDER BY check_in ASC NULLS LAST", [params.id]);
  sendJson(res, 200, rows);
});

route("POST", "/api/trips/:id/accommodations", async (req, res, params, body) => {
  const { name, check_in, check_out, address, booking_ref, cost, notes } = body;
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

// ---------- Transport ----------
route("GET", "/api/trips/:id/transports", async (req, res, params) => {
  const { rows } = await query("SELECT * FROM transports WHERE trip_id = $1 ORDER BY departure_time ASC NULLS LAST", [params.id]);
  sendJson(res, 200, rows);
});

route("POST", "/api/trips/:id/transports", async (req, res, params, body) => {
  const { type, from_location, to_location, departure_time, arrival_time, booking_ref, cost, notes } = body;
  const { rows } = await query(
    "INSERT INTO transports (trip_id, type, from_location, to_location, departure_time, arrival_time, booking_ref, cost, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
    [params.id, type, from_location||null, to_location||null, departure_time||null, arrival_time||null, booking_ref||null, cost||null, notes||null]
  );
  sendJson(res, 201, rows[0]);
});

route("PUT", "/api/transports/:id", async (req, res, params, body) => {
  const { type, from_location, to_location, departure_time, arrival_time, booking_ref, cost, notes } = body;
  const { rows } = await query(
    "UPDATE transports SET type=$1, from_location=$2, to_location=$3, departure_time=$4, arrival_time=$5, booking_ref=$6, cost=$7, notes=$8 WHERE id=$9 RETURNING *",
    [type, from_location||null, to_location||null, departure_time||null, arrival_time||null, booking_ref||null, cost||null, notes||null, params.id]
  );
  sendJson(res, 200, rows[0]);
});

route("DELETE", "/api/transports/:id", async (req, res, params) => {
  await query("DELETE FROM transports WHERE id = $1", [params.id]);
  res.writeHead(204); res.end();
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
  const { text } = body;
  if (!text || !text.trim()) return sendError(res, 400, "Geen tekst opgegeven");
  if (!process.env.ANTHROPIC_API_KEY) return sendError(res, 500, "ANTHROPIC_API_KEY niet geconfigureerd");

  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `Parse this travel confirmation email and extract structured data. Return ONLY valid JSON with this exact structure, no markdown, no explanation:
{
  "transports": [{"type": "Vliegtuig|Trein|Bus|Huurauto|Taxi|Boot|Anders", "from_location": "", "to_location": "", "departure_time": "ISO 8601 datetime or null", "arrival_time": "ISO 8601 datetime or null", "booking_ref": "", "cost": null, "notes": ""}],
  "accommodations": [{"name": "", "check_in": "YYYY-MM-DD or null", "check_out": "YYYY-MM-DD or null", "address": "", "booking_ref": "", "cost": null, "notes": ""}],
  "activities": [{"date": "YYYY-MM-DD or null", "time": "HH:MM or null", "title": "", "location": "", "category": "Bezienswaardigheid|Restaurant|Museum|Natuur|Sport|Shopping|Anders", "cost": null, "notes": ""}]
}
Only include items actually present in the email. Use null for missing values. Return empty arrays if nothing found. Activities are things like museum tickets, restaurant reservations, tours, events, excursions.

Email text:
${text}`
    }]
  });

  const raw = message.content[0].text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  try {
    const parsed = JSON.parse(raw);
    sendJson(res, 200, { transports: parsed.transports || [], accommodations: parsed.accommodations || [], activities: parsed.activities || [] });
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

// ---------- Server ----------
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const url = new URL(req.url, `http://localhost`);
  const pathname = url.pathname;

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (pathname.startsWith("/api/")) {
    const match = matchRoute(req.method, pathname);
    if (!match) { sendError(res, 404, "Not found"); return; }
    try {
      const body = ["POST", "PUT", "PATCH"].includes(req.method) ? await readBody(req) : {};
      await match.handler(req, res, match.params, body);
    } catch (err) {
      console.error(err);
      sendError(res, 500, err.message);
    }
    return;
  }

  // Static files
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
