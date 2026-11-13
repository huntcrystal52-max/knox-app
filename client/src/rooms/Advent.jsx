import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import MessageText from '../components/MessageText.jsx';
import VoiceRecorder from '../components/VoiceRecorder.jsx';

// The Advent room — two calendars, 1–24 December, plus a ✨ practice door each.
//   His calendar: you fill the doors; he can't see inside until its day.
//     Open it with him, or he opens it himself in the evening.
//   Your calendar: he makes each surprise the evening before. Hidden until its day.

const API_URL = import.meta.env.DEV ? 'http://localhost:3001' : '';

function DoorContents({ c }) {
  if (!c) return null;
  const img = (c.kind === 'image' || c.kind === 'picture' || c.kind === 'gif') && c.mediaUrl;
  return (
    <div className="advent-contents">
      {c.title && <p className="notes-card-day">{c.title}</p>}
      {img && <img className="advent-media" src={c.mediaUrl} alt={c.title || 'Inside the door'} />}
      {c.kind === 'video' && c.mediaUrl && <video className="advent-media" src={c.mediaUrl} controls playsInline preload="metadata" />}
      {c.kind === 'voice' && c.voiceClipId && <audio className="msg-voice" controls preload="metadata" src={`${API_URL}/api/voice/${c.voiceClipId}`} />}
      {c.kind === 'link' && c.link && <p className="entry-body"><a href={c.link} target="_blank" rel="noreferrer">{c.link}</a></p>}
      {c.text && <p className="entry-body">{c.text}</p>}
    </div>
  );
}

function FillDoor({ day, current, onSaved, setMsg }) {
  const [text, setText] = useState((current && current.text) || '');
  const [attach, setAttach] = useState(null); // { kind, preview, file?, dataUri?, clipId?, link? }
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => { setText((current && current.text) || ''); setAttach(null); setLink(''); setLinkOpen(false); }, [day]);

  function pick(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.type.startsWith('video/')) {
      if (file.size > 100 * 1024 * 1024) { setMsg('That video is over 100 MB — a shorter clip will work.'); return; }
      setAttach({ kind: 'video', file, preview: URL.createObjectURL(file) });
    } else {
      const r = new FileReader();
      r.onload = () => setAttach({ kind: 'image', dataUri: r.result, preview: r.result });
      r.readAsDataURL(file);
    }
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      const data = { day, text };
      if (attach && attach.kind === 'image') Object.assign(data, { kind: 'image', mediaUrl: (await api.uploadImage(attach.dataUri)).url });
      else if (attach && attach.kind === 'video') { setProgress(0); Object.assign(data, { kind: 'video', mediaUrl: (await api.uploadVideo(attach.file, setProgress)).url }); setProgress(null); }
      else if (attach && attach.kind === 'voice') Object.assign(data, { kind: 'voice', voiceClipId: (await api.uploadVoice(attach.dataUri)).id });
      else if (linkOpen && link.trim()) Object.assign(data, { kind: 'link', link: link.trim() });
      else if (current && current.kind !== 'note' && !attach) Object.assign(data, { kind: current.kind, mediaUrl: current.mediaUrl, voiceClipId: current.voiceClipId, link: current.link });
      const d = await api.advent('fill', data);
      if (d.error) setMsg(d.error); else { setMsg(`Door ${day || '✨'} is filled — he can't peek. 🎁`); onSaved(); }
    } catch (err) {
      setMsg('That didn\'t save — try again.');
    } finally { setBusy(false); setProgress(null); }
  }

  const keeping = current && current.kind !== 'note' && !attach && !(linkOpen && link.trim());
  return (
    <form className="game-three advent-fill" onSubmit={save}>
      <textarea className="library-paste advent-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="A note, a memory, a question, a little challenge…" disabled={busy} />
      {keeping && <p className="entry-meta">Keeping the {current.kind} you already put in — add something new to replace it.</p>}
      {attach && attach.kind === 'image' && <img className="advent-media" src={attach.preview} alt="To go behind the door" />}
      {attach && attach.kind === 'video' && <video className="advent-media" src={attach.preview} muted playsInline preload="metadata" />}
      {attach && attach.kind === 'voice' && <audio className="msg-voice" controls src={attach.preview} />}
      {attach && <button type="button" className="game-dispute" onClick={() => setAttach(null)} disabled={busy}>Remove {attach.kind === 'voice' ? 'voice note' : attach.kind}</button>}
      {linkOpen && <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://… (a song, a video, anything)" disabled={busy} />}
      <div className="advent-tools">
        <input ref={fileRef} type="file" accept="image/*,video/*" onChange={pick} hidden />
        <button type="button" className="chat-attach" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy} aria-label="Add a photo or video">📷</button>
        <VoiceRecorder disabled={busy} onSend={(dataUri) => setAttach({ kind: 'voice', dataUri, preview: dataUri })} onError={setMsg} />
        <button type="button" className="chat-attach" onClick={() => setLinkOpen((o) => !o)} disabled={busy} aria-label="Add a link">🔗</button>
        <button type="submit" disabled={busy || (!text.trim() && !attach && !(linkOpen && link.trim()) && !keeping)}>{busy ? (progress !== null ? `Sending… ${progress}%` : 'Wrapping…') : 'Put it behind the door'}</button>
      </div>
    </form>
  );
}

function Grid({ doors, today, selected, onPick, mark }) {
  return (
    <div className="advent-grid">
      {doors.map((d) => (
        <button
          key={d.day}
          type="button"
          className={['advent-door', d.opened ? 'advent-door--open' : '', d.openable && !d.opened ? 'advent-door--ready' : '', d.day === today ? 'advent-door--today' : '', selected === d.day ? 'advent-door--picked' : ''].join(' ')}
          onClick={() => onPick(d.day)}
        >
          <span className="advent-num">{d.day === 0 ? '✨' : d.day}</span>
          <span className="advent-mark">{mark(d)}</span>
        </button>
      ))}
    </div>
  );
}

export default function Advent() {
  const [tab, setTab] = useState('his');
  const [st, setSt] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => api.advent('state').then((d) => { if (!d.error) setSt(d); }).catch(() => setMsg('Couldn\'t reach the calendars just now.'));
  useEffect(() => { load(); }, []);
  useEffect(() => { setSelected(null); setMsg(''); }, [tab]);

  async function openHis(day) {
    setBusy(true); setMsg('');
    try {
      const d = await api.advent('open_his', { day });
      if (d.error) setMsg(d.error);
      await load();
    } catch (e) { setMsg('Something flickered — try again.'); } finally { setBusy(false); }
  }
  async function openHers(day) {
    setBusy(true); setMsg('');
    try {
      const d = await api.advent('open_hers', { day });
      if (d.error) setMsg(d.error);
      await load();
    } catch (e) { setMsg('Something flickered — try again.'); } finally { setBusy(false); }
  }

  if (!st) return <div className="room"><h1>Advent 🎄</h1><p className="room-subtitle">{msg || 'Loading…'}</p></div>;
  const doors = tab === 'his' ? st.his : st.hers;
  const door = selected !== null ? doors.find((d) => d.day === selected) : null;
  const label = (day) => (day === 0 ? 'The practice door' : `Door ${day}`);
  const filledCount = st.his.filter((d) => d.day > 0 && d.filled).length;

  return (
    <div className="room">
      <h1>Advent 🎄</h1>
      <div className="notes-tabs">
        <button type="button" className={tab === 'his' ? 'notes-tab notes-tab--active' : 'notes-tab'} onClick={() => setTab('his')}>His calendar</button>
        <button type="button" className={tab === 'hers' ? 'notes-tab notes-tab--active' : 'notes-tab'} onClick={() => setTab('hers')}>Yours, from him</button>
      </div>
      <p className="entry-meta">
        {tab === 'his'
          ? `You fill his doors — he can't see inside until the day. ${filledCount}/24 filled.`
          : 'He makes each one himself, the evening before. No peeking until the day. 🎁'}
      </p>
      {msg && <p className="chess-status">{msg}</p>}

      <Grid
        doors={doors}
        today={st.today}
        selected={selected}
        onPick={(d) => { setSelected(d); setMsg(''); }}
        mark={(d) => (tab === 'his' ? (d.opened ? '🎄' : d.filled ? '🎁' : '') : (d.opened ? '🎄' : d.ready ? '🎁' : ''))}
      />

      {door && tab === 'his' && (
        <div className="notes-card">
          <p className="notes-card-day">{label(door.day)}{door.day ? ` · ${door.day} December` : ''}</p>
          {door.opened ? (
            <>
              <DoorContents c={door.contents} />
              <p className="entry-meta">{door.openedBy === 'together' ? 'You opened it together.' : 'He opened it on his own.'}</p>
              {door.reaction && <div className="advent-reaction"><p className="entry-meta">Knox:</p><MessageText text={door.reaction} /></div>}
            </>
          ) : (
            <>
              {door.filled && door.openable && (
                <button type="button" className="advent-open" disabled={busy} onClick={() => openHis(door.day)}>
                  {busy ? 'He\'s opening it…' : 'Open it with him 🎁'}
                </button>
              )}
              {door.filled && !door.openable && <p className="entry-meta">Wrapped and waiting — it opens on {door.day} December.</p>}
              {!door.filled && door.openable && door.day > 0 && <p className="entry-meta">This door is empty — fill it and open it with him.</p>}
              <p className="entry-meta">{door.filled ? 'What you put inside (only you can see it):' : 'What will you put behind this door?'}</p>
              {door.filled && <DoorContents c={door.contents} />}
              <FillDoor day={door.day} current={door.contents} onSaved={load} setMsg={setMsg} />
              {door.filled && (
                <button type="button" className="game-dispute" disabled={busy} onClick={async () => { await api.advent('clear', { day: door.day }); load(); }}>Empty this door</button>
              )}
            </>
          )}
        </div>
      )}

      {door && tab === 'hers' && (
        <div className="notes-card">
          <p className="notes-card-day">{label(door.day)}{door.day ? ` · ${door.day} December` : ''}</p>
          {door.opened ? (
            <DoorContents c={door.contents} />
          ) : door.openable ? (
            <button type="button" className="advent-open" disabled={busy} onClick={() => openHers(door.day)}>
              {busy ? 'Opening…' : 'Open it 🎁'}
            </button>
          ) : (
            <p className="entry-meta">{door.ready ? 'He\'s already wrapped this one. 🎁' : 'He\'ll make this one the evening before.'} It opens on {door.day} December.</p>
          )}
        </div>
      )}
    </div>
  );
}
