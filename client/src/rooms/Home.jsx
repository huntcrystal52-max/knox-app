import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import MessageText from '../components/MessageText.jsx';

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [photo, setPhoto] = useState(null); // a picture waiting to be sent (data URI)
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const fileRef = useRef(null);

  function pickPhoto(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result);
    reader.readAsDataURL(file);
  }

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
    if ((!text && !photo) || sending) return;

    setInput('');
    setSending(true);
    const sendingPhoto = photo;
    setPhoto(null);
    if (fileRef.current) fileRef.current.value = '';
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text, photoPreview: sendingPhoto, created_at: new Date().toISOString() },
    ]);

    try {
      // A photo goes up to the image store first; Knox gets its link.
      const imageUrl = sendingPhoto ? (await api.uploadImage(sendingPhoto)).url : null;
      const data = await api.sendChatMessage(text, imageUrl);
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
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
  }

  function handleInput(e) {
    setInput(e.target.value);
    // Auto-grow with what's typed, capped by max-height in the CSS.
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
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
            {m.photoPreview && <img className="msg-gif" src={m.photoPreview} alt="Your photo" />}
            <MessageText text={m.content} />
          </div>
        ))}
        {sending && <div className="chat-bubble chat-bubble--assistant chat-bubble--typing">...</div>}
        <div ref={bottomRef} />
      </div>
      {photo && (
        <div className="chat-photo-preview">
          <img src={photo} alt="Photo to send" />
          <button type="button" onClick={() => { setPhoto(null); if (fileRef.current) fileRef.current.value = ''; }} aria-label="Remove photo">✕</button>
        </div>
      )}
      <form className="chat-input" onSubmit={handleSend}>
        <input ref={fileRef} type="file" accept="image/*" onChange={pickPhoto} hidden />
        <button type="button" className="chat-attach" onClick={() => fileRef.current && fileRef.current.click()} disabled={sending} aria-label="Add a photo">📷</button>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          placeholder="Say something..."
          rows={1}
          disabled={sending}
        />
        <button type="submit" disabled={sending || (!input.trim() && !photo)}>
          Send
        </button>
      </form>
    </div>
  );
}
