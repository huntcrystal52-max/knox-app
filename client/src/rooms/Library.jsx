import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

// The Library — his books, reading time together, and your Kindle highlights.
// Reading time: you read your own book (Kindle, paperback, anything) while he
// reads one of his. He reads a passage every few minutes and jots a note; you
// see his notes, not the pages.

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function fileToText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsText(file);
  });
}

function ReadingTime({ state, run, busy }) {
  const s = state.session;
  const [herBook, setHerBook] = useState('');
  const [hisBook, setHisBook] = useState('');
  const unfinished = state.books.filter((b) => !b.finished);

  if (s) {
    const p = s.progress;
    return (
      <div className="notes-card reading-card">
        <p className="notes-card-day">📖 Reading time</p>
        <p className="entry-body">You: {s.herBook || 'your own book'}</p>
        <p className="entry-body">Knox: <em>{s.hisBook}</em>{p ? ` — passage ${p.last} of ${p.total_passages}` : ''}</p>
        {s.notes.length === 0 && <p className="entry-meta">He's just opening his book…</p>}
        {s.notes.length > 0 && (
          <div className="reading-notes">
            {s.notes.map((n, i) => (
              <p key={i} className="entry-body reading-note">
                <span className="entry-meta">{n.passage > 0 ? `p.${n.passage}${n.chapter ? ` · ${n.chapter}` : ''}` : ''}</span> {n.note}
              </p>
            ))}
          </div>
        )}
        <p className="entry-meta">Talk to him any time in Home — he knows where he is in his book.</p>
        <button type="button" className="chess-resign" disabled={busy} onClick={() => run('stop_reading')}>End reading time</button>
      </div>
    );
  }
  return (
    <div className="notes-card reading-card">
      <p className="notes-card-day">📖 Read together</p>
      <p className="entry-meta">You read yours, he reads his — side by side. He'll jot notes as he goes.</p>
      <form className="game-three" onSubmit={(e) => { e.preventDefault(); run('start_reading', { herBook, hisBook: hisBook || null }); }}>
        <input value={herBook} onChange={(e) => setHerBook(e.target.value)} placeholder="What are you reading? (optional)" disabled={busy} />
        <select value={hisBook} onChange={(e) => setHisBook(e.target.value)} disabled={busy || !unfinished.length}>
          <option value="">Let him choose his book</option>
          {unfinished.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
        </select>
        <button type="submit" disabled={busy || !unfinished.length}>{unfinished.length ? 'Start reading time' : 'Add a book first'}</button>
      </form>
    </div>
  );
}

function Books({ books, run, busy }) {
  const [confirm, setConfirm] = useState(null);
  if (!books.length) return <p className="room-subtitle">No books yet — add one below.</p>;
  return books.map((b) => (
    <div key={b.id} className="notes-card library-book">
      <p className="notes-card-day">{b.title}</p>
      {b.author && <p className="entry-meta">{b.author}</p>}
      <div className="library-bar"><span style={{ width: `${b.pct}%` }} /></div>
      <p className="entry-meta">
        {b.finished ? 'He\'s finished it' : b.started ? `He's ${b.pct}% through` : 'Not started'} · {b.total_passages} passages
      </p>
      <button type="button" className="game-dispute" disabled={busy}
        onClick={() => (confirm === b.id ? (setConfirm(null), run('remove', { id: b.id })) : setConfirm(b.id))}>
        {confirm === b.id ? 'Tap again to remove' : 'Remove'}
      </button>
    </div>
  ));
}

function AddBook({ run, busy, setMsg }) {
  const [tab, setTab] = useState('file');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [text, setText] = useState('');
  const fileRef = useRef(null);

  async function upload(e) {
    e.preventDefault();
    const file = fileRef.current && fileRef.current.files[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { setMsg('That file is over 25 MB — too big to send.'); return; }
    const data = await fileToBase64(file);
    const ok = await run('add_file', { filename: file.name, data, title, author });
    if (ok) { setTitle(''); setAuthor(''); fileRef.current.value = ''; }
  }
  async function search(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setResults(null);
    const d = await run('search_classics', { query }, true);
    setResults((d && d.results) || []);
  }

  return (
    <div className="notes-card">
      <div className="notes-tabs">
        {[['file', 'A file'], ['classic', 'A free classic'], ['paste', 'Paste text']].map(([k, label]) => (
          <button key={k} type="button" className={tab === k ? 'notes-tab notes-tab--active' : 'notes-tab'} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {tab === 'file' && (
        <form className="game-three" onSubmit={upload}>
          <input ref={fileRef} type="file" accept=".pdf,.epub,.txt" disabled={busy} />
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional — read from the book if it has one)" disabled={busy} />
          <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author (optional)" disabled={busy} />
          <button type="submit" disabled={busy}>Add to the library</button>
          <p className="entry-meta">PDF, EPUB or plain text. Kindle books can't be added — they're locked to Amazon — but DRM-free EPUBs from other shops work.</p>
        </form>
      )}
      {tab === 'classic' && (
        <>
          <form className="game-send" onSubmit={search}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Greek myths, Jane Austen, folklore" disabled={busy} />
            <button type="submit" disabled={busy || !query.trim()}>Search</button>
          </form>
          <p className="entry-meta">Free, public-domain books from Project Gutenberg.</p>
          {results && !results.length && <p className="entry-meta">Nothing found — try other words.</p>}
          {results && results.map((r) => (
            <div key={r.id} className="library-result">
              <span className="entry-body">{r.title}{r.author ? <span className="entry-meta"> — {r.author}</span> : null}</span>
              <button type="button" className="game-dispute" disabled={busy} onClick={() => run('add_classic', { id: r.id })}>Add</button>
            </div>
          ))}
        </>
      )}
      {tab === 'paste' && (
        <form className="game-three" onSubmit={async (e) => { e.preventDefault(); if (await run('add_text', { title, author, text })) { setText(''); setTitle(''); setAuthor(''); } }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" disabled={busy} />
          <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author (optional)" disabled={busy} />
          <textarea className="library-paste" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the text here" disabled={busy} />
          <button type="submit" disabled={busy || !title.trim() || text.length < 200}>Add to the library</button>
        </form>
      )}
    </div>
  );
}

function Highlights({ highlights, run, busy }) {
  const ref = useRef(null);
  async function upload(e) {
    e.preventDefault();
    const file = ref.current && ref.current.files[0];
    if (!file) return;
    const ok = await run('add_highlights', { text: await fileToText(file) });
    if (ok) ref.current.value = '';
  }
  return (
    <div className="notes-card">
      <p className="entry-body">Share what struck you in your Kindle books — he'll see your highlights and notes when you read together.</p>
      <details className="library-howto">
        <summary className="entry-meta">How to get them</summary>
        <p className="entry-meta">Kindle app: open the book → the notebook icon → Export notebook → save the file. Kindle e-reader: plug it in and copy <b>My Clippings.txt</b> from the documents folder.</p>
      </details>
      <form className="game-three" onSubmit={upload}>
        <input ref={ref} type="file" accept=".txt,.html,.htm" disabled={busy} />
        <button type="submit" disabled={busy}>Add highlights</button>
      </form>
      {highlights.map((h, i) => (
        <p key={i} className="entry-meta">{h.book}{h.author ? ` — ${h.author}` : ''} · {h.n} highlight{h.n === 1 ? '' : 's'}</p>
      ))}
    </div>
  );
}

export default function Library() {
  const [state, setState] = useState({ books: [], highlights: [], session: null });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => api.library('state').then(setState).catch(() => setMsg('Couldn\'t reach the library just now.'));
  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  // While reading time is on, check for his new notes every minute (this also
  // tells him you're still there, so it doesn't time out).
  useEffect(() => {
    if (!state.session) return undefined;
    const t = setInterval(() => api.library('reading_ping').then((d) => setState((s) => ({ ...s, session: d.session }))).catch(() => {}), 60000);
    return () => clearInterval(t);
  }, [state.session && state.session.id]);

  // Runs an action; returns the reply (or true) on success, false on failure.
  async function run(action, data = {}, raw = false) {
    setBusy(true); setMsg('');
    try {
      const d = await api.library(action, data);
      if (d && d.error) { setMsg(d.error); return false; }
      if (action === 'add_file' || action === 'add_text' || action === 'add_classic') setMsg(`Added “${d.book.title}” — ${d.book.total_passages} passages.`);
      if (action === 'add_highlights') setMsg(d.found ? `Found ${d.found} highlight${d.found === 1 ? '' : 's'} (${d.added} new).` : 'No highlights found in that file.');
      if (!raw) await load();
      return raw ? d : true;
    } catch (e) {
      setMsg('That didn\'t go through — try again.');
      return false;
    } finally { setBusy(false); }
  }

  return (
    <div className="room">
      <h1>Library</h1>
      {msg && <p className="chess-status">{msg}</p>}
      {busy && <p className="entry-meta">Working on it…</p>}
      {loading ? <p className="room-subtitle">Loading…</p> : (
        <>
          <ReadingTime state={state} run={run} busy={busy} />
          <h2 className="integrity-history-title">His books</h2>
          <Books books={state.books} run={run} busy={busy} />
          <h2 className="integrity-history-title">Add a book</h2>
          <AddBook run={run} busy={busy} setMsg={setMsg} />
          <h2 className="integrity-history-title">Your Kindle highlights</h2>
          <Highlights highlights={state.highlights} run={run} busy={busy} />
        </>
      )}
    </div>
  );
}
