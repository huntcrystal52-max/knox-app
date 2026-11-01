import { Router } from 'express';
import { pool } from '../db/index.js';

const router = Router();

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  next();
}

// Talking games with Knox: 20 Questions, Would You Rather, Two Truths and a
// Lie, and Trivia. This server keeps each game's state, counts and score.
// Anything secret — his 20 Questions answer, which statement is his lie, the
// trivia answer — lives under state.hidden and is never sent to the browser
// until it's revealed. Knox-bot is only asked for his part of each turn.

const TYPES = ['20q', 'wyr', '2t1l', 'trivia'];
const NAMES = { '20q': '20 Questions', wyr: 'Would You Rather', '2t1l': 'Two Truths and a Lie', trivia: 'Trivia' };

class KnoxUnavailable extends Error {}

async function knox(turn, payload) {
  let r;
  try {
    r = await fetch(`${process.env.KNOX_BOT_URL}/internal/game/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET },
      body: JSON.stringify({ turn, payload }),
    });
  } catch (e) { throw new KnoxUnavailable(); }
  if (!r.ok) throw new KnoxUnavailable();
  return r.json();
}

async function remember(memory) {
  try {
    await fetch(`${process.env.KNOX_BOT_URL}/internal/game/finished`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET },
      body: JSON.stringify({ memory }),
    });
  } catch (e) { /* the game still ends; he just won't have it in memory */ }
}

// What the browser is allowed to see.
function view(row) {
  const { hidden, ...state } = row.state || {};
  return {
    id: row.id,
    type: row.type,
    name: NAMES[row.type],
    status: row.status,
    state: row.status === 'over' ? { ...state, revealed: hidden || {} } : state,
    transcript: row.transcript || [],
    createdAt: row.created_at,
  };
}

async function save(row) {
  const r = await pool.query(
    `UPDATE games SET state = $1, transcript = $2, status = $3, updated_at = now() WHERE id = $4 RETURNING *`,
    [JSON.stringify(row.state), JSON.stringify(row.transcript), row.status, row.id]
  );
  return r.rows[0];
}

const say = (row, who, text) => { if (text) row.transcript.push({ who, text: String(text) }); };

// How each game is remembered by Knox when it ends.
function memoryLine(row) {
  const s = row.state;
  const h = s.hidden || {};
  if (row.type === '20q' && s.mode === 'knox') {
    return `[Played 20 Questions with Elira — I was thinking of "${h.secret}". ${s.result === 'elira' ? `She got it in ${s.questions} questions.` : s.result === 'gave_up' ? 'She gave up.' : 'She didn\'t get it in 20.'}]`;
  }
  if (row.type === '20q') {
    return `[Played 20 Questions with Elira — she was thinking of something and ${s.result === 'knox' ? `I guessed it ("${s.lastGuess}") after ${s.questions} questions` : 'I didn\'t guess it'}.${s.answer ? ` It was ${s.answer}.` : ''}]`;
  }
  if (row.type === 'wyr') {
    const picks = (s.history || []).slice(-6).map(x => x.text).join(' · ');
    return `[Played Would You Rather with Elira (${(s.history || []).length} rounds).${picks ? ' ' + picks : ''}]`;
  }
  if (row.type === '2t1l') {
    return `[Played Two Truths and a Lie with Elira — she spotted my lie ${s.score.elira} time(s), I spotted hers ${s.score.knox} time(s).${(s.learned || []).length ? ' I learned: ' + s.learned.slice(-3).join(' · ') : ''}]`;
  }
  if (row.type === 'trivia') {
    return `[Hosted trivia for Elira on "${s.topic || 'a mix of things'}" — she got ${s.score} of ${s.total}.${(s.disputes || []).length ? ` She told me I got some wrong: ${s.disputes.join('; ')}.` : ''}]`;
  }
  return `[Played ${NAMES[row.type]} with Elira.]`;
}

async function finish(row) {
  row.status = 'over';
  const saved = await save(row);
  remember(memoryLine(row));
  return saved;
}

// ─── STARTING A GAME ─────────────────────────────────────────────────────────

async function start(type, opts) {
  const row = { type, status: 'active', state: {}, transcript: [] };

  if (type === '20q' && opts.mode === 'elira') {
    row.state = { mode: 'elira', questions: 0, pending: null };
    say(row, 'system', 'You think of something. Knox asks.');
  } else if (type === '20q') {
    const k = await knox('20q_start_knox', {});
    row.state = { mode: 'knox', category: k.category, questions: 0, hidden: { secret: k.secret } };
    say(row, 'knox', k.say || `I'm thinking of something. Category: ${k.category}.`);
  } else if (type === 'wyr') {
    row.state = { pending: null, history: [] };
  } else if (type === '2t1l') {
    row.state = { phase: 'idle', score: { elira: 0, knox: 0 }, learned: [], current: null, hers: null, hidden: {} };
  } else if (type === 'trivia') {
    const topic = String(opts.topic || '').trim().slice(0, 80);
    row.state = { topic, total: 10, round: 0, score: 0, asked: [], current: null, hidden: {}, last: null };
  }

  const r = await pool.query(
    `INSERT INTO games (type, state, transcript) VALUES ($1, $2, $3) RETURNING *`,
    [type, JSON.stringify(row.state), JSON.stringify(row.transcript)]
  );
  let saved = r.rows[0];

  // Some games begin with Knox's first move.
  if (type === '20q' && opts.mode === 'elira') saved = await act(saved, 'knox_asks', {});
  if (type === 'trivia') saved = await act(saved, 'next_question', {});
  return saved;
}

// ─── PLAYING ─────────────────────────────────────────────────────────────────

async function act(row, action, input) {
  const s = row.state;

  // ── 20 Questions ──
  if (row.type === '20q' && s.mode === 'knox') {
    if (action === 'ask') {
      const text = String(input.text || '').trim().slice(0, 300);
      if (!text) return row;
      say(row, 'elira', text);
      const k = await knox('20q_answer', { state: { ...s, secret: s.hidden.secret }, input: text, transcript: row.transcript });
      say(row, 'knox', k.is_guess ? (k.say || (k.correct ? 'Yes!' : 'No.')) : `${k.answer[0].toUpperCase()}${k.answer.slice(1)}.${k.say ? ' ' + k.say : ''}`);
      s.questions = (s.questions || 0) + 1;
      if (k.is_guess && k.correct) { s.result = 'elira'; say(row, 'system', `You got it in ${s.questions}! It was ${s.hidden.secret}.`); return finish(row); }
      if (s.questions >= 20) { s.result = 'knox'; say(row, 'system', `That's 20. He was thinking of ${s.hidden.secret}.`); return finish(row); }
      return save(row);
    }
    if (action === 'give_up') { s.result = 'gave_up'; say(row, 'system', `He was thinking of ${s.hidden.secret}.`); return finish(row); }
  }

  if (row.type === '20q' && s.mode === 'elira') {
    if (action === 'knox_asks') {
      const k = await knox('20q_knox_asks', { state: s, transcript: row.transcript });
      s.questions = (s.questions || 0) + 1;
      s.pending = k.guess ? { kind: 'guess', text: k.guess } : { kind: 'question', text: k.question };
      say(row, 'knox', (k.guess ? `Is it ${k.guess}?` : k.question) + (k.say ? ` ${k.say}` : ''));
      return save(row);
    }
    if (action === 'reply' && s.pending) {
      const ans = String(input.answer || '').toLowerCase();
      if (s.pending.kind === 'guess') {
        say(row, 'elira', ans === 'right' ? 'Yes! That\'s it.' : 'No, that\'s not it.');
        if (ans === 'right') { s.result = 'knox'; s.lastGuess = s.pending.text; s.pending = null; return finish(row); }
      } else {
        say(row, 'elira', { yes: 'Yes.', no: 'No.', sometimes: 'Sometimes.', 'not sure': 'Not sure.' }[ans] || 'Not sure.');
      }
      s.pending = null;
      if (s.questions >= 20) { s.result = 'elira'; say(row, 'system', 'That\'s 20 — he didn\'t get it. Tell him what it was?'); return save(row); }
      row = await save(row);
      return act(row, 'knox_asks', {});
    }
    if (action === 'tell_answer' && s.result === 'elira') {
      // He ran out of questions: she can tell him what it was (or skip),
      // and then the game ends and he remembers it.
      s.answer = String(input.text || '').trim().slice(0, 120);
      if (s.answer) say(row, 'elira', `It was ${s.answer}.`);
      return finish(row);
    }
  }

  // ── Would You Rather ──
  if (row.type === 'wyr') {
    if (action === 'knox_ask') {
      const k = await knox('wyr_make', { transcript: row.transcript });
      s.pending = { option_a: k.option_a, option_b: k.option_b };
      say(row, 'knox', `${k.say ? k.say + ' ' : ''}Would you rather… ${k.option_a} — or — ${k.option_b}?`);
      return save(row);
    }
    if (action === 'pick' && s.pending) {
      const pick = input.pick === 'b' ? 'b' : 'a';
      const why = String(input.why || '').trim().slice(0, 300);
      const chosen = pick === 'a' ? s.pending.option_a : s.pending.option_b;
      say(row, 'elira', `${chosen}.${why ? ' ' + why : ''}`);
      const k = await knox('wyr_react', { state: s.pending, input: { pick, why } });
      say(row, 'knox', k.say);
      s.history.push({ text: `She'd rather ${chosen}; I'd rather ${k.his_pick === 'a' ? s.pending.option_a : s.pending.option_b}` });
      s.pending = null;
      return save(row);
    }
    if (action === 'her_question') {
      const text = String(input.text || '').trim().slice(0, 400);
      if (!text) return row;
      say(row, 'elira', text);
      const k = await knox('wyr_answer_hers', { input: text });
      say(row, 'knox', k.say);
      s.history.push({ text: `She asked "${text.slice(0, 80)}"; I chose ${k.choice}` });
      return save(row);
    }
    if (action === 'finish') return finish(row);
  }

  // ── Two Truths and a Lie ──
  if (row.type === '2t1l') {
    if (action === 'knox_tells') {
      const k = await knox('2t1l_knox_tells', { transcript: row.transcript });
      s.current = { statements: k.statements };
      s.hidden = { ...(s.hidden || {}), lie_index: k.lie_index };
      s.phase = 'her_guess';
      say(row, 'knox', `${k.say ? k.say + '\n' : ''}1. ${k.statements[0]}\n2. ${k.statements[1]}\n3. ${k.statements[2]}`);
      return save(row);
    }
    if (action === 'guess' && s.phase === 'her_guess') {
      const g = Number(input.index);
      if (![0, 1, 2].includes(g)) return row;
      say(row, 'elira', `I think number ${g + 1} is the lie.`);
      const k = await knox('2t1l_reveal', { state: { statements: s.current.statements, lie_index: s.hidden.lie_index }, input: { guess: g } });
      if (k.correct) s.score.elira++;
      say(row, 'system', k.correct ? `Right — number ${s.hidden.lie_index + 1} was the lie.` : `Not quite — the lie was number ${s.hidden.lie_index + 1}.`);
      say(row, 'knox', k.say);
      s.lastRevealed = { statements: s.current.statements, lie_index: s.hidden.lie_index };
      s.current = null; s.hidden = {}; s.phase = 'idle';
      return save(row);
    }
    if (action === 'her_statements') {
      const st = (input.statements || []).map(x => String(x || '').trim().slice(0, 220));
      if (st.length !== 3 || st.some(x => !x)) return row;
      say(row, 'elira', `1. ${st[0]}\n2. ${st[1]}\n3. ${st[2]}`);
      const k = await knox('2t1l_guess_hers', { input: { statements: st } });
      s.hers = { statements: st, knox_guess: k.guess_index };
      s.phase = 'her_reveal';
      say(row, 'knox', k.say || `I think number ${k.guess_index + 1} is the lie.`);
      return save(row);
    }
    if (action === 'reveal_hers' && s.phase === 'her_reveal') {
      const li = Number(input.lie_index);
      if (![0, 1, 2].includes(li)) return row;
      say(row, 'elira', `The lie was number ${li + 1}.`);
      const k = await knox('2t1l_hers_revealed', { state: s.hers, input: { lie_index: li } });
      if (k.correct) s.score.knox++;
      say(row, 'knox', k.say);
      s.learned.push(...s.hers.statements.filter((_, i) => i !== li).map(t => t.slice(0, 100)));
      s.hers = null; s.phase = 'idle';
      return save(row);
    }
    if (action === 'finish') return finish(row);
  }

  // ── Trivia ──
  if (row.type === 'trivia') {
    if (action === 'next_question') {
      const k = await knox('trivia_question', { state: s });
      s.current = { question: k.question, options: k.options };
      s.hidden = { answer_index: k.answer_index, fact: k.fact };
      s.asked.push(k.question);
      return save(row);
    }
    if (action === 'dispute' && s.last && !s.last.right && !s.last.disputed) {
      // She thinks his answer was wrong: she gets the point, and he
      // remembers he slipped on that fact.
      s.last.disputed = true;
      s.score++;
      s.disputes = [...(s.disputes || []), `${s.last.question} (I said ${s.last.options[s.last.answer_index]})`];
      say(row, 'system', 'Point given back — he\'ll remember he got that one wrong.');
      return save(row);
    }
    if (action === 'answer' && s.current) {
      const a = Number(input.index);
      if (![0, 1, 2, 3].includes(a)) return row;
      const right = a === s.hidden.answer_index;
      if (right) s.score++;
      s.round++;
      s.last = { question: s.current.question, options: s.current.options, picked: a, answer_index: s.hidden.answer_index, fact: s.hidden.fact, right };
      s.current = null; s.hidden = {};
      if (s.round >= s.total) {
        const k = await knox('trivia_end', { state: s }).catch(() => ({}));
        say(row, 'knox', k.say);
        return finish(row);
      }
      row = await save(row);
      return act(row, 'next_question', {});
    }
  }

  return row;
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// GET /api/games -> the active game of each type, and recent finished ones.
router.get('/', requireLogin, async (req, res) => {
  try {
    const active = await pool.query(`SELECT DISTINCT ON (type) * FROM games WHERE status = 'active' ORDER BY type, created_at DESC`);
    const past = await pool.query(`SELECT * FROM games WHERE status = 'over' ORDER BY updated_at DESC LIMIT 15`);
    res.json({ active: active.rows.map(view), past: past.rows.map(view) });
  } catch (err) {
    console.error('Error reading games:', err);
    res.status(500).json({ error: 'Could not load games.' });
  }
});

// POST /api/games/new { type, mode?, topic? }
router.post('/new', requireLogin, async (req, res) => {
  const { type, mode, topic } = req.body || {};
  if (!TYPES.includes(type)) return res.status(400).json({ error: 'Unknown game.' });
  try {
    // Starting a new one closes any unfinished game of the same kind.
    await pool.query(`UPDATE games SET status = 'over', updated_at = now() WHERE type = $1 AND status = 'active'`, [type]);
    const row = await start(type, { mode, topic });
    res.status(201).json({ game: view(row) });
  } catch (err) {
    if (err instanceof KnoxUnavailable) return res.status(502).json({ error: 'Knox couldn\'t answer just now — try again.' });
    console.error('Error starting a game:', err);
    res.status(500).json({ error: 'Could not start that game.' });
  }
});

// POST /api/games/:id/act { action, ...input }
router.post('/:id/act', requireLogin, async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM games WHERE id = $1`, [req.params.id]);
    const row = r.rows[0];
    if (!row) return res.status(404).json({ error: 'No such game.' });
    if (row.status !== 'active') return res.status(409).json({ error: 'That game is over.' });
    row.transcript = row.transcript || [];
    const { action, ...input } = req.body || {};
    const after = await act(row, action, input);
    res.json({ game: view(after) });
  } catch (err) {
    if (err instanceof KnoxUnavailable) return res.status(502).json({ error: 'Knox couldn\'t answer just now — try again.' });
    console.error('Error playing a game turn:', err);
    res.status(500).json({ error: 'Could not play that.' });
  }
});

export default router;
