import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { HttpError, assertMember, nextPosition, toId } from '../util.js';
import { emitProject } from '../realtime.js';
import { notify } from '../notify.js';
import { TASK_SELECT } from './projects.js';

const r = Router();
const dateOrNull = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullable();
const createSchema = z.object({
  title: z.string().trim().min(1, 'Task title is required').max(200),
  description: z.string().max(5000).default(''),
  assigneeId: z.number().int().nullable().optional(),
  dueDate: dateOrNull.optional(),
});
const updateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000),
  dueDate: dateOrNull,
}).partial();

const taskById = (id) => db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(id);

function ownTask(req) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(toId(req.params.id));
  if (!task) throw new HttpError(404, 'Task not found');
  assertMember(task.project_id, req.user.id);
  return task;
}

function checkAssignee(projectId, assigneeId) {
  if (assigneeId == null) return;
  if (!db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, assigneeId)) {
    throw new HttpError(400, 'Assignee must be a member of this project');
  }
}

function notifyAssigned(task, actor) {
  notify({ userId: task.assignee_id, actorId: actor.id, type: 'assigned', projectId: task.project_id, taskId: task.id,
    message: `${actor.name} assigned you “${task.title}”` });
}

// ---- Tasks
r.post('/lists/:id/tasks', (req, res) => {
  const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(toId(req.params.id));
  if (!list) throw new HttpError(404, 'List not found');
  assertMember(list.project_id, req.user.id);
  const d = createSchema.parse(req.body);
  checkAssignee(list.project_id, d.assigneeId);
  const info = db.prepare(`INSERT INTO tasks (list_id, project_id, title, description, assignee_id, creator_id, due_date, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(list.id, list.project_id, d.title, d.description, d.assigneeId ?? null, req.user.id, d.dueDate ?? null, nextPosition('tasks', 'list_id', list.id));
  const task = taskById(info.lastInsertRowid);
  notifyAssigned(task, req.user);
  emitProject(list.project_id, 'task:created', { taskId: task.id });
  res.status(201).json({ task });
});

r.get('/tasks/:id', (req, res) => {
  const task = ownTask(req);
  res.json({ task: taskById(task.id), comments: listComments(task.id) });
});

r.patch('/tasks/:id', (req, res) => {
  const task = ownTask(req);
  const d = updateSchema.parse(req.body);
  db.prepare('UPDATE tasks SET title = ?, description = ?, due_date = ? WHERE id = ?').run(
    d.title ?? task.title, d.description ?? task.description, 'dueDate' in d ? d.dueDate : task.due_date, task.id);
  emitProject(task.project_id, 'task:updated', { taskId: task.id });
  res.json({ task: taskById(task.id) });
});

r.patch('/tasks/:id/assign', (req, res) => {
  const task = ownTask(req);
  const { assigneeId } = z.object({ assigneeId: z.number().int().nullable() }).parse(req.body);
  checkAssignee(task.project_id, assigneeId);
  db.prepare('UPDATE tasks SET assignee_id = ? WHERE id = ?').run(assigneeId, task.id);
  const updated = taskById(task.id);
  if (assigneeId !== task.assignee_id) notifyAssigned(updated, req.user);
  emitProject(task.project_id, 'task:assigned', { taskId: task.id });
  res.json({ task: updated });
});

// Drag-and-drop: the client sends the target list and the index it was dropped at.
// We compute a position between the two neighbours so only this one row is written.
r.patch('/tasks/:id/move', (req, res) => {
  const task = ownTask(req);
  const { listId, index } = z.object({ listId: z.number().int(), index: z.number().int().min(0) }).parse(req.body);
  const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(listId);
  if (!list || list.project_id !== task.project_id) throw new HttpError(400, 'List is not in this project');

  db.transaction(() => {
    const siblings = db.prepare('SELECT id, position FROM tasks WHERE list_id = ? AND id != ? ORDER BY position').all(listId, task.id);
    const at = Math.min(index, siblings.length);
    const before = siblings[at - 1]?.position;
    const after = siblings[at]?.position;
    let pos;
    if (before !== undefined && after !== undefined) {
      pos = (before + after) / 2;
      if (after - before < 1e-6) { // gaps exhausted: renumber this list once
        siblings.splice(at, 0, { id: task.id });
        siblings.forEach((s, i) => s.id !== task.id && db.prepare('UPDATE tasks SET position = ? WHERE id = ?').run((i + 1) * 1024, s.id));
        pos = (at + 1) * 1024;
      }
    } else if (before !== undefined) pos = before + 1024;
    else if (after !== undefined) pos = after / 2;
    else pos = 1024;
    db.prepare('UPDATE tasks SET list_id = ?, position = ? WHERE id = ?').run(listId, pos, task.id);
  })();

  emitProject(task.project_id, 'task:moved', { taskId: task.id, listId });
  res.json({ task: taskById(task.id) });
});

r.delete('/tasks/:id', (req, res) => {
  const task = ownTask(req);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
  emitProject(task.project_id, 'task:deleted', { taskId: task.id });
  res.status(204).end();
});

// ---- Comments
const listComments = (taskId) =>
  db.prepare(`SELECT c.*, u.name AS author_name FROM comments c JOIN users u ON u.id = c.author_id
              WHERE c.task_id = ? ORDER BY c.id`).all(taskId);

r.get('/tasks/:id/comments', (req, res) => res.json({ comments: listComments(ownTask(req).id) }));

r.post('/tasks/:id/comments', (req, res) => {
  const task = ownTask(req);
  const { body } = z.object({ body: z.string().trim().min(1, 'Write something first').max(2000) }).parse(req.body);
  const info = db.prepare('INSERT INTO comments (task_id, author_id, body) VALUES (?, ?, ?)').run(task.id, req.user.id, body);
  const comment = db.prepare('SELECT c.*, u.name AS author_name FROM comments c JOIN users u ON u.id = c.author_id WHERE c.id = ?').get(info.lastInsertRowid);
  // Tell the assignee, the creator and anyone who already commented (never the author).
  const people = new Set([task.assignee_id, task.creator_id, ...db.prepare('SELECT DISTINCT author_id FROM comments WHERE task_id = ?').all(task.id).map((c) => c.author_id)]);
  for (const userId of people) {
    if (userId && db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').get(task.project_id, userId)) {
      notify({ userId, actorId: req.user.id, type: 'comment', projectId: task.project_id, taskId: task.id,
        message: `${req.user.name} commented on “${task.title}”` });
    }
  }
  emitProject(task.project_id, 'comment:added', { taskId: task.id, comment });
  res.status(201).json({ comment });
});

export default r;
