import { getUser } from '@/lib/auth';
import { database } from '@/lib/db';
import { detail } from '@/lib/documents';
import { assert } from '@/lib/errors';
import { fail, privateHeaders } from '@/lib/http';
import { generatePDF } from '@/lib/pdf';
import { consecutive } from '@/lib/types';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUser();
    assert(user, 'Inicia sesión.', 401);
    const { id } = await context.params;
    const url = new URL(request.url);
    const version = Number(url.searchParams.get('version'));
    assert(Number.isInteger(version) && version > 0, 'Versión inválida.');
    const data = await detail(await database(), user, id, version);
    assert(data.doc.kind === 'EGRESO', 'El documento cargado se consulta en su archivo original.');
    const pdf = await generatePDF(data);
    return new Response(new Uint8Array(pdf), { headers: { ...privateHeaders, 'Content-Type': 'application/pdf', 'Content-Disposition': `${url.searchParams.has('download') ? 'attachment' : 'inline'}; filename="${consecutive(data.doc.number)}-v${version}.pdf"` } });
  } catch (error) { return fail(error); }
}
