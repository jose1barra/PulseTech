import { access } from 'node:fs/promises';
import path from 'node:path';
import { openDatabase } from '../database.mjs';

if (!process.env.DATABASE_URL || !process.argv.includes('--apply')) {
  console.error('Set DATABASE_URL for an empty PostgreSQL database, stop the app, then run: node scripts/migrate-to-postgres.mjs --apply');
  process.exit(1);
}
const dataDir = path.resolve(process.env.DATA_DIR || '.private');
await access(path.join(dataDir, 'pulse.sqlite'));
const source = await openDatabase({ dataDir, databaseUrl: '' });
let target;
const tables = ['users', 'customers', 'jobs', 'alerts', 'invitations', 'settings'];
try {
  target = await openDatabase({ databaseUrl: process.env.DATABASE_URL });
  const records = await source.transaction(async tx => {
    const data = {};
    for (const table of tables) data[table] = await tx.all(`SELECT * FROM ${table}`);
    if (!data.settings.some(item => item.key === 'initialized')) throw new Error('The source workspace is not initialized.');
    return data;
  });
  await target.transaction(async tx => {
    for (const table of [...tables, 'sessions', 'login_attempts']) {
      if ((await tx.all(`SELECT * FROM ${table} LIMIT 1`)).length) throw new Error('The target database is not empty. No records were copied.');
    }
    for (const table of tables) {
      for (const row of records[table]) {
        const columns = Object.keys(row);
        await tx.run(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, Object.values(row));
      }
    }
  });
  console.log('Workspace copied to PostgreSQL. The SQLite source is unchanged. Sign in again after switching the app.');
} finally { await source.close(); if (target) await target.close(); }
