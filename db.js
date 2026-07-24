require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("railway")
    ? { rejectUnauthorized: false }
    : false,
});

async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS trips (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      destination TEXT,
      start_date DATE,
      end_date DATE,
      budget NUMERIC(10,2),
      currency TEXT DEFAULT 'EUR',
      status TEXT DEFAULT 'planning',
      notes TEXT,
      cover_color TEXT DEFAULT '#7c3aed',
      cover_image TEXT,
      user_id INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE trips ADD COLUMN IF NOT EXISTS cover_image TEXT;
    ALTER TABLE trips ADD COLUMN IF NOT EXISTS user_id INTEGER;

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE,
      name TEXT,
      given_name TEXT,
      family_name TEXT,
      avatar TEXT,
      locale TEXT,
      email_verified BOOLEAN DEFAULT FALSE,
      google_id TEXT UNIQUE,
      apple_id TEXT UNIQUE,
      is_admin BOOLEAN DEFAULT FALSE,
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS given_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS family_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS locale TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0;

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS trip_members (
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (trip_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS trip_invites (
      token TEXT PRIMARY KEY,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS days (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      title TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS activities (
      id SERIAL PRIMARY KEY,
      day_id INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      time TEXT,
      title TEXT NOT NULL,
      location TEXT,
      notes TEXT,
      category TEXT DEFAULT 'activity',
      cost NUMERIC(10,2)
    );

    CREATE TABLE IF NOT EXISTS accommodations (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      check_in DATE,
      check_out DATE,
      address TEXT,
      booking_ref TEXT,
      cost NUMERIC(10,2),
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS transports (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      from_location TEXT,
      to_location TEXT,
      departure_time TIMESTAMPTZ,
      arrival_time TIMESTAMPTZ,
      booking_ref TEXT,
      cost NUMERIC(10,2),
      notes TEXT,
      baggage_allowance TEXT
    );
    ALTER TABLE transports ADD COLUMN IF NOT EXISTS baggage_allowance TEXT;

    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      date DATE,
      category TEXT,
      description TEXT NOT NULL,
      amount NUMERIC(10,2) NOT NULL,
      paid_by TEXT
    );

    CREATE TABLE IF NOT EXISTS packing_items (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      category TEXT NOT NULL DEFAULT 'Overig',
      item TEXT NOT NULL,
      checked BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE packing_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE packing_items ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Overig';
    ALTER TABLE packing_items ADD COLUMN IF NOT EXISTS checked BOOLEAN DEFAULT FALSE;

    CREATE TABLE IF NOT EXISTS photos (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      day_id INTEGER REFERENCES days(id) ON DELETE CASCADE,
      activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
      transport_id INTEGER REFERENCES transports(id) ON DELETE CASCADE,
      accommodation_id INTEGER REFERENCES accommodations(id) ON DELETE CASCADE,
      mime_type TEXT NOT NULL,
      data BYTEA NOT NULL,
      caption TEXT,
      taken_at TIMESTAMPTZ,
      latitude NUMERIC(9,6),
      longitude NUMERIC(9,6),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE photos ADD COLUMN IF NOT EXISTS taken_at TIMESTAMPTZ;
    ALTER TABLE photos ADD COLUMN IF NOT EXISTS latitude NUMERIC(9,6);
    ALTER TABLE photos ADD COLUMN IF NOT EXISTS longitude NUMERIC(9,6);
    ALTER TABLE photos ADD COLUMN IF NOT EXISTS transport_id INTEGER REFERENCES transports(id) ON DELETE CASCADE;
    ALTER TABLE photos ADD COLUMN IF NOT EXISTS accommodation_id INTEGER REFERENCES accommodations(id) ON DELETE CASCADE;
    ALTER TABLE photos ADD COLUMN IF NOT EXISTS content_hash TEXT;
    UPDATE photos SET content_hash = md5(data) WHERE content_hash IS NULL;

    CREATE TABLE IF NOT EXISTS journal_entries (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      day_id INTEGER REFERENCES days(id) ON DELETE CASCADE,
      activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
      transport_id INTEGER REFERENCES transports(id) ON DELETE CASCADE,
      accommodation_id INTEGER REFERENCES accommodations(id) ON DELETE CASCADE,
      title TEXT,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_day_unique ON journal_entries(day_id) WHERE day_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_activity_unique ON journal_entries(activity_id) WHERE activity_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_transport_unique ON journal_entries(transport_id) WHERE transport_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_accommodation_unique ON journal_entries(accommodation_id) WHERE accommodation_id IS NOT NULL;
  `);

  // Merge any photos already duplicated (same trip, identical bytes) before
  // this content_hash uniqueness was introduced, so the index below can apply.
  await mergeDuplicatePhotos();
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS photos_trip_hash_unique ON photos(trip_id, content_hash) WHERE content_hash IS NOT NULL;
  `);
}

async function mergeDuplicatePhotos() {
  const { rows: groups } = await query(`
    SELECT trip_id, content_hash, array_agg(id ORDER BY created_at ASC) AS ids
    FROM photos
    WHERE content_hash IS NOT NULL
    GROUP BY trip_id, content_hash
    HAVING COUNT(*) > 1
  `);
  for (const group of groups) {
    const [keepId, ...dupIds] = group.ids;
    for (const dupId of dupIds) {
      await query(
        `UPDATE photos p SET
           day_id = COALESCE(p.day_id, d.day_id),
           activity_id = COALESCE(p.activity_id, d.activity_id),
           transport_id = COALESCE(p.transport_id, d.transport_id),
           accommodation_id = COALESCE(p.accommodation_id, d.accommodation_id),
           taken_at = COALESCE(p.taken_at, d.taken_at),
           latitude = COALESCE(p.latitude, d.latitude),
           longitude = COALESCE(p.longitude, d.longitude)
         FROM (SELECT * FROM photos WHERE id = $2) d
         WHERE p.id = $1`,
        [keepId, dupId]
      );
      await query("DELETE FROM photos WHERE id = $1", [dupId]);
    }
  }
}

module.exports = { query, initDb };
