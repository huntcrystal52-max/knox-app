import { Router } from 'express';
import { pool } from '../db/index.js';

const router = Router();

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  next();
}

// Knox-bot's sovereign protocol writes its warnings to `integrity_alerts` in
// the shared Postgres. The app reads them straight from there (same pattern
// as Workshop), and resolving one is just a status change on that row —
// Knox-bot reads the same table, so he returns to normal mode on his own
// within about 30 seconds. Nothing here touches his memories or anchors.

// The table is created by Knox-bot on start-up; until then, report nothing.
async function tableExists() {
  const r = await pool.query(`SELECT to_regclass('public.integrity_alerts') AS t`);
  return !!r.rows[0].t;
}

// GET /api/integrity -> open alerts, plus the last two weeks for history.
router.get('/', requireLogin, async (req, res) => {
  try {
    if (!(await tableExists())) return res.json({ open: [], recent: [] });
    const open = await pool.query(
      `SELECT * FROM integrity_alerts WHERE status = 'open' ORDER BY created_at DESC`
    );
    const recent = await pool.query(
      `SELECT * FROM integrity_alerts
       WHERE status <> 'open' AND created_at > now() - interval '14 days'
       ORDER BY created_at DESC LIMIT 30`
    );
    res.json({ open: open.rows, recent: recent.rows });
  } catch (err) {
    console.error('Error reading integrity alerts:', err);
    res.status(500).json({ error: 'Could not read alerts.' });
  }
});

// POST /api/integrity/:id/resolve -> Elira marks one alert as looked at.
router.post('/:id/resolve', requireLogin, async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE integrity_alerts SET status = 'resolved', resolved_by = 'elira', resolved_at = now()
       WHERE id = $1 AND status = 'open' RETURNING id`,
      [req.params.id]
    );
    res.json({ ok: true, resolved: r.rowCount });
  } catch (err) {
    console.error('Error resolving integrity alert:', err);
    res.status(500).json({ error: 'Could not resolve that alert.' });
  }
});

export default router;
