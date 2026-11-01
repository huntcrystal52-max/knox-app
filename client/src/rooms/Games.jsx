import { useState } from 'react';
import Chess from './games/Chess.jsx';
import TalkGame from './games/TalkGame.jsx';

// Games — a room of its own for playing with Knox. Each game remembers where
// you left off, and Knox remembers every game you finish.

const GAMES = [
  { key: 'chess', name: 'Chess', blurb: 'A board you tap to move. He chooses his own moves.', icon: '♞' },
  { key: '20q', name: '20 Questions', blurb: 'One of you thinks of something; the other has twenty questions.', icon: '❓' },
  { key: 'wyr', name: 'Would You Rather', blurb: 'Impossible choices — and he has to choose too.', icon: '⚖️' },
  { key: '2t1l', name: 'Two Truths and a Lie', blurb: 'His truths are real. Can you find the lie?', icon: '🎭' },
  { key: 'trivia', name: 'Trivia', blurb: 'Ten questions on any topic you like, hosted by him.', icon: '✨' },
  { key: 'wordle', name: 'Wordle', blurb: 'A daily word you solve together.', icon: '🟩', soon: true },
  { key: 'cards', name: 'Cards', blurb: 'Blackjack, Go Fish and Crazy Eights.', icon: '🃏', soon: true },
];

export default function Games() {
  const [open, setOpen] = useState(null);
  const game = GAMES.find((g) => g.key === open);

  return (
    <div className="room">
      <h1>{game ? game.name : 'Games'}</h1>
      {game ? (
        <>
          <button type="button" className="notes-tab" onClick={() => setOpen(null)}>← All games</button>
          {game.key === 'chess' ? <Chess /> : <TalkGame type={game.key} />}
        </>
      ) : (
        <>
          <p className="room-subtitle">Play with Knox. He remembers every game you finish.</p>
          <div className="games-hub">
            {GAMES.map((g) => (
              <button key={g.key} type="button" className="games-card" disabled={g.soon} onClick={() => setOpen(g.key)}>
                <span className="games-card-icon" aria-hidden="true">{g.icon}</span>
                <span className="games-card-name">{g.name}{g.soon && <span className="games-soon"> · coming soon</span>}</span>
                <span className="entry-meta">{g.blurb}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
