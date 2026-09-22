import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('owner setup, authentication, protected files, and session revocation', async () => {
  // Isolated server copy keeps test credentials out of the real workspace.
  const fixture = await mkdtemp(path.join(tmpdir(), 'pulse-auth-'));
  await copyFile(new URL('../server.mjs', import.meta.url), path.join(fixture, 'server.mjs'));
  await writeFile(path.join(fixture, 'app.js'), '// protected workspace');
  const { server } = await import(pathToFileURL(path.join(fixture, 'server.mjs')));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (route, data, cookie = '', origin = base) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: origin }, body: JSON.stringify(data) });
  const credentials = { name: 'Test Owner', email: 'owner@example.com', password: 'test-only-password-123' };
  try {
    assert.equal((await fetch(base + '/app.js')).status, 401);
    assert.equal((await fetch(base + '/model.js')).status, 401);
    assert.equal((await fetch(base + '/api/session').then(r => r.json())).setupRequired, true);
    assert.equal((await post('/api/setup', { ...credentials, password: 'short' })).status, 400);
    assert.equal((await post('/api/setup', credentials, '', 'https://other.example')).status, 403);
    const setup = await post('/api/setup', credentials);
    assert.equal(setup.status, 200);
    const cookie = setup.headers.get('set-cookie').split(';')[0];
    assert.match(setup.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    const stored = JSON.parse(await readFile(path.join(fixture, '.private/account.json'), 'utf8'));
    assert.equal(stored.password, undefined);
    assert.notEqual(stored.hash, credentials.password);
    assert.equal((await post('/api/setup', credentials)).status, 409);
    assert.equal((await fetch(base + '/.private/account.json')).status, 404);
    assert.equal((await fetch(base + '/app.js', { headers: { Cookie: 'pulse_session=' + 'a'.repeat(64) } })).status, 401);
    assert.equal((await fetch(base + '/app.js', { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await fetch(base + '/api/session', { headers: { Cookie: cookie } }).then(r => r.json())).user.name, 'Test Owner');
    assert.equal((await post('/api/logout', {}, cookie)).status, 200);
    assert.equal((await fetch(base + '/app.js', { headers: { Cookie: cookie } })).status, 401);
    assert.equal((await post('/api/login', { ...credentials, password: 'wrong' })).status, 401);
    assert.equal((await post('/api/login', { ...credentials, email: 'wrong@example.com' })).status, 401);
    assert.equal((await post('/api/login', { ...credentials, email: ' OWNER@example.com ' })).status, 200);
    for (let i = 0; i < 10; i++) await post('/api/login', { ...credentials, password: 'wrong' });
    assert.equal((await post('/api/login', credentials)).status, 429);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
