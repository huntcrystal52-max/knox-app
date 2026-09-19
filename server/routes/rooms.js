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
    `SELECT id, room, author, kind, body, media_url, knox_reaction, created_at
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
     RETURNING id, room, author, kind, body, media_url, knox_reaction, created_at`,
    [room, req.session.user.username, kind, body, media_url]
  );

  res.status(201).json({ entry: rows[0] });
});

// POST /api/rooms/images/:id/react -> ask Knox to actually look at one photo
// and leave a short reaction on it. This relays to Knox-bot's own internal
// endpoint (same pattern as /api/chat/message) rather than calling a vision
// model directly here, so his voice/personality logic still lives in one
// place. The reaction is stored on the row itself, not sent into the Home
// chat — it belongs with the photo, in this room.
router.post('/images/:id/react', requireLogin, async (req, res) => {
  const { id } = req.params;

  const { rows } = await pool.query(
    `SELECT id, body, media_url FROM room_content WHERE id = $1 AND room = 'images'`,
    [id]
  );
  const entry = rows[0];
  if (!entry) {
    return res.status(404).json({ error: 'Image not found.' });
  }

  try {
    const knoxRes = await fetch(`${process.env.KNOX_BOT_URL}/internal/react-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET,
      },
      body: JSON.stringify({ imageUrl: entry.media_url, caption: entry.body }),
    });

    if (!knoxRes.ok) {
      const errText = await knoxRes.text();
      console.error('Knox-bot internal react-image error:', knoxRes.status, errText);
      return res.status(502).json({ error: 'Knox could not look at that right now.' });
    }

    const { reaction } = await knoxRes.json();

    const updated = await pool.query(
      `UPDATE room_content SET knox_reaction = $1
       WHERE id = $2
       RETURNING id, room, author, kind, body, media_url, knox_reaction, created_at`,
      [reaction, id]
    );

    res.json({ entry: updated.rows[0] });
  } catch (err) {
    console.error('Error reaching Knox-bot for image reaction:', err);
    res.status(502).json({ error: 'Could not reach Knox.' });
  }
});

export default router;
