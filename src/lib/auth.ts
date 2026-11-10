import { randomBytes, createHash } from 'node:crypto';
import { compare } from 'bcryptjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { database, type Database } from './db';
import type { User } from './types';
import { assert } from './errors';

export const COOKIE = 'ftf_session';
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export async function sessionUser(db: Database, token?: string): Promise<User | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const [user] = await db.query<User>('SELECT u.id,u.email,u.name,u.area_id,u.is_admin,u.active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true', [tokenHash(token)]);
  return user || null;
}
export async function getUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  return token ? sessionUser(await database(), token) : null;
}
export async function requireUser() { const user = await getUser(); if (!user) redirect('/login'); return user; }
export async function login(db: Database, emailInput: string, password: string) {
  const email = emailInput.trim().toLowerCase();
  assert(email.length <= 254 && Buffer.byteLength(password, 'utf8') <= 72, 'Credenciales inválidas.', 401);
  const key = tokenHash(email);
  // Actualización atómica: incluso solicitudes paralelas consumen intentos.
  const [attempt] = await db.query<{ failures: number }>(`INSERT INTO login_attempts(key,failures) VALUES($1,1) ON CONFLICT(key) DO UPDATE SET failures=CASE WHEN login_attempts.window_start < now()-interval '15 minutes' THEN 1 ELSE login_attempts.failures+1 END,window_start=CASE WHEN login_attempts.window_start < now()-interval '15 minutes' THEN now() ELSE login_attempts.window_start END RETURNING failures`, [key]);
  assert(attempt.failures <= 15, 'Demasiados intentos. Espera 15 minutos.', 429);
  const [user] = await db.query<User & { password_hash: string }>('SELECT * FROM users WHERE email=$1', [email]);
  // Hash ficticio para reducir diferencias temporales cuando el correo no existe.
  const valid = await compare(password, user?.password_hash || '$2b$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy');
  assert(user?.active && valid, 'Correo o contraseña incorrectos.', 401);
  const token = randomBytes(32).toString('hex');
  await db.transaction(async sql => {
    const [active] = await sql.query<User>('SELECT * FROM users WHERE id=$1 FOR SHARE', [user.id]);
    assert(active.active, 'Cuenta desactivada.', 401);
    await sql.query('DELETE FROM login_attempts WHERE key=$1', [key]);
    await sql.query('DELETE FROM sessions WHERE expires_at<now()');
    await sql.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')", [tokenHash(token), user.id]);
  });
  return token;
}
