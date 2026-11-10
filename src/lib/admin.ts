import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { z } from 'zod';
import type { Database } from './db';
import { freshActor } from './documents';
import { assert } from './errors';
import { AREAS, type User } from './types';

export async function manageUser(db: Database, actorId: string, input: Record<string, unknown>) {
  const schema = z.object({
    id: z.uuid().optional(), email: z.email().max(254), name: z.string().trim().min(2).max(120),
    area: z.string(), admin: z.boolean(), active: z.boolean(),
    password: z.string().min(12).max(72).refine(p => Buffer.byteLength(p, 'utf8') <= 72, 'La contraseña debe ocupar máximo 72 bytes UTF-8.').optional()
  });
  const data = schema.parse(input);
  assert(!data.area || Object.hasOwn(AREAS, data.area), 'Área inválida.');
  const passwordHash = data.password ? await hash(data.password, 12) : null;
  return db.transaction(async sql => {
    // Serializa cambios de membresía; protege también al último gerente activo.
    await sql.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');
    const actor = await freshActor(sql, actorId);
    const [previous] = data.id ? await sql.query<User>('SELECT * FROM users WHERE id=$1', [data.id]) : [];
    if (data.id) assert(previous, 'Usuario no encontrado.', 404);
    const gerenciaChange = data.area === 'gerencia' || previous?.area_id === 'gerencia';
    assert(actor.is_admin || (actor.area_id === 'gerencia' && gerenciaChange), 'Solo administración gestiona usuarios ordinarios.', 403);
    assert(!gerenciaChange || actor.area_id === 'gerencia', 'Solo una cuenta activa de Gerencia puede crear o modificar cuentas de Gerencia.', 403);
    if (!actor.is_admin) assert(!data.admin && !previous?.is_admin, 'El rol administrativo requiere administración.', 403);
    assert(data.id || passwordHash, 'La cuenta nueva requiere contraseña de al menos 12 caracteres.');
    assert(data.id !== actor.id || data.active, 'No puedes desactivar tu propia cuenta.');
    if (previous?.area_id === 'gerencia' && previous.active && (data.area !== 'gerencia' || !data.active)) {
      const other = await sql.query("SELECT 1 FROM users WHERE area_id='gerencia' AND active AND id<>$1", [previous.id]);
      assert(other.length, 'Debe quedar al menos una cuenta activa de Gerencia.');
    }
    const id = data.id || randomUUID();
    if (previous) {
      await sql.query('UPDATE users SET name=$2,email=$3,area_id=$4,is_admin=$5,active=$6,password_hash=COALESCE($7,password_hash) WHERE id=$1', [id, data.name, data.email.toLowerCase(), data.area || null, data.admin, data.active, passwordHash]);
      await sql.query('DELETE FROM sessions WHERE user_id=$1', [id]);
    } else await sql.query('INSERT INTO users(id,email,name,password_hash,area_id,is_admin,active) VALUES($1,$2,$3,$4,$5,$6,$7)', [id, data.email.toLowerCase(), data.name, passwordHash, data.area || null, data.admin, data.active]);
    await sql.query('INSERT INTO admin_events(id,actor_id,target_id,action,details) VALUES($1,$2,$3,$4,$5)', [randomUUID(), actor.id, id, previous ? 'USER_UPDATED' : 'USER_CREATED', JSON.stringify({ before: previous ? { name: previous.name, email: previous.email, area: previous.area_id, admin: previous.is_admin, active: previous.active } : null, after: { name: data.name, email: data.email.toLowerCase(), area: data.area || null, admin: data.admin, active: data.active }, sessionsRevoked: Boolean(previous), passwordReset: Boolean(previous && passwordHash) })]);
    return id;
  });
}
