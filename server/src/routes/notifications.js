import { Router } from 'express';
import { db } from '../db.js';
import { HttpError, toId } from '../util.js';

const r = Router();

r.get('/notifications', (req, res) => {
  const notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user.id);
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0').get(req.user.id);
  res.json({ notifications, unread: n });
});

r.post('/notifications/read-all', (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
  res.status(204).end();
});

r.patch('/notifications/:id/read', (req, res) => {
  const { changes } = db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(toId(req.params.id), req.user.id);
  if (!changes) throw new HttpError(404, 'Notification not found');
  res.status(204).end();
});

export default r;
