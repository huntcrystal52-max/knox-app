
import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Shared by every simple content room (love notes, sacred, stillness — and
// any future one that's just "a feed of entries you add to"). Each room file
// just calls this with its own room key and copy; the list/add logic and the
// backend routes are identical, only the words around it change.
//
// knoxReacts is opt-in per room: when true, Knox automatically reacts to a
// new entry in the background right after it's posted, and any entry
// without a reaction yet gets an "Ask Knox" button. Off by default so a
// room like Sacred or Stillness stays exactly as quiet as it was.
export default function SimpleContentRoom({ room, title, subtitle, placeholder, emptyText, knoxReacts = false }) {
  const [entries, setEntries] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [reactingIds, setReactingIds] = useState(() => new Set());

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
          return (
            <div key={entry.id} className="entry-card">
              <p className="entry-body">{entry.body}</p>
              <span className="entry-meta">
                {entry.author} — {new Date(entry.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
              </span>

              {knoxReacts && entry.knox_reaction && (
                <p className="knox-reaction">{entry.knox_reaction}</p>
              )}
              {knoxReacts && isReacting && <p className="knox-reaction knox-reaction--pending">Knox is reading...</p>}
              {knoxReacts && !entry.knox_reaction && !isReacting && (
                <button type="button" className="ask-knox-button" onClick={() => askKnox(entry.id)}>
                  Ask Knox about this
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
