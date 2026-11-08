import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { getSocket } from '../socket.js';
import { useToast } from '../context.jsx';

export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const nav = useNavigate();
  const box = useRef();
  const unread = items.filter((n) => !n.read).length;

  useEffect(() => { api.get('/notifications').then((d) => setItems(d.notifications)).catch(() => {}); }, []);

  useEffect(() => {
    const s = getSocket();
    const onNew = (n) => { setItems((x) => [n, ...x]); toast(n.message, 'alert'); };
    s.on('notification:new', onNew);
    return () => s.off('notification:new', onNew);
  }, [toast]);

  useEffect(() => {
    const close = (e) => { if (open && !box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const openItem = async (n) => {
    setOpen(false);
    if (!n.read) {
      setItems((x) => x.map((i) => (i.id === n.id ? { ...i, read: 1 } : i)));
      api.patch(`/notifications/${n.id}/read`).catch(() => {});
    }
    if (n.project_id) nav(`/projects/${n.project_id}${n.task_id ? `?task=${n.task_id}` : ''}`);
  };

  const readAll = () => { setItems((x) => x.map((i) => ({ ...i, read: 1 }))); api.post('/notifications/read-all').catch(() => {}); };

  return (
    <div className="bell" ref={box}>
      <button className="icon-btn" onClick={() => setOpen(!open)} aria-label={`Notifications, ${unread} unread`} aria-expanded={open}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
        {unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="popover">
          <div className="popover-head">
            <strong>Notifications</strong>
            {unread > 0 && <button className="link" onClick={readAll}>Mark all read</button>}
          </div>
          {items.length === 0 && <p className="muted pad">Nothing yet. You'll see assignments and comments here.</p>}
          <ul>
            {items.map((n) => (
              <li key={n.id}>
                <button className={`notif ${n.read ? '' : 'unread'}`} onClick={() => openItem(n)}>
                  <span>{n.message}</span>
                  <time>{new Date(n.created_at + 'Z').toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
