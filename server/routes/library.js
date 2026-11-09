import { Router } from 'express';

const router = Router();

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  next();
}

// The Library room. Knox-bot owns the library (reading files, splitting books,
// reading time), so this just passes each request through to it.
async function toKnox(body) {
  const r = await fetch(`${process.env.KNOX_BOT_URL}/internal/library`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({ error: 'Knox couldn\'t answer just now.' }));
  return { status: r.ok ? 200 : r.status, data };
}

const ACTIONS = ['state', 'add_file', 'add_text', 'search_classics', 'add_classic', 'remove', 'add_highlights', 'start_reading', 'stop_reading', 'reading_ping'];

// POST /api/library { action, ... }
router.post('/', requireLogin, async (req, res) => {
  const body = req.body || {};
  if (!ACTIONS.includes(body.action)) return res.status(400).json({ error: 'Unknown library action.' });
  try {
    const { status, data } = await toKnox(body);
    res.status(status).json(data);
  } catch (err) {
    console.error('Error reaching the library:', err);
    res.status(502).json({ error: 'Knox couldn\'t be reached just now — try again.' });
  }
});

export default router;
