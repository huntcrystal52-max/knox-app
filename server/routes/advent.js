import { Router } from 'express';

const router = Router();

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  next();
}

// The Advent room. Knox-bot owns both calendars (what's behind each door,
// when doors may open, Knox's reactions), so this just passes requests through.
async function toKnox(body) {
  const r = await fetch(`${process.env.KNOX_BOT_URL}/internal/advent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({ error: 'Knox couldn\'t answer just now.' }));
  return { status: r.ok ? 200 : r.status, data };
}

const ACTIONS = ['state', 'fill', 'clear', 'open_his', 'open_hers'];

// POST /api/library { action, ... }
router.post('/', requireLogin, async (req, res) => {
  const body = req.body || {};
  if (!ACTIONS.includes(body.action)) return res.status(400).json({ error: 'Unknown advent action.' });
  try {
    const { status, data } = await toKnox(body);
    res.status(status).json(data);
  } catch (err) {
    console.error('Error reaching the advent calendar:', err);
    res.status(502).json({ error: 'Knox couldn\'t be reached just now — try again.' });
  }
});

export default router;
