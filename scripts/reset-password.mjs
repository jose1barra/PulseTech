import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { openDatabase } from '../database.mjs';
import { passwordHash, digest } from '../workspace.mjs';

export async function resetOwnerPassword(database, password) {
  const { salt, hash } = await passwordHash(password);
  return database.transaction(async tx => {
    const owner = await tx.get('SELECT id, email FROM users WHERE owner = 1 AND password_hash IS NOT NULL');
    if (!owner) throw new Error('No owner account exists yet. Open the site to create one.');
    await tx.run('UPDATE users SET salt = ?, password_hash = ? WHERE id = ?', [salt, hash, owner.id]);
    await tx.run('DELETE FROM sessions WHERE user_id = ?', [owner.id]);
    await tx.run('DELETE FROM login_attempts WHERE key = ?', [digest(`email:${owner.email}`)]);
    return owner.email;
  });
}

function hiddenQuestion(prompt) {
  return new Promise((resolve, reject) => {
    // Readline handles editing and paste; its output sink suppresses all echo.
    const silent = new Writable({ write(_chunk, _encoding, done) { done(); } });
    const reader = createInterface({ input: process.stdin, output: silent, terminal: true, historySize: 0 });
    let answered = false;
    process.stdout.write(prompt);
    reader.once('SIGINT', () => { reader.close(); });
    reader.once('close', () => { if (!answered) reject(new Error('Password reset cancelled.')); });
    reader.question('', answer => {
      answered = true;
      reader.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Run this command in an interactive terminal. Passwords cannot be supplied as command arguments.');
  const root = fileURLToPath(new URL('..', import.meta.url));
  const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, '.private'));
  if (!process.env.DATABASE_URL) await access(path.join(dataDir, 'pulse.sqlite'));
  const database = await openDatabase({ dataDir });
  try {
    const owner = await database.transaction(tx => tx.get('SELECT email FROM users WHERE owner = 1 AND password_hash IS NOT NULL'));
    if (!owner) throw new Error('No owner account exists yet. Open the site to create one.');
    console.log(`Resetting the owner password for ${owner.email}. Jobs and team accounts will be kept.`);
    const password = await hiddenQuestion('New password (at least 12 characters; typing is hidden): ');
    const confirmation = await hiddenQuestion('Confirm new password: ');
    if (password !== confirmation) throw new Error('Passwords do not match. Nothing was changed.');
    await resetOwnerPassword(database, password);
    console.log(`Password reset. Sign in as ${owner.email} with your new password. Previous owner sessions have been signed out.`);
  } finally { await database.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.code === 'ENOENT' ? 'No local workspace database was found. Start the app first or set DATA_DIR to its data folder.' : error.message); process.exitCode = 1; });
}
