import { getUser } from '@/lib/auth';
import { database } from '@/lib/db';
import { attachFile, detail } from '@/lib/documents';
import { assert } from '@/lib/errors';
import { fail, limitedBody, privateHeaders, sameOrigin } from '@/lib/http';
import { discardStored, maxFileBytes, storeFile } from '@/lib/storage';
import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let stored: Awaited<ReturnType<typeof storeFile>> | undefined;
  try {
    sameOrigin(request);
    const user = await getUser();
    assert(user, 'Inicia sesión.', 401);
    const { id } = await context.params;
    const db = await database();
    const { doc } = await detail(db, user, id);
    assert(doc.origin_area === user.area_id && doc.responsible_area === user.area_id && ['DRAFT','RETURNED'].includes(doc.status), 'Tu área no puede modificar este documento.', 403);
    const bytes = await limitedBody(request, maxFileBytes() + 64 * 1024);
    const data = await new Response(new Uint8Array(bytes), { headers: { 'content-type': request.headers.get('content-type') || '' } }).formData();
    const file = data.get('file');
    assert(file instanceof File, 'Selecciona un archivo.');
    const role = String(data.get('role') || 'ATTACHMENT');
    const revision = Number(data.get('revision'));
    assert(Number.isInteger(revision) && revision >= 0, 'Revisión inválida.');
    stored = await storeFile(file, role === 'MAIN');
    await attachFile(db, user.id, id, revision, stored, role);
    return NextResponse.json({ ok: true }, { headers: privateHeaders });
  } catch (error) { if (stored) await discardStored(stored.storage_key); return fail(error); }
}
