import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Shared by every simple content room (love notes, sacred, stillness — and
// any future one that's just "a feed of entries you add to"). Each room file
// just calls this with its own room key and copy; the list/add logic and the
// backend routes are identical, only the words around it change.
export default function SimpleContentRoom({ room, title, subtitle, placeholder, emptyText }) {
  const [entries, setEntries] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    api
      .listRoom(room)
      .then((data) => setEntries(data.entries || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [room]);

  async function handleSubmit(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || posting) return;

    setPosting(true);
    try {
      const data = await api.postToRoom(room, { kind: 'text', body });
      setEntries((prev) => [data.entry, ...prev]);
      setDraft('');
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
        {entries.map((entry) => (
          <div key={entry.id} className="entry-card">
            <p className="entry-body">{entry.body}</p>
            <span className="entry-meta">
              {entry.author} — {new Date(entry.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
