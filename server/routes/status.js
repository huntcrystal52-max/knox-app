import { Router } from 'express';

const router = Router();

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  next();
}

// GET /api/status -> is Knox-bot actually up right now. This doesn't use the
// internal chat endpoint (that would burn a real reply just to check), it
// just confirms Knox-bot's server answers at all, with a short timeout so a
// slow/dead bot doesn't hang the badge forever.
router.get('/', requireLogin, async (req, res) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    await fetch(process.env.KNOX_BOT_URL, { signal: controller.signal });
    clearTimeout(timeout);

    res.json({ online: true });
  } catch (err) {
    res.json({ online: false });
  }
});

export default router;
