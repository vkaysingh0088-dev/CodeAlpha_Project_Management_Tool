import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { api } from '../api.js';
import { getSocket } from '../socket.js';
import { useToast } from '../context.jsx';
import Avatar from '../components/Avatar.jsx';
import TaskModal from '../components/TaskModal.jsx';
import MembersModal from '../components/MembersModal.jsx';

const EVENTS = ['task:created', 'task:updated', 'task:moved', 'task:assigned', 'task:deleted', 'list:created', 'list:updated',
  'list:deleted', 'comment:added', 'member:added', 'member:removed', 'project:updated'];

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' });

export default function Board() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [search, setSearch] = useSearchParams();
  const [board, setBoard] = useState(null);
  const [error, setError] = useState('');
  const [showMembers, setShowMembers] = useState(false);
  const [newList, setNewList] = useState(null);
  const dragging = useRef(false);
  const timer = useRef();
  const openTask = search.get('task') ? Number(search.get('task')) : null;

  const load = useCallback(() => api.get(`/projects/${id}`).then(setBoard).catch((e) => setError(e.message)), [id]);

  useEffect(() => { setBoard(null); setError(''); load(); }, [load]);

  // Real-time: join this project's room and refresh when anyone changes something.
  useEffect(() => {
    const s = getSocket();
    const join = () => s.emit('project:join', Number(id));
    const refresh = (e) => {
      if (e?.projectId !== Number(id) || dragging.current) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(load, 120);
    };
    const gone = (e) => { if (e.projectId === Number(id)) { toast('This project was deleted', 'alert'); nav('/'); } };
    s.on('connect', join);
    if (s.connected) join();
    EVENTS.forEach((ev) => s.on(ev, refresh));
    s.on('project:deleted', gone);
    return () => {
      s.off('connect', join);
      EVENTS.forEach((ev) => s.off(ev, refresh));
      s.off('project:deleted', gone);
      s.emit('project:leave', Number(id));
      clearTimeout(timer.current);
    };
  }, [id, load, nav, toast]);

  const onDragEnd = ({ source, destination, draggableId }) => {
    dragging.current = false;
    if (!destination || (source.droppableId === destination.droppableId && source.index === destination.index)) return load();
    const lists = board.lists.map((l) => ({ ...l, tasks: [...l.tasks] }));
    const from = lists.find((l) => String(l.id) === source.droppableId);
    const to = lists.find((l) => String(l.id) === destination.droppableId);
    const [task] = from.tasks.splice(source.index, 1);
    to.tasks.splice(destination.index, 0, { ...task, list_id: to.id });
    setBoard({ ...board, lists }); // optimistic
    api.patch(`/tasks/${draggableId}/move`, { listId: to.id, index: destination.index })
      .catch((e) => toast(e.message, 'alert')).finally(load);
  };

  const addTask = async (listId, title) => {
    try { await api.post(`/lists/${listId}/tasks`, { title }); load(); return true; }
    catch (e) { toast(e.message, 'alert'); return false; }
  };
  const renameList = async (l) => {
    const title = window.prompt('Rename list', l.title)?.trim();
    if (title && title !== l.title) api.patch(`/lists/${l.id}`, { title }).then(load).catch((e) => toast(e.message, 'alert'));
  };
  const deleteList = (l) => {
    if (window.confirm(`Delete “${l.title}” and its ${l.tasks.length} task(s)?`)) api.del(`/lists/${l.id}`).then(load).catch((e) => toast(e.message, 'alert'));
  };
  const addList = async (e) => {
    e.preventDefault();
    if (!newList?.trim()) return;
    try { await api.post(`/projects/${id}/lists`, { title: newList }); setNewList(null); load(); }
    catch (err) { toast(err.message, 'alert'); }
  };
  const closeTask = () => { search.delete('task'); setSearch(search, { replace: true }); load(); };

  if (error) return <main className="page"><div className="empty"><h2>Can't open this project</h2><p>{error}</p><button className="btn primary" onClick={() => nav('/')}>Back to projects</button></div></main>;
  if (!board) return <p className="center-note">Loading board…</p>;

  return (
    <div className="board-page">
      <div className="board-head">
        <div>
          <h1>{board.project.name}</h1>
          {board.project.description && <p className="muted">{board.project.description}</p>}
        </div>
        <button className="members-btn" onClick={() => setShowMembers(true)} aria-label="Manage members">
          <span className="stack">{board.members.slice(0, 5).map((m) => <Avatar key={m.id} name={m.name} size={28} />)}</span>
          <span>Members</span>
        </button>
      </div>

      <DragDropContext onDragStart={() => { dragging.current = true; }} onDragEnd={onDragEnd}>
        <div className="lists">
          {board.lists.map((list, i) => (
            <section key={list.id} className="list" style={{ '--tone': ['#1F4D3F', '#C98A00', '#6B7F78', '#8A4B2D', '#3C4F8A'][i % 5] }}>
              <header>
                <h2>{list.title} <span className="count">{list.tasks.length}</span></h2>
                <details className="menu">
                  <summary aria-label={`Options for ${list.title}`}>⋯</summary>
                  <div>
                    <button onClick={(e) => { e.target.closest('details').open = false; renameList(list); }}>Rename</button>
                    <button onClick={(e) => { e.target.closest('details').open = false; deleteList(list); }}>Delete</button>
                  </div>
                </details>
              </header>
              <Droppable droppableId={String(list.id)}>
                {(prov, snap) => (
                  <div ref={prov.innerRef} {...prov.droppableProps} className={`cards ${snap.isDraggingOver ? 'over' : ''}`}>
                    {list.tasks.map((t, idx) => (
                      <Draggable key={t.id} draggableId={String(t.id)} index={idx}>
                        {(p, s) => (
                          <article ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps}
                            className={`card ${s.isDragging ? 'dragging' : ''}`} tabIndex={0}
                            onClick={() => setSearch({ task: t.id })}
                            onKeyDown={(e) => { if (e.key === 'Enter') setSearch({ task: t.id }); }}>
                            <p className="card-title">{t.title}</p>
                            <div className="card-foot">
                              {t.due_date && <span className={`chip ${t.due_date < today() && list.title.toLowerCase() !== 'done' ? 'late' : ''}`}>{fmtDate(t.due_date)}</span>}
                              {t.comment_count > 0 && <span className="chip plain">💬 {t.comment_count}</span>}
                              {t.assignee_name && <span className="grow-end"><Avatar name={t.assignee_name} size={22} /></span>}
                            </div>
                          </article>
                        )}
                      </Draggable>
                    ))}
                    {prov.placeholder}
                  </div>
                )}
              </Droppable>
              <AddTask onAdd={(title) => addTask(list.id, title)} />
            </section>
          ))}

          <div className="list add-list">
            {newList === null ? (
              <button className="btn ghost" onClick={() => setNewList('')}>+ Add list</button>
            ) : (
              <form onSubmit={addList}>
                <input autoFocus placeholder="List name" value={newList} onChange={(e) => setNewList(e.target.value)} maxLength={80} />
                <div className="row"><button className="btn primary">Add list</button>
                  <button type="button" className="btn ghost" onClick={() => setNewList(null)}>Cancel</button></div>
              </form>
            )}
          </div>
        </div>
      </DragDropContext>

      {openTask && <TaskModal taskId={openTask} members={board.members} onClose={closeTask} />}
      {showMembers && <MembersModal board={board} onClose={() => setShowMembers(false)} reload={load} />}
    </div>
  );
}

function AddTask({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  if (!open) return <button className="add-task" onClick={() => setOpen(true)}>+ Add task</button>;
  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (await onAdd(title.trim())) setTitle('');
  };
  return (
    <form className="add-task-form" onSubmit={submit}>
      <textarea autoFocus rows={2} placeholder="What needs doing?" value={title} onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e); } if (e.key === 'Escape') setOpen(false); }} />
      <div className="row"><button className="btn primary">Add task</button>
        <button type="button" className="btn ghost" onClick={() => { setOpen(false); setTitle(''); }}>Done</button></div>
    </form>
  );
}
