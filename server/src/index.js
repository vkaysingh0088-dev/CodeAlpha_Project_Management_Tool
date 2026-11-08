import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';
import { fileURLToPath } from 'url';
import { requireAuth } from './auth.js';
import { initSocket } from './realtime.js';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import taskRoutes from './routes/tasks.js';
import notificationRoutes from './routes/notifications.js';

const app = express();
const server = http.createServer(app);
initSocket(server);

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: Number(process.env.AUTH_RATE_LIMIT || 50), standardHeaders: true, legacyHeaders: false }), authRoutes);
app.use('/api', requireAuth, projectRoutes, taskRoutes, notificationRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// In production the built client is served from the same origin.
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, req, res, next) => {
  if (err instanceof ZodError) return res.status(400).json({ error: err.issues.map((i) => i.message).join('. ') });
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side' });
});

const port = process.env.PORT || 4000;
server.listen(port, () => console.log(`Plank API listening on http://localhost:${port}`));
