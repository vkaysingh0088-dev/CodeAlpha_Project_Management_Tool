import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, useToast } from '../context.jsx';
import Avatar from './Avatar.jsx';

export default function MembersModal({ board, onClose, reload }) {
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const isOwner = board.role === 'owner';
  const pid = board.project.id;

  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const invite = async (e) => {
    e.preventDefault(); setError('');
    try { await api.post(`/projects/${pid}/members`, { email }); setEmail(''); reload(); toast('Member added'); }
    catch (err) { setError(err.message); }
  };
  const remove = async (m) => {
    const self = m.id === user.id;
    if (!window.confirm(self ? 'Leave this project?' : `Remove ${m.name} from this project?`)) return;
    try { await api.del(`/projects/${pid}/members/${m.id}`); if (self) nav('/'); else reload(); }
    catch (err) { toast(err.message, 'alert'); }
  };
  const rename = async () => {
    const name = window.prompt('Rename project', board.project.name)?.trim();
    if (name) api.patch(`/projects/${pid}`, { name }).then(reload).catch((e) => toast(e.message, 'alert'));
  };
  const deleteProject = async () => {
    if (!window.confirm(`Delete “${board.project.name}” for everyone? This can't be undone.`)) return;
    await api.del(`/projects/${pid}`).catch((e) => toast(e.message, 'alert'));
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal small" role="dialog" aria-modal="true" aria-label="Members">
        <button className="icon-btn close" onClick={onClose} aria-label="Close">✕</button>
        <h2>Members</h2>
        <ul className="members">
          {board.members.map((m) => (
            <li key={m.id}>
              <Avatar name={m.name} size={32} />
              <div><strong>{m.name}</strong><div className="muted">{m.email}</div></div>
              {m.role === 'owner' ? <span className="tag">Owner</span>
                : (isOwner || m.id === user.id) && <button className="link" onClick={() => remove(m)}>{m.id === user.id ? 'Leave' : 'Remove'}</button>}
            </li>
          ))}
        </ul>
        {isOwner ? (
          <form onSubmit={invite} className="invite">
            <label>Add someone by email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" required />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn primary">Add to project</button>
          </form>
        ) : <p className="muted">Only the project owner can add or remove people.</p>}
        {isOwner && (
          <div className="row owner-actions">
            <button className="btn ghost" onClick={rename}>Rename project</button>
            <button className="btn danger" onClick={deleteProject}>Delete project</button>
          </div>
        )}
      </div>
    </div>
  );
}
