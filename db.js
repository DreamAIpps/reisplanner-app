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
      notes TEXT
    );

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
  `);
}

module.exports = { query, initDb };
