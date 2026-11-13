// Shows a message's words, drawing pictures inline:
//   [GIF: what he searched](https://…giphy.com/…)  — a GIF Knox chose
//   [Image](https://…)                               — a photo she sent, or a picture he made
//   [Voice note](/api/voice/12)                      — a voice note (hers or his), with a player
//   [Video](https://res.cloudinary.com/…)            — a video she sent from her phone
// Only https links (and the app's own voice notes) are drawn; anything else stays as plain text.
const GIF = /\[(GIF:\s*[^\]]{1,80}|Image|Voice note|Video)\]\((https:\/\/[^)\s]+|\/api\/voice\/\d+)\)/gi;
const API_URL = import.meta.env.DEV ? 'http://localhost:3001' : '';

export default function MessageText({ text }) {
  const t = String(text || '');
  const parts = [];
  let last = 0;
  let m;
  GIF.lastIndex = 0;
  while ((m = GIF.exec(t)) !== null) {
    if (m.index > last) parts.push(t.slice(last, m.index));
    if (m[1] === 'Voice note') {
      if (m[2].startsWith('/api/voice/')) parts.push(<audio key={m.index} className="msg-voice" controls preload="metadata" src={API_URL + m[2]} />);
      else parts.push(m[0]);
      last = m.index + m[0].length;
      while (t[last] === '\n') last++; // the player sits on its own line already
      GIF.lastIndex = last;
      continue;
    }
    if (m[1] === 'Video') {
      if (/^https:\/\/res\.cloudinary\.com\//.test(m[2])) parts.push(<video key={m.index} className="msg-video" controls playsInline preload="metadata" src={m[2]} />);
      else parts.push(m[0]);
      last = m.index + m[0].length;
      while (t[last] === '\n') last++;
      GIF.lastIndex = last;
      continue;
    }
    if (m[2].startsWith('/')) { parts.push(m[0]); last = m.index + m[0].length; continue; }
    if (m[1].startsWith('GIF') && !/giphy\.com\//.test(m[2])) { parts.push(m[0]); last = m.index + m[0].length; continue; }
    parts.push(<img key={m.index} className="msg-gif" src={m[2]} alt={m[1].startsWith('GIF') ? m[1] : 'Picture'} loading="lazy" />);
    last = m.index + m[0].length;
  }
  if (last < t.length) parts.push(t.slice(last));
  return <>{parts.map((p, i) => (typeof p === 'string' ? <span key={`t${i}`}>{p.trim() ? p : p}</span> : p))}</>;
}
