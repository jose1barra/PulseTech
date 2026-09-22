import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openDatabase } from './database.mjs';
import { digest, RequestError, requireValue, cleanName, cleanEmail, passwordHash, publicUser, initialize, snapshot, mutateJob, requireManager, team, invite, findInvitation, acceptInvitation } from './workspace.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const derive = promisify(scrypt);
const lifetime = 8 * 60 * 60 * 1000;
const publicFiles = new Set(['/index.html', '/styles.css', '/auth.js', '/favicon.svg']);
const protectedFiles = new Set(['/app.js', '/view-model.js']);
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
async function readBody(req) {
  requireValue(req.headers['content-type']?.startsWith('application/json'), 415, 'JSON required.');
  let text = '';
  for await (const chunk of req) { text += chunk; requireValue(text.length <= 16384, 413, 'Request too large.'); }
  const value = JSON.parse(text);
  requireValue(value && typeof value === 'object' && !Array.isArray(value), 400, 'Provide a JSON object.');
  return value;
}
function send(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); }
export async function createApplication(options = {}) {
  const dataDir = path.resolve(options.dataDir || process.env.DATA_DIR || path.join(root, '.private'));
  const origin = options.origin ?? process.env.APP_ORIGIN ?? '';
  const setupToken = options.setupToken ?? process.env.SETUP_TOKEN ?? '';
  const secure = origin.startsWith('https://');
  const database = await openDatabase({ databaseUrl: options.databaseUrl ?? process.env.DATABASE_URL, dataDir });
  let legacy;
  try { legacy = JSON.parse(await readFile(path.join(dataDir, 'account.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await database.transaction(tx => initialize(tx, legacy));
  const cookie = (value, age) => `pulse_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure ? '; Secure' : ''}`;
  async function currentUser(tx, req) {
    const token = /(?:^|;\s*)pulse_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    if (!token) return null;
    return tx.get('SELECT users.* FROM users JOIN sessions ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires > ? AND users.disabled = 0', [digest(token), Date.now()]);
  }
  async function startSession(tx, req, userId) {
    const old = /(?:^|;\s*)pulse_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    if (old) await tx.run('DELETE FROM sessions WHERE token_hash = ?', [digest(old)]);
    await tx.run('DELETE FROM sessions WHERE expires <= ?', [Date.now()]);
    const token = randomBytes(32).toString('hex');
    await tx.run('INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)', [digest(token), userId, Date.now() + lifetime]);
    return cookie(token, lifetime / 1000);
  }
  async function rateLimit(req, data) {
    const now = Date.now();
    const exceeded = await database.transaction(async tx => {
      await tx.run('DELETE FROM login_attempts WHERE expires <= ?', [now]);
      const keys = [[digest(`ip:${req.socket.remoteAddress}`), 100], [digest(`email:${String(data.email || data.token || 'setup').trim().toLowerCase()}`), 10]];
      let blocked = false;
      for (const [key, limit] of keys) {
        const previous = await tx.get('SELECT count FROM login_attempts WHERE key = ?', [key]);
        if (previous?.count >= limit) blocked = true;
        if (previous) await tx.run('UPDATE login_attempts SET count = count + 1 WHERE key = ?', [key]);
        else await tx.run('INSERT INTO login_attempts (key, count, expires) VALUES (?, 1, ?)', [key, now + 15 * 60 * 1000]);
      }
      return blocked;
    });
    requireValue(!exceeded, 429, 'Too many attempts. Try again in 15 minutes.');
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    try {
      const url = new URL(req.url, 'http://localhost');
      const route = url.pathname;
      if (route.startsWith('/api/')) {
        const mutation = ['POST', 'PATCH', 'DELETE'].includes(req.method);
        requireValue(mutation || req.method === 'GET', 405, 'Method not allowed.');
        if (mutation) {
          const expected = origin || `http://${req.headers.host}`;
          requireValue((!req.headers.origin || req.headers.origin === expected) && req.headers['sec-fetch-site'] !== 'cross-site', 403, 'Request not allowed.');
        }
        const data = mutation ? await readBody(req) : {};
        if (mutation && ['/api/setup', '/api/login', '/api/accept-invite'].includes(route)) await rateLimit(req, data);
        const result = await database.transaction(async tx => {
          const user = await currentUser(tx, req);
          if (req.method === 'GET' && route === '/api/session') return { setupRequired: !(await tx.get('SELECT id FROM users WHERE owner = 1')), setupTokenRequired: Boolean(setupToken), user: user ? publicUser(user) : null };
          if (req.method === 'POST' && route === '/api/invitation') {
            const invitation = await findInvitation(tx, data.token);
            return { name: invitation.name, email: invitation.email, role: invitation.role, expires: Number(invitation.expires) };
          }
          if (req.method === 'POST' && ['/api/setup', '/api/login', '/api/accept-invite'].includes(route)) {
            let userId;
            if (route === '/api/setup') {
              requireValue(!(await tx.get('SELECT id FROM users WHERE owner = 1')), 409, 'An owner account already exists. Please sign in.');
              requireValue(!setupToken || (typeof data.setupToken === 'string' && timingSafeEqual(Buffer.from(digest(data.setupToken)), Buffer.from(digest(setupToken)))), 403, 'Enter the workspace setup code supplied by your administrator.');
              const name = cleanName(data.name), email = cleanEmail(data.email), { salt, hash } = await passwordHash(data.password);
              userId = 'alex';
              await tx.run('UPDATE users SET name = ?, email = ?, salt = ?, password_hash = ?, owner = 1 WHERE id = ?', [name, email, salt, hash, userId]);
            } else if (route === '/api/accept-invite') userId = await acceptInvitation(tx, data);
            else {
              const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
              const account = await tx.get('SELECT * FROM users WHERE email = ?', [email]);
              const password = typeof data.password === 'string' ? data.password : '';
              const hash = await derive(password.slice(0, 129), account?.salt || 'unconfigured', 64);
              const expected = account?.password_hash ? Buffer.from(account.password_hash, 'hex') : Buffer.alloc(64);
              requireValue(timingSafeEqual(hash, expected) && account?.password_hash && !account.disabled && password.length <= 128, 401, 'Email or password is incorrect.');
              userId = account.id;
            }
            await tx.run('DELETE FROM login_attempts WHERE key = ?', [digest(`email:${String(data.email || data.token || 'setup').trim().toLowerCase()}`)]);
            return { ok: true, setCookie: await startSession(tx, req, userId) };
          }
          if (req.method === 'POST' && route === '/api/logout') {
            const token = /(?:^|;\s*)pulse_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
            if (token) await tx.run('DELETE FROM sessions WHERE token_hash = ?', [digest(token)]);
            return { ok: true, setCookie: cookie('', 0) };
          }
          requireValue(user, 401, 'Please sign in to continue.');
          if (req.method === 'GET' && route === '/api/workspace') return snapshot(tx, user);
          if (req.method === 'GET' && route === '/api/team') return team(tx, user);
          if (req.method === 'POST' && route === '/api/invitations') return invite(tx, user, data);
          const revoke = /^\/api\/invitations\/([\w-]+)$/.exec(route);
          if (req.method === 'DELETE' && revoke) {
            requireManager(user);
            const invitation = await tx.get('SELECT role FROM invitations WHERE id = ?', [revoke[1]]);
            requireValue(invitation && (invitation.role === 'tech' || user.owner), 403, 'This invitation is not available to your account.');
            await tx.run('UPDATE invitations SET revoked = 1 WHERE id = ?', [revoke[1]]);
            return { ok: true };
          }
          const member = /^\/api\/team\/([\w-]+)$/.exec(route);
          if (req.method === 'PATCH' && member) {
            requireManager(user);
            const target = await tx.get('SELECT * FROM users WHERE id = ?', [member[1]]);
            requireValue(target && !target.owner && target.id !== user.id && (target.role === 'tech' || user.owner), 403, 'You cannot change access for this account.');
            requireValue(typeof data.disabled === 'boolean', 400, 'Choose whether this account is disabled.');
            await tx.run('UPDATE users SET disabled = ? WHERE id = ?', [Number(data.disabled), target.id]);
            if (data.disabled) {
              await tx.run('DELETE FROM sessions WHERE user_id = ?', [target.id]);
              await tx.run('UPDATE invitations SET revoked = 1 WHERE staff_id = ? AND used = 0', [target.id]);
            }
            return { ok: true };
          }
          const job = /^\/api\/jobs\/([\w-]+)(\/notes)?$/.exec(route);
          if (job && ((req.method === 'PATCH' && !job[2]) || (req.method === 'POST' && job[2]))) return mutateJob(tx, user, job[1], data, Boolean(job[2]));
          if (req.method === 'POST' && route === '/api/alerts/read') {
            const alerts = await tx.all('SELECT id, document FROM alerts WHERE user_id = ?', [user.id]);
            for (const alert of alerts.filter(item => !data.id || item.id === data.id)) await tx.run('UPDATE alerts SET document = ? WHERE id = ?', [JSON.stringify({ ...JSON.parse(alert.document), read: true }), alert.id]);
            return snapshot(tx, user);
          }
          throw new RequestError(404, 'Not found.');
        });
        const { setCookie, ...payload } = result;
        if (setCookie) res.setHeader('Set-Cookie', setCookie);
        return send(res, 200, payload);
      }
      requireValue(['GET', 'HEAD'].includes(req.method), 405, 'Method not allowed.');
      const file = route === '/' ? '/index.html' : route;
      if (protectedFiles.has(file)) requireValue(await database.transaction(tx => currentUser(tx, req)), 401, 'Sign-in required.');
      requireValue(publicFiles.has(file) || protectedFiles.has(file), 404, 'Not found.');
      const content = await readFile(path.join(root, file));
      res.writeHead(200, { 'Content-Type': `${types[path.extname(file)]}; charset=utf-8` });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (!error.status && !(error instanceof SyntaxError)) console.error('Request failed:', error.code || error.name);
      send(res, error.status || (error instanceof SyntaxError ? 400 : 500), { error: error.status ? error.message : error instanceof SyntaxError ? 'Invalid JSON.' : 'Unable to complete the request. Please try again.' });
    }
  });
  return { server, database, close: async () => { server.closeAllConnections(); if (server.listening) await new Promise(resolve => server.close(resolve)); await database.close(); } };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST || '127.0.0.1', port = Number(process.env.PORT || 5173);
  if (host !== '127.0.0.1' && (!process.env.APP_ORIGIN || !process.env.SETUP_TOKEN)) throw new Error('Set APP_ORIGIN and SETUP_TOKEN before exposing the server to a network.');
  const app = await createApplication();
  app.server.listen(port, host, () => console.log(`Pulse Tech is ready at ${process.env.APP_ORIGIN || `http://${host}:${port}`} (${app.database.kind})`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.close().then(() => process.exit(0)));
}
