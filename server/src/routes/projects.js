import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { HttpError, assertMember, assertOwner, nextPosition, toId } from '../util.js';
import { emitProject, kickFromProject } from '../realtime.js';
import { notify } from '../notify.js';

const r = Router();
const projectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(80),
  description: z.string().trim().max(500).default(''),
});
const titleSchema = z.object({ title: z.string().trim().min(1, 'Title is required').max(80) });

export const TASK_SELECT = `
  SELECT t.*, u.name AS assignee_name,
    (SELECT COUNT(*) FROM comments c WHERE c.task_id = t.id) AS comment_count
  FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id`;

const members = (projectId) =>
  db.prepare(`SELECT u.id, u.name, u.email, m.role FROM project_members m
              JOIN users u ON u.id = m.user_id WHERE m.project_id = ? ORDER BY m.role DESC, u.name`).all(projectId);

function getBoard(projectId, userId) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  const lists = db.prepare('SELECT * FROM lists WHERE project_id = ? ORDER BY position').all(projectId);
  const tasks = db.prepare(`${TASK_SELECT} WHERE t.project_id = ? ORDER BY t.position`).all(projectId);
  return {
    project,
    role: assertMember(projectId, userId).role,
    members: members(projectId),
    lists: lists.map((l) => ({ ...l, tasks: tasks.filter((t) => t.list_id === l.id) })),
  };
}

// ---- Projects
r.get('/projects', (req, res) => {
  const projects = db.prepare(`
    SELECT p.*, m.role,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
      (SELECT COUNT(*) FROM project_members x WHERE x.project_id = p.id) AS member_count
    FROM projects p JOIN project_members m ON m.project_id = p.id AND m.user_id = ?
    ORDER BY p.id DESC`).all(req.user.id);
  res.json({ projects });
});

r.post('/projects', (req, res) => {
  const { name, description } = projectSchema.parse(req.body);
  const id = db.transaction(() => {
    const pid = Number(db.prepare('INSERT INTO projects (name, description, owner_id) VALUES (?, ?, ?)').run(name, description, req.user.id).lastInsertRowid);
    db.prepare("INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, 'owner')").run(pid, req.user.id);
    ['To do', 'In progress', 'Done'].forEach((title, i) =>
      db.prepare('INSERT INTO lists (project_id, title, position) VALUES (?, ?, ?)').run(pid, title, (i + 1) * 1024));
    return pid;
  })();
  res.status(201).json(getBoard(id, req.user.id));
});

r.get('/projects/:id', (req, res) => res.json(getBoard(toId(req.params.id), req.user.id)));

r.patch('/projects/:id', (req, res) => {
  const id = toId(req.params.id);
  assertOwner(id, req.user.id);
  const data = projectSchema.partial().parse(req.body);
  const cur = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  db.prepare('UPDATE projects SET name = ?, description = ? WHERE id = ?').run(data.name ?? cur.name, data.description ?? cur.description, id);
  emitProject(id, 'project:updated');
  res.json(getBoard(id, req.user.id));
});

r.delete('/projects/:id', (req, res) => {
  const id = toId(req.params.id);
  assertOwner(id, req.user.id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  emitProject(id, 'project:deleted');
  res.status(204).end();
});

// ---- Members
r.post('/projects/:id/members', (req, res) => {
  const id = toId(req.params.id);
  assertOwner(id, req.user.id);
  const { email } = z.object({ email: z.string().trim().email('Enter a valid email') }).parse(req.body);
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!user) throw new HttpError(404, 'No account with that email yet. Ask them to sign up first.');
  if (db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').get(id, user.id)) {
    throw new HttpError(409, 'They are already on this project');
  }
  db.prepare("INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, 'member')").run(id, user.id);
  const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(id);
  notify({ userId: user.id, actorId: req.user.id, type: 'invited', message: `${req.user.name} added you to “${project.name}”`, projectId: id });
  emitProject(id, 'member:added');
  res.status(201).json({ members: members(id) });
});

r.delete('/projects/:id/members/:userId', (req, res) => {
  const id = toId(req.params.id);
  const userId = toId(req.params.userId);
  const me = assertMember(id, req.user.id);
  const target = db.prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?').get(id, userId);
  if (!target) throw new HttpError(404, 'Member not found');
  if (target.role === 'owner') throw new HttpError(400, 'The owner cannot be removed');
  if (me.role !== 'owner' && userId !== req.user.id) throw new HttpError(403, 'Only the owner can remove other members');
  db.transaction(() => {
    db.prepare('UPDATE tasks SET assignee_id = NULL WHERE project_id = ? AND assignee_id = ?').run(id, userId);
    db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?').run(id, userId);
  })();
  kickFromProject(userId, id);
  emitProject(id, 'member:removed', { userId });
  res.status(204).end();
});

// ---- Lists (board columns)
r.post('/projects/:id/lists', (req, res) => {
  const id = toId(req.params.id);
  assertMember(id, req.user.id);
  const { title } = titleSchema.parse(req.body);
  const info = db.prepare('INSERT INTO lists (project_id, title, position) VALUES (?, ?, ?)').run(id, title, nextPosition('lists', 'project_id', id));
  emitProject(id, 'list:created');
  res.status(201).json({ list: db.prepare('SELECT * FROM lists WHERE id = ?').get(info.lastInsertRowid) });
});

function ownList(req) {
  const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(toId(req.params.id));
  if (!list) throw new HttpError(404, 'List not found');
  assertMember(list.project_id, req.user.id);
  return list;
}

r.patch('/lists/:id', (req, res) => {
  const list = ownList(req);
  const { title } = titleSchema.parse(req.body);
  db.prepare('UPDATE lists SET title = ? WHERE id = ?').run(title, list.id);
  emitProject(list.project_id, 'list:updated');
  res.json({ list: { ...list, title } });
});

r.delete('/lists/:id', (req, res) => {
  const list = ownList(req);
  db.prepare('DELETE FROM lists WHERE id = ?').run(list.id);
  emitProject(list.project_id, 'list:deleted');
  res.status(204).end();
});

export default r;
