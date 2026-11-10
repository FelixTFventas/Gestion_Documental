import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { database } from '@/lib/db';
import { COOKIE, getUser, login, tokenHash } from '@/lib/auth';
import { act, createDocument, removeFile, saveDocument } from '@/lib/documents';
import { manageUser } from '@/lib/admin';
import { assert } from '@/lib/errors';
import { fail, limitedBody, privateHeaders, sameOrigin } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const raw = await limitedBody(request, 100 * 1024);
    let parsed: unknown;
    try { parsed = JSON.parse(raw.toString('utf8')); } catch { assert(false, 'JSON inválido.'); }
    const body = z.object({ command: z.string(), payload: z.record(z.string(), z.unknown()).default({}) }).parse(parsed);
    const db = await database();
    const p = body.payload;
    if (body.command === 'login') {
      const credentials = z.object({ email: z.string(), password: z.string() }).parse(p);
      const token = await login(db, credentials.email, credentials.password);
      (await cookies()).set(COOKIE, token, { httpOnly: true, secure: new URL(process.env.APP_URL!).protocol === 'https:', sameSite: 'strict', path: '/', maxAge: 8 * 60 * 60 });
      return NextResponse.json({ ok: true }, { headers: privateHeaders });
    }
    const user = await getUser();
    assert(user, 'Inicia sesión para continuar.', 401);
    let result: unknown;
    if (body.command === 'logout') {
      const jar = await cookies();
      const token = jar.get(COOKIE)?.value;
      if (token) await db.query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash(token)]);
      jar.delete(COOKIE);
    } else if (body.command === 'create') {
      const data = z.object({ kind: z.string(), subject: z.string().default('') }).parse(p);
      result = { id: await createDocument(db, user.id, data.kind, data.subject) };
    } else if (body.command === 'save') {
      const data = z.object({ id: z.uuid(), revision: z.number().int().nonnegative(), subject: z.string(), data: z.record(z.string(), z.unknown()) }).parse(p);
      result = { version: await saveDocument(db, user.id, data.id, data.revision, data.subject, data.data) };
    } else if (body.command === 'act') {
      const data = z.object({ id: z.uuid(), revision: z.number().int().nonnegative(), version: z.number().int().positive(), action: z.string(), target: z.string().optional(), note: z.string().default('') }).parse(p);
      await act(db, user.id, data.id, data.revision, data.version, data.action, data.target, data.note);
    } else if (body.command === 'removeFile') {
      const data = z.object({ id: z.uuid(), revision: z.number().int().nonnegative(), fileId: z.uuid() }).parse(p);
      await removeFile(db, user.id, data.id, data.revision, data.fileId);
    } else if (body.command === 'user') result = { id: await manageUser(db, user.id, p) };
    else assert(false, 'Comando desconocido.');
    return NextResponse.json({ ok: true, result }, { headers: privateHeaders });
  } catch (error) { return fail(error); }
}
