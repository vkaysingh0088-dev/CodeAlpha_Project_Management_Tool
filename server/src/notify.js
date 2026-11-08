import { db } from './db.js';
import { emitUser } from './realtime.js';

// Stores a notification and pushes it to the user's personal socket room.
export function notify({ userId, actorId, type, message, projectId = null, taskId = null }) {
  if (!userId || userId === actorId) return;
  const { lastInsertRowid } = db
    .prepare('INSERT INTO notifications (user_id, type, message, project_id, task_id) VALUES (?, ?, ?, ?, ?)')
    .run(userId, type, message, projectId, taskId);
  emitUser(userId, 'notification:new', db.prepare('SELECT * FROM notifications WHERE id = ?').get(lastInsertRowid));
}
