import { getUser } from '@/lib/auth';
import { database } from '@/lib/db';
import { detail } from '@/lib/documents';
import { assert } from '@/lib/errors';
import { fail, privateHeaders } from '@/lib/http';
import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUser(); assert(user, 'Inicia sesión.', 401);
    const { id } = await context.params;
    const query = new URL(request.url).searchParams.get('version');
    const data = await detail(await database(), user, id, query ? Number(query) : undefined);
    return NextResponse.json({ ...data, files: data.files.map(({ storage_key: _key, ...file }) => file) }, { headers: privateHeaders });
  } catch (error) { return fail(error); }
}
