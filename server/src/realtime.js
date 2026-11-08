import { Server } from 'socket.io';
import { parse } from 'cookie';
import { db } from './db.js';
import { COOKIE, verifyToken } from './auth.js';

let io;

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true },
  });

  // Authenticate the socket from the same httpOnly cookie the REST API uses.
  io.use((socket, next) => {
    const cookies = parse(socket.handshake.headers.cookie || '');
    const userId = verifyToken(cookies[COOKIE]);
    if (!userId) return next(new Error('unauthorized'));
    socket.data.userId = userId;
    next();
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`);

    socket.on('project:join', (projectId, ack) => {
      const ok = db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?')
        .get(Number(projectId), socket.data.userId);
      if (ok) socket.join(`project:${Number(projectId)}`);
      if (typeof ack === 'function') ack({ ok: !!ok });
    });
    socket.on('project:leave', (projectId) => socket.leave(`project:${Number(projectId)}`));
  });
  return io;
}

export const emitProject = (projectId, event, payload = {}) =>
  io?.to(`project:${projectId}`).emit(event, { projectId, ...payload });

export const emitUser = (userId, event, payload) => io?.to(`user:${userId}`).emit(event, payload);

export const kickFromProject = (userId, projectId) =>
  io?.in(`user:${userId}`).socketsLeave(`project:${projectId}`);
