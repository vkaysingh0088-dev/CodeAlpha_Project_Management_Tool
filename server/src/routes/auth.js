import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db.js';
import { HttpError, wrap } from '../util.js';
import { COOKIE, requireAuth, setAuthCookie } from '../auth.js';

const r = Router();
const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  email: z.string().trim().email('Enter a valid email').max(120),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
});
const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1) });

r.post('/register', wrap(async (req, res) => {
  const { name, email, password } = registerSchema.parse(req.body);
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    throw new HttpError(409, 'An account with that email already exists');
  }
  const hash = await bcrypt.hash(password, 10);
  const { lastInsertRowid } = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run(name, email, hash);
  setAuthCookie(res, lastInsertRowid);
  res.status(201).json({ user: { id: Number(lastInsertRowid), name, email } });
}));

r.post('/login', wrap(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    throw new HttpError(401, 'Email or password is incorrect');
  }
  setAuthCookie(res, row.id);
  res.json({ user: { id: row.id, name: row.name, email: row.email } });
}));

r.post('/logout', (req, res) => { res.clearCookie(COOKIE); res.status(204).end(); });
r.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

export default r;
