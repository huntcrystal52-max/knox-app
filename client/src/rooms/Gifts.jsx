import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Gifts — Knox's ideas for you (private until he shares one) and your
// wishlist. Buying always stays with you; links are his best find, not a
// guarantee.

function Link({ href, label }) {
  if (!href) return null;
  return <a className="gift-link" href={href} target="_blank" rel="noopener noreferrer">{label || 'Have a look'} ↗</a>;
}

export default function Gifts() {
  const [data, setData] = useState({ hiddenCount: 0, fromKnox: [], wishlist: [] });
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: '', note: '', link: '' });
  const [busy, setBusy] = useState(false);

  const load = () => api.getGifts().then(setData).catch(() => {});
  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  async function addWish(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setBusy(true);
    try { await api.addWish(form); setForm({ title: '', note: '', link: '' }); await load(); } finally { setBusy(false); }
  }
  async function mark(id, what) {
    setBusy(true);
    try { await (what === 'got' ? api.giftGot(id) : api.removeWish(id)); await load(); } finally { setBusy(false); }
  }

  return (
    <div className="room">
      <h1>Gifts</h1>
      <p className="room-subtitle">His ideas for you stay a surprise until he chooses to share one. Your wishlist is yours — he can see it.</p>
      {loading && <p className="room-subtitle">Loading…</p>}

      <h2 className="integrity-history-title">From Knox</h2>
      {data.hiddenCount > 0 && (
        <div className="notes-card gift-hidden">
          <p className="entry-body">🎁 Knox has {data.hiddenCount} idea{data.hiddenCount === 1 ? '' : 's'} tucked away for you.</p>
          <p className="entry-meta">You'll see one when he decides to share it.</p>
        </div>
      )}
      {!loading && !data.hiddenCount && !data.fromKnox.length && <p className="room-subtitle">Nothing yet.</p>}
      {data.fromKnox.map((g) => (
        <div key={g.id} className={`notes-card${g.status === 'got' ? ' notes-card--quiet' : ''}`}>
          <p className="notes-card-day">{g.title}</p>
          {g.note && <p className="entry-body">{g.note}</p>}
          <Link href={g.link} label={g.link_title ? `His find: ${g.link_title}` : 'His find'} />
          {g.status === 'got'
            ? <p className="entry-meta">Got it 💙</p>
            : <button type="button" className="game-dispute" disabled={busy} onClick={() => mark(g.id, 'got')}>Got it</button>}
        </div>
      ))}

      <h2 className="integrity-history-title">Your wishlist</h2>
      <form className="game-three" onSubmit={addWish}>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Something you'd love" disabled={busy} />
        <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Why, or any details (optional)" disabled={busy} />
        <input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="A link (optional)" disabled={busy} />
        <button type="submit" disabled={busy || !form.title.trim()}>Add to my wishlist</button>
      </form>
      {data.wishlist.map((g) => (
        <div key={g.id} className={`notes-card${g.status === 'got' ? ' notes-card--quiet' : ''}`}>
          <p className="notes-card-day">{g.title}</p>
          {g.note && <p className="entry-body">{g.note}</p>}
          <Link href={g.link} />
          {g.status === 'got' ? <p className="entry-meta">Got it 💙</p> : (
            <div className="chess-buttons">
              <button type="button" className="game-dispute" disabled={busy} onClick={() => mark(g.id, 'got')}>Got it</button>
              <button type="button" className="game-dispute" disabled={busy} onClick={() => mark(g.id, 'remove')}>Remove</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
