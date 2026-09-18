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

  console.log('Database ready.');
}
