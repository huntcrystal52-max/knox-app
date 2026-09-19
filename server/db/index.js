import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

export async function runMigrations() {
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
