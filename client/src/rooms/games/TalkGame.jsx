import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';

// One screen for each of the talking games: 20 Questions, Would You Rather,
// Two Truths and a Lie, and Trivia. The server keeps the state and any secrets;
// this only shows what's been said and the buttons for what you can do next.

function Transcript({ lines }) {
  const end = useRef(null);
  useEffect(() => { if (end.current) end.current.scrollIntoView({ block: 'nearest' }); }, [lines.length]);
  if (!lines.length) return null;
  return (
    <div className="game-transcript">
      {lines.map((l, i) => (
        <p key={i} className={`game-line game-line--${l.who}`}>{l.text}</p>
      ))}
      <span ref={end} />
    </div>
  );
}

function TextSend({ placeholder, label, onSend, busy }) {
  const [text, setText] = useState('');
  return (
    <form className="game-send" onSubmit={(e) => { e.preventDefault(); if (text.trim() && !busy) { onSend(text.trim()); setText(''); } }}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} disabled={busy} />
      <button type="submit" disabled={busy || !text.trim()}>{label}</button>
    </form>
  );
}

function Starts({ type, start, busy }) {
  const [topic, setTopic] = useState('');
  if (type === '20q') return (
    <div className="chess-buttons">
      <button type="button" disabled={busy} onClick={() => start({ mode: 'knox' })}>He thinks of something</button>
      <button type="button" disabled={busy} onClick={() => start({ mode: 'elira' })}>I'll think of something</button>
    </div>
  );
  if (type === 'trivia') return (
    <form className="game-send" onSubmit={(e) => { e.preventDefault(); start({ topic }); }}>
      <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Any topic (or leave blank for a mix)" disabled={busy} />
      <button type="submit" disabled={busy}>Start</button>
    </form>
  );
  return <div className="chess-buttons"><button type="button" disabled={busy} onClick={() => start({})}>Start</button></div>;
}

function Controls({ game, act, busy }) {
  const s = game.state;
  const [why, setWhy] = useState('');
  const [three, setThree] = useState(['', '', '']);

  if (game.type === '20q' && s.mode === 'knox') return (
    <>
      <p className="entry-meta">Category: {s.category} · question {Math.min((s.questions || 0) + 1, 20)} of 20</p>
      <TextSend placeholder="Ask a yes/no question — or guess" label="Ask" busy={busy} onSend={(text) => act('ask', { text })} />
      <button type="button" className="chess-resign" disabled={busy} onClick={() => act('give_up')}>Give up</button>
    </>
  );

  if (game.type === '20q') {
    if (s.result === 'elira') return (
      <TextSend placeholder="What was it? (so he knows)" label="Tell him" busy={busy} onSend={(text) => act('tell_answer', { text })} />
    );
    if (!s.pending) return null;
    return (
      <>
        <p className="entry-meta">His question {s.questions} of 20</p>
        <div className="chess-buttons">
          {s.pending.kind === 'guess' ? (
            <>
              <button type="button" disabled={busy} onClick={() => act('reply', { answer: 'right' })}>Yes, that's it!</button>
              <button type="button" disabled={busy} onClick={() => act('reply', { answer: 'wrong' })}>No</button>
            </>
          ) : (
            ['yes', 'no', 'sometimes', 'not sure'].map((a) => (
              <button key={a} type="button" disabled={busy} onClick={() => act('reply', { answer: a })}>{a[0].toUpperCase() + a.slice(1)}</button>
            ))
          )}
        </div>
      </>
    );
  }

  if (game.type === 'wyr') return (
    <>
      {s.pending ? (
        <>
          <div className="game-options">
            <button type="button" disabled={busy} onClick={() => { act('pick', { pick: 'a', why }); setWhy(''); }}>{s.pending.option_a}</button>
            <button type="button" disabled={busy} onClick={() => { act('pick', { pick: 'b', why }); setWhy(''); }}>{s.pending.option_b}</button>
          </div>
          <input className="game-why" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why? (optional — type before you choose)" disabled={busy} />
        </>
      ) : (
        <div className="chess-buttons"><button type="button" disabled={busy} onClick={() => act('knox_ask')}>Ask me one</button></div>
      )}
      <TextSend placeholder="Or ask him one: would you rather…" label="Ask him" busy={busy} onSend={(text) => act('her_question', { text })} />
      <button type="button" className="chess-resign" disabled={busy} onClick={() => act('finish')}>Finish</button>
    </>
  );

  if (game.type === '2t1l') return (
    <>
      <p className="entry-meta">You've spotted his lie {s.score.elira} time{s.score.elira === 1 ? '' : 's'} · he's spotted yours {s.score.knox}</p>
      {s.phase === 'her_guess' && s.current && (
        <>
          <p className="entry-body">Which one is the lie?</p>
          <div className="game-options">
            {s.current.statements.map((st, i) => (
              <button key={i} type="button" disabled={busy} onClick={() => act('guess', { index: i })}>{i + 1}. {st}</button>
            ))}
          </div>
        </>
      )}
      {s.phase === 'her_reveal' && s.hers && (
        <>
          <p className="entry-body">Which one was your lie?</p>
          <div className="game-options">
            {s.hers.statements.map((st, i) => (
              <button key={i} type="button" disabled={busy} onClick={() => act('reveal_hers', { lie_index: i })}>{i + 1}. {st}</button>
            ))}
          </div>
        </>
      )}
      {s.phase === 'idle' && (
        <>
          <div className="chess-buttons"><button type="button" disabled={busy} onClick={() => act('knox_tells')}>His turn: tell me three</button></div>
          <form className="game-three" onSubmit={(e) => { e.preventDefault(); act('her_statements', { statements: three }); setThree(['', '', '']); }}>
            <p className="entry-meta">Or your turn — two truths and a lie, in any order:</p>
            {three.map((t, i) => (
              <input key={i} value={t} onChange={(e) => setThree(three.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Statement ${i + 1}`} disabled={busy} />
            ))}
            <button type="submit" disabled={busy || three.some((t) => !t.trim())}>Let him guess</button>
          </form>
          <button type="button" className="chess-resign" disabled={busy} onClick={() => act('finish')}>Finish</button>
        </>
      )}
    </>
  );

  if (game.type === 'trivia') return (
    <>
      <p className="entry-meta">{s.topic ? `${s.topic} · ` : ''}question {Math.min(s.round + 1, s.total)} of {s.total} · score {s.score}</p>
      {s.last && (
        <div className={`game-result ${s.last.right ? 'game-result--right' : 'game-result--wrong'}`}>
          <p className="entry-body">{s.last.right ? 'Right!' : `Not quite — it was ${s.last.options[s.last.answer_index]}.`}</p>
          {s.last.fact && <p className="entry-meta">{s.last.fact}</p>}
          {!s.last.right && !s.last.disputed && (
            <button type="button" className="game-dispute" disabled={busy} onClick={() => act('dispute')}>I think that's wrong</button>
          )}
        </div>
      )}
      {s.current && (
        <>
          <p className="entry-body game-question">{s.current.question}</p>
          <div className="game-options">
            {s.current.options.map((o, i) => (
              <button key={i} type="button" disabled={busy} onClick={() => act('answer', { index: i })}>{o}</button>
            ))}
          </div>
        </>
      )}
    </>
  );

  return null;
}

export default function TalkGame({ type }) {
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getGames()
      .then((d) => setGame((d.active || []).find((g) => g.type === type) || null))
      .catch(() => setError('Could not load the game.'))
      .finally(() => setLoading(false));
  }, [type]);

  async function run(fn) {
    setBusy(true); setError('');
    try { const d = await fn(); setGame(d.game); }
    catch (e) { setError('Knox couldn\'t answer just now — try again.'); }
    finally { setBusy(false); }
  }

  const start = (opts) => run(() => api.newGame(type, opts));
  const act = (action, input) => run(() => api.gameAct(game.id, action, input));

  if (loading) return <p className="room-subtitle">Loading…</p>;

  const over = !game || game.status === 'over';
  return (
    <div>
      {error && <p className="chess-error">{error}</p>}
      {game && <Transcript lines={game.transcript} />}
      {game && game.status === 'over' && game.type === 'trivia' && (
        <p className="chess-status">Final score: {game.state.score} of {game.state.total}</p>
      )}
      {busy && <p className="chess-status">Knox is thinking…</p>}
      {!over && <Controls game={game} act={act} busy={busy} />}
      {over && (
        <div className="chess-new">
          <p className="entry-body">{game ? 'Play again?' : 'Start a game:'}</p>
          <Starts type={type} start={start} busy={busy} />
        </div>
      )}
    </div>
  );
}
