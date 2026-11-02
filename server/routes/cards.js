import { Router } from 'express';
import { pool } from '../db/index.js';
import { talkToKnox, cleanMessage } from '../lib/gamechat.js';

const router = Router();

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  next();
}

// Card games with Knox: Blackjack, Go Fish and Crazy Eights. This server is
// the dealer — it shuffles, deals and keeps the rules. The deck and Knox's
// hand live in state.hidden and are never sent to the browser, so neither of
// you can see the other's cards. Knox makes his own choices in Go Fish and
// Crazy Eights; in Blackjack he's the dealer, so house rules decide for him.
// Stored in the same `games` table as the talking games.

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const NAMES = { blackjack: 'Blackjack', gofish: 'Go Fish', eights: 'Crazy Eights' };
const TYPES = Object.keys(NAMES);

const rankOf = (c) => c.slice(0, -1);
const suitOf = (c) => c.slice(-1);
const RANK_WORD = { A: 'aces', J: 'jacks', Q: 'queens', K: 'kings' };
const plural = (r) => RANK_WORD[r] || `${r}s`;

function newDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push(r + s);
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}

async function knox(turn, payload) {
  try {
    const r = await fetch(`${process.env.KNOX_BOT_URL}/internal/game/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET },
      body: JSON.stringify({ turn, payload }),
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

function view(row) {
  const { hidden, ...state } = row.state || {};
  return { id: row.id, type: row.type, name: NAMES[row.type], status: row.status, state, transcript: row.transcript || [], createdAt: row.created_at };
}

async function save(row) {
  const r = await pool.query(
    `UPDATE games SET state = $1, transcript = $2, status = $3, updated_at = now() WHERE id = $4 RETURNING *`,
    [JSON.stringify(row.state), JSON.stringify(row.transcript.slice(-60)), row.status, row.id]
  );
  return r.rows[0];
}

const log = (row, who, text) => { if (text) row.transcript.push({ who, text }); };

// ─── BLACKJACK (Knox deals; house rules: he hits below 17) ───────────────────

function bjValue(cards) {
  let total = 0, aces = 0;
  for (const c of cards) {
    const r = rankOf(c);
    if (r === 'A') { aces++; total += 11; } else if (['J', 'Q', 'K'].includes(r)) total += 10; else total += Number(r);
  }
  while (total > 21 && aces) { total -= 10; aces--; }
  return total;
}

async function bjDeal(row) {
  const s = row.state;
  const deck = newDeck();
  const her = [deck.pop(), deck.pop()];
  const his = [deck.pop(), deck.pop()];
  s.hand = her;
  s.knoxShowing = [his[0]];
  s.hidden = { deck, knoxHand: his };
  s.phase = 'her_turn';
  s.round = (s.round || 0) + 1;
  s.outcome = null;
  if (bjValue(her) === 21 || bjValue(his) === 21) await bjSettle(row);
  return row;
}

async function bjSettle(row) {
  const s = row.state;
  const his = s.hidden.knoxHand;
  const deck = s.hidden.deck;
  const herV = bjValue(s.hand);
  if (herV <= 21 && !(s.hand.length === 2 && herV === 21)) {
    while (bjValue(his) < 17) his.push(deck.pop());
  }
  const hisV = bjValue(his);
  let outcome;
  if (herV > 21) outcome = 'knox';
  else if (hisV > 21) outcome = 'elira';
  else if (herV > hisV) outcome = 'elira';
  else if (hisV > herV) outcome = 'knox';
  else outcome = 'push';
  s.score[outcome]++;
  s.knoxShowing = his.slice();
  s.knoxTotal = hisV;
  s.outcome = outcome;
  s.phase = 'round_over';
  const what = outcome === 'elira' ? `Elira won the hand (${herV}${hisV > 21 ? ', you bust' : ` to your ${hisV}`})` : `you won the hand (${herV > 21 ? 'she bust' : `${hisV} to her ${herV}`})`;
  log(row, 'system', outcome === 'push' ? `Push — ${herV} each.` : outcome === 'elira' ? `You win — ${herV}${hisV > 21 ? ', he bust' : ` to ${hisV}`}.` : `Knox wins — ${herV > 21 ? 'you bust' : `${hisV} to ${herV}`}.`);
  // A word from him now and then, not every hand.
  if (outcome !== 'push' && Math.random() < 0.5) {
    const k = await knox('cards_comment', { game: 'blackjack (you are the dealer)', moment: `That hand was ${what}. Overall: Elira ${s.score.elira}, you ${s.score.knox}.` });
    if (k && k.say) log(row, 'knox', k.say);
  }
  return row;
}

async function blackjack(row, action) {
  const s = row.state;
  if (action === 'deal' && s.phase !== 'her_turn') return bjDeal(row);
  if (action === 'hit' && s.phase === 'her_turn') {
    s.hand.push(s.hidden.deck.pop());
    if (bjValue(s.hand) >= 21) return bjSettle(row);
    return row;
  }
  if (action === 'stand' && s.phase === 'her_turn') return bjSettle(row);
  return row;
}

// ─── GO FISH ─────────────────────────────────────────────────────────────────

function takeBooks(hand) {
  const count = {};
  for (const c of hand) count[rankOf(c)] = (count[rankOf(c)] || 0) + 1;
  const made = Object.keys(count).filter((r) => count[r] === 4);
  return { made, rest: hand.filter((c) => !made.includes(rankOf(c))) };
}

function gfCheckBooks(row, who) {
  const s = row.state;
  const hand = who === 'elira' ? s.hand : s.hidden.knoxHand;
  const { made, rest } = takeBooks(hand);
  if (!made.length) return;
  if (who === 'elira') s.hand = rest; else s.hidden.knoxHand = rest;
  s.books[who].push(...made);
  for (const r of made) log(row, 'system', `${who === 'elira' ? 'You make' : 'Knox makes'} a book of ${plural(r)}.`);
}

function gfRefill(row, who) {
  const s = row.state;
  const hand = who === 'elira' ? s.hand : s.hidden.knoxHand;
  if (!hand.length && s.hidden.deck.length) hand.push(s.hidden.deck.pop());
}

function gfOver(row) {
  const s = row.state;
  return s.books.elira.length + s.books.knox.length === 13;
}

function gfSync(row) {
  const s = row.state;
  s.knoxCount = s.hidden.knoxHand.length;
  s.deckCount = s.hidden.deck.length;
  s.hand.sort((a, b) => RANKS.indexOf(rankOf(a)) - RANKS.indexOf(rankOf(b)));
}

// One ask. Returns true if the asker goes again.
function gfAsk(row, who, rank) {
  const s = row.state;
  const askerHand = who === 'elira' ? s.hand : s.hidden.knoxHand;
  const otherHand = who === 'elira' ? s.hidden.knoxHand : s.hand;
  const given = otherHand.filter((c) => rankOf(c) === rank);
  if (who === 'elira') s.herAsks = [...(s.herAsks || []), rank].slice(-6);
  if (given.length) {
    const keep = otherHand.filter((c) => rankOf(c) !== rank);
    if (who === 'elira') s.hidden.knoxHand = keep; else s.hand = keep;
    askerHand.push(...given);
    log(row, 'system', who === 'elira' ? `Knox hands you ${given.length} ${given.length === 1 ? rank : plural(rank)}.` : `You hand Knox ${given.length} ${given.length === 1 ? rank : plural(rank)}.`);
    gfCheckBooks(row, who);
    return true;
  }
  log(row, 'system', who === 'elira' ? 'Go fish!' : 'You tell him: go fish.');
  if (s.hidden.deck.length) {
    const drawn = s.hidden.deck.pop();
    askerHand.push(drawn);
    gfCheckBooks(row, who);
    if (rankOf(drawn) === rank) {
      log(row, 'system', who === 'elira' ? `You fished a ${rank} — go again.` : `He fished the ${rank} he wanted — he goes again.`);
      return true;
    }
  }
  return false;
}

async function gfKnoxTurn(row) {
  const s = row.state;
  let guard = 0;
  while (!gfOver(row) && guard++ < 15) {
    gfRefill(row, 'knox');
    const hand = s.hidden.knoxHand;
    if (!hand.length) break;
    const ranks = [...new Set(hand.map(rankOf))];
    const k = await knox('gofish_ask', { ranks, herCount: s.hand.length, books: s.books, herRecentAsks: s.herAsks || [], deckCount: s.hidden.deck.length });
    const rank = k && ranks.includes(k.rank) ? k.rank : ranks[Math.floor(Math.random() * ranks.length)];
    log(row, 'knox', `${k && k.say ? k.say + ' ' : ''}Got any ${plural(rank)}?`);
    if (!gfAsk(row, 'knox', rank)) break;
  }
  s.turn = 'elira';
  gfRefill(row, 'elira');
}

async function gofish(row, action, input) {
  const s = row.state;
  if (action === 'ask' && s.turn === 'elira') {
    const rank = String(input.rank || '');
    if (!s.hand.some((c) => rankOf(c) === rank)) return row;
    log(row, 'elira', `Got any ${plural(rank)}?`);
    const again = gfAsk(row, 'elira', rank);
    if (!gfOver(row) && !again) { s.turn = 'knox'; await gfKnoxTurn(row); }
    gfRefill(row, 'elira');
  }
  // If she has no cards and the pond is empty, play passes to him.
  if (!gfOver(row) && s.turn === 'elira' && !s.hand.length && !s.hidden.deck.length) { s.turn = 'knox'; await gfKnoxTurn(row); }
  gfSync(row);
  if (gfOver(row)) {
    s.phase = 'over';
    const e = s.books.elira.length, k = s.books.knox.length;
    s.winner = e > k ? 'elira' : 'knox';
    log(row, 'system', `Game over — ${e} books to ${k}. ${e > k ? 'You win!' : 'Knox wins.'}`);
  }
  return row;
}

// ─── CRAZY EIGHTS ────────────────────────────────────────────────────────────

const ceLegal = (hand, top, suit) => hand.filter((c) => rankOf(c) === '8' || suitOf(c) === suit || rankOf(c) === rankOf(top));

function ceDraw(row) {
  const s = row.state;
  if (!s.hidden.deck.length) {
    const keep = s.hidden.discard.pop();
    s.hidden.deck = s.hidden.discard.sort(() => Math.random() - 0.5);
    s.hidden.discard = [keep];
  }
  return s.hidden.deck.pop() || null;
}

function cePlay(row, who, card, suit) {
  const s = row.state;
  const hand = who === 'elira' ? s.hand : s.hidden.knoxHand;
  hand.splice(hand.indexOf(card), 1);
  s.hidden.discard.push(card);
  s.top = card;
  s.suit = rankOf(card) === '8' && SUITS.includes(suit) ? suit : suitOf(card);
  log(row, who === 'elira' ? 'elira' : 'knox', `${who === 'elira' ? 'You play' : 'Knox plays'} ${card}${rankOf(card) === '8' ? ` — ${who === 'elira' ? 'you call' : 'he calls'} ${s.suit}` : ''}.`);
  if (!hand.length) { s.phase = 'over'; s.winner = who; log(row, 'system', who === 'elira' ? 'You\'re out — you win!' : 'Knox is out — he wins.'); }
}

function ceSync(row) {
  const s = row.state;
  s.knoxCount = s.hidden.knoxHand.length;
  s.deckCount = s.hidden.deck.length;
  s.legal = s.turn === 'elira' && s.phase !== 'over' ? ceLegal(s.hand, s.top, s.suit) : [];
}

function mostCommonSuit(hand) {
  const n = {};
  for (const c of hand) if (rankOf(c) !== '8') n[suitOf(c)] = (n[suitOf(c)] || 0) + 1;
  return Object.keys(n).sort((a, b) => n[b] - n[a])[0] || '♠';
}

async function ceKnoxTurn(row) {
  const s = row.state;
  const hand = s.hidden.knoxHand;
  let legal = ceLegal(hand, s.top, s.suit);
  const k = await knox('eights_play', { hand, top: s.top, suit: s.suit, legal, herCount: s.hand.length });
  if (k && k.say) log(row, 'knox', k.say);
  let card = k && legal.includes(k.play) ? k.play : null;
  if (!card && legal.length && !(k && /draw/i.test(k.play || ''))) card = legal[0];
  if (card) {
    cePlay(row, 'knox', card, SUITS.includes(k && k.suit) ? k.suit : mostCommonSuit(hand));
  } else {
    const drawn = ceDraw(row);
    if (drawn) {
      hand.push(drawn);
      legal = ceLegal([drawn], s.top, s.suit);
      if (legal.length) cePlay(row, 'knox', drawn, mostCommonSuit(hand));
      else log(row, 'system', 'Knox draws and passes.');
    } else log(row, 'system', 'Knox passes.');
  }
  if (s.phase !== 'over') s.turn = 'elira';
}

async function eights(row, action, input) {
  const s = row.state;
  if (s.turn !== 'elira' || s.phase === 'over') { ceSync(row); return row; }
  if (action === 'play') {
    const card = String(input.card || '');
    if (s.drawnThisTurn && card !== s.drawnThisTurn) { ceSync(row); return row; }
    if (!ceLegal(s.hand, s.top, s.suit).includes(card)) { ceSync(row); return row; }
    s.drawnThisTurn = null;
    cePlay(row, 'elira', card, input.suit);
    if (s.phase !== 'over') { s.turn = 'knox'; await ceKnoxTurn(row); }
  } else if (action === 'draw' && !s.drawnThisTurn) {
    const drawn = ceDraw(row);
    if (drawn) {
      s.hand.push(drawn);
      log(row, 'system', `You draw ${drawn}.`);
      if (ceLegal([drawn], s.top, s.suit).length) s.drawnThisTurn = drawn; // she may play it, or pass
      else { log(row, 'system', 'You pass.'); s.turn = 'knox'; await ceKnoxTurn(row); }
    } else { s.turn = 'knox'; await ceKnoxTurn(row); }
  } else if (action === 'pass' && s.drawnThisTurn) {
    s.drawnThisTurn = null;
    log(row, 'system', 'You pass.');
    s.turn = 'knox'; await ceKnoxTurn(row);
  }
  ceSync(row);
  return row;
}

// ─── STARTING ────────────────────────────────────────────────────────────────

async function start(type) {
  const row = { type, status: 'active', state: {}, transcript: [] };
  if (type === 'blackjack') {
    row.state = { score: { elira: 0, knox: 0, push: 0 }, phase: 'idle', hand: [], knoxShowing: [], round: 0, hidden: {} };
  } else if (type === 'gofish') {
    const deck = newDeck();
    row.state = { hand: deck.splice(0, 7), books: { elira: [], knox: [] }, turn: 'elira', herAsks: [], phase: 'play', hidden: { deck, knoxHand: deck.splice(0, 7) } };
    gfCheckBooks(row, 'elira'); gfCheckBooks(row, 'knox'); gfSync(row);
    log(row, 'system', 'Seven cards each. You go first — tap a rank in your hand to ask for it.');
  } else if (type === 'eights') {
    const deck = newDeck();
    const hand = deck.splice(0, 7);
    const knoxHand = deck.splice(0, 7);
    let top = deck.pop();
    while (rankOf(top) === '8') { deck.unshift(top); top = deck.pop(); }
    row.state = { hand, top, suit: suitOf(top), turn: 'elira', phase: 'play', drawnThisTurn: null, hidden: { deck, knoxHand, discard: [top] } };
    ceSync(row);
    log(row, 'system', `${top} starts the pile. Match the suit or the rank — 8s are wild. You go first.`);
  }
  const r = await pool.query(`INSERT INTO games (type, state, transcript) VALUES ($1, $2, $3) RETURNING *`,
    [type, JSON.stringify(row.state), JSON.stringify(row.transcript)]);
  return r.rows[0];
}

function memoryLine(row) {
  const s = row.state;
  if (row.type === 'blackjack') return `[Played blackjack with Elira, me dealing — ${s.round} hands: she won ${s.score.elira}, I won ${s.score.knox}${s.score.push ? `, ${s.score.push} pushes` : ''}.]`;
  if (row.type === 'gofish') return `[Played Go Fish with Elira — ${s.winner === 'elira' ? 'she won' : 'I won'}, ${s.books.elira.length} books to ${s.books.knox.length}.]`;
  return `[Played Crazy Eights with Elira — ${s.winner === 'elira' ? 'she went out first and won' : 'I went out first and won'}.]`;
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// POST /api/cards/new { type }
router.post('/new', requireLogin, async (req, res) => {
  const type = req.body && req.body.type;
  if (!TYPES.includes(type)) return res.status(400).json({ error: 'Unknown card game.' });
  try {
    await pool.query(`UPDATE games SET status = 'over', updated_at = now() WHERE type = $1 AND status = 'active'`, [type]);
    res.status(201).json({ game: view(await start(type)) });
  } catch (err) {
    console.error('Error starting a card game:', err);
    res.status(500).json({ error: 'Could not deal.' });
  }
});

// POST /api/cards/:id/say { message } -> talk to Knox while you play cards.
// He knows his own hand (it's his) but is told to keep it to himself.
router.post('/:id/say', requireLogin, async (req, res) => {
  try {
    const message = cleanMessage(req.body && req.body.message);
    if (!message) return res.status(400).json({ error: 'Say something first.' });
    const r = await pool.query(`SELECT * FROM games WHERE id = $1`, [req.params.id]);
    let row = r.rows[0];
    if (!row || !TYPES.includes(row.type)) return res.status(404).json({ error: 'No such game.' });
    const s = row.state || {};
    const h = s.hidden || {};
    let context = '';
    if (row.type === 'blackjack') context = `You're dealing. Score — Elira ${s.score.elira}, you ${s.score.knox}. Her hand: ${(s.hand || []).join(' ') || 'none yet'}. Your showing card(s): ${(s.knoxShowing || []).join(' ') || 'none'}.`;
    if (row.type === 'gofish') context = `Her books: ${s.books.elira.join(' ') || 'none'}; yours: ${s.books.knox.join(' ') || 'none'}. Cards in the pond: ${s.deckCount}. Your hand (keep it secret): ${(h.knoxHand || []).join(' ')}. It's ${s.turn === 'elira' ? 'her' : 'your'} turn.`;
    if (row.type === 'eights') context = `On the pile: ${s.top}, suit to follow ${s.suit}. She has ${(s.hand || []).length} cards. Your hand (keep it secret): ${(h.knoxHand || []).join(' ')}. It's ${s.turn === 'elira' ? 'her' : 'your'} turn.`;
    if (row.status === 'over') context = 'This game has finished. ' + context;
    const k = await talkToKnox(NAMES[row.type], context, (row.transcript || []).slice(-10), message);
    if (k.error) return res.status(502).json({ error: 'Knox couldn\'t answer just now — try again.' });
    row.transcript = [...(row.transcript || []), { who: 'elira', text: message, chat: true }];
    if (k.text) row.transcript.push({ who: 'knox', text: k.text, chat: true });
    else if (k.note) row.transcript.push({ who: 'system', text: k.note });
    row = await save(row);
    res.json({ game: view(row) });
  } catch (err) {
    console.error('Error talking during cards:', err);
    res.status(500).json({ error: 'Could not send that.' });
  }
});

// POST /api/cards/:id/act { action, ...input }
router.post('/:id/act', requireLogin, async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM games WHERE id = $1`, [req.params.id]);
    let row = r.rows[0];
    if (!row || !TYPES.includes(row.type)) return res.status(404).json({ error: 'No such game.' });
    if (row.status !== 'active') return res.status(409).json({ error: 'That game is over.' });
    row.transcript = row.transcript || [];
    const { action, ...input } = req.body || {};

    if (action === 'finish') {
      row.status = 'over';
      if (row.type === 'blackjack' && row.state.round) remember(memoryLine(row));
    } else {
      if (row.type === 'blackjack') await blackjack(row, action);
      if (row.type === 'gofish') await gofish(row, action, input);
      if (row.type === 'eights') await eights(row, action, input);
      if (row.state.phase === 'over') {
        row.status = 'over';
        remember(memoryLine(row));
      }
    }
    row = await save(row);
    res.json({ game: view(row) });
  } catch (err) {
    console.error('Error playing a card game:', err);
    res.status(500).json({ error: 'Could not play that.' });
  }
});

export default router;
