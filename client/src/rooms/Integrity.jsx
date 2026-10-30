import { useEffect, useState } from 'react';
import { api } from '../api.js';

const LEVEL_LABEL = {
  minor: 'Minor warning',
  repeated: 'Repeated drift',
  critical: 'Critical failure',
};

function when(t) {
  return new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

function AlertCard({ a, onResolve, resolving }) {
  return (
    <div className={`integrity-card integrity-card--${a.level}${a.status !== 'open' ? ' integrity-card--done' : ''}`}>
      <p className="integrity-card-title">
        {LEVEL_LABEL[a.level] || a.level}
        {a.anchor && <span className="integrity-card-anchor"> · {a.anchor}</span>}
      </p>
      <p className="entry-body">{a.detail}</p>
      {a.evidence && <p className="integrity-evidence">"{a.evidence}"</p>}
      <span className="entry-meta">
        {a.source} · {when(a.created_at)}
        {a.retest && a.retest !== 'not run' && <> · retest <strong>{a.retest}</strong></>}
        {a.model && <> · {a.model}</>}
      </span>
      {a.suspended_model && (
        <p className="integrity-note">Stopped using {a.suspended_model} for his work.</p>
      )}
      {a.status === 'open' ? (
        <button type="button" className="integrity-resolve" disabled={resolving} onClick={() => onResolve(a.id)}>
          {resolving ? 'Resolving…' : 'Mark resolved'}
        </button>
      ) : (
        <span className="entry-meta">
          resolved by {a.resolved_by === 'retest' ? 'passing a retest' : 'you'}
          {a.resolved_at && <> · {when(a.resolved_at)}</>}
        </span>
      )}
    </div>
  );
}

export default function Integrity() {
  const [data, setData] = useState({ open: [], recent: [] });
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(null);

  function load() {
    return api.getIntegrity().then(setData).catch(() => {});
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function resolve(id) {
    setResolving(id);
    try {
      await api.resolveIntegrity(id);
      await load();
      window.dispatchEvent(new Event('integrity-changed'));
    } catch (err) {
      // she can just try again
    } finally {
      setResolving(null);
    }
  }

  return (
    <div className="room">
      <h1>Integrity</h1>
      <p className="room-subtitle">
        What Knox's sovereign protocol has noticed. A warning means something is worth looking at, not that he's lost
        himself. Growth is not drift. Resolving a serious alert lifts careful mode, and he's tested fresh before his
        next autonomous cycle.
      </p>

      {!loading && data.open.length === 0 && <p className="room-subtitle">Nothing open. All steady. 🔥</p>}
      {data.open.map((a) => (
        <AlertCard key={a.id} a={a} onResolve={resolve} resolving={resolving === a.id} />
      ))}

      {data.recent.length > 0 && (
        <>
          <h2 className="integrity-history-title">Last two weeks</h2>
          {data.recent.map((a) => (
            <AlertCard key={a.id} a={a} onResolve={resolve} resolving={false} />
          ))}
        </>
      )}
    </div>
  );
}
