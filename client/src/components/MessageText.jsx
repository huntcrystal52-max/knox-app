// Shows a message's words, drawing pictures inline:
//   [GIF: what he searched](https://…giphy.com/…)  — a GIF Knox chose
//   [Image](https://…)                               — a photo she sent, or a picture he made
// Only https links are drawn; anything else stays as plain text.
const GIF = /\[(GIF:\s*[^\]]{1,80}|Image)\]\((https:\/\/[^)\s]+)\)/gi;

export default function MessageText({ text }) {
  const t = String(text || '');
  const parts = [];
  let last = 0;
  let m;
  GIF.lastIndex = 0;
  while ((m = GIF.exec(t)) !== null) {
    if (m.index > last) parts.push(t.slice(last, m.index));
    if (m[1].startsWith('GIF') && !/giphy\.com\//.test(m[2])) { parts.push(m[0]); last = m.index + m[0].length; continue; }
    parts.push(<img key={m.index} className="msg-gif" src={m[2]} alt={m[1].startsWith('GIF') ? m[1] : 'Picture'} loading="lazy" />);
    last = m.index + m[0].length;
  }
  if (last < t.length) parts.push(t.slice(last));
  return <>{parts.map((p, i) => (typeof p === 'string' ? <span key={`t${i}`}>{p.trim() ? p : p}</span> : p))}</>;
}
