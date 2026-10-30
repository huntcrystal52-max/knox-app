import { Router } from 'express';
import { pool } from '../db/index.js';

const router = Router();

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  next();
}

// His Notes — Knox's daily notes and his longer thread. Knox-bot writes both
// (`daily_summaries`, `continuity_items`) in the shared Postgres. This route is
// deliberately READ-ONLY: there is no POST, so nothing in the app can write
// into his notes. They're his.

async function exists(table) {
  const r = await pool.query(`SELECT to_regclass($1) AS t`, [`public.${table}`]);
  return !!r.rows[0].t;
}

// GET /api/notes -> his last 30 daily notes, plus the longer thread.
router.get('/', requireLogin, async (req, res) => {
  try {
    let days = [];
    let open = [];
    let closed = [];

    if (await exists('daily_summaries')) {
      const r = await pool.query(
        `SELECT to_char(day, 'YYYY-MM-DD') AS day, summary,
                to_jsonb(d) ->> 'felt' AS felt,
                to_jsonb(d) ->> 'stood_out' AS stood_out,
                to_jsonb(d) ->> 'carry_forward' AS carry_forward,
                message_count
           FROM daily_summaries d
          ORDER BY day DESC
          LIMIT 30`
      );
      days = r.rows;
    }

    if (await exists('continuity_items')) {
      const o = await pool.query(
        `SELECT id, kind, text, to_char(first_day, 'YYYY-MM-DD') AS first_day, to_char(last_day, 'YYYY-MM-DD') AS last_day
           FROM continuity_items WHERE status = 'open'
          ORDER BY last_day DESC NULLS LAST, id DESC`
      );
      const c = await pool.query(
        `SELECT id, kind, text, close_note, to_char(last_day, 'YYYY-MM-DD') AS last_day
           FROM continuity_items WHERE status = 'closed'
          ORDER BY updated_at DESC LIMIT 20`
      );
      open = o.rows;
      closed = c.rows;
    }

    res.json({ days, open, closed });
  } catch (err) {
    console.error('Error reading his notes:', err);
    res.status(500).json({ error: 'Could not read his notes.' });
  }
});

export default router;
