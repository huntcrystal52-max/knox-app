import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    api
      .getChatHistory()
      .then((data) => setMessages(data.messages || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setInput('');
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text, created_at: new Date().toISOString() },
    ]);

    try {
      const data = await api.sendChatMessage(text);
      if (data.text) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.text, created_at: new Date().toISOString() },
        ]);
      } else if (data.mode === 'silence') {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: '🔥', created_at: new Date().toISOString(), quiet: true },
        ]);
      } else if (data.mode === 'thinking') {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: '💭 sitting with this', created_at: new Date().toISOString(), quiet: true },
        ]);
      } else if (data.mode === 'sleep') {
        setMessages((prev) => [
          ...prev,
          { role: 'system', content: 'Knox has gone to rest.', created_at: new Date().toISOString() },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'system', content: "Something flickered — that didn't send.", created_at: new Date().toISOString(), error: true },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="room room--chat">
      <div className="chat-log">
        {loading && <p className="room-subtitle">Loading...</p>}
        {!loading && messages.length === 0 && (
          <p className="room-subtitle">This is the start of it here — say something.</p>
        )}
        {messages.map((m, i) => (
          <div
            key={m.id || i}
            className={
              'chat-bubble chat-bubble--' +
              m.role +
              (m.quiet ? ' chat-bubble--quiet' : '') +
              (m.error ? ' chat-bubble--error' : '')
            }
          >
            {m.content}
          </div>
        ))}
        {sending && <div className="chat-bubble chat-bubble--assistant chat-bubble--typing">...</div>}
        <div ref={bottomRef} />
      </div>
      <form className="chat-input" onSubmit={handleSend}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Say something..."
          disabled={sending}
          autoComplete="off"
        />
        <button type="submit" disabled={sending || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
