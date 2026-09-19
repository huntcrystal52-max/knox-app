import { Router } from 'express';
import { pool } from '../db/index.js';

const router = Router();

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  next();
}

const ENTRY_COLUMNS = 'id, room, author, kind, body, media_url, knox_reaction, user_reply, created_at';

// Every simple content room (love notes, images, sacred, stillness) reads
// and writes through these same two routes, just with a different `room`
// name — that's what makes them cheap to add later. The build room and
// wearable dashboard will get their own dedicated routes when it's their turn.

// GET /api/rooms/:room -> list recent entries for that room
router.get('/:room', requireLogin, async (req, res) => {
  const { room } = req.params;
  const { rows } = await pool.query(
    `SELECT ${ENTRY_COLUMNS}
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
     RETURNING ${ENTRY_COLUMNS}`,
    [room, req.session.user.username, kind, body, media_url]
  );

  res.status(201).json({ entry: rows[0] });
});

// POST /api/rooms/:room/:id/react -> ask Knox to actually look at (an image)
// or read (a note) one entry and leave a short reaction on it. This relays
// to Knox-bot's own internal endpoints (same pattern as /api/chat/message)
// rather than rebuilding his vision/personality logic here, so his voice
// stays in one place. Works for any room/kind — an image entry gets the
// vision pipeline, anything else gets a plain text reaction. The reaction
// is stored on the row itself, not sent into the Home chat — it belongs
// with the entry, in the room it was left in.
router.post('/:room/:id/react', requireLogin, async (req, res) => {
  const { room, id } = req.params;

  const { rows } = await pool.query(
    `SELECT id, room, kind, body, media_url FROM room_content WHERE id = $1 AND room = $2`,
    [id, room]
  );
  const entry = rows[0];
  if (!entry) {
    return res.status(404).json({ error: 'Entry not found.' });
  }

  const isImage = entry.kind === 'image' && entry.media_url;
  const path = isImage ? '/internal/react-image' : '/internal/react-text';
  const payload = isImage
    ? { imageUrl: entry.media_url, caption: entry.body }
    : { room: entry.room, text: entry.body };

  try {
    const knoxRes = await fetch(`${process.env.KNOX_BOT_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET,
      },
      body: JSON.stringify(payload),
    });

    if (!knoxRes.ok) {
      const errText = await knoxRes.text();
      console.error('Knox-bot internal react error:', knoxRes.status, errText);
      return res.status(502).json({ error: 'Knox could not react to that right now.' });
    }

    const { reaction } = await knoxRes.json();

    const updated = await pool.query(
      `UPDATE room_content SET knox_reaction = $1
       WHERE id = $2
       RETURNING ${ENTRY_COLUMNS}`,
      [reaction, id]
    );

    res.json({ entry: updated.rows[0] });
  } catch (err) {
    console.error('Error reaching Knox-bot for a reaction:', err);
    res.status(502).json({ error: 'Could not reach Knox.' });
  }
});

// POST /api/rooms/:room/:id/reply -> her reply to an entry Knox left on his
// own (author = 'Knox', e.g. an autonomous love note). This is just a plain
// write — no round trip to Knox-bot needed, since it's her words, not his.
router.post('/:room/:id/reply', requireLogin, async (req, res) => {
  const { room, id } = req.params;
  const { text } = req.body || {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }

  const { rows } = await pool.query(
    `UPDATE room_content SET user_reply = $1
     WHERE id = $2 AND room = $3
     RETURNING ${ENTRY_COLUMNS}`,
    [text.trim(), id, room]
  );

  if (!rows[0]) {
    return res.status(404).json({ error: 'Entry not found.' });
  }

  res.json({ entry: rows[0] });
});

export default router;
