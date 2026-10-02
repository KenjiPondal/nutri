import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Icon = ({ d }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const ICONS = {
  home: 'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5',
  log: 'M4 6h16M4 12h16M4 18h10',
  db: 'M3 7V5h4M17 5h4v2M21 17v2h-4M7 19H3v-2M7 9v6M10 9v6M13 9v6M17 9v6',
  meals: 'M4 11h16a8 8 0 0 1-16 0zM9 7c0-1.5 1-2 1-3.5M13 7c0-1.5 1-2 1-3.5'
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const initials = user?.name?.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="layout">
      <header className="topbar">
        <span className="brand">nutri</span>
        <div className="menu-wrap">
          <button className="avatar" aria-label="Account menu" onClick={() => setMenu(m => !m)}>{initials}</button>
          {menu && (
            <>
              <div className="menu-backdrop" onClick={() => setMenu(false)} />
              <div className="menu" onClick={() => setMenu(false)}>
                <p className="menu-name">{user?.name}<span>{user?.email}</span></p>
                <Link to="/goals">Goals & targets</Link>
                <Link to="/account">Account & data</Link>
                <Link to="/legal">Legal & privacy</Link>
                <button onClick={() => { logout(); navigate('/login'); }}>Log out</button>
              </div>
            </>
          )}
        </div>
      </header>
      <main className="main"><Outlet /></main>
      <nav className="tabbar">
        <NavLink to="/" end><Icon d={ICONS.home} /><span>Today</span></NavLink>
        <NavLink to="/nutrition"><Icon d={ICONS.log} /><span>Log</span></NavLink>
        <NavLink to="/meals"><Icon d={ICONS.meals} /><span>Meals</span></NavLink>
        <NavLink to="/products"><Icon d={ICONS.db} /><span>Foods</span></NavLink>
      </nav>
    </div>
  );
}
