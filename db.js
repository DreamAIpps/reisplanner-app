require("dotenv").config();
const { Pool, types } = require("pg");

// A DATE column is a calendar day, not an instant. pg's default parser turns it
// into a JS Date at *local* midnight, which JSON.stringify then serialises as
// UTC — so on any server not running UTC every trip day shifted a day backwards
// ("2027-03-28" arriving at the browser as "2027-03-27"). Hand DATE through as
// the plain "YYYY-MM-DD" string the whole app already treats it as.
types.setTypeParser(types.builtins.DATE, (v) => v);

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
      cover_color TEXT DEFAULT '#FF7A00',
      cover_image TEXT,
      user_id INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE trips ADD COLUMN IF NOT EXISTS cover_image TEXT;
    ALTER TABLE trips ADD COLUMN IF NOT EXISTS user_id INTEGER;
    -- IANA-naam (bv. "Asia/Tokyo"). Leeg laat "vandaag" op de klok van elk
    -- toestel afgaan; ingevuld maakt het reisdoel bepalend, zodat een medereiziger
    -- met een andere tijdzone een reactie niet meer op de verkeerde dagkaart plaatst.
    ALTER TABLE trips ADD COLUMN IF NOT EXISTS timezone TEXT;

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
    -- Recipients can turn notification mail off; on by default so sharing a trip
    -- keeps working without anyone having to opt in.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_email BOOLEAN NOT NULL DEFAULT TRUE;

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS trip_members (
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'editor',
      PRIMARY KEY (trip_id, user_id)
    );
    ALTER TABLE trip_members ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'editor';

    CREATE TABLE IF NOT EXISTS trip_invites (
      token TEXT PRIMARY KEY,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      created_by INTEGER NOT NULL REFERENCES users(id),
      role TEXT NOT NULL DEFAULT 'editor',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE trip_invites ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'editor';

    CREATE TABLE IF NOT EXISTS trip_views (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      viewed_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS trip_views_trip_idx ON trip_views(trip_id, viewed_at);

    -- One row per minute a viewer has the trip open, which is what makes "how
    -- long did they look" answerable at all — trip_views only records that a
    -- trip was opened, not for how long. Kept coarse on purpose: a minute is
    -- enough to tell a glance from an evening of reading.
    CREATE TABLE IF NOT EXISTS trip_pings (
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      minute TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (trip_id, user_id, minute)
    );
    CREATE INDEX IF NOT EXISTS trip_pings_lookup ON trip_pings(trip_id, user_id, minute);

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
    -- Downscaled copy served to grids and strips. Without it every 150px
    -- thumbnail downloads the full multi-megabyte original.
    ALTER TABLE photos ADD COLUMN IF NOT EXISTS thumb_data BYTEA;
    -- Bumped when the thumbnail generator changes so existing thumbnails are
    -- regenerated lazily on next view, rather than needing a migration pass.
    ALTER TABLE photos ADD COLUMN IF NOT EXISTS thumb_rev SMALLINT NOT NULL DEFAULT 0;
    CREATE INDEX IF NOT EXISTS photos_trip_idx ON photos(trip_id);
    CREATE INDEX IF NOT EXISTS days_trip_idx ON days(trip_id);
    CREATE INDEX IF NOT EXISTS activities_trip_idx ON activities(trip_id);
    CREATE INDEX IF NOT EXISTS activities_day_idx ON activities(day_id);
    CREATE INDEX IF NOT EXISTS accommodations_trip_idx ON accommodations(trip_id);
    CREATE INDEX IF NOT EXISTS transports_trip_idx ON transports(trip_id);
    CREATE INDEX IF NOT EXISTS expenses_trip_idx ON expenses(trip_id);
    CREATE INDEX IF NOT EXISTS packing_items_trip_idx ON packing_items(trip_id);

    CREATE TABLE IF NOT EXISTS journal_entries (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      day_id INTEGER REFERENCES days(id) ON DELETE CASCADE,
      activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
      transport_id INTEGER REFERENCES transports(id) ON DELETE CASCADE,
      accommodation_id INTEGER REFERENCES accommodations(id) ON DELETE CASCADE,
      title TEXT,
      body TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
    -- Uniqueness is per (slot, author): each user keeps their own entry for a
    -- day/activity/transport/stay. The original indexes were on the slot column
    -- alone, which made a second user's INSERT fail with a 23505 duplicate-key
    -- error — i.e. only the first person to write about something could ever do so.
    DROP INDEX IF EXISTS journal_entries_day_unique;
    DROP INDEX IF EXISTS journal_entries_activity_unique;
    DROP INDEX IF EXISTS journal_entries_transport_unique;
    DROP INDEX IF EXISTS journal_entries_accommodation_unique;
    CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_day_user_unique ON journal_entries(day_id, user_id) WHERE day_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_activity_user_unique ON journal_entries(activity_id, user_id) WHERE activity_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_transport_user_unique ON journal_entries(transport_id, user_id) WHERE transport_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_accommodation_user_unique ON journal_entries(accommodation_id, user_id) WHERE accommodation_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS journal_entries_trip_idx ON journal_entries(trip_id);

    -- Reactions to someone's story. Read-only members may post these; it is the
    -- one write a viewer is allowed to make. trip_id is denormalised so the
    -- router's tripScope can authorise a DELETE without a join.
    CREATE TABLE IF NOT EXISTS journal_comments (
      id SERIAL PRIMARY KEY,
      entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    -- Reactions hang off the dagboek *slot* (a day, activity, transport or
    -- stay), not off someone's entry. Attaching them to an entry meant a day
    -- nobody had written about yet — or one with only photos — offered a
    -- reader no way to react at all.
    ALTER TABLE journal_comments ALTER COLUMN entry_id DROP NOT NULL;
    ALTER TABLE journal_comments ADD COLUMN IF NOT EXISTS day_id INTEGER REFERENCES days(id) ON DELETE CASCADE;
    ALTER TABLE journal_comments ADD COLUMN IF NOT EXISTS activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE;
    ALTER TABLE journal_comments ADD COLUMN IF NOT EXISTS transport_id INTEGER REFERENCES transports(id) ON DELETE CASCADE;
    ALTER TABLE journal_comments ADD COLUMN IF NOT EXISTS accommodation_id INTEGER REFERENCES accommodations(id) ON DELETE CASCADE;
    -- Reacties onder één specifieke foto, los van de dag/activiteit/etc. waar
    -- die foto toevallig aan hangt — zodat je op de foto zelf kunt reageren.
    ALTER TABLE journal_comments ADD COLUMN IF NOT EXISTS photo_id INTEGER REFERENCES photos(id) ON DELETE CASCADE;
    UPDATE journal_comments c SET day_id = e.day_id, activity_id = e.activity_id,
           transport_id = e.transport_id, accommodation_id = e.accommodation_id
      FROM journal_entries e
     WHERE c.entry_id = e.id AND c.day_id IS NULL AND c.activity_id IS NULL
       AND c.transport_id IS NULL AND c.accommodation_id IS NULL;
    CREATE INDEX IF NOT EXISTS journal_comments_trip_idx ON journal_comments(trip_id);

    -- Drives the "new since your last visit" markers. Deliberately not tied to
    -- login: people stay signed in for weeks, so a login timestamp would mark
    -- everything as seen forever. Instead marker_at is the boundary shown to the
    -- user and last_seen_at tracks activity; see advanceJournalRead in server.js.
    -- Thumbs-up on either a story or a reaction. One table with two nullable
    -- targets keeps the toggle endpoint and the counting query single-shot.
    -- Viewers may like, same as they may comment.
    CREATE TABLE IF NOT EXISTS journal_likes (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entry_id INTEGER REFERENCES journal_entries(id) ON DELETE CASCADE,
      comment_id INTEGER REFERENCES journal_comments(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    -- Likes follow comments onto the slot, for the same reason.
    ALTER TABLE journal_likes DROP CONSTRAINT IF EXISTS journal_likes_one_target;
    ALTER TABLE journal_likes ADD COLUMN IF NOT EXISTS day_id INTEGER REFERENCES days(id) ON DELETE CASCADE;
    ALTER TABLE journal_likes ADD COLUMN IF NOT EXISTS activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE;
    ALTER TABLE journal_likes ADD COLUMN IF NOT EXISTS transport_id INTEGER REFERENCES transports(id) ON DELETE CASCADE;
    ALTER TABLE journal_likes ADD COLUMN IF NOT EXISTS accommodation_id INTEGER REFERENCES accommodations(id) ON DELETE CASCADE;
    ALTER TABLE journal_likes ADD COLUMN IF NOT EXISTS photo_id INTEGER REFERENCES photos(id) ON DELETE CASCADE;
    -- Guarded: after the column is dropped this block must not reference it
    -- again, or every later boot fails and the server never starts.
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'journal_likes' AND column_name = 'entry_id') THEN
        UPDATE journal_likes l SET day_id = e.day_id, activity_id = e.activity_id,
               transport_id = e.transport_id, accommodation_id = e.accommodation_id
          FROM journal_entries e
         WHERE l.entry_id = e.id AND l.day_id IS NULL AND l.activity_id IS NULL
           AND l.transport_id IS NULL AND l.accommodation_id IS NULL;
        ALTER TABLE journal_likes DROP COLUMN entry_id;
      END IF;
    END $$;
    CREATE UNIQUE INDEX IF NOT EXISTS journal_likes_comment_user ON journal_likes(comment_id, user_id) WHERE comment_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS journal_likes_day_user ON journal_likes(day_id, user_id) WHERE day_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS journal_likes_activity_user ON journal_likes(activity_id, user_id) WHERE activity_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS journal_likes_transport_user ON journal_likes(transport_id, user_id) WHERE transport_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS journal_likes_accommodation_user ON journal_likes(accommodation_id, user_id) WHERE accommodation_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS journal_likes_photo_user ON journal_likes(photo_id, user_id) WHERE photo_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS journal_likes_trip_idx ON journal_likes(trip_id);

    -- Outbox for e-mail notifications. Rows are written when something happens
    -- and swept into one digest per (recipient, trip) a few minutes later, so a
    -- burst of likes on one evening becomes a single mail rather than twenty.
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      actor_name TEXT,
      summary TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS notifications_pending_idx ON notifications(user_id, trip_id) WHERE sent_at IS NULL;

    CREATE TABLE IF NOT EXISTS journal_reads (
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      marker_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (trip_id, user_id)
    );
  `);

  // Trips created before the "fris oranje" redesign still carry a cover_color
  // from the old blue/violet/teal palette — changing the app's color CONSTANTS
  // never touched rows already written to the database. Remap each retired
  // value to its equivalent slot in the new palette; harmless to repeat every
  // boot, since after the first run no row matches the WHERE clause anymore.
  await query(`
    UPDATE trips SET cover_color = CASE cover_color
      WHEN '#0369a1' THEN '#FF7A00'
      WHEN '#7c3aed' THEN '#8A4B12'
      WHEN '#b45309' THEN '#6B3A2A'
      WHEN '#065f46' THEN '#4A5D3A'
      WHEN '#9f1239' THEN '#4A2F42'
      WHEN '#1e40af' THEN '#3D2E22'
      WHEN '#92400e' THEN '#6B3145'
      WHEN '#134e4a' THEN '#5A4632'
    END
    WHERE cover_color IN ('#0369a1','#7c3aed','#b45309','#065f46','#9f1239','#1e40af','#92400e','#134e4a');
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
