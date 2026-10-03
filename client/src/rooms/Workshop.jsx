import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Workshop() {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [asking, setAsking] = useState(false);
  const [notes, setNotes] = useState({}); // id -> draft decision note
  const [deciding, setDeciding] = useState(null); // id currently being decided

  function load() {
    return api
      .getProposals()
      .then((data) => setProposals(data.proposals || []))
      .catch(() => {});
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function handleAsk(e) {
    e.preventDefault();
    if (asking) return;
    setAsking(true);
    try {
      await api.requestProposal(prompt.trim() || undefined);
      setPrompt('');
      await load();
    } catch (err) {
      // leave the prompt in place so nothing typed is lost
    } finally {
      setAsking(false);
    }
  }

  async function handleDecide(id, decision) {
    setDeciding(id);
    try {
      await api.decideProposal(id, decision, notes[id] || undefined);
      await load();
    } catch (err) {
      // no-op — she can just try again
    } finally {
      setDeciding(null);
    }
  }

  return (
    <div className="room">
      <h1>Workshop</h1>
      <p className="room-subtitle">
        Where Knox has a real say in his own development — his memory, his personality, how he behaves. He proposes;
        nothing changes until you decide.
      </p>

      <form className="entry-form" onSubmit={handleAsk}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask him something specific (optional) — or leave blank and let him reflect on his own..."
          rows={2}
          disabled={asking}
        />
        <button type="submit" disabled={asking}>
          {asking ? 'Thinking...' : 'Ask Knox for a proposal'}
        </button>
      </form>

      <div className="workshop-proposals">
        {!loading && proposals.length === 0 && <p className="room-subtitle">No proposals yet.</p>}
        {proposals.map((p) => (
          <div key={p.id} className={`workshop-card workshop-card-${p.status}`}>
            <p className="workshop-card-title">
              {p.title}
              {p.area && <span className="workshop-card-area"> — {p.area}</span>}
            </p>
            <p className="entry-body">{p.description}</p>
            <span className="entry-meta">
              {p.status}
              {' · '}
              {new Date(p.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
            </span>

            {p.status !== 'pending' && p.decision_note && (
              <p className="workshop-decision-note">"{p.decision_note}"</p>
            )}

            {p.status === 'pending' && (
              <div className="workshop-decide">
                <input
                  type="text"
                  value={notes[p.id] || ''}
                  onChange={(e) => setNotes({ ...notes, [p.id]: e.target.value })}
                  placeholder="Leave a note (optional)"
                  disabled={deciding === p.id}
                />
                <div className="workshop-decide-buttons">
                  <button
                    type="button"
                    className="workshop-approve"
                    disabled={deciding === p.id}
                    onClick={() => handleDecide(p.id, 'approved')}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="workshop-decline"
                    disabled={deciding === p.id}
                    onClick={() => handleDecide(p.id, 'declined')}
                  >
                    Decline
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
