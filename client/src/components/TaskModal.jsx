import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { getSocket } from '../socket.js';
import { useAuth, useToast } from '../context.jsx';
import Avatar from './Avatar.jsx';

export default function TaskModal({ taskId, members, onClose }) {
  const { user } = useAuth();
  const toast = useToast();
  const [task, setTask] = useState(null);
  const [comments, setComments] = useState([]);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const first = useRef(true);
  const endRef = useRef();

  const load = useCallback(async () => {
    try {
      const d = await api.get(`/tasks/${taskId}`);
      setTask(d.task); setComments(d.comments);
      if (first.current) { setTitle(d.task.title); setDesc(d.task.description); first.current = false; }
    } catch (e) { setError(e.status === 404 ? 'This task no longer exists.' : e.message); }
  }, [taskId]);

  useEffect(() => { first.current = true; load(); }, [load]);

  // Live comments and edits from other people.
  useEffect(() => {
    const s = getSocket();
    const onComment = (e) => { if (e.taskId === taskId) load(); };
    const onTask = (e) => { if (e.taskId === taskId) load(); };
    s.on('comment:added', onComment);
    s.on('task:updated', onTask); s.on('task:assigned', onTask); s.on('task:moved', onTask); s.on('task:deleted', onTask);
    return () => { s.off('comment:added', onComment); ['task:updated', 'task:assigned', 'task:moved', 'task:deleted'].forEach((ev) => s.off(ev, onTask)); };
  }, [taskId, load]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [comments.length]);
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const save = (patch) => api.patch(`/tasks/${taskId}`, patch).then((d) => setTask(d.task)).catch((e) => toast(e.message, 'alert'));
  const assign = (v) => api.patch(`/tasks/${taskId}/assign`, { assigneeId: v ? Number(v) : null }).then((d) => setTask(d.task)).catch((e) => toast(e.message, 'alert'));
  const remove = async () => {
    if (!window.confirm('Delete this task and its comments?')) return;
    await api.del(`/tasks/${taskId}`).catch((e) => toast(e.message, 'alert'));
    onClose();
  };
  const post = async (e) => {
    e?.preventDefault();
    if (!body.trim()) return;
    try { await api.post(`/tasks/${taskId}/comments`, { body }); setBody(''); load(); }
    catch (err) { toast(err.message, 'alert'); }
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Task details">
        <button className="icon-btn close" onClick={onClose} aria-label="Close">✕</button>
        {error && <div className="empty"><p>{error}</p><button className="btn primary" onClick={onClose}>Close</button></div>}
        {!error && !task && <p className="muted pad">Loading…</p>}
        {task && (
          <div className="modal-grid">
            <div className="modal-main">
              <input className="title-input" value={title} maxLength={200} aria-label="Task title"
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => title.trim() && title !== task.title ? save({ title }) : setTitle(task.title)} />
              <label>Description
                <textarea rows={4} value={desc} placeholder="Add details, links or acceptance criteria" onChange={(e) => setDesc(e.target.value)}
                  onBlur={() => desc !== task.description && save({ description: desc })} />
              </label>

              <h3>Comments <span className="count">{comments.length}</span></h3>
              <ul className="comments">
                {comments.length === 0 && <li className="muted">No comments yet. Start the conversation below.</li>}
                {comments.map((c) => (
                  <li key={c.id} className={c.author_id === user.id ? 'mine' : ''}>
                    <Avatar name={c.author_name} size={28} />
                    <div>
                      <div className="c-head"><strong>{c.author_name}</strong>
                        <time>{new Date(c.created_at + 'Z').toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></div>
                      <p>{c.body}</p>
                    </div>
                  </li>
                ))}
                <li ref={endRef} />
              </ul>
              <form onSubmit={post} className="comment-form">
                <textarea rows={2} placeholder="Write a comment…" value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post(e); }} />
                <button className="btn primary" disabled={!body.trim()}>Post comment</button>
              </form>
            </div>

            <aside className="modal-side">
              <label>Assigned to
                <select value={task.assignee_id ?? ''} onChange={(e) => assign(e.target.value)}>
                  <option value="">Unassigned</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === user.id ? ' (you)' : ''}</option>)}
                </select>
              </label>
              <label>Due date
                <input type="date" value={task.due_date ?? ''} onChange={(e) => save({ dueDate: e.target.value || null })} />
              </label>
              <button className="btn danger" onClick={remove}>Delete task</button>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
