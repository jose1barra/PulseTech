import { randomBytes, randomUUID, createHash, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { STAFF, CUSTOMERS, seedState, visibleJobs, updateJob, addNote, canAccess } from './model.js';

const derive = promisify(scrypt);
export const digest = value => createHash('sha256').update(value).digest('hex');
export class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function requireValue(condition, status, message) { if (!condition) throw new RequestError(status, message); }
export function cleanEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  requireValue(email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 400, 'Enter a valid email address.');
  return email;
}
export function cleanName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  requireValue(name.length > 0 && name.length <= 80, 400, 'Enter a name of up to 80 characters.');
  return name;
}
export async function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  requireValue(typeof password === 'string' && password.length >= 12 && password.length <= 128, 400, 'Use a password between 12 and 128 characters.');
  return { salt, hash: (await derive(password, salt, 64)).toString('hex') };
}
export const publicUser = row => ({ id: row.id, name: row.name, role: row.role, title: row.title, color: row.color, initials: row.name.split(/\s+/).map(s => s[0]).slice(0, 2).join(''), disabled: Boolean(row.disabled), owner: Boolean(row.owner) });
export async function initialize(tx, legacy) {
  if (await tx.get("SELECT value FROM settings WHERE key = 'initialized'")) return;
  for (const person of STAFF) await tx.run('INSERT INTO users (id, name, role, title, color) VALUES (?, ?, ?, ?, ?)', [person.id, person.name, person.role, person.title, person.color]);
  if (legacy) await tx.run('UPDATE users SET email = ?, name = ?, salt = ?, password_hash = ?, owner = 1 WHERE id = ?', [legacy.email, legacy.name, legacy.salt, legacy.hash, 'alex']);
  for (const customer of CUSTOMERS) await tx.run('INSERT INTO customers (id, document) VALUES (?, ?)', [customer.id, JSON.stringify(customer)]);
  const state = seedState();
  for (const job of state.jobs) await tx.run('INSERT INTO jobs (id, document) VALUES (?, ?)', [job.id, JSON.stringify({ ...job, revision: 0 })]);
  for (const alert of state.alerts) await tx.run('INSERT INTO alerts (id, user_id, document) VALUES (?, ?, ?)', [alert.id, alert.userId, JSON.stringify(alert)]);
  await tx.run("INSERT INTO settings (key, value) VALUES ('initialized', '1')");
}
export async function loadState(tx) {
  return {
    version: 2,
    jobs: (await tx.all('SELECT document FROM jobs')).map(row => JSON.parse(row.document)),
    alerts: (await tx.all('SELECT document FROM alerts')).map(row => JSON.parse(row.document)),
    customers: (await tx.all('SELECT document FROM customers')).map(row => JSON.parse(row.document)),
    staff: (await tx.all('SELECT * FROM users ORDER BY name')).map(publicUser),
  };
}
export async function snapshot(tx, user) {
  const state = await loadState(tx);
  const jobs = visibleJobs(state, user);
  const customers = state.customers.filter(customer => user.role === 'manager' || jobs.some(job => job.customerId === customer.id));
  return { ...state, jobs, customers, alerts: state.alerts.filter(alert => alert.userId === user.id), user: publicUser(user) };
}
export async function mutateJob(tx, user, id, data, note = false) {
  const state = await loadState(tx), job = state.jobs.find(item => item.id === id);
  requireValue(canAccess(user, job), 403, 'This job is not available to your account.');
  if (!note) requireValue(Number.isInteger(data.revision) && data.revision === job.revision, 409, 'This job changed since you opened it. Close and reopen it to see the latest details.');
  const changes = data.changes;
  if (!note) requireValue(changes && typeof changes === 'object' && !Array.isArray(changes), 400, 'Provide valid job changes.');
  let next;
  try {
    // Rescheduling is a server decision, never a client-supplied permission.
    next = note ? addNote(state, user, id, data.note) : updateJob(state, user, id, { ...changes, ...(changes.scheduled && changes.scheduled !== job.scheduled ? { status: 'Rescheduled' } : {}) });
  } catch (error) { throw new RequestError(400, error.message); }
  if (next !== state) {
    const updated = next.jobs.find(item => item.id === id);
    await tx.run('UPDATE jobs SET document = ? WHERE id = ?', [JSON.stringify({ ...updated, revision: job.revision + 1 }), id]);
    const existing = new Set(state.alerts.map(alert => alert.id));
    for (const alert of next.alerts.filter(item => !existing.has(item.id))) await tx.run('INSERT INTO alerts (id, user_id, document) VALUES (?, ?, ?)', [alert.id, alert.userId, JSON.stringify(alert)]);
  }
  return snapshot(tx, user);
}
export function requireManager(user) { requireValue(user?.role === 'manager', 403, 'Only managers can manage the team.'); }
export async function team(tx, user) {
  requireManager(user);
  const users = (await tx.all('SELECT * FROM users ORDER BY name')).map(row => ({ ...publicUser(row), email: row.email, registered: Boolean(row.password_hash) }));
  const invitations = (await tx.all('SELECT id, email, name, role, staff_id, expires FROM invitations WHERE used = 0 AND revoked = 0 AND expires > ?', [Date.now()])).map(row => ({ ...row, expires: Number(row.expires) }));
  return { users, invitations };
}
export async function invite(tx, user, data) {
  requireManager(user);
  const email = cleanEmail(data.email), name = cleanName(data.name);
  requireValue(['tech', 'manager'].includes(data.role), 400, 'Choose a valid role.');
  requireValue(data.role !== 'manager' || user.owner, 403, 'Only the owner can invite managers.');
  requireValue(!(await tx.get('SELECT id FROM users WHERE email = ?', [email])), 409, 'An account already uses that email address.');
  const staffId = data.staffId || null;
  if (staffId) {
    const member = await tx.get('SELECT * FROM users WHERE id = ?', [staffId]);
    requireValue(member && !member.password_hash && !member.owner && member.role === data.role, 400, 'Choose an unclaimed staff profile with the same role.');
  }
  await tx.run('UPDATE invitations SET revoked = 1 WHERE used = 0 AND (email = ? OR staff_id = ?)', [email, staffId]);
  const token = randomBytes(32).toString('hex'), id = randomUUID(), expires = Date.now() + 48 * 60 * 60 * 1000;
  await tx.run('INSERT INTO invitations (id, token_hash, email, name, role, staff_id, expires) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, digest(token), email, name, data.role, staffId, expires]);
  return { id, token, expires };
}
export async function findInvitation(tx, token) {
  requireValue(typeof token === 'string' && /^[a-f0-9]{64}$/.test(token), 404, 'This invitation is invalid or has expired.');
  const invitation = await tx.get('SELECT * FROM invitations WHERE token_hash = ? AND used = 0 AND revoked = 0 AND expires > ?', [digest(token), Date.now()]);
  requireValue(invitation, 404, 'This invitation is invalid or has expired.');
  return invitation;
}
export async function acceptInvitation(tx, data) {
  const invitation = await findInvitation(tx, data.token);
  requireValue(!(await tx.get('SELECT id FROM users WHERE email = ?', [invitation.email])), 409, 'An account already uses this email. Please sign in.');
  const { salt, hash } = await passwordHash(data.password);
  const id = invitation.staff_id || randomUUID();
  if (invitation.staff_id) {
    const member = await tx.get('SELECT * FROM users WHERE id = ?', [id]);
    requireValue(member && !member.password_hash && !member.owner, 409, 'This staff account is already registered.');
    await tx.run('UPDATE users SET name = ?, email = ?, salt = ?, password_hash = ?, disabled = 0 WHERE id = ?', [invitation.name, invitation.email, salt, hash, id]);
  } else {
    await tx.run('INSERT INTO users (id, name, email, role, title, color, salt, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, invitation.name, invitation.email, invitation.role, invitation.role === 'manager' ? 'Manager' : 'Technician', 'blue', salt, hash]);
  }
  await tx.run('UPDATE invitations SET used = 1 WHERE id = ?', [invitation.id]);
  return id;
}
