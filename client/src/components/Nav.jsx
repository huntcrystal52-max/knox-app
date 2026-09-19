import { NavLink } from 'react-router-dom';

// The single list of rooms the app knows about. Adding a new room later is:
// 1. add a line here, 2. add a matching <Route> in App.jsx, 3. add the room
// file in src/rooms/. Nothing else about the shell needs to change.
export const ROOMS = [
  { path: '/', label: 'Home' },
  { path: '/love-notes', label: 'Love Notes' },
  { path: '/sacred', label: 'Sacred' },
  { path: '/stillness', label: 'Stillness' },
  { path: '/images', label: 'Images' },
  { path: '/build', label: 'Build' },
  // Added one at a time as each room gets built:
  // { path: '/wearable', label: 'Wearable' },
];

export default function Nav() {
  return (
    <nav className="nav">
      {ROOMS.map((room) => (
        <NavLink
          key={room.path}
          to={room.path}
          className={({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`}
          end={room.path === '/'}
        >
          {room.label}
        </NavLink>
      ))}
    </nav>
  );
}
