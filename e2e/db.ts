// A superuser look at the local Postgres, to prove a write went all the way
// through sync — the contract tests use the same connection.
import { Client } from "pg";

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DB_URL, connectionTimeoutMillis: 3000 });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

/** Polls until the statement returns a row, or gives up. */
export async function waitForRow<T extends Record<string, unknown>>(sql: string, params: unknown[], timeoutMs = 15_000): Promise<T | null> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const row = await withDb(async (c) => (await c.query<T>(sql, params)).rows[0] ?? null);
    if (row) return row;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}
