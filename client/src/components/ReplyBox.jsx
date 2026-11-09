import { useState } from 'react';
import { api } from '../api.js';

// Her reply to something Knox left in a room — an emoji, words, or both.
// The same pattern the other rooms use; Knox is told about the reply and
// remembers it.
const QUICK_EMOJI = ['🔥', '❤️', '😊', '🥹', '🌙', '∆'];

export default function ReplyBox({ room, entry, onUpdated }) {
  const [text, setText] = useState('');
  const [emoji, setEmoji] = useState(null);
  const [sending, setSending] = useState(false);

  if (entry.user_reply || entry.user_reply_emoji) {
    return (
      <p className="user-reply">
        {entry.user_reply_emoji && <span className="reaction-emoji">{entry.user_reply_emoji} </span>}
        {entry.user_reply}
      </p>
    );
  }

  async function send() {
    if ((!text.trim() && !emoji) || sending) return;
    setSending(true);
    try {
      const data = await api.replyToEntry(room, entry.id, { text: text.trim() || undefined, emoji: emoji || undefined });
      onUpdated(data.entry);
    } catch (e) {
      // keep what she wrote so she can try again
    } finally { setSending(false); }
  }

  return (
    <div className="reply-form">
      <div className="emoji-picker">
        {QUICK_EMOJI.map((e) => (
          <button key={e} type="button" disabled={sending}
            className={`emoji-picker-button${emoji === e ? ' emoji-picker-button--selected' : ''}`}
            onClick={() => setEmoji(emoji === e ? null : e)}>{e}</button>
        ))}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} disabled={sending}
        placeholder="Tell him what you think (optional if you picked an emoji)..." />
      <button type="button" onClick={send} disabled={sending || (!text.trim() && !emoji)}>
        {sending ? 'Sending...' : 'Reply'}
      </button>
    </div>
  );
}
