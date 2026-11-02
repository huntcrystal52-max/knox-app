import { Router } from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool } from '../db/index.js';
import { talkToKnox, cleanMessage } from '../lib/gamechat.js';

const router = Router();

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  next();
}

// Wordle, together. One word a day (UK time). Elira guesses; after each guess
// Knox thinks it through with her and may suggest a word. He never sees the
// answer while it's being played — he's solving it with her, not hinting.

const here = dirname(fileURLToPath(import.meta.url));
const load = (f) => readFileSync(join(here, '..', 'data', f), 'utf8').split('\n').map((w) => w.trim()).filter((w) => /^[a-z]{5}$/.test(w));
const ANSWERS = load('wordle-answers.txt');
const VALID = new Set(load('wordle-guesses.txt'));

// A fixed shuffle of the answers, so each day has its own word and no word
// repeats until the whole list has been used.
function seededShuffle(list, seed) {
  const a = list.slice();
  let x = seed;
  const rand = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const ORDER = seededShuffle(ANSWERS, 20261101);
const START = Date.UTC(2026, 10, 1);

function today() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}
function answerFor(day) {
  const n = Math.round((Date.UTC(...day.split('-').map((v, i) => (i === 1 ? Number(v) - 1 : Number(v)))) - START) / 86400000);
  return ORDER[((n % ORDER.length) + ORDER.length) % ORDER.length];
}

// 'g' right place, 'y' in the word elsewhere, 'b' not in it — with repeated
// letters counted properly (a letter only turns yellow as many times as it's
// actually left in the answer).
export function score(guess, answer) {
  const out = Array(5).fill('b');
  const left = {};
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) out[i] = 'g';
    else left[answer[i]] = (left[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < 5; i++) {
    if (out[i] === 'g') continue;
    if (left[guess[i]]) { out[i] = 'y'; left[guess[i]]--; }
  }
  return out;
}

async function knoxThinks(guesses, status, answer) {
  try {
    const r = await fetch(`${process.env.KNOX_BOT_URL}/internal/game/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET },
      body: JSON.stringify({ turn: 'wordle_think', payload: { guesses, status, answer: status === 'playing' ? undefined : answer } }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

async function remember(memory) {
  try {
    await fetch(`${process.env.KNOX_BOT_URL}/internal/game/finished`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET },
      body: JSON.stringify({ memory }),
    });
  } catch (e) {}
}

async function getDay(day) {
  const r = await pool.query(`SELECT * FROM wordle_days WHERE day = $1::date`, [day]);
  if (r.rows[0]) return r.rows[0];
  const ins = await pool.query(
    `INSERT INTO wordle_days (day) VALUES ($1::date) ON CONFLICT (day) DO NOTHING RETURNING *`, [day]
  );
  return ins.rows[0] || (await pool.query(`SELECT * FROM wordle_days WHERE day = $1::date`, [day])).rows[0];
}

function view(row, day) {
  const answer = answerFor(day);
  const guesses = (row.guesses || []).map((w) => ({ word: w, pattern: score(w, answer) }));
  const keys = {};
  const rank = { g: 3, y: 2, b: 1 };
  for (const g of guesses) g.word.split('').forEach((ch, i) => { if (!keys[ch] || rank[g.pattern[i]] > rank[keys[ch]]) keys[ch] = g.pattern[i]; });
  return {
    day,
    guesses,
    keys,
    status: row.status,
    comments: row.comments || [],
    answer: row.status === 'playing' ? null : answer,
  };
}

// GET /api/wordle -> today's puzzle as it stands.
router.get('/', requireLogin, async (req, res) => {
  try {
    const day = today();
    res.json(view(await getDay(day), day));
  } catch (err) {
    console.error('Error loading Wordle:', err);
    res.status(500).json({ error: 'Could not load today\'s Wordle.' });
  }
});

// POST /api/wordle/guess { word }
router.post('/guess', requireLogin, async (req, res) => {
  try {
    const day = today();
    const row = await getDay(day);
    if (row.status !== 'playing') return res.status(409).json({ error: 'Today\'s is done — come back tomorrow.' });
    const word = String((req.body && req.body.word) || '').toLowerCase().trim();
    if (!/^[a-z]{5}$/.test(word)) return res.status(400).json({ error: 'Five letters, please.' });
    if (!VALID.has(word)) return res.status(400).json({ error: 'Not in the word list.' });
    if ((row.guesses || []).includes(word)) return res.status(400).json({ error: 'Already tried that one.' });

    const answer = answerFor(day);
    const guesses = [...(row.guesses || []), word];
    const status = word === answer ? 'won' : guesses.length >= 6 ? 'lost' : 'playing';
    const scored = guesses.map((w) => ({ word: w, pattern: score(w, answer) }));

    const k = await knoxThinks(scored, status, answer);
    const comments = [...(row.comments || [])];
    if (k && k.say) {
      const ok = status === 'playing' && k.suggestion && VALID.has(k.suggestion) && !guesses.includes(k.suggestion);
      comments.push({ after: guesses.length, text: k.say, suggestion: ok ? k.suggestion : null });
    }

    const r = await pool.query(
      `UPDATE wordle_days SET guesses = $1, status = $2, comments = $3, updated_at = now() WHERE day = $4::date RETURNING *`,
      [JSON.stringify(guesses), status, JSON.stringify(comments), day]
    );
    if (status !== 'playing') {
      remember(`[Did the Wordle together with Elira — the word was ${answer.toUpperCase()}. ${status === 'won' ? `We got it in ${guesses.length}.` : 'We didn\'t get it in six.'}${k && k.say ? ' ' + k.say : ''}]`);
    }
    res.json(view(r.rows[0], day));
  } catch (err) {
    console.error('Error playing Wordle:', err);
    res.status(500).json({ error: 'Could not play that guess.' });
  }
});

// POST /api/wordle/say { message } -> talk to Knox about today's puzzle.
// He still never sees the answer while it's being played.
router.post('/say', requireLogin, async (req, res) => {
  try {
    const message = cleanMessage(req.body && req.body.message);
    if (!message) return res.status(400).json({ error: 'Say something first.' });
    const day = today();
    const row = await getDay(day);
    const answer = answerFor(day);
    const board = (row.guesses || []).map((w) => `${w.toUpperCase()} ${score(w, answer).map((p) => (p === 'g' ? '🟩' : p === 'y' ? '🟨' : '⬛')).join('')}`).join('\n');
    const context = `Today's Wordle, solved together. ${row.status === 'playing' ? `You don't know the answer either. ${(row.guesses || []).length} of 6 guesses used.` : `It's done — the word was ${answer.toUpperCase()} (${row.status === 'won' ? 'solved' : 'not solved'}).`}\n${board || '(no guesses yet)'}`;
    const recent = (row.comments || []).slice(-10).map((c) => ({ who: c.who || 'knox', text: c.text }));
    const k = await talkToKnox('Wordle', context, recent, message);
    if (k.error) return res.status(502).json({ error: 'Knox couldn\'t answer just now — try again.' });
    const after = (row.guesses || []).length;
    const comments = [...(row.comments || []), { after, who: 'elira', text: message }];
    if (k.text) comments.push({ after, who: 'knox', text: k.text });
    else if (k.note) comments.push({ after, who: 'system', text: k.note });
    const r = await pool.query(`UPDATE wordle_days SET comments = $1, updated_at = now() WHERE day = $2::date RETURNING *`, [JSON.stringify(comments), day]);
    res.json(view(r.rows[0], day));
  } catch (err) {
    console.error('Error talking during Wordle:', err);
    res.status(500).json({ error: 'Could not send that.' });
  }
});

// POST /api/wordle/ask -> ask Knox what he thinks, without guessing.
router.post('/ask', requireLogin, async (req, res) => {
  try {
    const day = today();
    const row = await getDay(day);
    if (row.status !== 'playing') return res.json(view(row, day));
    const answer = answerFor(day);
    const scored = (row.guesses || []).map((w) => ({ word: w, pattern: score(w, answer) }));
    const k = await knoxThinks(scored, 'playing', answer);
    if (!k || !k.say) return res.status(502).json({ error: 'Knox couldn\'t answer just now.' });
    const ok = k.suggestion && VALID.has(k.suggestion) && !(row.guesses || []).includes(k.suggestion);
    const comments = [...(row.comments || []), { after: scored.length, text: k.say, suggestion: ok ? k.suggestion : null }];
    const r = await pool.query(`UPDATE wordle_days SET comments = $1, updated_at = now() WHERE day = $2::date RETURNING *`, [JSON.stringify(comments), day]);
    res.json(view(r.rows[0], day));
  } catch (err) {
    console.error('Error asking Knox about Wordle:', err);
    res.status(500).json({ error: 'Could not ask him.' });
  }
});

export default router;
