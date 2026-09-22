import { mkdir } from 'node:fs/promises';
import path from 'node:path';

// Keep the schema portable: JSON documents are stored as text; credentials,
// sessions, invitations, customers, and jobs have separate indexed records.
const schema = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL,
  title TEXT NOT NULL, color TEXT NOT NULL, salt TEXT, password_hash TEXT,
  disabled INTEGER NOT NULL DEFAULT 0, owner INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, email TEXT NOT NULL,
  name TEXT NOT NULL, role TEXT NOT NULL, staff_id TEXT REFERENCES users(id),
  expires BIGINT NOT NULL, used INTEGER NOT NULL DEFAULT 0, revoked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, document TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, document TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS alerts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, document TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS session_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS alerts_user_idx ON alerts(user_id);
`;

export async function openDatabase({ databaseUrl = process.env.DATABASE_URL, dataDir = process.env.DATA_DIR || '.private' } = {}) {
  if (databaseUrl) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 8, connectionTimeoutMillis: 5000 });
    pool.on('error', () => console.error('Database connection interrupted.'));
    const query = (client, sql, params = []) => {
      let index = 0;
      return client.query(sql.replace(/\?/g, () => `$${++index}`), params);
    };
    const transaction = async fn => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Serializes workspace writes across app instances, including scheduling
        // conflict checks and one-time invitation acceptance.
        await client.query('SELECT pg_advisory_xact_lock(728194205)');
        const result = await fn({
          all: async (sql, params) => (await query(client, sql, params)).rows,
          get: async (sql, params) => (await query(client, sql, params)).rows[0],
          run: async (sql, params) => query(client, sql, params),
        });
        await client.query('COMMIT');
        return result;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    };
    await transaction(async tx => { for (const sql of schema.split(';').filter(s => s.trim())) await tx.run(sql); });
    return { transaction, close: () => pool.end(), kind: 'PostgreSQL' };
  }
  const { DatabaseSync } = await import('node:sqlite');
  await mkdir(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'pulse.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.exec(schema);
  let pending = Promise.resolve();
  const transaction = fn => {
    const task = pending.then(async () => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn({
          all: async (sql, params = []) => db.prepare(sql).all(...params),
          get: async (sql, params = []) => db.prepare(sql).get(...params),
          run: async (sql, params = []) => db.prepare(sql).run(...params),
        });
        db.exec('COMMIT');
        return result;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    });
    pending = task.catch(() => {});
    return task;
  };
  return { transaction, close: async () => { await pending; db.close(); }, kind: 'SQLite' };
}
