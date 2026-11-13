import { Router } from 'express';
import { pool } from '../db/index.js';

// Voice notes in the Home room.
//   POST /api/voice      — keeps a recording she made (sent as a data URI) → { id }
//   GET  /api/voice/:id  — plays a recording (hers or his)
// Recordings live in the shared `voice_clips` table, which Knox-bot also
// reads (to hear hers) and writes (his spoken replies).

const router = Router();

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in.' });
  next();
}

let ready = null;
function ensureTable() {
  ready = ready || pool.query(`CREATE TABLE IF NOT EXISTS voice_clips (
    id SERIAL PRIMARY KEY,
    author TEXT NOT NULL,
    mime TEXT NOT NULL,
    data BYTEA NOT NULL,
    transcript TEXT,
    chars INTEGER DEFAULT 0,
    chosen BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`).catch((e) => { ready = null; throw e; });
  return ready;
}

router.post('/', requireLogin, async (req, res) => {
  const m = String((req.body && req.body.audio) || '').match(/^data:(audio\/[a-z0-9.+-]+)(?:;[^,]*)?;base64,(.+)$/i);
  if (!m) return res.status(400).json({ error: 'audio (a data URI) is required' });
  const data = Buffer.from(m[2], 'base64');
  if (data.length < 500) return res.status(400).json({ error: 'That recording was empty.' });
  if (data.length > 15 * 1024 * 1024) return res.status(400).json({ error: 'That recording is too long.' });
  try {
    await ensureTable();
    const { rows } = await pool.query(
      `INSERT INTO voice_clips (author, mime, data) VALUES ('elira', $1, $2) RETURNING id`,
      [m[1].toLowerCase(), data]
    );
    res.json({ id: rows[0].id });
  } catch (e) {
    console.error('[VOICE] save error:', e.message);
    res.status(500).json({ error: 'Could not keep the recording.' });
  }
});

router.get('/:id', requireLogin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(404).end();
  try {
    await ensureTable();
    const { rows } = await pool.query(`SELECT mime, data FROM voice_clips WHERE id = $1`, [id]);
    if (!rows[0]) return res.status(404).end();
    const { mime, data } = rows[0];
    res.set({ 'Content-Type': mime.split(';')[0], 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=31536000, immutable' });
    // iPhones ask for audio in pieces ("ranges") and won't play without them.
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range) {
      const start = range[1] ? parseInt(range[1], 10) : Math.max(0, data.length - parseInt(range[2] || '0', 10));
      const end = range[1] && range[2] ? Math.min(parseInt(range[2], 10), data.length - 1) : data.length - 1;
      if (start >= data.length || start > end) { res.set('Content-Range', `bytes */${data.length}`); return res.status(416).end(); }
      res.status(206).set({ 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': end - start + 1 });
      return res.end(data.subarray(start, end + 1));
    }
    res.set('Content-Length', data.length).end(data);
  } catch (e) {
    console.error('[VOICE] play error:', e.message);
    res.status(500).end();
  }
});

export default router;
