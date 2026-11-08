import jwt from 'jsonwebtoken';
import { db } from './db.js';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}
const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
export const COOKIE = 'plank_token';

export const verifyToken = (t) => {
  try { return jwt.verify(t, SECRET).sub; } catch { return null; }
};

export const setAuthCookie = (res, userId) =>
  res.cookie(COOKIE, jwt.sign({ sub: userId }, SECRET, { expiresIn: '7d' }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 3600 * 1000,
  });

export function requireAuth(req, res, next) {
  const id = verifyToken(req.cookies?.[COOKIE]);
  const user = id && db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(id);
  if (!user) return res.status(401).json({ error: 'Please sign in' });
  req.user = user;
  next();
}
