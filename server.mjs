import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('.', import.meta.url));
const accountPath = path.join(root, '.private', 'account.json');
const sessions = new Map(), attempts = new Map();
let account, settingUp = false;
try { account = JSON.parse(await readFile(accountPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const publicFiles = new Set(['/index.html', '/styles.css', '/auth.js', '/favicon.svg']);
const protectedFiles = new Set(['/app.js', '/model.js']);
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
const lifetime = 8 * 60 * 60 * 1000;
function sessionFor(req) {
  const token = /(?:^|;\s*)pulse_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
  const session = sessions.get(token);
  if (!session || session.expires <= Date.now()) { sessions.delete(token); return null; }
  return { ...session, token };
}
function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); }
async function body(req) {
  let text = '';
  for await (const chunk of req) { text += chunk; if (text.length > 4096) throw new Error('Request too large'); }
  return JSON.parse(text);
}
function startSession(res) {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, { expires: Date.now() + lifetime });
  res.setHeader('Set-Cookie', `pulse_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${lifetime / 1000}`);
}
export const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const session = sessionFor(req);
  try {
    if (pathname.startsWith('/api/')) {
      if (req.method === 'GET' && pathname === '/api/session') return json(res, 200, { setupRequired: !account, user: session && account ? { id: 'alex', name: account.name } : null });
      if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
      if ((req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) || req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: 'Request not allowed.' });
      if (pathname === '/api/logout') {
        if (session) sessions.delete(session.token);
        res.setHeader('Set-Cookie', 'pulse_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
        return json(res, 200, { ok: true });
      }
      if (!['/api/setup', '/api/login'].includes(pathname)) return json(res, 404, { error: 'Not found.' });
      const key = req.socket.remoteAddress, now = Date.now();
      const recent = (attempts.get(key) || []).filter(at => now - at < 15 * 60 * 1000);
      if (recent.length >= 10) return json(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });
      attempts.set(key, [...recent, now]);
      if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'JSON required.' });
      const data = await body(req);
      const email = typeof data?.email === 'string' ? data.email.trim().toLowerCase() : '';
      const password = typeof data?.password === 'string' ? data.password : '';
      if (pathname === '/api/setup') {
        if (account || settingUp) return json(res, 409, { error: 'An owner account already exists. Please sign in.' });
        const name = typeof data?.name === 'string' ? data.name.trim() : '';
        if (!name || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 12 || password.length > 128) return json(res, 400, { error: 'Enter your name, a valid email, and a password between 12 and 128 characters.' });
        settingUp = true;
        try {
          const salt = randomBytes(16).toString('hex');
          const next = { name, email, salt, hash: scryptSync(password, salt, 64).toString('hex') };
          await mkdir(path.dirname(accountPath), { recursive: true });
          await writeFile(accountPath, JSON.stringify(next), { flag: 'wx', mode: 0o600 });
          account = next;
        } finally { settingUp = false; }
      } else {
        const hash = scryptSync(password.slice(0, 129), account?.salt || 'unconfigured', 64);
        if (!account || password.length > 128 || !timingSafeEqual(hash, Buffer.from(account.hash, 'hex')) || email !== account.email) return json(res, 401, { error: 'Email or password is incorrect.' });
      }
      attempts.delete(key);
      if (session) sessions.delete(session.token);
      startSession(res);
      return json(res, 200, { ok: true });
    }
    if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Method not allowed.' });
    const file = pathname === '/' ? '/index.html' : pathname;
    if (protectedFiles.has(file) && !session) return json(res, 401, { error: 'Sign-in required.' });
    if (!publicFiles.has(file) && !protectedFiles.has(file)) return json(res, 404, { error: 'Not found.' });
    const content = await readFile(path.join(root, file));
    res.writeHead(200, { 'Content-Type': `${types[path.extname(file)]}; charset=utf-8` });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) {
    json(res, error instanceof SyntaxError || error.message === 'Request too large' ? 400 : 500, { error: 'Unable to complete the request. Please try again.' });
  }
});
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 5173);
  server.listen(port, '127.0.0.1', () => console.log(`Pulse Tech is ready at http://localhost:${port}`));
}
