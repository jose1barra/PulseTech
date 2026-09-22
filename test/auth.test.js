import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApplication } from '../server.mjs';
import { digest, passwordHash } from '../workspace.mjs';

async function fixture(options = {}) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'pulse-shared-'));
  const app = await createApplication({ dataDir, databaseUrl: '', ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const call = async (route, { method = 'GET', data, cookie = '', origin = base } = {}) => {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: origin }, ...(method !== 'GET' ? { body: JSON.stringify(data || {}) } : {}) });
    const result = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
    return { status: response.status, data: result, cookie: response.headers.get('set-cookie')?.split(';')[0], headers: response.headers };
  };
  return { ...app, call, dataDir };
}
const owner = { name: 'Test Owner', email: 'owner@example.com', password: 'test-only-password-123' };
const post = (data, cookie) => ({ method: 'POST', data, cookie });

test('owner setup, authentication, private assets, rate limiting, and revocation', async () => {
  const app = await fixture();
  try {
    const { call } = app;
    assert.equal((await call('/app.js')).status, 401);
    assert.equal((await call('/model.js')).status, 404);
    assert.equal((await call('/api/workspace')).status, 401);
    assert.equal((await call('/api/session')).data.setupRequired, true);
    assert.equal((await call('/api/setup', post({ ...owner, password: 'short' }))).status, 400);
    assert.equal((await call('/api/setup', { ...post(owner), origin: 'https://other.example' })).status, 403);
    const setup = await call('/api/setup', post(owner));
    assert.equal(setup.status, 200);
    assert.match(setup.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    assert.equal((await call('/api/setup', post(owner))).status, 409);
    assert.equal((await call('/.private/pulse.sqlite')).status, 404);
    assert.equal((await call('/app.js', { cookie: 'pulse_session=' + 'a'.repeat(64) })).status, 401);
    assert.equal((await call('/app.js', { cookie: setup.cookie })).status, 200);
    const stored = await app.database.transaction(tx => tx.get('SELECT * FROM users WHERE owner = 1'));
    assert.notEqual(stored.password_hash, owner.password);
    const session = await app.database.transaction(tx => tx.get('SELECT * FROM sessions'));
    assert.equal(session.token_hash, digest(setup.cookie.split('=')[1]));
    assert.equal((await call('/api/session', { cookie: setup.cookie })).data.user.name, owner.name);
    await call('/api/logout', post({}, setup.cookie));
    assert.equal((await call('/app.js', { cookie: setup.cookie })).status, 401);
    assert.equal((await call('/api/login', post({ ...owner, password: 'wrong' }))).status, 401);
    const login = await call('/api/login', post({ ...owner, email: ' OWNER@example.com ' }));
    assert.equal(login.status, 200);
    await app.database.transaction(tx => tx.run('UPDATE sessions SET expires = 0'));
    assert.equal((await call('/api/workspace', { cookie: login.cookie })).status, 401);
    for (let i = 0; i < 10; i++) await call('/api/login', post({ ...owner, password: 'wrong' }));
    assert.equal((await call('/api/login', post(owner))).status, 429);
  } finally { await app.close(); }
});

test('invitations, server-side role boundaries, shared writes, and concurrency', async () => {
  const app = await fixture();
  try {
    const { call } = app;
    const admin = (await call('/api/setup', post(owner))).cookie;
    const invitation = await call('/api/invitations', post({ name: 'Jamie <script>', email: 'jamie@example.com', role: 'tech', staffId: 'jamie' }, admin));
    assert.equal(invitation.status, 200);
    const token = invitation.data.token;
    assert.equal((await call('/api/invitation', post({ token }))).data.email, 'jamie@example.com');
    const accepted = await call('/api/accept-invite', post({ token, password: owner.password, role: 'manager', email: 'forged@example.com' }));
    assert.equal(accepted.status, 200);
    const tech = accepted.cookie;
    assert.equal((await call('/api/accept-invite', post({ token, password: owner.password }))).status, 404);
    const techState = (await call('/api/workspace', { cookie: tech })).data;
    assert.equal(techState.user.role, 'tech');
    assert.ok(techState.jobs.every(job => job.assignee === 'jamie'));
    assert.ok(techState.customers.every(customer => techState.jobs.some(job => job.customerId === customer.id)));
    assert.ok(techState.alerts.every(alert => alert.userId === 'jamie'));
    assert.ok(techState.staff.every(person => !('password_hash' in person) && !('email' in person)));
    assert.equal((await call('/api/team', { cookie: tech })).status, 403);
    assert.equal((await call('/api/invitations', post({ name: 'Forged', email: 'forged@example.com', role: 'manager' }, tech))).status, 403);
    assert.equal((await call('/api/jobs/1042', { method: 'PATCH', cookie: tech, data: { revision: 0, changes: { status: 'Done' } } })).status, 403);
    assert.equal((await call('/api/jobs/1041', { method: 'PATCH', cookie: tech, data: { revision: 0, changes: { assignee: 'sam' } } })).status, 400);
    const saved = await call('/api/jobs/1041', { method: 'PATCH', cookie: tech, data: { revision: 0, changes: { status: 'In Progress' } } });
    assert.equal(saved.status, 200);
    assert.equal((await call('/api/workspace', { cookie: admin })).data.jobs.find(job => job.id === '1041').status, 'In Progress');
    assert.equal((await call('/api/jobs/1041', { method: 'PATCH', cookie: admin, data: { revision: 0, changes: { status: 'Done' } } })).status, 409);
    const notes = await Promise.all(['First', 'Second'].map(note => call('/api/jobs/1041/notes', post({ note, author: 'alex' }, tech))));
    assert.ok(notes.every(result => result.status === 200));
    const after = (await call('/api/workspace', { cookie: admin })).data;
    const job = after.jobs.find(job => job.id === '1041');
    assert.deepEqual(job.notes.map(note => note.text).sort(), ['First', 'Second']);
    assert.ok(job.notes.every(note => note.author === 'jamie'));
    const beforeOther = after.alerts;
    await call('/api/alerts/read', post({}, tech));
    assert.deepEqual((await call('/api/workspace', { cookie: admin })).data.alerts, beforeOther);
    assert.equal((await call('/api/team/alex', { method: 'PATCH', cookie: admin, data: { disabled: true } })).status, 403);
    await call('/api/team/jamie', { method: 'PATCH', cookie: admin, data: { disabled: true } });
    assert.equal((await call('/api/workspace', { cookie: tech })).status, 401);
    assert.equal((await call('/api/login', post({ email: 'jamie@example.com', password: owner.password }))).status, 401);
    await call('/api/team/jamie', { method: 'PATCH', cookie: admin, data: { disabled: false } });
    assert.equal((await call('/api/login', post({ email: 'jamie@example.com', password: owner.password }))).status, 200);
    const team = (await call('/api/team', { cookie: admin })).data;
    assert.ok(team.users.every(person => !('password_hash' in person) && !('salt' in person)));
    assert.ok(team.invitations.every(item => !('token_hash' in item)));
  } finally { await app.close(); }
});

test('invitation replacement, expiry, revocation, manager restrictions, and duplicate acceptance', async () => {
  const app = await fixture();
  try {
    const { call } = app, admin = (await call('/api/setup', post(owner))).cookie;
    const input = { name: 'New Staff', email: 'new@example.com', role: 'tech' };
    const first = (await call('/api/invitations', post(input, admin))).data;
    const second = (await call('/api/invitations', post(input, admin))).data;
    assert.equal((await call('/api/invitation', post({ token: first.token }))).status, 404);
    await call(`/api/invitations/${second.id}`, { method: 'DELETE', cookie: admin });
    assert.equal((await call('/api/accept-invite', post({ token: second.token, password: owner.password }))).status, 404);
    const third = (await call('/api/invitations', post(input, admin))).data;
    await app.database.transaction(tx => tx.run('UPDATE invitations SET expires = 0 WHERE id = ?', [third.id]));
    assert.equal((await call('/api/invitation', post({ token: third.token }))).status, 404);
    const managerInvite = (await call('/api/invitations', post({ ...input, email: 'manager@example.com', role: 'manager' }, admin))).data;
    const manager = (await call('/api/accept-invite', post({ token: managerInvite.token, password: owner.password }))).cookie;
    assert.equal((await call('/api/invitations', post({ ...input, role: 'manager' }, manager))).status, 403);
    const last = (await call('/api/invitations', post(input, manager))).data;
    const accepted = await Promise.all([1, 2].map(() => call('/api/accept-invite', post({ token: last.token, password: owner.password }))));
    assert.deepEqual(accepted.map(result => result.status).sort(), [200, 404]);
    const newCookie = accepted.find(result => result.status === 200).cookie;
    const newMember = (await call('/api/session', { cookie: newCookie })).data.user;
    assert.equal((await call('/api/workspace', { cookie: newCookie })).data.jobs.length, 0);
    const assignments = await Promise.all(['1045', '1046'].map(id => call(`/api/jobs/${id}`, { method: 'PATCH', cookie: admin, data: { revision: 0, changes: { assignee: newMember.id, scheduled: '2030-05-01T10:00:00.000Z' } } })));
    assert.deepEqual(assignments.map(result => result.status).sort(), [200, 400]);
    const assigned = (await call('/api/workspace', { cookie: newCookie })).data;
    assert.equal(assigned.jobs.length, 1);
    assert.equal(assigned.jobs[0].status, 'Rescheduled');
    assert.equal(assigned.alerts.length, 1);
  } finally { await app.close(); }
});

test('legacy owner migrates and database state and sessions survive a server restart', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'pulse-migration-'));
  const { salt, hash } = await passwordHash(owner.password);
  await writeFile(path.join(dataDir, 'account.json'), JSON.stringify({ ...owner, password: undefined, salt, hash }));
  const app = await fixture({ dataDir });
  let cookie;
  try {
    assert.equal((await app.call('/api/session')).data.setupRequired, false);
    cookie = (await app.call('/api/login', post(owner))).cookie;
    assert.equal((await app.call('/api/jobs/1041/notes', post({ note: 'Survives restart' }, cookie))).status, 200);
  } finally { await app.close(); }
  const restarted = await fixture({ dataDir });
  try {
    const state = await restarted.call('/api/workspace', { cookie });
    assert.equal(state.status, 200);
    assert.equal(state.data.jobs.find(job => job.id === '1041').notes[0].text, 'Survives restart');
    assert.equal((await restarted.call('/api/session', { cookie })).data.user.name, owner.name);
  } finally { await restarted.close(); }
});

test('HTTPS configuration uses secure cookies and setup requires its one-time code', async () => {
  const app = await fixture({ origin: 'https://field.example.com', setupToken: 'deployment-setup-secret' });
  try {
    assert.equal((await app.call('/api/session')).data.setupTokenRequired, true);
    assert.equal((await app.call('/api/setup', { ...post(owner), origin: 'https://field.example.com' })).status, 403);
    const setup = await app.call('/api/setup', { ...post({ ...owner, setupToken: 'deployment-setup-secret' }), origin: 'https://field.example.com' });
    assert.equal(setup.status, 200);
    assert.match(setup.headers.get('set-cookie'), /; Secure/);
  } finally { await app.close(); }
});


test('local owner reset preserves workspace data and revokes old passwords and sessions', async () => {
  const { resetOwnerPassword } = await import('../scripts/reset-password.mjs');
  const app = await fixture();
  try {
    const login = await app.call('/api/setup', post(owner));
    const before = (await app.call('/api/workspace', { cookie: login.cookie })).data;
    await assert.rejects(resetOwnerPassword(app.database, 'short'), /between 12 and 128/);
    assert.equal((await app.call('/api/workspace', { cookie: login.cookie })).status, 200);
    assert.equal(await resetOwnerPassword(app.database, 'new-test-password-123'), owner.email);
    assert.equal((await app.call('/api/workspace', { cookie: login.cookie })).status, 401);
    assert.equal((await app.call('/api/login', post(owner))).status, 401);
    const next = await app.call('/api/login', post({ ...owner, password: 'new-test-password-123' }));
    assert.equal(next.status, 200);
    assert.deepEqual((await app.call('/api/workspace', { cookie: next.cookie })).data, before);
  } finally { await app.close(); }
});
