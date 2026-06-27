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
      password_hash TEXT,
      login_count INTEGER DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS wines (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      producer TEXT,
      vintage_year INTEGER,
      region TEXT,
      country TEXT,
      grape_variety TEXT,
      type TEXT DEFAULT 'Rood',
      price NUMERIC(10,2),
      purchase_date DATE,
      bottles INTEGER DEFAULT 1,
      rack TEXT,
      notes TEXT,
      label_image TEXT,
      drink_from INTEGER,
      drink_until INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE wines ADD COLUMN IF NOT EXISTS label_image TEXT;
    ALTER TABLE wines ADD COLUMN IF NOT EXISTS drink_from INTEGER;
    ALTER TABLE wines ADD COLUMN IF NOT EXISTS drink_until INTEGER;
    ALTER TABLE wines ADD COLUMN IF NOT EXISTS rack TEXT;

    CREATE TABLE IF NOT EXISTS tastings (
      id SERIAL PRIMARY KEY,
      wine_id INTEGER NOT NULL REFERENCES wines(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tasting_date DATE,
      rating INTEGER CHECK (rating >= 1 AND rating <= 5),
      notes TEXT,
      nose TEXT,
      palate TEXT,
      finish TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE tastings ADD COLUMN IF NOT EXISTS nose TEXT;
    ALTER TABLE tastings ADD COLUMN IF NOT EXISTS palate TEXT;
    ALTER TABLE tastings ADD COLUMN IF NOT EXISTS finish TEXT;
  `);
}

module.exports = { query, initDb };
