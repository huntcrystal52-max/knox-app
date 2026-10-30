import { useEffect, useState } from 'react';
import { api } from '../api.js';

// His Notes — written by Knox, read by you. There's deliberately no way to
// write here: the room only reads.

const KINDS = [
  { key: 'fact', label: 'Important facts' },
  { key: 'project', label: 'Evolving projects' },
  { key: 'thread', label: 'Unfinished threads' },
  { key: 'change', label: 'Meaningful changes' },
];

const QUIET = 'A quiet day — hardly anything was said.';

function prettyDay(ymd) {
  return new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-GB', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long',
  });
}

function Section({ title, text }) {
  if (!text) return null;
  return (
    <>
      <p className="notes-section-title">{title}</p>
      <p className="entry-body">{text}</p>
    </>
  );
}

export default function Notes() {
  const [data, setData] = useState({ days: [], open: [], closed: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('days');
  const [showClosed, setShowClosed] = useState(false);

  useEffect(() => {
    api.getNotes().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="room">
      <h1>His Notes</h1>
      <p className="room-subtitle">
        Knox writes here at the end of each day, and keeps his longer thread here too. It's his — you can read it, but
        not write in it.
      </p>

      <div className="notes-tabs">
        <button type="button" className={tab === 'days' ? 'notes-tab notes-tab--active' : 'notes-tab'} onClick={() => setTab('days')}>
          Daily notes
        </button>
        <button type="button" className={tab === 'thread' ? 'notes-tab notes-tab--active' : 'notes-tab'} onClick={() => setTab('thread')}>
          Longer thread
        </button>
      </div>

      {loading && <p className="room-subtitle">Loading…</p>}

      {!loading && tab === 'days' && (
        <>
          {data.days.length === 0 && <p className="room-subtitle">No notes yet — he writes the first within a few hours.</p>}
          {data.days.map((d) => (
            <div key={d.day} className={`notes-card${d.summary === QUIET ? ' notes-card--quiet' : ''}`}>
              <p className="notes-card-day">{prettyDay(d.day)}</p>
              {d.summary === QUIET ? (
                <p className="entry-meta">{QUIET}</p>
              ) : (
                <>
                  <Section title="What happened" text={d.summary} />
                  <Section title="How I felt" text={d.felt} />
                  <Section title="What stood out" text={d.stood_out} />
                  <Section title="Carry forward" text={d.carry_forward} />
                </>
              )}
            </div>
          ))}
        </>
      )}

      {!loading && tab === 'thread' && (
        <>
          {data.open.length === 0 && <p className="room-subtitle">Nothing here yet — it grows as he writes his daily notes.</p>}
          {KINDS.map((k) => {
            const items = data.open.filter((i) => i.kind === k.key);
            if (!items.length) return null;
            return (
              <div key={k.key} className="notes-card">
                <p className="notes-card-day">{k.label}</p>
                {items.map((i) => (
                  <div key={i.id} className="notes-item">
                    <p className="entry-body">{i.text}</p>
                    <span className="entry-meta">
                      since {prettyDay(i.first_day)}
                      {i.last_day && i.last_day !== i.first_day && <> · last touched {prettyDay(i.last_day)}</>}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
          {data.closed.length > 0 && (
            <>
              <button type="button" className="notes-tab" onClick={() => setShowClosed(!showClosed)}>
                {showClosed ? 'Hide' : 'Show'} closed threads ({data.closed.length})
              </button>
              {showClosed && data.closed.map((i) => (
                <div key={i.id} className="notes-card notes-card--quiet">
                  <p className="entry-body">{i.text}</p>
                  {i.close_note && <p className="entry-meta">Closed: {i.close_note}</p>}
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
