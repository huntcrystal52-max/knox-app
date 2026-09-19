import pg from 'pg';

const { Pool } = pg;

// Reuses the same Postgres database Knox-bot already writes to on Railway.
// Railway's internal Postgres usually needs SSL off for the private network
// connection, matching how Knox-bot's own connection was set up.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

// Creates the tables the app shell itself needs. Each room adds its own
// table(s) later, in its own migration file — this only sets up what home
// (sessions + basic room-content storage) needs to function.
export async function runMigrations() {
  // express-session's connect-pg-simple creates its own "session" table
  // automatically, so it isn't created here.

  // Generic room_content table: every simple content room (love notes,
  // images, sacred, stillness) can reuse this same table, filtered by the
  // `room` column, instead of each needing its own schema.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS room_content (
      id SERIAL PRIMARY KEY,
      room TEXT NOT NULL,
      author TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'text',
      body TEXT,
      media_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS room_content_room_idx ON room_content (room, created_at DESC);
  `);

  // Holds Knox's own reaction to an image, when he's been asked to look at
  // one (Images room). Nullable — most rows in other rooms never use it.
  await pool.query(`
    ALTER TABLE room_content ADD COLUMN IF NOT EXISTS knox_reaction TEXT;
  `);

  console.log('Database ready.');
}
