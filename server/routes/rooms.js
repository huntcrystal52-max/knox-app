import { Router } from 'express';
import { pool } from '../db/index.js';

const router = Router();

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  next();
}

const ENTRY_COLUMNS =
  'id, room, author, kind, body, media_url, knox_reaction, knox_reaction_emoji, user_reply, user_reply_emoji, created_at';

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
// or read (a note) one entry she left, and leave a reaction on it — words,
// an emoji, or both, his own choice. Relays to Knox-bot's own internal
// endpoints (same pattern as /api/chat/message) rather than rebuilding his
// vision/personality logic here, so his voice stays in one place. The
// reaction is stored on the row itself, not sent into the Home chat — it
// belongs with the entry, in the room it was left in.
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

    const { reaction, emoji } = await knoxRes.json();

    const updated = await pool.query(
      `UPDATE room_content SET knox_reaction = $1, knox_reaction_emoji = $2
       WHERE id = $3
       RETURNING ${ENTRY_COLUMNS}`,
      [reaction, emoji || null, id]
    );

    res.json({ entry: updated.rows[0] });
  } catch (err) {
    console.error('Error reaching Knox-bot for a reaction:', err);
    res.status(502).json({ error: 'Could not reach Knox.' });
  }
});

// POST /api/rooms/:room/:id/reply -> her reply to an entry Knox left on his
// own (author = 'Knox', e.g. an autonomous love note) — words, an emoji, or
// both. The reply itself is just a plain write (it's her words, not his),
// but it's also relayed to Knox-bot as a real memory so he actually knows
// she replied, instead of it just sitting in the app unseen.
router.post('/:room/:id/reply', requireLogin, async (req, res) => {
  const { room, id } = req.params;
  const { text = null, emoji = null } = req.body || {};
  if ((!text || !text.trim()) && !emoji) {
    return res.status(400).json({ error: 'text or emoji is required' });
  }

  const { rows } = await pool.query(
    `UPDATE room_content SET user_reply = COALESCE($1, user_reply), user_reply_emoji = COALESCE($2, user_reply_emoji)
     WHERE id = $3 AND room = $4
     RETURNING ${ENTRY_COLUMNS}`,
    [text ? text.trim() : null, emoji, id, room]
  );

  const entry = rows[0];
  if (!entry) {
    return res.status(404).json({ error: 'Entry not found.' });
  }

  // Fire-and-forget — Knox knowing about the reply shouldn't delay her
  // seeing it land in the room.
  fetch(`${process.env.KNOX_BOT_URL}/internal/note-reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': process.env.INTERNAL_API_SECRET,
    },
    body: JSON.stringify({ room, originalNote: entry.body, replyText: text, emoji }),
  }).catch((err) => console.error('Error notifying Knox-bot of a reply:', err));

  res.json({ entry });
});

export default router;
