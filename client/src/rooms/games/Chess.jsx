import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import GameTalk from './GameTalk.jsx';

// Games — chess with Knox. Tap one of your pieces, then tap where it goes.
// The server checks every move; Knox chooses his own from the legal ones.

const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

const REASON = {
  checkmate: 'checkmate',
  stalemate: 'stalemate',
  resignation: 'resignation',
  'threefold repetition': 'threefold repetition',
  'insufficient material': 'not enough pieces left',
  'the fifty-move rule': 'the fifty-move rule',
};

function squareName(rankIdx, fileIdx) {
  return FILES[fileIdx] + (8 - rankIdx);
}

function resultLine(g) {
  if (!g || g.status !== 'over') return '';
  const how = REASON[g.endReason] || g.endReason;
  if (g.result === 'draw') return `A draw — ${how}.`;
  return g.result === 'elira' ? `You won — ${how}. 🔥` : `Knox won — ${how}.`;
}

// Moves a piece locally so the board responds straight away while Knox thinks.
function optimistic(game, from, to) {
  const board = game.board.map((r) => r.slice());
  const f = { r: 8 - Number(from[1]), c: FILES.indexOf(from[0]) };
  const t = { r: 8 - Number(to[1]), c: FILES.indexOf(to[0]) };
  board[t.r][t.c] = board[f.r][f.c];
  board[f.r][f.c] = null;
  return { ...game, board, herTurn: false, legal: [], lastMove: { from, to } };
}

function Board({ game, selected, onSquare }) {
  const flip = game.eliraColor === 'b';
  const ranks = [...Array(8).keys()];
  const order = flip ? ranks.slice().reverse() : ranks;
  const targets = new Set(selected ? game.legal.filter((m) => m.from === selected).map((m) => m.to) : []);
  const kingInCheck = game.inCheck ? game.turn : null;

  return (
    <div className="chess-board" role="grid" aria-label="Chess board">
      {/* Rows run rank 8→1 (or 1→8 when she plays black); columns a→h (or h→a). */}
      {order.map((r) =>
        order.map((fileIdx) => {
          const sq = squareName(r, fileIdx);
          const piece = game.board[r][fileIdx];
          const dark = (r + fileIdx) % 2 === 1;
          const isLast = game.lastMove && (game.lastMove.from === sq || game.lastMove.to === sq);
          const isCheck = piece && piece.type === 'k' && piece.color === kingInCheck;
          const cls = [
            'chess-sq',
            dark ? 'chess-sq--dark' : 'chess-sq--light',
            isLast ? 'chess-sq--last' : '',
            selected === sq ? 'chess-sq--selected' : '',
            isCheck ? 'chess-sq--check' : '',
          ].join(' ');
          return (
            <button key={sq} type="button" className={cls} onClick={() => onSquare(sq, piece)} aria-label={sq}>
              {piece && (
                <span className={`chess-piece chess-piece--${piece.color}`}>{GLYPH[piece.type]}{'︎'}</span>
              )}
              {targets.has(sq) && <span className={piece ? 'chess-target chess-target--capture' : 'chess-target'} />}
            </button>
          );
        })
      )}
    </div>
  );
}

export default function Chess() {
  const [game, setGame] = useState(null);
  const [past, setPast] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState('');
  const [confirmResign, setConfirmResign] = useState(false);
  const [viewing, setViewing] = useState(null); // a finished game being looked back at

  function load() {
    return api.getChess().then((d) => { setGame(d.game); setPast(d.past || []); }).catch(() => setError('Could not load games.'));
  }

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  async function start(color) {
    setError(''); setThinking(color !== 'w'); setViewing(null);
    try {
      const d = await api.newChessGame(color);
      setGame(d.game);
    } catch (e) { setError('Could not start a game.'); }
    finally { setThinking(false); }
  }

  async function onSquare(sq, piece) {
    if (!game || !game.herTurn || thinking) return;
    if (selected) {
      const move = game.legal.find((m) => m.from === selected && m.to === sq);
      if (move) {
        setSelected(null); setError(''); setThinking(true);
        setGame(optimistic(game, move.from, move.to));
        try {
          const d = await api.playChessMove(game.id, move.from, move.to);
          setGame(d.game);
          if (d.game.status === 'over') load();
        } catch (e) {
          setError('That move didn\'t go through — try again.');
          await load();
        } finally { setThinking(false); }
        return;
      }
    }
    if (piece && piece.color === game.eliraColor && game.legal.some((m) => m.from === sq)) setSelected(sq);
    else setSelected(null);
  }

  async function resign() {
    if (!confirmResign) { setConfirmResign(true); return; }
    setConfirmResign(false); setThinking(true);
    try { const d = await api.resignChess(game.id); setGame(d.game); load(); }
    catch (e) { setError('Could not resign.'); }
    finally { setThinking(false); }
  }

  async function say(text) {
    const g = viewing || game;
    if (!g) return false;
    setThinking(true); setError('');
    try {
      const d = await api.sayChess(g.id, text);
      if (viewing) setViewing(d.game); else setGame(d.game);
      return true;
    } catch (e) { setError('Knox couldn\'t answer just now — try again.'); return false; }
    finally { setThinking(false); }
  }

  async function view(id) {
    try { const d = await api.getChessGame(id); setViewing(d.game); } catch (e) {}
  }

  const shown = viewing || game;
  const talk = shown && shown.comments ? shown.comments.slice(-8) : [];

  let status = '';
  if (shown && shown.status === 'over') status = resultLine(shown);
  else if (thinking) status = 'Knox is thinking…';
  else if (shown && shown.herTurn) status = shown.inCheck ? 'Check — your move.' : 'Your move.';
  else if (shown) status = 'Knox\'s move.';

  return (
    <div>
      <p className="room-subtitle">He chooses his own moves — he plays like someone who loves the game, not like an engine.</p>

      {loading && <p className="room-subtitle">Loading…</p>}
      {error && <p className="chess-error">{error}</p>}

      {!loading && (!game || game.status === 'over') && !viewing && (
        <div className="chess-new">
          <p className="entry-body">{game && game.status === 'over' ? 'Play again?' : 'Start a game:'}</p>
          <div className="chess-buttons">
            <button type="button" onClick={() => start('w')} disabled={thinking}>Play white</button>
            <button type="button" onClick={() => start('b')} disabled={thinking}>Play black</button>
            <button type="button" onClick={() => start('random')} disabled={thinking}>Surprise me</button>
          </div>
        </div>
      )}

      {shown && (
        <>
          {viewing && (
            <button type="button" className="notes-tab" onClick={() => setViewing(null)}>← Back</button>
          )}
          <p className={`chess-status${shown.inCheck && shown.status !== 'over' ? ' chess-status--check' : ''}`}>{status}</p>
          <Board game={shown} selected={viewing ? null : selected} onSquare={viewing ? () => {} : onSquare} />

          {talk.length > 0 && (
            <div className="game-transcript chess-talk">
              {talk.map((c, i) => (
                <p key={i} className={`game-line game-line--${c.system ? 'system' : c.who === 'elira' ? 'elira' : 'knox'}`}>{c.text}</p>
              ))}
            </div>
          )}
          <GameTalk onSend={say} busy={thinking} />

          {shown.moves.length > 0 && (
            <p className="chess-moves">
              {shown.moves.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m} ` : `${m}  `))}
            </p>
          )}

          {!viewing && shown.status === 'active' && (
            <button type="button" className="chess-resign" onClick={resign} disabled={thinking}>
              {confirmResign ? 'Tap again to resign' : 'Resign'}
            </button>
          )}
        </>
      )}

      {past.length > 0 && (
        <>
          <h2 className="integrity-history-title">Past games</h2>
          {past.map((p) => (
            <button key={p.id} type="button" className="chess-past" onClick={() => view(p.id)}>
              <span>{p.result === 'draw' ? 'Draw' : p.result === 'elira' ? 'You won' : 'Knox won'}</span>
              <span className="entry-meta">
                {REASON[p.end_reason] || p.end_reason} · {Math.ceil(p.plies / 2)} moves · you played {p.elira_color === 'w' ? 'white' : 'black'} ·{' '}
                {new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}
