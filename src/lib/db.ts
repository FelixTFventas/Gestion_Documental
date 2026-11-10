import 'dotenv/config';
import { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export interface Sql {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
}
export interface Database extends Sql {
  transaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}
export function embeddedDatabase(pg: PGlite): Database {
  let tail: Promise<unknown> = Promise.resolve();
  const lock = <T>(fn: () => Promise<T>) => {
    const result = tail.then(fn, fn);
    tail = result.catch(() => undefined);
    return result;
  };
  return {
    query: <T>(sql: string, params?: unknown[]) => lock(async () => (await pg.query<T>(sql, params)).rows),
    exec: sql => lock(async () => { await pg.exec(sql); }),
    transaction: fn => lock(() => pg.transaction(tx => fn({ query: async <T>(sql: string, params?: unknown[]) => (await tx.query<T>(sql, params)).rows, exec: async sql => { await tx.exec(sql); } }))),
    close: () => lock(() => pg.close())
  };
}
export async function connectDatabase(url = process.env.DATABASE_URL): Promise<Database> {
  if (!url) throw new Error('Configura DATABASE_URL en .env. Consulta el README.');
  if (url.startsWith('pglite://')) {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_LOCAL_PGLITE !== 'true') throw new Error('PGlite solo está habilitado para desarrollo.');
    const dir = path.resolve(url.slice('pglite://'.length));
    await mkdir(dir, { recursive: true });
    return embeddedDatabase(new PGlite(dir));
  }
  const pool = new Pool({ connectionString: url, max: 10 });
  return {
    query: async <T>(sql: string, params?: unknown[]) => (await pool.query(sql, params)).rows as T[],
    exec: async sql => { await pool.query(sql); },
    transaction: async fn => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({ query: async <T>(sql: string, params?: unknown[]) => (await client.query(sql, params)).rows as T[], exec: async sql => { await client.query(sql); } });
        await client.query('COMMIT');
        return result;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    close: () => pool.end()
  };
}
const globalDb = globalThis as unknown as { ftfDb?: Promise<Database> };
export function database() { return globalDb.ftfDb ??= connectDatabase(); }
