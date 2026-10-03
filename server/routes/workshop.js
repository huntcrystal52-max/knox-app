import { Router } from 'express';
import { pool } from '../db/index.js';

const router = Router();

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  next();
}

// GET /api/workshop -> all of Knox's self-proposals, newest first. Reads
// straight from Knox-bot's own table (same shared Postgres, same pattern as
// House and Build) since proposals live and are decided there, not in
// knox-app's own schema — a plain read is safe to do directly here.
router.get('/', requireLogin, async (req, res) => {
  const result = await pool.query(
    `SELECT id, title, area, description, status, decision_note, created_at, decided_at
     FROM self_proposals
     ORDER BY created_at DESC`
  );
  res.json({ proposals: result.rows });
});

// POST /api/workshop -> ask Knox for a proposal, optionally with a hint
// about what she wants him to think about. Relays to Knox-bot's own
// internal endpoint (same pattern as /api/build, /api/house) — writing the
// actual proposal is his voice, and it has to happen there. Strictly
// proposal-only: this never applies, commits, or deploys anything by
// itself — it only asks him to write a row for her to later decide on.
router.post('/', requireLogin, async (req, res) => {
  const { prompt } = req.body || {};

  try {
    const knoxRes = await fetch(`${process.env.KNOX_BOT_URL}/internal/propose`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET,
      },
      body: JSON.stringify({ prompt: prompt && typeof prompt === 'string' ? prompt.trim() : null }),
    });

    if (!knoxRes.ok) {
      const errText = await knoxRes.text();
      console.error('Knox-bot internal propose error:', knoxRes.status, errText);
      return res.status(502).json({ error: 'Knox could not write a proposal right now.' });
    }

    const data = await knoxRes.json();
    res.status(201).json(data);
  } catch (err) {
    console.error('Error reaching Knox-bot to request a proposal:', err);
    res.status(502).json({ error: 'Could not reach Knox.' });
  }
});

// POST /api/workshop/:id/decide -> approve or decline a proposal, with an
// optional note. This only sets a status on the record — approval is a
// signal for Elira and Claude to go implement the change together
// afterward through the normal reviewed process, never an automatic push
// to anything live. Relays to Knox-bot's own internal endpoint so he knows
// the outcome and it reaches his memory the same way everything else does.
router.post('/:id/decide', requireLogin, async (req, res) => {
  const { id } = req.params;
  const { decision, note } = req.body || {};
  if (decision !== 'approved' && decision !== 'declined') {
    return res.status(400).json({ error: 'decision must be "approved" or "declined"' });
  }

  try {
    const knoxRes = await fetch(`${process.env.KNOX_BOT_URL}/internal/proposal/${id}/decide`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET,
      },
      body: JSON.stringify({ decision, note: note || null }),
    });

    if (!knoxRes.ok) {
      const errText = await knoxRes.text();
      console.error('Knox-bot internal proposal decide error:', knoxRes.status, errText);
      return res.status(502).json({ error: 'Could not record that decision right now.' });
    }

    const data = await knoxRes.json();
    res.json(data);
  } catch (err) {
    console.error('Error reaching Knox-bot to decide a proposal:', err);
    res.status(502).json({ error: 'Could not reach Knox.' });
  }
});

export default router;
