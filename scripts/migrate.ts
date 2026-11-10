import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { database, type Database } from '../src/lib/db';
export async function migrate(db: Database) {
  await db.exec('CREATE TABLE IF NOT EXISTS migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const file of (await readdir('migrations')).filter(f => f.endsWith('.sql')).sort()) {
    const sql = await readFile(`migrations/${file}`, 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    await db.transaction(async tx => {
      await tx.exec('LOCK TABLE migrations IN EXCLUSIVE MODE');
      const [existing] = await tx.query<{ checksum: string }>('SELECT checksum FROM migrations WHERE name=$1', [file]);
      if (existing) { if (existing.checksum !== checksum) throw new Error(`Migración modificada: ${file}`); return; }
      await tx.exec(sql);
      await tx.query('INSERT INTO migrations(name,checksum) VALUES($1,$2)', [file, checksum]);
      console.log(`Aplicada: ${file}`);
    });
  }
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/scripts/migrate.ts')) {
  const db = await database();
  try { await migrate(db); } finally { await db.close(); }
}
