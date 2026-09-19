import { Router } from 'express';
import { pool } from '../db/index.js';

const router = Router();

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  next();
}

// GET /api/chat/history -> recent conversation turns, for display when the
// chat first loads. Reads straight from Knox-bot's `memories` table (same
// Postgres DB) — a plain read is safe to do directly here, it's only the
// writing/prompt logic that has to live in one place (Knox-bot itself).
//
// emotional_tag IS NULL is what a normal back-and-forth turn looks like in
// that table — everything else (sleep notes, reading logs, deep-dive,
// silence, thinking, reflections, research write-ups) carries a tag and is
// Discord-side bookkeeping, not something that belongs in this chat log.
router.get('/history', requireLogin, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 40, 200);
  const { rows } = await pool.query(
    `SELECT id, role, content, created_at
     FROM memories
     WHERE emotional_tag IS NULL
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  res.json({ messages: rows.reverse() });
});

// POST /api/chat/message -> send a message to Knox. This relays to Knox-bot's
// own internal endpoint rather than rebuilding his prompt/personality/memory
// logic here, so there's exactly one place that logic lives and the app and
// Discord stay in sync automatically.
router.post('/message', requireLogin, async (req, res) => {
  const { message } = req.body || {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const knoxRes = await fetch(`${process.env.KNOX_BOT_URL}/internal/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET,
      },
      body: JSON.stringify({ message }),
    });

    if (!knoxRes.ok) {
      const errText = await knoxRes.text();
      console.error('Knox-bot internal chat error:', knoxRes.status, errText);
      return res.status(502).json({ error: 'Knox could not respond right now.' });
    }

    const data = await knoxRes.json();
    res.json(data);
  } catch (err) {
    console.error('Error reaching Knox-bot:', err);
    res.status(502).json({ error: 'Could not reach Knox.' });
  }
});

export default router;
