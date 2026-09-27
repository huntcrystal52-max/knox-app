import { Router } from 'express';
import { pool } from '../db/index.js';

const router = Router();

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  next();
}

// GET /api/house -> the house as it currently stands. Reads straight from
// Knox-bot's own tables (same shared Postgres, same pattern as chat history)
// since House lives and grows there, not in knox-app's own schema — a plain
// read is safe to do directly here.
router.get('/', requireLogin, async (req, res) => {
  const metaResult = await pool.query(`SELECT last_image_url, last_updated, visits FROM house_meta WHERE id = 1`);
  const additionsResult = await pool.query(
    `SELECT id, room, type, description, added_by, build_stage, added_at
     FROM house_additions
     ORDER BY added_at ASC`
  );
  res.json({
    imageUrl: metaResult.rows[0] ? metaResult.rows[0].last_image_url : null,
    lastUpdated: metaResult.rows[0] ? metaResult.rows[0].last_updated : null,
    additions: additionsResult.rows,
  });
});

// POST /api/house -> ask Knox to build something onto the house. Relays to
// Knox-bot's own internal endpoint (same pattern as /api/build) — writing
// the description and editing the house image is his voice/skill, and it
// has to happen there since that's where the House's actual state lives.
router.post('/', requireLogin, async (req, res) => {
  const { room, prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  try {
    const knoxRes = await fetch(`${process.env.KNOX_BOT_URL}/internal/house/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET,
      },
      body: JSON.stringify({ room: room || null, prompt: prompt.trim() }),
    });

    if (!knoxRes.ok) {
      const errText = await knoxRes.text();
      console.error('Knox-bot internal house/add error:', knoxRes.status, errText);
      return res.status(502).json({ error: 'Knox could not build that right now.' });
    }

    const data = await knoxRes.json();
    res.status(201).json(data);
  } catch (err) {
    console.error('Error reaching Knox-bot to build the house:', err);
    res.status(502).json({ error: 'Could not reach Knox.' });
  }
});

export default router;
