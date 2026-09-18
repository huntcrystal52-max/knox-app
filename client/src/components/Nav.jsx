import { NavLink } from 'react-router-dom';

export const ROOMS = [
  { path: '/', label: 'Home' },
  // Added one at a time as each room gets built:
  // { path: '/love-notes', label: 'Love Notes' },
  // { path: '/images', label: 'Images' },
  // { path: '/sacred', label: 'Sacred' },
  // { path: '/stillness', label: 'Stillness' },
  // { path: '/build', label: 'Build' },
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
