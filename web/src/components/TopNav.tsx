import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/authContext';

const LINKS: { to: string; label: string }[] = [
  { to: '/', label: 'Map' },
  { to: '/analytics/price-vs-market', label: 'Price vs Market' },
  { to: '/analytics/undervalued', label: 'Undervalued' },
  { to: '/analytics/amenity-premium', label: 'Amenity Premium' },
  { to: '/chat', label: 'Chat' },
];

export default function TopNav() {
  const { session, me, signOut } = useAuth();
  const tier = me?.tier ?? 'free';

  return (
    <nav className="top-nav">
      <span className="top-nav-brand">Propsoch</span>
      <ul className="top-nav-links">
        {LINKS.map((l) => (
          <li key={l.to}>
            <NavLink
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) =>
                isActive ? 'top-nav-link top-nav-link-active' : 'top-nav-link'
              }
            >
              {l.label}
            </NavLink>
          </li>
        ))}
      </ul>
      {session && (
        <div className="top-nav-user">
          <NavLink to="/billing" className="top-nav-link">
            <span className={`tier-badge tier-badge-${tier}`}>{tier}</span>
          </NavLink>
          <span className="top-nav-email">{me?.email ?? session.user.email}</span>
          <button type="button" className="top-nav-signout" onClick={signOut}>
            Sign out
          </button>
        </div>
      )}
    </nav>
  );
}
