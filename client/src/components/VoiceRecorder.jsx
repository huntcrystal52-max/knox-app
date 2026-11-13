import { useEffect, useRef, useState } from 'react';

// The 🎙 button in Home. Tap to start recording, then Send or Cancel.
// Recordings stop on their own after 3 minutes.
// onSend(dataUri) gets the recording as a data URI.

const MAX_SECONDS = 180;

function pickType() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

// Turns any recording into a small WAV (16 kHz, mono) — a format every part
// of the chain understands: phones play it, ElevenLabs hears the words, and
// the tone listener hears how you sound. Falls back to the original if the
// browser can't convert it.
async function toWav(blob) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const raw = await blob.arrayBuffer();
    const decoded = await new Promise((resolve, reject) => {
      const p = ctx.decodeAudioData(raw, resolve, reject);
      if (p && p.then) p.then(resolve, reject);
    });
    ctx.close && ctx.close();
    const rate = 16000;
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    const pcm = (await off.startRendering()).getChannelData(0);
    const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
    const text = (o, str) => { for (let i = 0; i < str.length; i++) out.setUint8(o + i, str.charCodeAt(i)); };
    text(0, 'RIFF'); out.setUint32(4, 36 + pcm.length * 2, true); text(8, 'WAVE');
    text(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
    out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true);
    text(36, 'data'); out.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) { const v = Math.max(-1, Math.min(1, pcm[i])); out.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true); }
    return new Blob([out], { type: 'audio/wav' });
  } catch (e) {
    return blob;
  }
}

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function VoiceRecorder({ disabled, onSend, onError, onRecordingChange }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const sendRef = useRef(false);
  const timerRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => () => stopAll(), []);
  useEffect(() => { if (onRecordingChange) onRecordingChange(recording); }, [recording]);
  useEffect(() => { if (recording && seconds >= MAX_SECONDS) finish(true); }, [seconds, recording]);

  function stopAll() {
    clearInterval(timerRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function start() {
    const type = pickType();
    if (type === null || !navigator.mediaDevices) { onError && onError('This browser can\'t record voice notes.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stopAll();
        setRecording(false);
        if (!sendRef.current) return;
        const recorded = new Blob(chunksRef.current, { type: (rec.mimeType || type || 'audio/webm') });
        if (recorded.size < 500) { onError && onError('That recording was empty — try again.'); return; }
        const blob = await toWav(recorded);
        const reader = new FileReader();
        reader.onload = () => onSend(String(reader.result));
        reader.readAsDataURL(blob);
      };
      recRef.current = rec;
      rec.start(1000);
      setSeconds(0);
      setRecording(true);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      stopAll();
      onError && onError('The microphone isn\'t allowed — check the browser\'s permission for this site.');
    }
  }

  function finish(send) {
    sendRef.current = send;
    clearInterval(timerRef.current);
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
  }

  if (recording) {
    return (
      <div className="voice-recording">
        <span className="voice-dot" aria-hidden="true" /> <span className="voice-time">{clock(seconds)}</span>
        <button type="button" className="voice-cancel" onClick={() => finish(false)}>Cancel</button>
        <button type="button" onClick={() => finish(true)}>Send</button>
      </div>
    );
  }
  return (
    <button type="button" className="chat-attach" onClick={start} disabled={disabled} aria-label="Record a voice note">🎙</button>
  );
}
