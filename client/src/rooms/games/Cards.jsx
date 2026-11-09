import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import GameTalk from './GameTalk.jsx';
import MessageText from '../../components/MessageText.jsx';

// Cards with Knox: Blackjack, Go Fish and Crazy Eights. The server deals and
// keeps his hand hidden — you only ever see your own cards.

const GAMES = [
  { key: 'blackjack', name: 'Blackjack', blurb: 'He deals. Get closer to 21 than him without going over.' },
  { key: 'gofish', name: 'Go Fish', blurb: 'Ask for ranks, make books of four.' },
  { key: 'eights', name: 'Crazy Eights', blurb: 'Match suit or rank — 8s are wild. First out wins.' },
];
const SUITS = ['♠', '♥', '♦', '♣'];
const red = (c) => c && (c.endsWith('♥') || c.endsWith('♦'));

function Card({ c, onClick, disabled, dim, back, selected }) {
  if (back) return <span className="card card--back" aria-label="hidden card" />;
  return (
    <button type="button" className={`card${red(c) ? ' card--red' : ''}${dim ? ' card--dim' : ''}${selected ? ' card--selected' : ''}`} onClick={onClick} disabled={disabled || !onClick}>
      {c}
    </button>
  );
}

function Log({ lines }) {
  const end = useRef(null);
  useEffect(() => { if (end.current) end.current.scrollIntoView({ block: 'nearest' }); }, [lines.length]);
  if (!lines.length) return null;
  return (
    <div className="game-transcript cards-log">
      {lines.slice(-14).map((l, i) => <p key={i} className={`game-line game-line--${l.who}`}><MessageText text={l.text} /></p>)}
      <span ref={end} />
    </div>
  );
}

function bjTotal(cards) {
  let t = 0, a = 0;
  for (const c of cards) { const r = c.slice(0, -1); if (r === 'A') { a++; t += 11; } else if ('JQK'.includes(r)) t += 10; else t += Number(r); }
  while (t > 21 && a) { t -= 10; a--; }
  return t;
}

function Blackjack({ g, act, busy }) {
  const s = g.state;
  const playing = s.phase === 'her_turn';
  return (
    <>
      <p className="entry-meta">You {s.score.elira} · Knox {s.score.knox}{s.score.push ? ` · pushes ${s.score.push}` : ''}</p>
      {s.round > 0 && (
        <>
          <p className="cards-label">Knox{s.phase === 'round_over' ? ` — ${s.knoxTotal}` : ''}</p>
          <div className="cards-hand">
            {s.knoxShowing.map((c, i) => <Card key={i} c={c} />)}
            {playing && <Card back />}
          </div>
          <p className="cards-label">You — {bjTotal(s.hand)}</p>
          <div className="cards-hand">{s.hand.map((c, i) => <Card key={i} c={c} />)}</div>
        </>
      )}
      <div className="chess-buttons">
        {playing ? (
          <>
            <button type="button" disabled={busy} onClick={() => act('hit')}>Hit</button>
            <button type="button" disabled={busy} onClick={() => act('stand')}>Stand</button>
          </>
        ) : (
          <button type="button" disabled={busy} onClick={() => act('deal')}>{s.round ? 'Deal again' : 'Deal'}</button>
        )}
      </div>
      {!playing && s.round > 0 && <button type="button" className="chess-resign" disabled={busy} onClick={() => act('finish')}>Finish for now</button>}
    </>
  );
}

function GoFish({ g, act, busy }) {
  const s = g.state;
  const myTurn = s.turn === 'elira' && s.phase !== 'over';
  return (
    <>
      <p className="entry-meta">Your books: {s.books.elira.join(' ') || 'none'} · Knox's: {s.books.knox.join(' ') || 'none'} · pond: {s.deckCount} · Knox holds {s.knoxCount}</p>
      <p className="cards-label">{myTurn ? 'Your hand — tap a card to ask for that rank' : 'Your hand'}</p>
      <div className="cards-hand">
        {s.hand.map((c, i) => <Card key={i} c={c} disabled={busy || !myTurn} onClick={myTurn ? () => act('ask', { rank: c.slice(0, -1) }) : null} />)}
      </div>
    </>
  );
}

function Eights({ g, act, busy }) {
  const s = g.state;
  const [eight, setEight] = useState(null);
  const myTurn = s.turn === 'elira' && s.phase !== 'over';
  const playable = new Set(s.drawnThisTurn ? [s.drawnThisTurn] : s.legal || []);

  function play(c) {
    if (c.startsWith('8')) { setEight(c); return; }
    act('play', { card: c });
  }

  return (
    <>
      <p className="entry-meta">Knox holds {s.knoxCount} · deck {s.deckCount}</p>
      <div className="cards-pile">
        <Card c={s.top} />
        <span className="entry-body">Suit to follow: <span className={s.suit === '♥' || s.suit === '♦' ? 'card--red' : ''}>{s.suit}</span></span>
      </div>
      {eight ? (
        <>
          <p className="cards-label">Choose the next suit</p>
          <div className="chess-buttons">
            {SUITS.map((x) => <button key={x} type="button" disabled={busy} onClick={() => { act('play', { card: eight, suit: x }); setEight(null); }}>{x}</button>)}
            <button type="button" disabled={busy} onClick={() => setEight(null)}>Back</button>
          </div>
        </>
      ) : (
        <>
          <p className="cards-label">{myTurn ? (s.drawnThisTurn ? `You drew ${s.drawnThisTurn} — play it or pass` : 'Your hand — tap a lit card to play it') : 'Your hand'}</p>
          <div className="cards-hand">
            {s.hand.map((c, i) => <Card key={i} c={c} dim={myTurn && !playable.has(c)} disabled={busy || !myTurn || !playable.has(c)} onClick={() => play(c)} />)}
          </div>
          {myTurn && (
            <div className="chess-buttons">
              {s.drawnThisTurn
                ? <button type="button" disabled={busy} onClick={() => act('pass')}>Pass</button>
                : <button type="button" disabled={busy} onClick={() => act('draw')}>Draw a card</button>}
            </div>
          )}
        </>
      )}
    </>
  );
}

export default function Cards() {
  const [pick, setPick] = useState(null);
  const [games, setGames] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getGames().then((d) => {
      const m = {};
      for (const g of d.active || []) if (GAMES.some((x) => x.key === g.type)) m[g.type] = g;
      setGames(m);
    }).catch(() => {});
  }, []);

  async function run(fn) {
    setBusy(true); setError('');
    try { const d = await fn(); setGames((m) => ({ ...m, [d.game.type]: d.game })); }
    catch (e) { setError('That didn\'t go through — try again.'); }
    finally { setBusy(false); }
  }

  if (!pick) return (
    <div className="games-hub">
      {GAMES.map((x) => (
        <button key={x.key} type="button" className="games-card" onClick={() => setPick(x.key)}>
          <span className="games-card-name">{x.name}{games[x.key] && games[x.key].status === 'active' ? <span className="games-soon"> · in progress</span> : ''}</span>
          <span className="entry-meta">{x.blurb}</span>
        </button>
      ))}
    </div>
  );

  const g = games[pick];
  const info = GAMES.find((x) => x.key === pick);
  const act = (action, input) => run(() => api.cardAct(g.id, action, input));
  async function say(text) {
    setBusy(true); setError('');
    try { const d = await api.sayCards(g.id, text); setGames((m) => ({ ...m, [d.game.type]: d.game })); return true; }
    catch (e) { setError('Knox couldn\'t answer just now — try again.'); return false; }
    finally { setBusy(false); }
  }
  const live = g && g.status === 'active';

  return (
    <div>
      <button type="button" className="notes-tab" onClick={() => setPick(null)}>← Card games</button>
      <h2 className="cards-title">{info.name}</h2>
      {error && <p className="chess-error">{error}</p>}
      {g && <Log lines={g.transcript} />}
      {busy && <p className="chess-status">Knox is thinking…</p>}
      {g && pick === 'blackjack' && live && <Blackjack g={g} act={act} busy={busy} />}
      {g && pick === 'gofish' && <GoFish g={g} act={act} busy={busy} />}
      {g && pick === 'eights' && <Eights g={g} act={act} busy={busy} />}
      {g && <GameTalk onSend={say} busy={busy} />}
      {(!g || !live) && (
        <div className="chess-buttons">
          <button type="button" disabled={busy} onClick={() => run(() => api.newCardGame(pick))}>{g ? 'New game' : 'Deal me in'}</button>
        </div>
      )}
    </div>
  );
}
