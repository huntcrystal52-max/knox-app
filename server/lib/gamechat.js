// Talking with Knox during a game. Every game's "say" route uses this: it
// sends him the game's current state (as she sees it, plus his own secrets
// he already knows) and what's been said, and returns his reply. The reply
// comes from his full chat pipeline on Knox-bot, so it's really him.
export async function talkToKnox(game, context, recent, message) {
  try {
    const r = await fetch(`${process.env.KNOX_BOT_URL}/internal/game/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET },
      body: JSON.stringify({ game, context, recent, message }),
    });
    if (!r.ok) return { error: true };
    const d = await r.json();
    if (d.mode === 'sleep') return { text: null, note: 'He\'s resting right now — he\'ll see your games when he wakes.' };
    return { text: d.text || null, note: d.text ? null : '(He listened, and stayed quiet.)' };
  } catch (e) { return { error: true }; }
}

export function cleanMessage(m) {
  return String(m || '').trim().slice(0, 1500);
}
