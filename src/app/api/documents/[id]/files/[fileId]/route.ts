import { getUser } from '@/lib/auth';
import { database } from '@/lib/db';
import { detail } from '@/lib/documents';
import { assert } from '@/lib/errors';
import { fail, privateHeaders } from '@/lib/http';
import { readStored } from '@/lib/storage';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ id: string; fileId: string }> }) {
  try {
    const user = await getUser();
    assert(user, 'Inicia sesión.', 401);
    const { id, fileId } = await context.params;
    const url = new URL(request.url);
    const version = Number(url.searchParams.get('version'));
    assert(Number.isInteger(version) && version > 0, 'Versión inválida.');
    const data = await detail(await database(), user, id, version);
    const file = data.files.find(f => f.id === fileId);
    assert(file, 'Archivo no disponible.', 404);
    const bytes = await readStored(file.storage_key);
    return new Response(new Uint8Array(bytes), { headers: { ...privateHeaders, 'Content-Type': file.mime, 'Content-Length': String(bytes.length), 'Content-Disposition': `${url.searchParams.has('download') ? 'attachment' : 'inline'}; filename="archivo"; filename*=UTF-8''${encodeURIComponent(file.original_name)}`, 'Content-Security-Policy': "sandbox; default-src 'none'", 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { return fail(error); }
}
