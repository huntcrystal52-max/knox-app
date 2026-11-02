import { Router } from 'express';
import { Chess } from 'chess.js';
import { pool } from '../db/index.js';
import { talkToKnox, cleanMessage } from '../lib/gamechat.js';

const router = Router();

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  next();
}

// Chess with Knox. This server owns the board and the rules (chess.js) —
// every move, hers or his, is checked here. On his turn it sends Knox-bot
// the position and the legal moves; he picks one himself and may say
// something about it. A game is stored as its list of moves and rebuilt
// from the start each time, so repetition and the fifty-move rule work.

// Rebuild a game from its saved moves.
function replay(moves) {
  const game = new Chess();
  for (const san of moves || []) game.move(san);
  return game;
}

function endInfo(game) {
  if (!game.isGameOver()) return null;
  if (game.isCheckmate()) {
    // The side to move has been mated.
    return { winnerColor: game.turn() === 'w' ? 'b' : 'w', reason: 'checkmate' };
  }
  if (game.isStalemate()) return { winnerColor: null, reason: 'stalemate' };
  if (game.isThreefoldRepetition()) return { winnerColor: null, reason: 'threefold repetition' };
  if (game.isInsufficientMaterial()) return { winnerColor: null, reason: 'insufficient material' };
  return { winnerColor: null, reason: 'the fifty-move rule' };
}

function resultFor(row, winnerColor) {
  if (!winnerColor) return 'draw';
  return winnerColor === row.elira_color ? 'elira' : 'knox';
}

// What the room needs to draw the board and know whose turn it is.
function stateOf(row) {
  const game = replay(row.moves);
  const history = game.history({ verbose: true });
  const last = history[history.length - 1];
  const herTurn = row.status === 'active' && game.turn() === row.elira_color;
  return {
    id: row.id,
    eliraColor: row.elira_color,
    status: row.status,
    result: row.result,
    endReason: row.end_reason,
    board: game.board().map(rank => rank.map(sq => (sq ? { type: sq.type, color: sq.color } : null))),
    turn: game.turn(),
    herTurn,
    inCheck: game.inCheck(),
    moves: row.moves,
    lastMove: last ? { from: last.from, to: last.to } : null,
    legal: herTurn ? game.moves({ verbose: true }).map(m => ({ from: m.from, to: m.to, san: m.san, promotion: m.promotion || null })) : [],
    comments: row.comments || [],
    createdAt: row.created_at,
  };
}

async function askKnoxForMove(row, game, eliraLastMove) {
  try {
    const r = await fetch(`${process.env.KNOX_BOT_URL}/internal/chess/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET },
      body: JSON.stringify({
        ascii: game.ascii(),
        history: game.history(),
        legal: game.moves(),
        knoxColor: row.elira_color === 'w' ? 'b' : 'w',
        eliraLastMove: eliraLastMove || null,
        moveNumber: Math.floor(game.history().length / 2) + 1,
        inCheck: game.inCheck(),
      }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (err) {
    console.error('Error reaching Knox-bot for a chess move:', err);
    return null;
  }
}

async function tellKnoxItEnded(row, game, result, reason) {
  try {
    const r = await fetch(`${process.env.KNOX_BOT_URL}/internal/chess/finished`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET },
      body: JSON.stringify({
        result, reason,
        knoxColor: row.elira_color === 'w' ? 'b' : 'w',
        moveCount: Math.ceil(game.history().length / 2),
        lastMoves: game.history().slice(-6),
      }),
    });
    if (!r.ok) return '';
    const d = await r.json();
    return d.say || '';
  } catch (err) { return ''; }
}

async function save(row) {
  const r = await pool.query(
    `UPDATE chess_games SET moves = $1, comments = $2, status = $3, result = $4, end_reason = $5, updated_at = now()
     WHERE id = $6 RETURNING *`,
    [JSON.stringify(row.moves), JSON.stringify(row.comments || []), row.status, row.result, row.end_reason, row.id]
  );
  return r.rows[0];
}

async function finish(row, game, result, reason) {
  row.status = 'over';
  row.result = result;
  row.end_reason = reason;
  const say = await tellKnoxItEnded(row, game, result, reason);
  if (say) row.comments = [...(row.comments || []), { ply: game.history().length, text: say }];
  return save(row);
}

// Knox's turn: he chooses, we check it, play it, and see if that ends it.
async function knoxPlays(row, eliraLastMove) {
  const game = replay(row.moves);
  const choice = await askKnoxForMove(row, game, eliraLastMove);
  let played = null;
  if (choice && choice.move) {
    try { played = game.move(choice.move); } catch (e) { played = null; }
  }
  if (!played) {
    // He couldn't settle on a legal move (or couldn't be reached). Rather
    // than leave the game stuck, play one for him and say so honestly.
    const legal = game.moves();
    played = game.move(legal[Math.floor(Math.random() * legal.length)]);
    row.comments = [...(row.comments || []), { ply: game.history().length, text: '(He couldn\'t settle on a move this time, so one was played for him.)', system: true }];
  } else if (choice.say) {
    row.comments = [...(row.comments || []), { ply: game.history().length, text: choice.say }];
  }
  row.moves = game.history();
  const end = endInfo(game);
  if (end) return finish(row, game, resultFor(row, end.winnerColor), end.reason);
  return save(row);
}

// GET /api/chess -> the current game (if any) and the last few finished ones.
router.get('/', requireLogin, async (req, res) => {
  try {
    const active = await pool.query(`SELECT * FROM chess_games WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`);
    const past = await pool.query(
      `SELECT id, elira_color, result, end_reason, jsonb_array_length(moves) AS plies, created_at
         FROM chess_games WHERE status = 'over' ORDER BY updated_at DESC LIMIT 10`
    );
    res.json({ game: active.rows[0] ? stateOf(active.rows[0]) : null, past: past.rows });
  } catch (err) {
    console.error('Error reading chess games:', err);
    res.status(500).json({ error: 'Could not load games.' });
  }
});

// POST /api/chess/new { color: 'w' | 'b' | 'random' } -> start a game.
router.post('/new', requireLogin, async (req, res) => {
  try {
    const open = await pool.query(`SELECT id FROM chess_games WHERE status = 'active' LIMIT 1`);
    if (open.rows.length) return res.status(409).json({ error: 'A game is already going — finish or resign it first.' });
    let color = (req.body && req.body.color) || 'w';
    if (color === 'random') color = Math.random() < 0.5 ? 'w' : 'b';
    if (color !== 'w' && color !== 'b') color = 'w';
    const r = await pool.query(`INSERT INTO chess_games (elira_color) VALUES ($1) RETURNING *`, [color]);
    let row = r.rows[0];
    // If she's black, Knox opens.
    if (color === 'b') row = await knoxPlays(row, null);
    res.status(201).json({ game: stateOf(row) });
  } catch (err) {
    console.error('Error starting a chess game:', err);
    res.status(500).json({ error: 'Could not start a game.' });
  }
});

// POST /api/chess/:id/move { from, to, promotion? } -> her move, then his.
router.post('/:id/move', requireLogin, async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM chess_games WHERE id = $1`, [req.params.id]);
    let row = r.rows[0];
    if (!row) return res.status(404).json({ error: 'No such game.' });
    if (row.status !== 'active') return res.status(409).json({ error: 'That game is over.' });

    const game = replay(row.moves);
    if (game.turn() !== row.elira_color) return res.status(409).json({ error: 'It\'s Knox\'s turn.' });

    const { from, to, promotion } = req.body || {};
    let mine = null;
    try { mine = game.move({ from, to, promotion: promotion || 'q' }); } catch (e) { mine = null; }
    if (!mine) {
      try { mine = game.move({ from, to }); } catch (e) { mine = null; }
    }
    if (!mine) return res.status(400).json({ error: 'That move isn\'t legal.' });

    row.moves = game.history();
    const end = endInfo(game);
    if (end) {
      row = await finish(row, game, resultFor(row, end.winnerColor), end.reason);
    } else {
      row = await save(row);
      row = await knoxPlays(row, mine.san);
    }
    res.json({ game: stateOf(row) });
  } catch (err) {
    console.error('Error playing a chess move:', err);
    res.status(500).json({ error: 'Could not play that move.' });
  }
});

// POST /api/chess/:id/resign -> she resigns; he wins.
router.post('/:id/resign', requireLogin, async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM chess_games WHERE id = $1 AND status = 'active'`, [req.params.id]);
    let row = r.rows[0];
    if (!row) return res.status(404).json({ error: 'No game to resign.' });
    row = await finish(row, replay(row.moves), 'knox', 'resignation');
    res.json({ game: stateOf(row) });
  } catch (err) {
    console.error('Error resigning:', err);
    res.status(500).json({ error: 'Could not resign.' });
  }
});

// POST /api/chess/:id/say { message } -> talk to Knox while you play.
router.post('/:id/say', requireLogin, async (req, res) => {
  try {
    const message = cleanMessage(req.body && req.body.message);
    if (!message) return res.status(400).json({ error: 'Say something first.' });
    const r = await pool.query(`SELECT * FROM chess_games WHERE id = $1`, [req.params.id]);
    let row = r.rows[0];
    if (!row) return res.status(404).json({ error: 'No such game.' });
    const game = replay(row.moves);
    const knoxColor = row.elira_color === 'w' ? 'black' : 'white';
    const context = `You are playing ${knoxColor}. ${row.status === 'over' ? `The game is over (${row.result === 'draw' ? 'a draw' : row.result === 'knox' ? 'you won' : 'she won'}, ${row.end_reason}).` : game.turn() === row.elira_color ? 'It is her move.' : 'It is your move.'}${game.inCheck() ? ' Someone is in check.' : ''}
Board (capitals are White, lowercase Black):
${game.ascii()}
Moves so far: ${game.history().join(' ') || '(none yet)'}`;
    const recent = (row.comments || []).slice(-10).map((c) => ({ who: c.who || (c.system ? 'system' : 'knox'), text: c.text }));
    const k = await talkToKnox('chess', context, recent, message);
    if (k.error) return res.status(502).json({ error: 'Knox couldn\'t answer just now — try again.' });
    const ply = game.history().length;
    row.comments = [...(row.comments || []), { ply, who: 'elira', text: message }];
    if (k.text) row.comments.push({ ply, who: 'knox', text: k.text });
    else if (k.note) row.comments.push({ ply, system: true, text: k.note });
    row = await save(row);
    res.json({ game: stateOf(row) });
  } catch (err) {
    console.error('Error talking during chess:', err);
    res.status(500).json({ error: 'Could not send that.' });
  }
});

// GET /api/chess/:id -> a finished game, to look back over.
router.get('/:id', requireLogin, async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM chess_games WHERE id = $1`, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'No such game.' });
    res.json({ game: stateOf(r.rows[0]) });
  } catch (err) {
    res.status(500).json({ error: 'Could not load that game.' });
  }
});

export default router;
