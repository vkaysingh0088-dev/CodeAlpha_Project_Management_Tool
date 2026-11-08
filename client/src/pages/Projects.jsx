import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { getSocket } from '../socket.js';

export default function Projects() {
  const [projects, setProjects] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const nav = useNavigate();

  const load = () => api.get('/projects').then((d) => setProjects(d.projects)).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    // Pick up "added to a project" without a refresh.
    const s = getSocket();
    s.on('notification:new', load);
    return () => s.off('notification:new', load);
  }, []);

  const create = async (e) => {
    e.preventDefault(); setError('');
    try {
      const board = await api.post('/projects', form);
      nav(`/projects/${board.project.id}`);
    } catch (err) { setError(err.message); }
  };

  return (
    <main className="page">
      <div className="page-head">
        <h1>Projects</h1>
        {!creating && <button className="btn primary" onClick={() => setCreating(true)}>New project</button>}
      </div>

      {creating && (
        <form className="panel new-project" onSubmit={create}>
          <label>Project name<input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={80} /></label>
          <label>What is it for? <span className="muted">(optional)</span>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} /></label>
          <div className="row">
            <button className="btn primary">Create project</button>
            <button type="button" className="btn ghost" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}

      {projects?.length === 0 && !creating && (
        <div className="empty">
          <h2>No projects yet</h2>
          <p>Create one to get a board with To do, In progress and Done columns, then invite your team by email.</p>
        </div>
      )}
      <div className="project-grid">
        {projects?.map((p) => (
          <Link key={p.id} to={`/projects/${p.id}`} className="project-card">
            <h3>{p.name}</h3>
            <p className="muted">{p.description || 'No description'}</p>
            <div className="meta">
              <span>{p.task_count} {p.task_count === 1 ? 'task' : 'tasks'}</span>
              <span>{p.member_count} {p.member_count === 1 ? 'member' : 'members'}</span>
              {p.role === 'owner' && <span className="tag">Owner</span>}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
