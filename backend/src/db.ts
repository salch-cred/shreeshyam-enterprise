import { Pool } from 'pg';
import { env } from './env.js';

// Single pooled client. Vercel serverless reuses it across warm invocations.
// No DATABASE_URL at runtime = null → routes return 503 and frontend falls back to IndexedDB.
let pool: Pool | null = null;

export function db(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 20_000,
    });
    pool.on('error', (e) => console.error('[db] idle error', e.message));
  }
  return pool;
}

export function requireDb() {
  const p = db();
  if (!p) {
    const err = new Error('DATABASE_URL not configured — running in offline mode');
    (err as unknown as { status?: number }).status = 503;
    throw err;
  }
  return p;
}
