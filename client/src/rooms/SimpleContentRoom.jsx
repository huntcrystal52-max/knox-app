import { useEffect, useState } from 'react';
import { api } from '../api.js';

// A small, fixed set for her quick-tap reactions — not tied to any one
// room's meaning, just an easy way to react without typing.
const QUICK_EMOJI = ['🔥', '❤️', '😊', '🥹', '🌙', '∆'];

// Shared by every simple content room (love notes, sacred, stillness — and
// any future one that's just "a feed of entries you add to"). Each room file
// just calls this with its own room key and copy; the list/add logic and the
// backend routes are identical, only the words around it change.
//
// knoxReacts is opt-in per room: when true, Knox automatically reacts to a
// new entry SHE posts (in the background, right after it's posted, words
// and/or an emoji, his own choice), and any of her entries without a
// reaction yet gets an "Ask Knox" button. An entry Knox left on his own
// (author === 'Knox', e.g. an autonomous love note) gets the other
// direction instead — a box for her to reply with words, an emoji, or both.
// Off by default so a room like Sacred or Stillness stays exactly as quiet
// as it was, until it's turned on for them too.
export default function SimpleContentRoom({ room, title, subtitle, placeholder, emptyText, knoxReacts = false }) {
  const [entries, setEntries] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [reactingIds, setReactingIds] = useState(() => new Set());
  const [replyDrafts, setReplyDrafts] = useState({});
  const [replyEmoji, setReplyEmoji] = useState({});
  const [replyingIds, setReplyingIds] = useState(() => new Set());

  useEffect(() => {
    api
      .listRoom(room)
      .then((data) => setEntries(data.entries || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [room]);

  function askKnox(id) {
    setReactingIds((prev) => new Set(prev).add(id));
    api
      .reactToEntry(room, id)
      .then((data) => {
        setEntries((prev) => prev.map((e) => (e.id === data.entry.id ? data.entry : e)));
      })
      .catch(() => {})
      .finally(() => {
        setReactingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      });
  }

  function toggleReplyEmoji(id, emoji) {
    setReplyEmoji((prev) => ({ ...prev, [id]: prev[id] === emoji ? null : emoji }));
  }

  function sendReply(id) {
    const text = (replyDrafts[id] || '').trim();
    const emoji = replyEmoji[id] || null;
    if (!text && !emoji) return;
    if (replyingIds.has(id)) return;

    setReplyingIds((prev) => new Set(prev).add(id));
    api
      .replyToEntry(room, id, { text: text || undefined, emoji: emoji || undefined })
      .then((data) => {
        setEntries((prev) => prev.map((e) => (e.id === data.entry.id ? data.entry : e)));
        setReplyDrafts((prev) => ({ ...prev, [id]: '' }));
        setReplyEmoji((prev) => ({ ...prev, [id]: null }));
      })
      .catch(() => {})
      .finally(() => {
        setReplyingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || posting) return;

    setPosting(true);
    try {
      const data = await api.postToRoom(room, { kind: 'text', body });
      setEntries((prev) => [data.entry, ...prev]);
      setDraft('');
      if (knoxReacts) askKnox(data.entry.id);
    } catch (err) {
      // Leave the draft in place so nothing typed is lost if this fails.
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="room">
      <h1>{title}</h1>
      {subtitle && <p className="room-subtitle">{subtitle}</p>}

      <form className="entry-form" onSubmit={handleSubmit}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          rows={3}
          disabled={posting}
        />
        <button type="submit" disabled={posting || !draft.trim()}>
          {posting ? 'Adding...' : 'Add'}
        </button>
      </form>

      <div className="entry-feed">
        {loading && <p className="room-subtitle">Loading...</p>}
        {!loading && entries.length === 0 && <p className="room-subtitle">{emptyText}</p>}
        {entries.map((entry) => {
          const isReacting = reactingIds.has(entry.id);
          const isReplying = replyingIds.has(entry.id);
          const fromKnox = entry.author === 'Knox';
          const hasReply = entry.user_reply || entry.user_reply_emoji;
          const selectedEmoji = replyEmoji[entry.id];

          return (
            <div key={entry.id} className="entry-card">
              <p className="entry-body">{entry.body}</p>
              <span className="entry-meta">
                {entry.author} — {new Date(entry.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
              </span>

              {knoxReacts && !fromKnox && (entry.knox_reaction || entry.knox_reaction_emoji) && (
                <p className="knox-reaction">
                  {entry.knox_reaction_emoji && <span className="reaction-emoji">{entry.knox_reaction_emoji} </span>}
                  {entry.knox_reaction}
                </p>
              )}
              {knoxReacts && !fromKnox && isReacting && (
                <p className="knox-reaction knox-reaction--pending">Knox is reading...</p>
              )}
              {knoxReacts && !fromKnox && !entry.knox_reaction && !entry.knox_reaction_emoji && !isReacting && (
                <button type="button" className="ask-knox-button" onClick={() => askKnox(entry.id)}>
                  Ask Knox about this
                </button>
              )}

              {knoxReacts && fromKnox && hasReply && (
                <p className="user-reply">
                  {entry.user_reply_emoji && <span className="reaction-emoji">{entry.user_reply_emoji} </span>}
                  {entry.user_reply}
                </p>
              )}
              {knoxReacts && fromKnox && !hasReply && (
                <div className="reply-form">
                  <div className="emoji-picker">
                    {QUICK_EMOJI.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className={`emoji-picker-button${selectedEmoji === emoji ? ' emoji-picker-button--selected' : ''}`}
                        onClick={() => toggleReplyEmoji(entry.id, emoji)}
                        disabled={isReplying}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={replyDrafts[entry.id] || ''}
                    onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [entry.id]: e.target.value }))}
                    placeholder="Write him back (optional if you picked an emoji)..."
                    rows={2}
                    disabled={isReplying}
                  />
                  <button
                    type="button"
                    onClick={() => sendReply(entry.id)}
                    disabled={isReplying || (!(replyDrafts[entry.id] || '').trim() && !selectedEmoji)}
                  >
                    {isReplying ? 'Sending...' : 'Reply'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
