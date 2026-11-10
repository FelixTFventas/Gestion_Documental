import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { COOKIE, login } from '@/lib/auth';
import { database } from '@/lib/db';
import { assert } from '@/lib/errors';
import { fail, limitedBody, privateHeaders, sameOrigin } from '@/lib/http';

export const runtime = 'nodejs';

// Respaldo seguro para un envío HTML nativo: nunca poner credenciales en la URL.
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    assert(request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'), 'Formulario inválido.');
    const body = new URLSearchParams((await limitedBody(request, 4096)).toString('utf8'));
    const token = await login(await database(), body.get('email') || '', body.get('password') || '');
    (await cookies()).set(COOKIE, token, { httpOnly: true, secure: new URL(process.env.APP_URL!).protocol === 'https:', sameSite: 'strict', path: '/', maxAge: 8 * 60 * 60 });
    return NextResponse.redirect(new URL('/', process.env.APP_URL), { status: 303, headers: privateHeaders });
  } catch (error) { return fail(error); }
}
