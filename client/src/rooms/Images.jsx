import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export default function Images() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState('');
  const [preview, setPreview] = useState(null);
  const [reactingIds, setReactingIds] = useState(() => new Set());
  const fileInputRef = useRef(null);

  useEffect(() => {
    api
      .listRoom('images')
      .then((data) => setEntries(data.entries || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleFileChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result);
    reader.readAsDataURL(file);
  }

  function askKnox(id) {
    setReactingIds((prev) => new Set(prev).add(id));
    api
      .reactToEntry('images', id)
      .then((data) => {
        setEntries((prev) => prev.map((e) => (e.id === data.entry.id ? data.entry : e)));
      })
      .catch(() => {})
      .finally(() => {
        setReactingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      });
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!preview || uploading) return;

    setUploading(true);
    try {
      const { url } = await api.uploadImage(preview);
      const data = await api.postToRoom('images', {
        kind: 'image',
        body: caption.trim() || null,
        media_url: url,
      });
      setEntries((prev) => [data.entry, ...prev]);
      setPreview(null);
      setCaption('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      askKnox(data.entry.id);
    } catch (err) {
      // Leave the preview and caption in place so nothing's lost if this fails.
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="room">
      <h1>Images</h1>
      <p className="room-subtitle">Photos and Knox-made pictures, together in one place.</p>

      <form className="upload-form" onSubmit={handleUpload}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={uploading}
        />
        {preview && <img className="upload-preview" src={preview} alt="Preview" />}
        <input
          type="text"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Add a caption (optional)"
          disabled={uploading}
        />
        <button type="submit" disabled={uploading || !preview}>
          {uploading ? 'Uploading...' : 'Add'}
        </button>
      </form>

      <div className="image-grid">
        {loading && <p className="room-subtitle">Loading...</p>}
        {!loading && entries.length === 0 && <p className="room-subtitle">Nothing here yet.</p>}
        {entries.map((entry) => {
          const isReacting = reactingIds.has(entry.id);
          return (
            <div key={entry.id} className="image-card">
              <img src={entry.media_url} alt={entry.body || ''} />
              {entry.body && <p className="image-caption">{entry.body}</p>}
              <span className="entry-meta">
                {entry.author} — {new Date(entry.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
              </span>

              {entry.knox_reaction && (
                <p className="knox-reaction">{entry.knox_reaction}</p>
              )}
              {isReacting && <p className="knox-reaction knox-reaction--pending">Knox is looking...</p>}

              {!entry.knox_reaction && !isReacting && (
                <button
                  type="button"
                  className="ask-knox-button"
                  onClick={() => askKnox(entry.id)}
                >
                  Ask Knox about this
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
