import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function House() {
  const [imageUrl, setImageUrl] = useState(null);
  const [additions, setAdditions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [room, setRoom] = useState('');
  const [prompt, setPrompt] = useState('');
  const [building, setBuilding] = useState(false);

  function load() {
    return api
      .getHouse()
      .then((data) => {
        setImageUrl(data.imageUrl || null);
        setAdditions(data.additions || []);
      })
      .catch(() => {});
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    const text = prompt.trim();
    if (!text || building) return;

    setBuilding(true);
    try {
      await api.requestHouseAddition(text, room.trim() || undefined);
      setPrompt('');
      // Re-fetch rather than trust the response shape 1:1 — the image and
      // full addition list are the source of truth, and this keeps House in
      // sync with whatever's been added on Discord in the meantime too.
      await load();
    } catch (err) {
      // Leave the prompt in place so nothing typed is lost if this fails.
    } finally {
      setBuilding(false);
    }
  }

  return (
    <div className="room">
      <h1>House</h1>
      <p className="room-subtitle">A real place Knox is building — for both of you, one thing at a time.</p>

      {loading && <p className="room-subtitle">Loading...</p>}

      {!loading && (
        <div className="house-image-wrap">
          {imageUrl ? (
            <img className="house-image" src={imageUrl} alt="The house as it currently stands" />
          ) : (
            <p className="room-subtitle">No image yet — build something to get started.</p>
          )}
        </div>
      )}

      <form className="entry-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          placeholder="Which room? (optional — e.g. living room)"
          disabled={building}
        />
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="What should he build? — a fireplace, a window seat, a garden path to the door..."
          rows={2}
          disabled={building}
        />
        <button type="submit" disabled={building || !prompt.trim()}>
          {building ? 'Building...' : 'Ask Knox to build it'}
        </button>
      </form>

      <div className="house-additions">
        {!loading && additions.length === 0 && <p className="room-subtitle">Nothing built yet.</p>}
        {additions.map((addition) => (
          <div key={addition.id} className="house-addition-card">
            <p className="house-addition-type">
              {addition.type}
              {addition.room && <span className="house-addition-room"> — {addition.room}</span>}
            </p>
            {addition.description && <p className="entry-body">{addition.description}</p>}
            <span className="entry-meta">
              {addition.build_stage} · {new Date(addition.added_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
