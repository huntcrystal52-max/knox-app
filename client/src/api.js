const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
  sendChatMessage: (message) =>
    request('/api/chat/message', { method: 'POST', body: JSON.stringify({ message }) }),

  // Images room — uploads to Cloudinary via the backend, returns the URL to
  // then post into the images room like any other entry.
  uploadImage: (dataUri) =>
    request('/api/upload/image', { method: 'POST', body: JSON.stringify({ image: dataUri }) }),
};
// Asks Knox to actually look at one photo in the Images room and leave a
  // reaction on it — used both right after upload and from an "Ask Knox"
  // button on older photos.
  reactToImage: (id) => request(`/api/rooms/images/${id}/react`, { method: 'POST' }),
