import { Router } from 'express';
import { pool } from '../db/index.js';

const router = Router();

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  next();
}

// The gift list. Knox's ideas for Elira stay private until he shares one —
// this route never sends a private idea to the browser, only how many he's
// holding. Her wishlist is hers to add to; he can see it on his side.

// GET /api/gifts
router.get('/', requireLogin, async (req, res) => {
  try {
    const hidden = await pool.query(`SELECT count(*)::int AS n FROM gift_ideas WHERE added_by = 'knox' AND status = 'idea'`);
    const fromKnox = await pool.query(
      `SELECT id, title, note, link, link_title, status, shared_at FROM gift_ideas
        WHERE added_by = 'knox' AND status IN ('shared', 'got') ORDER BY shared_at DESC NULLS LAST, id DESC`
    );
    const wishlist = await pool.query(
      `SELECT id, title, note, link, status, created_at FROM gift_ideas
        WHERE added_by = 'elira' AND status IN ('idea', 'got') ORDER BY created_at DESC`
    );
    res.json({ hiddenCount: hidden.rows[0].n, fromKnox: fromKnox.rows, wishlist: wishlist.rows });
  } catch (err) {
    console.error('Error reading gifts:', err);
    res.status(500).json({ error: 'Could not load the gift list.' });
  }
});

// POST /api/gifts/wish { title, note?, link? } -> add to her wishlist.
router.post('/wish', requireLogin, async (req, res) => {
  const title = String((req.body && req.body.title) || '').trim().slice(0, 120);
  const note = String((req.body && req.body.note) || '').trim().slice(0, 300) || null;
  let link = String((req.body && req.body.link) || '').trim().slice(0, 500) || null;
  if (link && !/^https?:\/\//i.test(link)) link = null;
  if (!title) return res.status(400).json({ error: 'What would you love?' });
  try {
    await pool.query(`INSERT INTO gift_ideas (for_whom, added_by, title, note, link) VALUES ('elira', 'elira', $1, $2, $3)`, [title, note, link]);
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('Error adding a wish:', err);
    res.status(500).json({ error: 'Could not add that.' });
  }
});

// POST /api/gifts/:id/got -> mark something as got (a shared idea or a wish).
router.post('/:id/got', requireLogin, async (req, res) => {
  try {
    await pool.query(
      `UPDATE gift_ideas SET status = 'got' WHERE id = $1 AND ((added_by = 'knox' AND status = 'shared') OR (added_by = 'elira' AND status = 'idea'))`,
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Could not update that.' }); }
});

// POST /api/gifts/:id/remove -> take one of her own wishes off the list.
router.post('/:id/remove', requireLogin, async (req, res) => {
  try {
    await pool.query(`UPDATE gift_ideas SET status = 'removed' WHERE id = $1 AND added_by = 'elira'`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Could not remove that.' }); }
});

export default router;
