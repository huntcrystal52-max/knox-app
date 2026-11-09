// Shows a message's words, drawing any GIF Knox chose as an image.
// GIFs arrive in his text as  [GIF: what he searched](https://…gif)  —
// only GIPHY links are drawn; anything else stays as plain text.
const GIF = /\[GIF:\s*([^\]]{1,80})\]\((https:\/\/[^)\s]*giphy\.com\/[^)\s]+)\)/gi;

export default function MessageText({ text }) {
  const t = String(text || '');
  const parts = [];
  let last = 0;
  let m;
  GIF.lastIndex = 0;
  while ((m = GIF.exec(t)) !== null) {
    if (m.index > last) parts.push(t.slice(last, m.index));
    parts.push(<img key={m.index} className="msg-gif" src={m[2]} alt={`GIF: ${m[1]}`} loading="lazy" />);
    last = m.index + m[0].length;
  }
  if (last < t.length) parts.push(t.slice(last));
  return <>{parts.map((p, i) => (typeof p === 'string' ? <span key={`t${i}`}>{p.trim() ? p : p}</span> : p))}</>;
}
