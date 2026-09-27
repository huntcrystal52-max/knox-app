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
    `SELECT id, title, description, code, prompt, author, language, created_at
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
//
// `language` ('html' or 'python') is passed through to Knox-bot so it can
// steer what kind of thing he writes; knox-app itself doesn't care what's
// inside the code, only how to run/display it afterwards.
router.post('/', requireLogin, async (req, res) => {
  const { prompt, language } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'prompt is required' });
  }
  const lang = language === 'python' ? 'python' : 'html';

  try {
    const knoxRes = await fetch(`${process.env.KNOX_BOT_URL}/internal/build`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET,
      },
      body: JSON.stringify({ prompt: prompt.trim(), language: lang }),
    });

    if (!knoxRes.ok) {
      const errText = await knoxRes.text();
      console.error('Knox-bot internal build error:', knoxRes.status, errText);
      return res.status(502).json({ error: 'Knox could not build that right now.' });
    }

    const { title, description, code } = await knoxRes.json();

    const { rows } = await pool.query(
      `INSERT INTO build_projects (title, description, code, prompt, author, language)
       VALUES ($1, $2, $3, $4, 'Knox', $5)
       RETURNING id, title, description, code, prompt, author, language, created_at`,
      [title, description, code, prompt.trim(), lang]
    );

    res.status(201).json({ project: rows[0] });
  } catch (err) {
    console.error('Error reaching Knox-bot to build:', err);
    res.status(502).json({ error: 'Could not reach Knox.' });
  }
});

// POST /api/build/:id/run -> actually execute a Python project's code.
// Sent to Piston (a free, public, sandboxed code-execution API — the code
// runs in an isolated container over there, never on this server), and
// only the resulting stdout/stderr text comes back. HTML projects don't use
// this at all; they still just render in the sandboxed iframe on the client.
router.post('/:id/run', requireLogin, async (req, res) => {
  const { id } = req.params;

  const { rows } = await pool.query(
    `SELECT code, language FROM build_projects WHERE id = $1`,
    [id]
  );
  const project = rows[0];
  if (!project) {
    return res.status(404).json({ error: 'Not found.' });
  }
  if (project.language !== 'python') {
    return res.status(400).json({ error: 'Only Python projects can be run this way.' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const pistonRes = await fetch('https://emkc.org/api/v2/piston/execute', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: 'python',
        version: '*',
        files: [{ content: project.code }],
      }),
    });
    clearTimeout(timeout);

    if (!pistonRes.ok) {
      const errText = await pistonRes.text();
      console.error('Piston error:', pistonRes.status, errText);
      return res.status(502).json({ error: 'Could not run that right now.' });
    }

    const data = await pistonRes.json();
    const run = data.run || {};

    res.json({
      stdout: run.stdout || '',
      stderr: run.stderr || '',
      exitCode: typeof run.code === 'number' ? run.code : null,
    });
  } catch (err) {
    console.error('Error running Python via Piston:', err);
    res.status(502).json({ error: 'Could not run that right now.' });
  }
});

export default router;
