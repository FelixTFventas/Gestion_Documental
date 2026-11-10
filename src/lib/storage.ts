import path from 'node:path';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { assert } from './errors';
import type { StoredFile } from './types';

const root = () => {
  const dir = path.resolve(/* turbopackIgnore: true */ process.env.STORAGE_PATH || './.local/files');
  const publicDir = path.join(process.cwd(), 'public');
  assert(dir !== publicDir && !dir.startsWith(publicDir + path.sep), 'STORAGE_PATH no puede estar en public.', 500);
  return dir;
};
export const maxFileBytes = () => {
  const mb = Number(process.env.MAX_FILE_MB || 15);
  assert(Number.isFinite(mb) && mb > 0 && mb <= 50, 'MAX_FILE_MB debe estar entre 1 y 50.', 500);
  return mb * 1024 * 1024;
};
export async function storeFile(file: File, principal: boolean): Promise<Omit<StoredFile, 'role'>> {
  assert(file.size > 0 && file.size <= maxFileBytes(), `El archivo debe pesar entre 1 byte y ${maxFileBytes() / 1024 / 1024} MB.`);
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = await fileTypeFromBuffer(bytes);
  const allowed = principal ? ['application/pdf'] : ['application/pdf', 'image/jpeg', 'image/png'];
  assert(type && allowed.includes(type.mime), principal ? 'El archivo principal debe ser un PDF real.' : 'Solo se admiten PDF, JPG y PNG reales.');
  if (type.mime === 'application/pdf') {
    // No es un antivirus: se rechazan los mecanismos activos más comunes.
    const source = bytes.toString('latin1');
    assert(source.includes('%%EOF'), 'El PDF parece incompleto.');
    assert(!/\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|OpenAction|AA)\b/.test(source), 'No se admiten PDF con acciones activas o archivos incrustados.');
  }
  const id = randomUUID();
  await mkdir(root(), { recursive: true });
  await writeFile(path.join(/* turbopackIgnore: true */ root(), id), bytes, { flag: 'wx', mode: 0o600 });
  return { id, storage_key: id, original_name: path.basename(file.name).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 180) || `archivo.${type.ext}`, mime: type.mime, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
export async function readStored(key: string) {
  assert(/^[a-f0-9-]{36}$/.test(key), 'Archivo no disponible.', 404);
  return readFile(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ root(), key));
}
export async function discardStored(key: string) { if (/^[a-f0-9-]{36}$/.test(key)) await unlink(path.join(/* turbopackIgnore: true */ root(), key)).catch(() => undefined); }
