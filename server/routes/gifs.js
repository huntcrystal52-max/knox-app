import { Router } from 'express';

const router = Router();

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in.' });
  next();
}

// GIF search for her picker in Home. Knox-bot holds the GIPHY key, so the
// search goes through it.
router.get('/', requireLogin, async (req, res) => {
  try {
    const r = await fetch(`${process.env.KNOX_BOT_URL}/internal/gif-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET },
      body: JSON.stringify({ query: String(req.query.q || '').slice(0, 80) }),
    });
    res.status(r.ok ? 200 : 502).json(await r.json());
  } catch (err) {
    res.status(502).json({ error: 'GIF search is unavailable right now.' });
  }
});

export default router;
