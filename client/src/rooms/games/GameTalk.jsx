import { useState } from 'react';

// The message box under every game, so you can talk to Knox while you play.
// It shares the game's "busy" state on purpose: a message and a move are
// never sent at the same time, so neither can overwrite the other.
export default function GameTalk({ onSend, busy, placeholder }) {
  const [text, setText] = useState('');
  async function send(e) {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setText('');
    const ok = await onSend(t);
    if (ok === false) setText(t); // keep what she wrote if it didn't go through
  }
  return (
    <form className="game-send game-talk" onSubmit={send}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder || 'Say something to Knox…'} disabled={busy} />
      <button type="submit" disabled={busy || !text.trim()}>Send</button>
    </form>
  );
}
