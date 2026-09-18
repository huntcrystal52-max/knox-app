const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
  listRoom: (room) => request(`/api/rooms/${room}`),
  postToRoom: (room, entry) =>
    request(`/api/rooms/${room}`, { method: 'POST', body: JSON.stringify(entry) }),
};
