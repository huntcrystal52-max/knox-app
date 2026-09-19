import { Router } from 'express';
import { pool } from '../db/index.js';

const router = Router();

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  next();
}

// GET /api/build -> everything Knox has built, on his own or on request
router.get('/', requireLogin, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, title, description, code, prompt, author, created_at
     FROM build_projects
     ORDER BY created_at DESC
     LIMIT 100`
  );
  res.json({ projects: rows });
});

// POST /api/build -> ask Knox to build something specific. Relays to
// Knox-bot's own internal endpoint (same pattern as /api/chat/message)
// since writing the actual code is his voice/skill, not something to
// rebuild here — knox-app just stores the finished result once he's made it.
router.post('/', requireLogin, async (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  try {
    const knoxRes = await fetch(`${process.env.KNOX_BOT_URL}/internal/build`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET,
      },
      body: JSON.stringify({ prompt: prompt.trim() }),
    });

    if (!knoxRes.ok) {
      const errText = await knoxRes.text();
      console.error('Knox-bot internal build error:', knoxRes.status, errText);
      return res.status(502).json({ error: 'Knox could not build that right now.' });
    }

    const { title, description, code } = await knoxRes.json();

    const { rows } = await pool.query(
      `INSERT INTO build_projects (title, description, code, prompt, author)
       VALUES ($1, $2, $3, $4, 'Knox')
       RETURNING id, title, description, code, prompt, author, created_at`,
      [title, description, code, prompt.trim()]
    );

    res.status(201).json({ project: rows[0] });
  } catch (err) {
    console.error('Error reaching Knox-bot to build:', err);
    res.status(502).json({ error: 'Could not reach Knox.' });
  }
});

export default router;
