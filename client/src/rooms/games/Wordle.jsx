import { useEffect, useState } from 'react';
import { api } from '../../api.js';

// Wordle, together. One shared word a day. You guess; Knox thinks it through
// with you and may suggest a word — tap his suggestion to try it. He doesn't
// know the answer either.

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

function Tile({ ch, state }) {
  return <span className={`wordle-tile${state ? ` wordle-tile--${state}` : ''}${ch && !state ? ' wordle-tile--typed' : ''}`}>{ch || ''}</span>;
}

export default function Wordle() {
  const [w, setW] = useState(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api.getWordle().then(setW).catch(() => setError('Could not load today\'s word.')); }, []);

  async function submit(word) {
    const g = (word || typed).toLowerCase();
    if (g.length !== 5 || busy) return;
    setBusy(true); setError('');
    try { setW(await api.guessWordle(g)); setTyped(''); }
    catch (e) { setError(e.message.includes('400') ? 'Not in the word list — try another.' : 'That didn\'t go through — try again.'); }
    finally { setBusy(false); }
  }

  async function askKnox() {
    setBusy(true); setError('');
    try { setW(await api.askKnoxWordle()); } catch (e) { setError('Knox couldn\'t answer just now.'); }
    finally { setBusy(false); }
  }

  function key(k) {
    if (!w || w.status !== 'playing' || busy) return;
    setError('');
    if (k === 'enter') submit();
    else if (k === 'del') setTyped((t) => t.slice(0, -1));
    else setTyped((t) => (t.length < 5 ? t + k : t));
  }

  if (!w) return <p className="room-subtitle">{error || 'Loading…'}</p>;

  const rows = [];
  for (let i = 0; i < 6; i++) {
    const g = w.guesses[i];
    if (g) rows.push(g.word.split('').map((ch, j) => <Tile key={j} ch={ch} state={g.pattern[j]} />));
    else if (i === w.guesses.length && w.status === 'playing') rows.push([...Array(5)].map((_, j) => <Tile key={j} ch={typed[j]} />));
    else rows.push([...Array(5)].map((_, j) => <Tile key={j} />));
  }
  const last = w.comments[w.comments.length - 1];

  return (
    <div>
      <p className="room-subtitle">Today's word, together. He doesn't know it either.</p>
      <div className="wordle-grid">{rows.map((r, i) => <div key={i} className="wordle-row">{r}</div>)}</div>

      {w.status !== 'playing' && (
        <p className="chess-status">{w.status === 'won' ? `Got it in ${w.guesses.length}! 🔥` : `The word was ${w.answer.toUpperCase()}.`} New word tomorrow.</p>
      )}
      {error && <p className="chess-error">{error}</p>}
      {busy && <p className="chess-status">Knox is thinking…</p>}

      {last && (
        <div className="chess-said">
          <p className="entry-body chess-said-line">“{last.text}”</p>
          {last.suggestion && w.status === 'playing' && (
            <button type="button" className="wordle-suggest" disabled={busy} onClick={() => submit(last.suggestion)}>
              Try {last.suggestion.toUpperCase()}
            </button>
          )}
        </div>
      )}

      {w.status === 'playing' && (
        <>
          <div className="wordle-keys">
            {ROWS.map((r, i) => (
              <div key={i} className="wordle-keyrow">
                {i === 2 && <button type="button" className="wordle-key wordle-key--wide" onClick={() => key('enter')} disabled={busy}>Enter</button>}
                {r.split('').map((ch) => (
                  <button key={ch} type="button" className={`wordle-key${w.keys[ch] ? ` wordle-key--${w.keys[ch]}` : ''}`} onClick={() => key(ch)} disabled={busy}>{ch}</button>
                ))}
                {i === 2 && <button type="button" className="wordle-key wordle-key--wide" onClick={() => key('del')} disabled={busy} aria-label="Delete">⌫</button>}
              </div>
            ))}
          </div>
          <button type="button" className="chess-resign" onClick={askKnox} disabled={busy}>What do you think, Knox?</button>
        </>
      )}
    </div>
  );
}
