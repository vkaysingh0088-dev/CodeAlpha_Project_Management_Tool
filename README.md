# Plank: a collaborative project board

A Trello/Asana-style tool: group projects, task cards on drag-and-drop boards, assignments,
comment threads on every task, and live updates + notifications over WebSockets.

**Stack:** React 18 + Vite · Node/Express · SQLite (built-in node:sqlite) · Socket.IO · JWT in an httpOnly cookie · Zod validation

## Run it

Requires Node 22.13 or newer (uses the built-in node:sqlite, so no native compile step).

```bash
npm run install:all
npm run dev          # API on :4000, web app on :5173 (open this one)
```

Production-style, single process serving the built client:

```bash
JWT_SECRET=$(openssl rand -hex 32) NODE_ENV=production npm start   # http://localhost:4000
```

Try real-time: sign up two users in two browsers (one normal, one private window), have the
first create a project and add the second by email, then assign them a task or comment.

```bash
npm test             # boots the API on a temp DB and runs the end-to-end smoke test
```

## Features

| Requirement | Where |
|---|---|
| Auth (register / login / logout) | `server/src/routes/auth.js`, `client/src/pages/AuthPage.jsx` |
| Group projects with members | `routes/projects.js`, `MembersModal.jsx` (owner invites by email) |
| Boards, lists, task cards, drag & drop | `pages/Board.jsx` |
| Assign tasks, due dates | `routes/tasks.js` (`/assign`), `TaskModal.jsx` |
| Comments inside tasks | `routes/tasks.js` (`/tasks/:id/comments`) |
| WebSockets + notifications (bonus) | `server/src/realtime.js`, `notify.js`, `NotificationBell.jsx` |

## API (all under `/api`, cookie-authenticated except `/auth/register|login`)

```
POST /auth/register · POST /auth/login · POST /auth/logout · GET /auth/me
GET  /projects · POST /projects · GET|PATCH|DELETE /projects/:id
POST /projects/:id/members {email} · DELETE /projects/:id/members/:userId
POST /projects/:id/lists · PATCH|DELETE /lists/:id
POST /lists/:id/tasks · GET|PATCH|DELETE /tasks/:id
PATCH /tasks/:id/move {listId, index} · PATCH /tasks/:id/assign {assigneeId|null}
GET|POST /tasks/:id/comments
GET /notifications · PATCH /notifications/:id/read · POST /notifications/read-all
```

## Real-time events

Clients join a project room with `project:join` (the server checks membership first). The server emits
`task:created|updated|moved|assigned|deleted`, `list:*`, `comment:added`, `member:added|removed`, `project:updated|deleted`
to that room, and `notification:new` to the recipient's personal room. The board refetches (debounced) when
an event arrives, which keeps every client consistent; open task modals refresh their comments live.

## Design notes

- **Access control:** every project-scoped route calls `assertMember`; non-members get 404 (ids can't be probed). Socket room joins are checked the same way, and removed members are evicted from the room.
- **Ordering:** `position` is a REAL. Moving a card writes one row (midpoint between neighbours), with an automatic renumber if gaps get too small.
- **Security basics:** bcrypt hashing, httpOnly + SameSite=Lax cookie, rate-limited auth routes, Zod validation on every body, parameterised SQL.
- **Swapping the DB:** all SQL lives in `server/src/routes/*.js` and `db.js`; moving to Postgres means changing the driver in `db.js` and the places that use `lastInsertRowid`.

## Ideas for next steps

Drag to reorder lists, @mentions, file attachments, labels, activity log, email notifications, refresh-token rotation.
