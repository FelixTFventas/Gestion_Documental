import { requireUser } from '@/lib/auth';
import { database } from '@/lib/db';
import { Shell } from '@/components/shell';
import { AdminUsers } from '@/components/admin-users';
import { notFound } from 'next/navigation';
import type { User } from '@/lib/types';
export const dynamic = 'force-dynamic';
export default async function AdminPage() {
  const actor = await requireUser(); if (!actor.is_admin && actor.area_id !== 'gerencia') notFound();
  const db = await database();
  const users = await db.query<User>(`SELECT id,email,name,area_id,is_admin,active FROM users ${actor.is_admin ? '' : "WHERE area_id='gerencia'"} ORDER BY name`);
  const events = await db.query<{ id: string; actor_name: string; target_name: string; action: string; details: unknown; created_at: string }>('SELECT e.*,a.name AS actor_name,t.name AS target_name FROM admin_events e LEFT JOIN users a ON a.id=e.actor_id LEFT JOIN users t ON t.id=e.target_id ORDER BY e.created_at DESC LIMIT 100');
  return <Shell user={actor} active="admin"><AdminUsers actor={actor} users={users} events={JSON.parse(JSON.stringify(events))} /></Shell>;
}
