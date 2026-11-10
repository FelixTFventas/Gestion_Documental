import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { z } from 'zod';
import { database } from '../src/lib/db';
// Operación de consola inicial, requiere acceso al servidor y una BD sin Gerencia.
const email = z.email().parse(process.env.BOOTSTRAP_EMAIL).toLowerCase();
const password = z.string().min(16).max(72).refine(p => Buffer.byteLength(p, 'utf8') <= 72, 'Máximo 72 bytes UTF-8.').parse(process.env.BOOTSTRAP_PASSWORD);
const db = await database();
try {
  const passwordHash = await hash(password, 12);
  await db.transaction(async sql => {
    await sql.exec('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');
    const exists = await sql.query("SELECT 1 FROM users WHERE area_id='gerencia'");
    if (exists.length) throw new Error('Ya existe Gerencia. Usa una cuenta autorizada; no se permite repetir la provisión.');
    const id = randomUUID();
    await sql.query("INSERT INTO users(id,email,name,password_hash,area_id,is_admin) VALUES($1,$2,'Gerencia inicial',$3,'gerencia',true)", [id, email, passwordHash]);
    await sql.query("INSERT INTO admin_events(id,actor_id,target_id,action,details) VALUES($1,$2,$2,'BOOTSTRAP_GERENCIA',$3)", [randomUUID(), id, JSON.stringify({ mechanism: 'Consola del servidor, provisión inicial única', area: 'gerencia', admin: true })]);
  });
  console.log('Gerencia inicial provisionada. Retira BOOTSTRAP_PASSWORD del entorno.');
} finally { await db.close(); }
