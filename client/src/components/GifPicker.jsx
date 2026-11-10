import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Her GIF picker in Home: search, tap one, it's sent. Knox sees it too —
// he's told what it is and looks at a still from it.
export default function GifPicker({ onPick, onClose }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [state, setState] = useState('idle'); // idle | loading | off | error

  useEffect(() => {
    const term = q.trim() || 'love';
    setState('loading');
    const t = setTimeout(() => {
      api.searchGifs(term)
        .then((d) => { if (d.enabled === false) setState('off'); else { setResults(d.results || []); setState('idle'); } })
        .catch(() => setState('error'));
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="gif-picker">
      <div className="gif-picker-top">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search GIFs…" />
        <button type="button" onClick={onClose} aria-label="Close GIFs">✕</button>
      </div>
      {state === 'off' && <p className="entry-meta">GIFs aren't switched on yet — add GIPHY_API_KEY to Knox-bot in Railway.</p>}
      {state === 'error' && <p className="entry-meta">Couldn't search just now.</p>}
      <div className="gif-grid">
        {results.map((g) => (
          <button key={g.url} type="button" className="gif-pick" onClick={() => onPick(g)} title={g.title}>
            <img src={g.preview} alt={g.title} loading="lazy" />
          </button>
        ))}
      </div>
      <p className="gif-credit">Powered by GIPHY</p>
    </div>
  );
}
