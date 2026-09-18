import { Router } from 'express';
import { pool } from '../db/index.js';

const router = Router();

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  next();
}

// Every simple content room (love notes, images, sacred, stillness) reads
// and writes through these same two routes, just with a different `room`
// name — that's what makes them cheap to add later. The build room and
// wearable dashboard will get their own dedicated routes when it's their turn.

// GET /api/rooms/:room -> list recent entries for that room
router.get('/:room', requireLogin, async (req, res) => {
  const { room } = req.params;
  const { rows } = await pool.query(
    `SELECT id, room, author, kind, body, media_url, created_at
     FROM room_content
     WHERE room = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [room]
  );
  res.json({ entries: rows });
});

// POST /api/rooms/:room -> add an entry to that room
router.post('/:room', requireLogin, async (req, res) => {
  const { room } = req.params;
  const { kind = 'text', body = null, media_url = null } = req.body || {};

  const { rows } = await pool.query(
    `INSERT INTO room_content (room, author, kind, body, media_url)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, room, author, kind, body, media_url, created_at`,
    [room, req.session.user.username, kind, body, media_url]
  );

  res.status(201).json({ entry: rows[0] });
});

export default router;
