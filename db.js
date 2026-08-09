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
  // Houdt de TCP-verbinding levend, zodat het netwerk tussen app en database
  // hem niet als "inactief" opruimt. Dat verbreken is de aanleiding voor de
  // fout die hieronder wordt opgevangen; dit maakt hem zeldzamer.
  keepAlive: true,
});

// Zonder deze listener stopt Node het hele proces zodra een verbinding in de
// pool wegvalt — een "unhandled 'error' event". De database verbreekt inactieve
// verbindingen routinematig (onderhoud, herstart, een haperend netwerk), dus dit
// gebeurde regelmatig, en dan kreeg iedereen die op dat moment iets aan het doen
// was een 502 van de proxy. Foto's uploaden duurt van alles in de app het
// langst en werd daarom het vaakst geraakt. De pool gooit de kapotte verbinding
// zelf weg en maakt bij het volgende verzoek een nieuwe; er valt hier verder
// niets te doen behalve het niet fataal laten zijn.
pool.on("error", (err) => {
  console.error("Databaseverbinding weggevallen (pool herstelt zichzelf):", err.message);
});

async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

// Meerdere bewerkingen die alleen samen zinvol zijn. Nodig waar iets eerst wordt
// weggegooid en daarna opnieuw opgebouwd: knapt er halverwege iets, dan blijft
// zonder transactie de helft weg. De callback krijgt een eigen client — gebruik
// die en niet query(), anders loopt de bewerking buiten de transactie om.
async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const uitkomst = await fn(client);
    await client.query("COMMIT");
    return uitkomst;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
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
      cover_color TEXT DEFAULT '#F3C2B5',
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
    -- Wanneer de laatste pushmelding echt is verstuurd, los van notify_email —
    -- bepaalt de 30-minuten-cooldown tussen twee pushes aan dezelfde persoon.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_push_at TIMESTAMPTZ;

    -- trips.user_id had nooit een foreign key — het kon niet eerder, want deze
    -- kolom bestaat al vanaf vóór de users-tabel verderop in dit bestand werd
    -- aangemaakt. NOT VALID + een DO-block: bekrachtigt alleen nieuwe/gewijzigde
    -- rijen (breekt de boot niet op eventuele bestaande data) en is veilig om
    -- op elke herstart opnieuw te proberen.
    DO $$ BEGIN
      ALTER TABLE trips ADD CONSTRAINT trips_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL NOT VALID;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

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

    -- Eén rij per AI-verzoek. De rekening van Anthropic komt per maand en per
    -- account binnen; wie hem veroorzaakt heeft stond nergens. Hiermee is dat
    -- terug te zien in het beheerscherm: wie, waarvoor, welk model, hoeveel
    -- tokens. De reis mag NULL zijn (niet elk verzoek hoort bij een reis) en
    -- blijft bestaan als de reis verdwijnt — het verbruik was er wel.
    CREATE TABLE IF NOT EXISTS ai_usage (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL,
      doel TEXT NOT NULL,
      model TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ai_usage_user_idx ON ai_usage(user_id, created_at);

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
    -- Standaard openbaar (zichtbaar voor gedeelde kijkers); aangevinkt verbergt
    -- het item voor iedereen met alleen-lezen (viewer) toegang tot de reis —
    -- dezelfde rol die nu al geen kosten/uitgaven te zien krijgt.
    ALTER TABLE activities ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;

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
    ALTER TABLE accommodations ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;

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
    ALTER TABLE transports ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;

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
    -- Pixelafmetingen van de opgeslagen (al verkleinde) foto, alleen gevuld bij
    -- nieuwe uploads — gebruikt door het fotoboek om te waarschuwen als een
    -- foto te weinig pixels heeft voor scherpe afdruk op het gekozen formaat.
    -- Bestaande foto's blijven NULL tot ze opnieuw geüpload worden.
    ALTER TABLE photos ADD COLUMN IF NOT EXISTS width INTEGER;
    ALTER TABLE photos ADD COLUMN IF NOT EXISTS height INTEGER;
    -- Sorteersleutel binnen een dag of activiteit. Standaard 0, waarna de
    -- opnametijd de volgorde bepaalt zoals altijd. Wie een foto vooraan zet
    -- krijgt een negatief getal — zo hoeft de rest niet hernummerd te worden en
    -- blijft de bestaande volgorde intact.
    ALTER TABLE photos ADD COLUMN IF NOT EXISTS sort_key INTEGER NOT NULL DEFAULT 0;
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
    -- push_sent_at staat los van sent_at (mail): dezelfde rij voedt beide
    -- kanalen, elk met zijn eigen "verstuurd"-markering en eigen ritme.
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS push_sent_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS notifications_push_pending_idx ON notifications(user_id) WHERE push_sent_at IS NULL;

    -- Eén rij per toestel/browser dat pushmeldingen heeft geaccepteerd. Een
    -- gebruiker kan er meerdere hebben (telefoon én laptop); endpoint is uniek
    -- per subscriptie, dus opnieuw registreren vanaf hetzelfde toestel is een
    -- upsert in plaats van een dubbele rij.
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions(user_id);

    CREATE TABLE IF NOT EXISTS journal_reads (
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      marker_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (trip_id, user_id)
    );

    -- Een Kahoot-achtige fotoquiz: één sessie deelt dezelfde vragen tussen alle
    -- deelnemers, en de voortgang loopt puur op verstreken tijd sinds
    -- started_at (zie computeQuizPhase in server.js) — geen host die per vraag
    -- op "volgende" hoeft te klikken. Meedoen kan alleen via het join-token in
    -- de QR-link, bewust gescheiden van het gewone trip_invites-token: een
    -- gewone alleen-lezen uitnodiging mag geen toegang tot de quiz geven, en
    -- omgekeerd geeft meedoen aan een quiz geen permanente kijktoegang tot de
    -- rest van de reis buiten wat nodig is voor de quizfoto's.
    CREATE TABLE IF NOT EXISTS quiz_sessions (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      host_user_id INTEGER NOT NULL REFERENCES users(id),
      token TEXT UNIQUE NOT NULL,
      questions JSONB NOT NULL,
      question_seconds INTEGER NOT NULL DEFAULT 15,
      interval_seconds INTEGER NOT NULL DEFAULT 6,
      status TEXT NOT NULL DEFAULT 'lobby',
      started_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS quiz_sessions_trip_idx ON quiz_sessions(trip_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS quiz_participants (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT,
      score INTEGER NOT NULL DEFAULT 0,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (session_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS quiz_answers (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
      participant_id INTEGER NOT NULL REFERENCES quiz_participants(id) ON DELETE CASCADE,
      question_index INTEGER NOT NULL,
      choice TEXT,
      correct BOOLEAN NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (participant_id, question_index)
    );

    -- Fotoboek: door het gezin zelf samen te stellen uit de foto's van de reis
    -- (voorgestelde selectie/volgorde/bijschrift, zelf aan te passen). Bestellen
    -- bij een drukkerij komt in een latere stap; print_order_id staat hier vast
    -- klaar zodat die stap geen aparte migratie nodig heeft.
    CREATE TABLE IF NOT EXISTS photobooks (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT 'Fotoboek',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      print_order_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS photobooks_trip_idx ON photobooks(trip_id);
    -- Staand (portrait, standaard) of liggend (landscape) paginaformaat —
    -- gekozen bij het aanmaken, geldt voor het hele boek (canvas-verhouding
    -- in de editor/preview en het PDF-paginaformaat).
    ALTER TABLE photobooks ADD COLUMN IF NOT EXISTS orientation TEXT NOT NULL DEFAULT 'portrait';
    -- Bij het aanmaken gekozen hoekafronding voor foto's (fractie van de
    -- kortste zijde, 0 = vierkant). Geldt als startwaarde voor elke foto die
    -- in dit boek belandt; per foto kan het daarna nog bijgesteld worden.
    ALTER TABLE photobooks ADD COLUMN IF NOT EXISTS corner_radius REAL NOT NULL DEFAULT 0;
    -- Bij het aanmaken gekozen achtergrondkleur voor de pagina's. NULL betekent
    -- geen kleur: dan blijft de pagina wit, zoals hij altijd was. Staat op het
    -- boek en niet alleen op de pagina's, zodat een pagina die je later
    -- toevoegt dezelfde kleur meekrijgt in plaats van er wit tussen te vallen.
    ALTER TABLE photobooks ADD COLUMN IF NOT EXISTS background_color TEXT;

    -- Eén pagina kan meerdere foto's bevatten (zie photobook_page_photos
    -- hieronder), een titel/beschrijving, en een optionele achtergrond (een
    -- kleur, of één van de eigen foto's van de pagina full-bleed).
    CREATE TABLE IF NOT EXISTS photobook_pages (
      id SERIAL PRIMARY KEY,
      photobook_id INTEGER NOT NULL REFERENCES photobooks(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      title TEXT,
      description TEXT,
      background_type TEXT,
      background_color TEXT,
      background_photo_id INTEGER REFERENCES photos(id) ON DELETE SET NULL,
      background_overlay REAL NOT NULL DEFAULT 0,
      title_align TEXT NOT NULL DEFAULT 'left',
      description_align TEXT NOT NULL DEFAULT 'left'
    );
    CREATE INDEX IF NOT EXISTS photobook_pages_book_idx ON photobook_pages(photobook_id, position);
    ALTER TABLE photobook_pages ADD COLUMN IF NOT EXISTS title TEXT;
    ALTER TABLE photobook_pages ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE photobook_pages ADD COLUMN IF NOT EXISTS background_type TEXT;
    ALTER TABLE photobook_pages ADD COLUMN IF NOT EXISTS background_color TEXT;
    ALTER TABLE photobook_pages ADD COLUMN IF NOT EXISTS background_photo_id INTEGER REFERENCES photos(id) ON DELETE SET NULL;
    -- Witte sluier over een achtergrondfoto (0 = geen, tot 0.75 = bijna wit),
    -- zodat voorgrondtekst/-foto's leesbaar blijven op een drukke achtergrond.
    ALTER TABLE photobook_pages ADD COLUMN IF NOT EXISTS background_overlay REAL NOT NULL DEFAULT 0;
    -- Welke rol een pagina in het boek speelt: 'cover_front', 'cover_back' of
    -- leeg voor een gewone binnenpagina. Een kaft is geen gewone pagina — hij
    -- wordt op één vel gedrukt met de achterkant links en de voorkant rechts —
    -- en zonder dit veld was daar niets van te zien. Bestaande boeken houden
    -- overal NULL en blijven zich dus gedragen zoals ze deden.
    ALTER TABLE photobook_pages ADD COLUMN IF NOT EXISTS role TEXT;
    -- Uitlijning van titel (CEWE-achtige stijlopties).
    ALTER TABLE photobook_pages ADD COLUMN IF NOT EXISTS title_align TEXT NOT NULL DEFAULT 'left';
    -- De titel is vrij versleepbaar/vergrootbaar op de pagina, net als een
    -- zwevend tekstvak — x/y/width/height zijn fracties van de pagina.
    ALTER TABLE photobook_pages ADD COLUMN IF NOT EXISTS title_x REAL NOT NULL DEFAULT 0.15;
    ALTER TABLE photobook_pages ADD COLUMN IF NOT EXISTS title_y REAL NOT NULL DEFAULT 0.14;
    ALTER TABLE photobook_pages ADD COLUMN IF NOT EXISTS title_width REAL NOT NULL DEFAULT 0.7;
    ALTER TABLE photobook_pages ADD COLUMN IF NOT EXISTS title_height REAL NOT NULL DEFAULT 0.1;
    -- ADD COLUMN IF NOT EXISTS hierboven raakt de DEFAULT van een kolom die
    -- al bestaat niet meer aan (0.06 stond te dicht bij de vaste "+"/
    -- instellingen-knoppen in de canvas-hoeken) — vandaar deze losse SET DEFAULT.
    ALTER TABLE photobook_pages ALTER COLUMN title_y SET DEFAULT 0.14;

    -- x/y/width/height zijn fracties van de pagina (0-1), niet pixels — zo
    -- blijft een foto op dezelfde relatieve plek staan ongeacht schermgrootte
    -- of (later) afdrukresolutie. Dit is wat vrij verslepen en met een
    -- hoekgreep vergroten/verkleinen op de A4-pagina mogelijk maakt.
    CREATE TABLE IF NOT EXISTS photobook_page_photos (
      id SERIAL PRIMARY KEY,
      page_id INTEGER NOT NULL REFERENCES photobook_pages(id) ON DELETE CASCADE,
      photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      caption TEXT,
      x REAL NOT NULL DEFAULT 0.1,
      y REAL NOT NULL DEFAULT 0.1,
      width REAL NOT NULL DEFAULT 0.4,
      height REAL NOT NULL DEFAULT 0.4,
      opacity REAL NOT NULL DEFAULT 1,
      corner_radius REAL NOT NULL DEFAULT 0,
      crop_x REAL NOT NULL DEFAULT 0.5,
      crop_y REAL NOT NULL DEFAULT 0.5,
      crop_zoom REAL NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS photobook_page_photos_page_idx ON photobook_page_photos(page_id, position);
    ALTER TABLE photobook_page_photos ADD COLUMN IF NOT EXISTS x REAL NOT NULL DEFAULT 0.1;
    ALTER TABLE photobook_page_photos ADD COLUMN IF NOT EXISTS y REAL NOT NULL DEFAULT 0.1;
    ALTER TABLE photobook_page_photos ADD COLUMN IF NOT EXISTS width REAL NOT NULL DEFAULT 0.4;
    ALTER TABLE photobook_page_photos ADD COLUMN IF NOT EXISTS height REAL NOT NULL DEFAULT 0.4;
    -- Doorzicht en hoekafronding per foto (CEWE-achtige stijlopties).
    ALTER TABLE photobook_page_photos ADD COLUMN IF NOT EXISTS opacity REAL NOT NULL DEFAULT 1;
    ALTER TABLE photobook_page_photos ADD COLUMN IF NOT EXISTS corner_radius REAL NOT NULL DEFAULT 0;
    -- Welk deel van de foto zichtbaar is binnen het kader: crop_x/crop_y is
    -- het brandpunt (0-1, zoals CSS object-position), crop_zoom vergroot dat
    -- verder in dan de standaard "vul het kader" (1 = geen extra inzoom).
    ALTER TABLE photobook_page_photos ADD COLUMN IF NOT EXISTS crop_x REAL NOT NULL DEFAULT 0.5;
    ALTER TABLE photobook_page_photos ADD COLUMN IF NOT EXISTS crop_y REAL NOT NULL DEFAULT 0.5;
    ALTER TABLE photobook_page_photos ADD COLUMN IF NOT EXISTS crop_zoom REAL NOT NULL DEFAULT 1;

    -- Zwevend tekstvak op een pagina, los van de vaste titel/beschrijving-band
    -- — vrij te verslepen/schalen net als een foto, met eigen HTML-inhoud
    -- (dezelfde beperkte opmaak-substring als titel/beschrijving/bijschrift).
    CREATE TABLE IF NOT EXISTS photobook_page_textboxes (
      id SERIAL PRIMARY KEY,
      page_id INTEGER NOT NULL REFERENCES photobook_pages(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      html TEXT,
      x REAL NOT NULL DEFAULT 0.15,
      y REAL NOT NULL DEFAULT 0.4,
      width REAL NOT NULL DEFAULT 0.7,
      height REAL NOT NULL DEFAULT 0.15,
      align TEXT NOT NULL DEFAULT 'center',
      background_color TEXT
    );
    CREATE INDEX IF NOT EXISTS photobook_page_textboxes_page_idx ON photobook_page_textboxes(page_id, position);

    -- Foto's van vóór het losse verslepen/schalen stonden allemaal op
    -- dezelfde standaardplek — dit verspreidt ze eenmalig over een simpel
    -- rooster per pagina, zodat ze niet allemaal op elkaar blijven liggen.
    -- De WHERE-voorwaarde (nog op de verse standaardwaarde) maakt dit veilig
    -- om bij elke herstart opnieuw te draaien.
    WITH ranked AS (
      SELECT id, page_id,
             ROW_NUMBER() OVER (PARTITION BY page_id ORDER BY position ASC) - 1 AS idx,
             COUNT(*) OVER (PARTITION BY page_id) AS total
      FROM photobook_page_photos
    )
    -- Vergelijking met een kleine tolerantie, niet exacte gelijkheid: REAL
    -- (float4) van de DEFAULT 0.1 kan als 0.100000001490116... zijn
    -- opgeslagen, waardoor "pp.x = 0.1" nooit waar is en de spreiding
    -- hieronder stil zou overslaan.
    UPDATE photobook_page_photos pp
    SET x = 0.06 + (r.idx % 2) * 0.47,
        y = 0.06 + (r.idx / 2) * 0.47,
        width = 0.44,
        height = 0.44
    FROM ranked r
    WHERE pp.id = r.id AND r.total > 1
      AND ABS(pp.x - 0.1) < 0.001 AND ABS(pp.y - 0.1) < 0.001
      AND ABS(pp.width - 0.4) < 0.001 AND ABS(pp.height - 0.4) < 0.001;

    -- photobook_pages had oorspronkelijk zelf één foto + bijschrift per rij
    -- (photo_id/caption) — nu vervangen door photobook_page_photos hierboven,
    -- zodat een pagina meerdere foto's kan bevatten. Bestaande pagina's worden
    -- hier eenmalig overgezet vóór de oude kolommen verdwijnen; de
    -- kolom-check maakt dit veilig om bij elke herstart opnieuw te draaien.
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'photobook_pages' AND column_name = 'photo_id') THEN
        INSERT INTO photobook_page_photos (page_id, photo_id, position, caption)
        SELECT id, photo_id, 0, caption FROM photobook_pages WHERE photo_id IS NOT NULL;
        UPDATE photobook_pages SET title = caption WHERE title IS NULL;
        ALTER TABLE photobook_pages DROP COLUMN photo_id;
        ALTER TABLE photobook_pages DROP COLUMN caption;
      END IF;
    END $$;
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

  // Zelfde verhaal voor de stap van het felle oranje naar het pastelpalet:
  // opnieuw slot voor slot, en bewust ná het blok hierboven, zodat een heel
  // oude rij in twee stappen (blauw -> oranje -> pastel) alsnog goed uitkomt.
  await query(`
    UPDATE trips SET cover_color = CASE cover_color
      WHEN '#FF7A00' THEN '#F3C2B5'
      WHEN '#8A4B12' THEN '#E98C7D'
      WHEN '#6B3A2A' THEN '#F6E2A7'
      WHEN '#4A5D3A' THEN '#A8C7B3'
      WHEN '#4A2F42' THEN '#B8D6E8'
      WHEN '#3D2E22' THEN '#8C4A3F'
      WHEN '#6B3145' THEN '#7B7571'
      WHEN '#5A4632' THEN '#373432'
    END
    WHERE cover_color IN ('#FF7A00','#8A4B12','#6B3A2A','#4A5D3A','#4A2F42','#3D2E22','#6B3145','#5A4632');
  `);

  // ADD COLUMN IF NOT EXISTS laat de DEFAULT van een bestaande kolom staan,
  // dus die moet los bijgewerkt worden (zie ook title_y eerder).
  await query(`ALTER TABLE trips ALTER COLUMN cover_color SET DEFAULT '#F3C2B5';`);

  // Merge any photos already duplicated (same trip, identical bytes) before
  // this content_hash uniqueness was introduced, so the index below can apply.
  await mergeDuplicatePhotos();
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS photos_trip_hash_unique ON photos(trip_id, content_hash) WHERE content_hash IS NOT NULL;
  `);

  // Een reis hoort per datum één dagkaart te hebben. Dat was nergens
  // afgedwongen, en een oudere versie kon er twee maken: de reeks dagen werd
  // toen met setDate() opgebouwd, wat over een zomertijdovergang 23 uur
  // vooruit stapt en dezelfde datum een tweede keer oplevert. Die dubbele
  // kaarten staan nog in bestaande reizen. Eerst samenvoegen, dan vastzetten
  // met een index — in die volgorde, anders faalt de index en start de app niet.
  await mergeDuplicateDays();
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS days_trip_date_unique ON days(trip_id, date);
  `);
}

// Voegt dubbele dagkaarten (zelfde reis, zelfde datum) samen op de oudste. Wat
// eraan hangt — activiteiten, foto's, verhalen, reacties, duimpjes — verhuist
// mee, zodat er niets verdwijnt. Bij de verhalen en duimpjes staat één rij per
// dag per gebruiker vast; komt dezelfde gebruiker op beide kaarten voor, dan
// blijft die van de oudste kaart staan en vervalt de andere.
async function mergeDuplicateDays() {
  const { rows: groups } = await query(`
    SELECT trip_id, date, array_agg(id ORDER BY id ASC) AS ids
    FROM days
    GROUP BY trip_id, date
    HAVING COUNT(*) > 1
  `);
  for (const group of groups) {
    const [keepId, ...dupIds] = group.ids;
    for (const dupId of dupIds) {
      for (const tabel of ["journal_entries", "journal_likes"]) {
        await query(
          `DELETE FROM ${tabel} WHERE day_id = $2
             AND user_id IN (SELECT user_id FROM ${tabel} WHERE day_id = $1)`,
          [keepId, dupId]
        );
      }
      for (const tabel of ["activities", "photos", "journal_entries", "journal_comments", "journal_likes"]) {
        await query(`UPDATE ${tabel} SET day_id = $1 WHERE day_id = $2`, [keepId, dupId]);
      }
      // De titel en notities van de bewaarde kaart winnen; alleen wat daar leeg
      // is wordt uit de dubbele overgenomen, zodat aantekeningen niet weglekken.
      await query(
        `UPDATE days k SET title = COALESCE(k.title, v.title), notes = COALESCE(k.notes, v.notes)
         FROM (SELECT * FROM days WHERE id = $2) v WHERE k.id = $1`,
        [keepId, dupId]
      );
      await query("DELETE FROM days WHERE id = $1", [dupId]);
    }
  }
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

module.exports = { query, transaction, initDb, pool };
