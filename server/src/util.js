import { db } from './db.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function toId(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, 'Invalid id');
  return n;
}

// Every project-scoped route calls this. Non-members get a 404 so project ids can't be probed.
export function assertMember(projectId, userId) {
  const m = db.prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, userId);
  if (!m) throw new HttpError(404, 'Project not found');
  return m;
}

export function assertOwner(projectId, userId) {
  const m = assertMember(projectId, userId);
  if (m.role !== 'owner') throw new HttpError(403, 'Only the project owner can do that');
}

export const nextPosition = (table, col, id) =>
  (db.prepare(`SELECT MAX(position) AS p FROM ${table} WHERE ${col} = ?`).get(id).p ?? 0) + 1024;

// Express 4 doesn't catch rejected promises; this forwards them to the error middleware.
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
