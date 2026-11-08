// End-to-end smoke test: boots the server on a temp DB and walks through the main flows.
import { spawn } from 'child_process';
import { io } from 'socket.io-client';
import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

const PORT = 4100, BASE = `http://localhost:${PORT}`;
const dbFile = path.join(os.tmpdir(), `plank-test-${Date.now()}.db`);
const srv = spawn('node', ['src/index.js'], { env: { ...process.env, PORT, DB_FILE: dbFile, AUTH_RATE_LIMIT: '1000' }, stdio: 'inherit' });
const cleanup = () => { srv.kill(); for (const f of [dbFile, dbFile + '-wal', dbFile + '-shm']) fs.rmSync(f, { force: true }); };
process.on('exit', cleanup);

const client = () => {
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(BASE + '/api' + url, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, data: res.status === 204 ? null : await res.json() };
  };
  return { call, cookie: () => cookie };
};
const step = (name) => console.log('  ✓', name);
const once = (s, ev) => new Promise((r) => s.once(ev, r));

for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/api/auth/me'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }

try {
  const alice = client(), bob = client(), eve = client();

  // Auth
  let r = await alice.call('POST', '/auth/register', { name: 'Alice', email: 'alice@x.io', password: 'password1' });
  assert.equal(r.status, 201); const aliceId = r.data.user.id;
  r = await bob.call('POST', '/auth/register', { name: 'Bob', email: 'bob@x.io', password: 'password1' });
  const bobId = r.data.user.id;
  await eve.call('POST', '/auth/register', { name: 'Eve', email: 'eve@x.io', password: 'password1' });
  assert.equal((await alice.call('POST', '/auth/register', { name: 'A', email: 'ALICE@x.io', password: 'password1' })).status, 409);
  assert.equal((await alice.call('POST', '/auth/login', { email: 'alice@x.io', password: 'wrong-pass' })).status, 401);
  assert.equal((await client().call('GET', '/projects')).status, 401);
  assert.equal((await alice.call('GET', '/auth/me')).data.user.name, 'Alice');
  step('register / login / me / auth guard');

  // Projects + members
  r = await alice.call('POST', '/projects', { name: 'Launch' });
  const pid = r.data.project.id; const [todo, doing, done] = r.data.lists;
  assert.equal(r.data.lists.length, 3);
  assert.equal((await bob.call('GET', `/projects/${pid}`)).status, 404);
  assert.equal((await alice.call('POST', `/projects/${pid}/members`, { email: 'nobody@x.io' })).status, 404);
  assert.equal((await alice.call('POST', `/projects/${pid}/members`, { email: 'bob@x.io' })).status, 201);
  assert.equal((await bob.call('GET', `/projects/${pid}`)).status, 200);
  assert.equal((await bob.call('POST', `/projects/${pid}/members`, { email: 'eve@x.io' })).status, 403);
  assert.equal((await eve.call('GET', `/projects/${pid}`)).status, 404);
  step('projects, invites, membership isolation');

  // Realtime: Bob listens in the project room and on his own user room
  const sock = io(BASE, { extraHeaders: { cookie: bob.cookie() }, transports: ['websocket'] });
  await once(sock, 'connect');
  assert.equal((await new Promise((res) => sock.emit('project:join', pid, res))).ok, true);
  const evil = io(BASE, { extraHeaders: { cookie: eve.cookie() }, transports: ['websocket'] });
  await once(evil, 'connect');
  assert.equal((await new Promise((res) => evil.emit('project:join', pid, res))).ok, false);
  const badSock = io(BASE, { transports: ['websocket'] });
  assert.equal((await once(badSock, 'connect_error')).message, 'unauthorized');
  step('socket auth + room membership check');

  // Tasks, assignment, notifications
  const created = once(sock, 'task:created'), notif = once(sock, 'notification:new');
  r = await alice.call('POST', `/lists/${todo.id}/tasks`, { title: 'Write copy', assigneeId: bobId });
  assert.equal(r.status, 201); const t1 = r.data.task.id;
  assert.equal((await created).taskId, t1);
  assert.match((await notif).message, /Alice assigned you/);
  assert.equal((await alice.call('POST', `/lists/${todo.id}/tasks`, { title: 'Design' })).status, 201);
  assert.equal((await alice.call('POST', `/lists/${todo.id}/tasks`, { title: 'Ship', assigneeId: 999 })).status, 400);
  assert.equal((await bob.call('GET', '/notifications')).data.unread, 2); // invite + assignment
  step('create task, assign, realtime notification');

  // Move: to the top of "doing", then reorder inside todo
  const moved = once(sock, 'task:moved');
  assert.equal((await alice.call('PATCH', `/tasks/${t1}/move`, { listId: doing.id, index: 0 })).status, 200);
  await moved;
  let board = (await alice.call('GET', `/projects/${pid}`)).data;
  assert.deepEqual(board.lists.map((l) => l.tasks.map((t) => t.title)), [['Design'], ['Write copy'], []]);
  await alice.call('POST', `/lists/${todo.id}/tasks`, { title: 'Third' });
  const third = (await alice.call('GET', `/projects/${pid}`)).data.lists[0].tasks[1].id;
  await alice.call('PATCH', `/tasks/${third}/move`, { listId: todo.id, index: 0 });
  for (let i = 0; i < 25; i++) await alice.call('PATCH', `/tasks/${third}/move`, { listId: todo.id, index: i % 2 }); // stress gap halving
  board = (await alice.call('GET', `/projects/${pid}`)).data;
  assert.equal(board.lists[0].tasks.length, 2);
  assert.equal((await alice.call('PATCH', `/tasks/${t1}/move`, { listId: 99999, index: 0 })).status, 400);
  step('drag-and-drop ordering (incl. repeated reordering)');

  // Comments
  const cEv = once(sock, 'comment:added');
  r = await alice.call('POST', `/tasks/${t1}/comments`, { body: 'Draft is ready' });
  assert.equal(r.status, 201);
  assert.equal((await cEv).comment.author_name, 'Alice');
  assert.equal((await bob.call('POST', `/tasks/${t1}/comments`, { body: 'Thanks!' })).status, 201);
  assert.equal((await eve.call('POST', `/tasks/${t1}/comments`, { body: 'hi' })).status, 404);
  assert.equal((await alice.call('GET', `/tasks/${t1}`)).data.comments.length, 2);
  assert.equal((await alice.call('POST', `/tasks/${t1}/comments`, { body: '  ' })).status, 400);
  assert.equal((await alice.call('GET', '/notifications')).data.unread >= 1, true);
  step('comments + permissions + validation');

  // Edit, unassign, remove member
  r = await alice.call('PATCH', `/tasks/${t1}`, { title: 'Write launch copy', dueDate: '2030-01-31' });
  assert.equal(r.data.task.due_date, '2030-01-31');
  assert.equal((await alice.call('PATCH', `/tasks/${t1}/assign`, { assigneeId: null })).data.task.assignee_id, null);
  assert.equal((await alice.call('DELETE', `/projects/${pid}/members/${aliceId}`)).status, 400);
  assert.equal((await alice.call('DELETE', `/projects/${pid}/members/${bobId}`)).status, 204);
  assert.equal((await bob.call('GET', `/projects/${pid}`)).status, 404);
  assert.equal((await alice.call('DELETE', `/tasks/${t1}`)).status, 204);
  assert.equal((await alice.call('DELETE', `/projects/${pid}`)).status, 204);
  step('edit, unassign, remove member, delete');

  console.log('\nAll smoke tests passed');
  sock.close(); evil.close();
} catch (e) {
  console.error('\nFAILED:', e); process.exitCode = 1;
} finally { cleanup(); process.exit(process.exitCode || 0); }
