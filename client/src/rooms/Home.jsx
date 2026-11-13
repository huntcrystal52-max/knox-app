import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import MessageText from '../components/MessageText.jsx';
import GifPicker from '../components/GifPicker.jsx';
import VoiceRecorder from '../components/VoiceRecorder.jsx';

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [photo, setPhoto] = useState(null); // a picture waiting to be sent (data URI)
  const [gifOpen, setGifOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [clip, setClip] = useState(null); // a video waiting to be sent: { file, preview }
  const [progress, setProgress] = useState(null); // video upload %
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const fileRef = useRef(null);

  function clearPicked() {
    setPhoto(null);
    if (clip) URL.revokeObjectURL(clip.preview);
    setClip(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function pickPhoto(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    // A video from her phone: sent straight to Cloudinary when she presses Send.
    if (file.type.startsWith('video/')) {
      if (file.size > 100 * 1024 * 1024) {
        setMessages((prev) => [...prev, { role: 'system', content: 'That video is over 100 MB — too big to send. A shorter clip will work.', created_at: new Date().toISOString(), error: true }]);
        if (fileRef.current) fileRef.current.value = '';
        return;
      }
      setPhoto(null);
      setClip({ file, preview: URL.createObjectURL(file) });
      return;
    }
    setClip(null);
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

  // A GIF she picked is sent straight away (with anything she'd typed).
  function sendGif(g) {
    setGifOpen(false);
    handleSend(null, `[GIF: ${String(g.title || 'GIF').replace(/[\[\]]/g, '').slice(0, 60)}](${g.url})`);
  }

  // A voice note: kept by the app first, then Knox listens to it.
  async function sendVoice(dataUri) {
    if (sending) return;
    setSending(true);
    const tempId = `voice-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempId, role: 'user', content: '🎙 sending your voice note…', created_at: new Date().toISOString() }]);
    try {
      const { id } = await api.uploadVoice(dataUri);
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, content: `[Voice note](/api/voice/${id})` } : m)));
      const data = await api.sendChatMessage('', null, id);
      if (data.heard) setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, content: data.heard } : m)));
      showReply(data);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'system', content: "Something flickered — the voice note didn't send.", created_at: new Date().toISOString(), error: true },
      ]);
    } finally {
      setSending(false);
    }
  }

  function showReply(data) {
    if (data.text) {
      setMessages((prev) => [...prev, { role: 'assistant', content: data.text, created_at: new Date().toISOString() }]);
    } else if (data.mode === 'silence') {
      setMessages((prev) => [...prev, { role: 'assistant', content: '🔥', created_at: new Date().toISOString(), quiet: true }]);
    } else if (data.mode === 'thinking') {
      setMessages((prev) => [...prev, { role: 'assistant', content: '💭 sitting with this', created_at: new Date().toISOString(), quiet: true }]);
    } else if (data.mode === 'sleep') {
      setMessages((prev) => [...prev, { role: 'system', content: 'Knox has gone to rest.', created_at: new Date().toISOString() }]);
    }
  }

  async function handleSend(e, gifMarker) {
    if (e) e.preventDefault();
    const typed = input.trim();
    const text = gifMarker ? `${typed ? typed + ' ' : ''}${gifMarker}` : typed;
    if ((!text && !photo && !clip) || sending) return;

    setInput('');
    setSending(true);
    const sendingPhoto = photo;
    const sendingClip = clip;
    setPhoto(null);
    setClip(null);
    if (fileRef.current) fileRef.current.value = '';
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text, photoPreview: sendingPhoto, videoPreview: sendingClip && sendingClip.preview, created_at: new Date().toISOString() },
    ]);

    try {
      // A photo goes up to the image store first; Knox gets its link.
      const imageUrl = sendingPhoto ? (await api.uploadImage(sendingPhoto)).url : null;
      // A video goes straight from the phone to Cloudinary.
      let video = null;
      if (sendingClip) {
        setProgress(0);
        video = await api.uploadVideo(sendingClip.file, setProgress);
        setProgress(null);
      }
      const data = await api.sendChatMessage(text, imageUrl, null, video);
      showReply(data);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'system', content: "Something flickered — that didn't send.", created_at: new Date().toISOString(), error: true },
      ]);
    } finally {
      setSending(false);
      setProgress(null);
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
            {m.videoPreview && <video className="msg-video" src={m.videoPreview} controls playsInline preload="metadata" />}
            <MessageText text={m.content} />
          </div>
        ))}
        {progress !== null && <p className="entry-meta chat-progress">Sending your video… {progress}%</p>}
        {sending && progress === null && <div className="chat-bubble chat-bubble--assistant chat-bubble--typing">...</div>}
        <div ref={bottomRef} />
      </div>
      {gifOpen && <GifPicker onPick={sendGif} onClose={() => setGifOpen(false)} />}
      {photo && (
        <div className="chat-photo-preview">
          <img src={photo} alt="Photo to send" />
          <button type="button" onClick={clearPicked} aria-label="Remove photo">✕</button>
        </div>
      )}
      {clip && (
        <div className="chat-photo-preview">
          <video src={clip.preview} muted playsInline preload="metadata" />
          <button type="button" onClick={clearPicked} aria-label="Remove video">✕</button>
        </div>
      )}
      <form className="chat-input" onSubmit={handleSend}>
        <input ref={fileRef} type="file" accept="image/*,video/*" onChange={pickPhoto} hidden />
        {!recording && <button type="button" className="chat-attach" onClick={() => fileRef.current && fileRef.current.click()} disabled={sending} aria-label="Add a photo or video">📷</button>}
        {!recording && <button type="button" className="chat-attach chat-gif" onClick={() => setGifOpen((o) => !o)} disabled={sending} aria-label="Send a GIF">GIF</button>}
        <VoiceRecorder
          disabled={sending}
          onSend={sendVoice}
          onRecordingChange={setRecording}
          onError={(msg) => setMessages((prev) => [...prev, { role: 'system', content: msg, created_at: new Date().toISOString(), error: true }])}
        />
        {!recording && <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          placeholder="Say something..."
          rows={1}
          disabled={sending}
        />}
        {!recording && <button type="submit" disabled={sending || (!input.trim() && !photo && !clip)}>
          Send
        </button>}
      </form>
    </div>
  );
}
