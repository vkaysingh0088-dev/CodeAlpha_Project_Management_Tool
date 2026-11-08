import { Link } from 'react-router-dom';
import { useAuth } from '../context.jsx';
import NotificationBell from './NotificationBell.jsx';
import Avatar from './Avatar.jsx';

export default function Header() {
  const { user, logout } = useAuth();
  return (
    <header className="topbar">
      <Link to="/" className="brand"><span className="brand-mark" aria-hidden /> Plank</Link>
      <div className="topbar-right">
        <NotificationBell />
        <Avatar name={user.name} size={28} />
        <span className="who">{user.name}</span>
        <button className="btn ghost light" onClick={logout}>Sign out</button>
      </div>
    </header>
  );
}
