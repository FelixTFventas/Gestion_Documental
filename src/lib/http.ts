import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError, assert } from './errors';

export const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0', 'Vary': 'Cookie' };
export function fail(error: unknown) {
  if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status, headers: privateHeaders });
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues.map(i => i.message).join('. ') }, { status: 400, headers: privateHeaders });
  const code = (error as { code?: string })?.code;
  if (code === '23505') return NextResponse.json({ error: 'El registro ya existe o la acción ya se completó. Actualiza la página.' }, { status: 409, headers: privateHeaders });
  // Nunca registrar cuerpos de formularios, contraseñas, notas ni nombres de archivos.
  console.error('Operación fallida', { type: error instanceof Error ? error.name : 'unknown', code });
  return NextResponse.json({ error: 'No fue posible completar la operación. Revisa la conexión e inténtalo de nuevo.' }, { status: 500, headers: privateHeaders });
}
export function sameOrigin(request: Request) {
  const expected = process.env.APP_URL;
  assert(expected, 'Configura APP_URL.', 500);
  assert(request.headers.get('origin') === new URL(expected).origin, 'Origen de solicitud no permitido.', 403);
}
export async function limitedBody(request: Request, max: number) {
  const length = Number(request.headers.get('content-length') || 0);
  assert(length <= max, 'La solicitud excede el tamaño permitido.', 413);
  const reader = request.body?.getReader();
  assert(reader, 'Solicitud vacía.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); throw new AppError('La solicitud excede el tamaño permitido.', 413); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
