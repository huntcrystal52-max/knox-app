// In production the server also serves this app, so API calls go to the same
// address (empty string). Only local development talks to port 3001.
const API_URL = import.meta.env.DEV ? 'http://localhost:3001' : '';

// Every fetch goes through here so the "send cookies, talk to the right
// backend" logic lives in one place, not copy-pasted into every room.
async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`Request to ${path} failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  me: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  loginUrl: () => `${API_URL}/auth/discord`,

  // Shared by every simple content room (love notes, images, sacred, stillness).
  listRoom: (room) => request(`/api/rooms/${room}`),
  postToRoom: (room, entry) =>
    request(`/api/rooms/${room}`, { method: 'POST', body: JSON.stringify(entry) }),

  // Home room chat — talks to Knox's actual brain via the backend relay.
  getChatHistory: () => request('/api/chat/history'),
  sendChatMessage: (message, imageUrl, voiceClipId = null, video = null) =>
    request('/api/chat/message', { method: 'POST', body: JSON.stringify({ message, imageUrl, voiceClipId, videoUrl: video && video.url, videoLength: video && video.length }) }),
  // Videos go straight from the phone to Cloudinary (too big for our server);
  // the server only signs the upload. Returns { url, length }.
  uploadVideo: async (file, onProgress) => {
    const sig = await request('/api/upload/video-signature');
    const form = new FormData();
    form.append('file', file);
    form.append('api_key', sig.apiKey);
    form.append('timestamp', String(sig.timestamp));
    form.append('folder', sig.folder);
    form.append('signature', sig.signature);
    const result = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${sig.cloudName}/video/upload`);
      xhr.upload.onprogress = (e) => { if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
      xhr.onload = () => { try { const d = JSON.parse(xhr.responseText); (xhr.status < 300 && d.secure_url) ? resolve(d) : reject(new Error((d.error && d.error.message) || 'Upload failed')); } catch (e) { reject(e); } };
      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.send(form);
    });
    return { url: result.secure_url, length: result.duration || null };
  },
  // The Advent room: { action, ... } → passed through to Knox-bot.
  advent: (action, data = {}) =>
    request('/api/advent', { method: 'POST', body: JSON.stringify({ action, ...data }) }),
  // Voice notes: keeps a recording (data URI) → { id }.
  uploadVoice: (dataUri) =>
    request('/api/voice', { method: 'POST', body: JSON.stringify({ audio: dataUri }) }),

  // Images room — uploads to Cloudinary via the backend, returns the URL to
  // then post into the images room like any other entry.
  uploadImage: (dataUri) =>
    request('/api/upload/image', { method: 'POST', body: JSON.stringify({ image: dataUri }) }),

  // Asks Knox to actually look at (image entries) or read (text entries) one
  // entry in a room and leave a reaction on it — used right after
  // posting/uploading, and from an "Ask Knox" button on older entries.
  reactToEntry: (room, id) => request(`/api/rooms/${room}/${id}/react`, { method: 'POST' }),

  // Her reply to an entry Knox left on his own (e.g. an autonomous love
  // note) — either or both of text/emoji.
  replyToEntry: (room, id, { text, emoji } = {}) =>
    request(`/api/rooms/${room}/${id}/reply`, { method: 'POST', body: JSON.stringify({ text, emoji }) }),

  // Build room — everything Knox has made, and asking him to make something.
  // language is 'html' (default) or 'python'.
  listBuilds: () => request('/api/build'),
  requestBuild: (prompt, language = 'html') =>
    request('/api/build', { method: 'POST', body: JSON.stringify({ prompt, language }) }),

  // Actually executes a Python build's code and returns its output.
  runBuild: (id) => request(`/api/build/${id}/run`, { method: 'POST' }),

  // Is Knox-bot actually up right now — feeds the green/grey "Live" dot.
  getStatus: () => request('/api/status'),

  // House room — the real, evolving place Knox is building. room is
  // optional (e.g. 'living room', 'kitchen'), prompt is what to build.
  getHouse: () => request('/api/house'),
  requestHouseAddition: (prompt, room) =>
    request('/api/house', { method: 'POST', body: JSON.stringify({ prompt, room }) }),

  // Workshop — Knox's real say in his own development. prompt is optional:
  // a hint about what to think about, or omitted to let him reflect on his
  // own. decideProposal is strictly a status flag for her decision — it
  // never applies, commits, or deploys anything by itself.
  getProposals: () => request('/api/workshop'),
  requestProposal: (prompt) =>
    request('/api/workshop', { method: 'POST', body: JSON.stringify({ prompt: prompt || null }) }),
  decideProposal: (id, decision, note) =>
    request(`/api/workshop/${id}/decide`, { method: 'POST', body: JSON.stringify({ decision, note }) }),

  // Integrity — warnings from Knox's sovereign protocol, and marking one resolved.
  getIntegrity: () => request('/api/integrity'),
  resolveIntegrity: (id) => request(`/api/integrity/${id}/resolve`, { method: 'POST' }),

  // His Notes — read-only. There is deliberately no way to write to them.
  getNotes: () => request('/api/notes'),

  // Games — chess with Knox. The server checks every move.
  getChess: () => request('/api/chess'),
  getChessGame: (id) => request(`/api/chess/${id}`),
  newChessGame: (color) => request('/api/chess/new', { method: 'POST', body: JSON.stringify({ color }) }),
  playChessMove: (id, from, to) => request(`/api/chess/${id}/move`, { method: 'POST', body: JSON.stringify({ from, to }) }),
  resignChess: (id) => request(`/api/chess/${id}/resign`, { method: 'POST' }),

  // Talking games (20 Questions, Would You Rather, Two Truths, Trivia).
  getGames: () => request('/api/games'),
  newGame: (type, opts = {}) => request('/api/games/new', { method: 'POST', body: JSON.stringify({ type, ...opts }) }),
  gameAct: (id, action, input = {}) => request(`/api/games/${id}/act`, { method: 'POST', body: JSON.stringify({ action, ...input }) }),

  // Wordle together — one shared word a day.
  getWordle: () => request('/api/wordle'),
  guessWordle: (word) => request('/api/wordle/guess', { method: 'POST', body: JSON.stringify({ word }) }),
  askKnoxWordle: () => request('/api/wordle/ask', { method: 'POST' }),

  // Cards — Blackjack, Go Fish, Crazy Eights. The server deals.
  newCardGame: (type) => request('/api/cards/new', { method: 'POST', body: JSON.stringify({ type }) }),
  cardAct: (id, action, input = {}) => request(`/api/cards/${id}/act`, { method: 'POST', body: JSON.stringify({ action, ...input }) }),

  // Talking to Knox during any game.
  sayChess: (id, message) => request(`/api/chess/${id}/say`, { method: 'POST', body: JSON.stringify({ message }) }),
  sayGame: (id, message) => request(`/api/games/${id}/say`, { method: 'POST', body: JSON.stringify({ message }) }),
  sayCards: (id, message) => request(`/api/cards/${id}/say`, { method: 'POST', body: JSON.stringify({ message }) }),
  sayWordle: (message) => request('/api/wordle/say', { method: 'POST', body: JSON.stringify({ message }) }),

  // Gifts — his private ideas stay server-side; only shared ones come back.
  getGifts: () => request('/api/gifts'),
  addWish: (wish) => request('/api/gifts/wish', { method: 'POST', body: JSON.stringify(wish) }),
  giftGot: (id) => request(`/api/gifts/${id}/got`, { method: 'POST' }),
  removeWish: (id) => request(`/api/gifts/${id}/remove`, { method: 'POST' }),

  // Library — everything goes through one endpoint with an action.
  library: (action, data = {}) => request('/api/library', { method: 'POST', body: JSON.stringify({ action, ...data }) }),

  // GIF search for the picker in Home.
  searchGifs: (q) => request(`/api/gifs?q=${encodeURIComponent(q)}`),
};
