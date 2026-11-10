import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { connectDatabase, embeddedDatabase, type Database } from '../src/lib/db';
import { migrate } from '../scripts/migrate';
import { act, attachFile, createDocument, detail, documentCounts, listDocuments, saveDocument, removeFile } from '../src/lib/documents';
import { manageUser } from '../src/lib/admin';
import { login, sessionUser } from '../src/lib/auth';
import { AREAS, cop, type Area, type Doc, type Egreso, type StoredFile, type User } from '../src/lib/types';
import { generatePDF } from '../src/lib/pdf';
import { storeFile, discardStored } from '../src/lib/storage';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { currentTask, workflowSummary } from '../src/lib/tracking';

let db: Database;
const users = {} as Record<Area | 'admin', User>;
const full: Egreso = { date: '2026-11-10', payment: 'TRANSFERENCIA', owner: 'Propietaria ficticia', tenant: 'Arrendatario ficticio', payee: 'Proveedor de prueba', amount: '123456.78', concept: 'Mantenimiento de prueba', receiver: 'Receptor ficticio', identity: '000000', ct: 'DEMO' };
async function snapshot(id: string) { return (await db.query<Doc>('SELECT * FROM documents WHERE id=$1', [id]))[0]; }
async function step(area: Area, id: string, action: string, target?: string, note?: string) { const d = await snapshot(id); return act(db, users[area].id, id, d.revision, d.current_version, action, target, note); }
async function egreso() { const id = await createDocument(db, users.arriendos.id, 'EGRESO', 'Egreso ficticio'); await saveDocument(db, users.arriendos.id, id, 0, 'Egreso ficticio', full); return id; }
async function fakeFile(): Promise<Omit<StoredFile,'role'>> { const id = randomUUID(); return { id, storage_key: id, original_name: 'soporte.pdf', mime: 'application/pdf', size: 123, sha256: 'a'.repeat(64) }; }
beforeAll(async () => {
  db = process.env.TEST_DATABASE_URL ? await connectDatabase(process.env.TEST_DATABASE_URL) : embeddedDatabase(new PGlite());
  if (process.env.TEST_DATABASE_URL) {
    const existing = await db.query("SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('users','documents')");
    if (existing.length) throw new Error('TEST_DATABASE_URL debe apuntar a una base vacía y descartable. No se borrará ningún dato existente.');
  }
  await migrate(db);
  const passwordHash = await hash('Prueba-segura-2026!', 4);
  for (const area of [...Object.keys(AREAS), 'admin'] as (Area | 'admin')[]) {
    const [u] = await db.query<User>('INSERT INTO users(id,email,name,password_hash,area_id,is_admin) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [randomUUID(), `${area}@test.example`, `Prueba ${area}`, passwordHash, area === 'admin' ? null : area, area === 'admin']);
    users[area] = u;
  }
});
afterAll(async () => { await db.close(); });

describe('Borradores, archivos y versiones', () => {
  it('acepta borradores incompletos y exige los campos al enviar, sin eventos parciales', async () => {
    const id = await createDocument(db, users.arriendos.id, 'EGRESO', 'Incompleto');
    await saveDocument(db, users.arriendos.id, id, 0, 'Incompleto', { concept: 'Pendiente' });
    const before = await snapshot(id);
    await expect(step('arriendos', id, 'send', 'administrativa')).rejects.toThrow('fecha');
    expect(await snapshot(id)).toEqual(before);
    expect((await detail(db, users.arriendos, id)).events.map(e => e.action)).toEqual(['CREATED','SAVED']);
    for (const amount of ['0','-1','1.234','NaN','1e5']) await expect(saveDocument(db, users.arriendos.id, id, before.revision, 'Inválido', { amount })).rejects.toThrow();
    await expect(saveDocument(db, users.arriendos.id, id, before.revision, 'Inválido', { date: '2026-02-30' })).rejects.toThrow();
  });
  it('conserva precisión decimal sin convertir valores a coma flotante', async () => {
    const id = await createDocument(db, users.arriendos.id, 'EGRESO', 'Precisión');
    await saveDocument(db, users.arriendos.id, id, 0, 'Precisión', { ...full, amount: '9999999999999999.99' });
    expect((await detail(db, users.arriendos, id)).version.amount).toBe('9999999999999999.99');
    expect(cop('9999999999999999.99')).toBe('$ 9.999.999.999.999.999,99');
  });
  it('el envío congela el contenido y los anexos incluso a nivel de base de datos', async () => {
    const id = await egreso(); const file = await fakeFile();
    await attachFile(db, users.arriendos.id, id, 1, file, 'ATTACHMENT');
    await step('arriendos', id, 'send', 'administrativa');
    await expect(db.query("UPDATE versions SET data='{}' WHERE document_id=$1", [id])).rejects.toThrow('inmutable');
    await expect(db.query('DELETE FROM version_files WHERE document_id=$1', [id])).rejects.toThrow('inmutables');
    await expect(db.query('UPDATE version_files SET version=99 WHERE document_id=$1', [id])).rejects.toThrow('inmutables');
    await expect(saveDocument(db, users.administrativa.id, id, (await snapshot(id)).revision, 'No permitido', full)).rejects.toThrow();
    await expect(removeFile(db, users.arriendos.id, id, (await snapshot(id)).revision, file.id)).rejects.toThrow();
  });
});

describe('Recorrido Arriendos → Dirección Administrativa → Contabilidad → Gerencia', () => {
  it('devuelve con motivo, corrige en v2, registra decisiones independientes y autoriza solo esa versión', async () => {
    const id = await egreso(); const file = await fakeFile();
    await attachFile(db, users.arriendos.id, id, 1, file, 'ATTACHMENT');
    await step('arriendos', id, 'send', 'administrativa');
    await step('administrativa', id, 'receive');
    await expect(step('administrativa', id, 'return', undefined, '')).rejects.toThrow('Indica');
    await step('administrativa', id, 'return', undefined, 'Falta detallar el concepto');
    let d = await snapshot(id);
    await saveDocument(db, users.arriendos.id, id, d.revision, 'Asunto corregido privado', { ...full, concept: 'Concepto corregido con el detalle solicitado' });
    d = await snapshot(id); expect(d.current_version).toBe(2);
    // El receptor anterior no puede acceder al borrador de la corrección ni a sus archivos.
    await expect(detail(db, users.administrativa, id, 2)).rejects.toThrow('Versión no disponible');
    expect((await detail(db, users.administrativa, id)).version.number).toBe(1);
    expect((await detail(db, users.administrativa, id)).doc.subject).toBe('Egreso ficticio');
    expect((await listDocuments(db, users.administrativa)).find(d => d.id === id)?.subject).toBe('Egreso ficticio');
    await step('arriendos', id, 'send', 'administrativa');
    await step('administrativa', id, 'receive');
    await step('administrativa', id, 'visa');
    await step('administrativa', id, 'send', 'contabilidad');
    await step('contabilidad', id, 'receive');
    await step('contabilidad', id, 'visa');
    await step('contabilidad', id, 'send', 'gerencia');
    await step('gerencia', id, 'receive');
    const before = await detail(db, users.gerencia, id);
    expect(before.decisions.map(d => d.kind)).toEqual(['VISA','VISA']);
    await expect(act(db, users.gerencia.id, id, before.doc.revision, 1, 'authorize')).rejects.toThrow('vigente');
    expect((await snapshot(id)).revision).toBe(before.doc.revision);
    await step('gerencia', id, 'authorize');
    const result = await detail(db, users.arriendos, id);
    expect(result.doc.status).toBe('AUTHORIZED');
    expect(result.closure?.version).toBe(2);
    expect(result.closure?.actor_name).toBe(users.gerencia.name);
    expect(result.steps.every(s => s.closed_at)).toBe(true);
    expect(result.steps.map(s => s.recipient_area)).toEqual(['administrativa','arriendos','administrativa','contabilidad','gerencia']);
    expect(result.steps[1].assignment_action).toBe('RETURNED');
    expect(result.decisions.filter(d => d.kind === 'AUTHORIZE')).toHaveLength(1);
    expect(result.files[0].id).toBe(file.id);
    expect(result.events.filter(e => e.action === 'RECEIVED')).toHaveLength(4);
    expect(result.events.filter(e => e.action === 'VISA')).toHaveLength(2);
    expect(result.events.find(e => e.action === 'RETURNED')?.note).toBe('Falta detallar el concepto');
    const original = await detail(db, users.arriendos, id, 1);
    expect(original.version.data.concept).toBe(full.concept);
    expect(original.decisions).toHaveLength(0);
    expect(original.closure?.version).toBe(2); // El cierre del trámite no autoriza la versión consultada v1.
    await expect(db.query('DELETE FROM events WHERE document_id=$1', [id])).rejects.toThrow('inmutable');
    await expect(step('gerencia', id, 'authorize')).rejects.toThrow('autorizada');
    const pdf = await generatePDF(result);
    expect(pdf.subarray(0,4).toString()).toBe('%PDF');
    const parsed = await getDocument({ data: new Uint8Array(pdf), useSystemFonts: true }).promise;
    const content = await (await parsed.getPage(1)).getTextContent();
    const text = content.items.map(item => 'str' in item ? item.str : '').join(' ');
    for (const label of ['Formato de egreso','PROPIETARIO','ARRENDATARIO','PAGADO A','VALOR','CONCEPTO','Dirección Administrativa','Contabilidad','Gerencia General','CT N.º','RECIBE','N.º C. C.','Prueba gerencia']) expect(text).toContain(label);
    await parsed.cleanup();
  });
  it('el área intermedia aclara mediante nota y reenvía la misma versión o devuelve al origen', async () => {
    const id = await egreso();
    await step('arriendos', id, 'send', 'administrativa'); await step('administrativa', id, 'receive');
    await step('administrativa', id, 'send', 'contabilidad'); await step('contabilidad', id, 'receive');
    await step('contabilidad', id, 'return', undefined, 'Aclarar la referencia');
    expect((await snapshot(id)).responsible_area).toBe('administrativa');
    await step('administrativa', id, 'send', 'contabilidad', 'Aclaración: referencia de prueba');
    expect((await snapshot(id)).current_version).toBe(1);
    await step('contabilidad', id, 'return', undefined, 'Ahora requiere corregir el valor');
    await step('administrativa', id, 'return', 'arriendos', 'Se requiere corrección por el origen');
    expect((await snapshot(id)).responsible_area).toBe('arriendos');
    const d = await snapshot(id);
    await attachFile(db, users.arriendos.id, id, d.revision, await fakeFile(), 'ATTACHMENT');
    expect((await snapshot(id)).current_version).toBe(2);
    expect((await detail(db, users.arriendos, id, 1)).files).toHaveLength(0);
  });
});

describe('Finalización visible y bandejas operativas', () => {
  it('autorizar cierra automáticamente y archiva sin crear otro estado, respetando permisos y contadores', async () => {
    const ownBefore = await documentCounts(db, users.arriendos);
    const foreignBefore = await documentCounts(db, users.cartera);
    const id = await egreso();
    expect((await listDocuments(db, users.arriendos, 'circulation')).some(d => d.id === id)).toBe(false);
    await step('arriendos', id, 'send', 'gerencia');
    expect((await listDocuments(db, users.arriendos, 'circulation')).some(d => d.id === id)).toBe(true);
    await step('gerencia', id, 'receive');
    expect((await detail(db, users.gerencia, id)).closure).toBeNull();
    expect((await listDocuments(db, users.gerencia, 'finished')).some(d => d.id === id)).toBe(false);
    await expect(step('gerencia', id, 'close')).rejects.toThrow('Acción desconocida');
    await step('gerencia', id, 'authorize');
    const archived = (await listDocuments(db, users.arriendos, 'finished')).find(d => d.id === id)!;
    expect(archived.status).toBe('AUTHORIZED');
    expect(archived.visible_version).toBe(1);
    expect(archived.authorized_by).toBe(users.gerencia.name);
    expect(archived.authorized_at).toBeTruthy();
    expect(workflowSummary(archived)).toMatchObject({ finished: true, location: 'Archivo', task: 'Sin acciones pendientes', label: 'Finalizado' });
    expect((await listDocuments(db, users.gerencia, 'inbox')).some(d => d.id === id)).toBe(false);
    expect((await listDocuments(db, users.arriendos, 'circulation')).some(d => d.id === id)).toBe(false);
    expect((await listDocuments(db, users.cartera, 'finished')).some(d => d.id === id)).toBe(false);
    expect(await listDocuments(db, users.admin, 'finished')).toEqual([]);
    expect(Number((await documentCounts(db, users.arriendos)).finished)).toBe(Number(ownBefore.finished) + 1);
    expect(await documentCounts(db, users.cartera)).toEqual(foreignBefore);
    expect((await documentCounts(db, users.admin)).total).toBe('0');
    const result = await detail(db, users.arriendos, id);
    expect(result.steps.map(s => s.recipient_area)).toEqual(['gerencia']); // Sin inventar áreas obligatorias.
    expect(result.steps[0].outcome).toBe('AUTHORIZED');
    expect(result.events.filter(e => e.action === 'AUTHORIZED')).toHaveLength(1);
    await expect(saveDocument(db, users.gerencia.id, id, result.doc.revision, 'No editable', full)).rejects.toThrow('autorizada');
  });

  it.each([
    ['DRAFT', 'arriendos', 'Arriendos', 'Completar y enviar el borrador'],
    ['PENDING', 'administrativa', 'Dirección Administrativa', 'Confirmar recepción'],
    ['RECEIVED', 'gerencia', 'Gerencia', 'Revisar y decidir la autorización'],
    ['RETURNED', 'arriendos', 'Arriendos', 'Corregir y reenviar'],
    ['RETURNED', 'administrativa', 'Dirección Administrativa', 'Aclarar o devolver al origen']
  ] as const)('explica ubicación y siguiente tarea para %s / %s', (status, area, location, task) => {
    const doc = { status, origin_area: 'arriendos' as const, responsible_area: area };
    expect(workflowSummary(doc)).toMatchObject({ finished: false, location, task });
    expect(currentTask(doc, area)).toBe(`Tu área: ${task.toLowerCase()}`);
  });
});

describe('Impresión horizontal sin recortes', () => {
  it('pagina el concepto largo y conserva los vistos buenos y el final del texto', async () => {
    const id = await egreso(); const d = await snapshot(id);
    const concept = 'Descripción extensa del mantenimiento del inmueble de prueba. '.repeat(220) + ' FIN-DEL-CONCEPTO';
    await saveDocument(db, users.arriendos.id, id, d.revision, d.subject, { ...full, concept });
    const bytes = await generatePDF(await detail(db, users.arriendos, id));
    const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
    expect(pdf.numPages).toBeGreaterThan(1);
    let text = '';
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n); const viewport = page.getViewport({ scale: 1 });
      expect(viewport.width).toBeGreaterThan(viewport.height);
      const content = await page.getTextContent();
      for (const item of content.items) if ('str' in item && item.str.trim()) {
        text += item.str + ' ';
        expect(item.transform[4]).toBeGreaterThanOrEqual(15);
        expect(item.transform[4] + item.width).toBeLessThanOrEqual(viewport.width - 14);
        expect(item.transform[5]).toBeGreaterThanOrEqual(10);
        expect(item.transform[5]).toBeLessThanOrEqual(viewport.height - 10);
      }
    }
    expect(text).toContain('FIN-DEL-CONCEPTO'); expect(text).toContain('Gerencia General'); expect(text).toContain('RECIBE');
    await pdf.cleanup();
  });
});

describe('PDF cargado y aislamiento de áreas', () => {
  it('Cartera carga un PDF y Tesorería registra recibido, sin plantilla', async () => {
    const id = await createDocument(db, users.cartera.id, 'UPLOAD', 'Cuenta ficticia');
    await expect(step('cartera', id, 'send', 'tesoreria')).rejects.toThrow('PDF principal');
    await attachFile(db, users.cartera.id, id, 0, await fakeFile(), 'MAIN');
    await step('cartera', id, 'send', 'tesoreria'); await step('tesoreria', id, 'receive');
    const result = await detail(db, users.tesoreria, id);
    expect(result.version.data).toEqual({}); expect(result.files[0].role).toBe('MAIN');
    expect(result.events.map(e => e.action)).toEqual(['CREATED','FILE_ADDED','SENT','RECEIVED']);
    expect(result.decisions).toHaveLength(0);
    await expect(detail(db, users.arriendos, id)).rejects.toThrow('no disponible');
    await expect(detail(db, users.admin, id)).rejects.toThrow('no disponible');
    expect((await listDocuments(db, users.arriendos)).some(d => d.id === id)).toBe(false);
    await expect(step('tesoreria', id, 'authorize')).rejects.toThrow('Solo Gerencia');
    await expect(step('tesoreria', id, 'visa')).rejects.toThrow('espacio de visto bueno');
    expect((await snapshot(id)).status).toBe('RECEIVED');
    expect((await detail(db, users.gerencia, id)).doc.id).toBe(id);
    await expect(step('gerencia', id, 'authorize')).rejects.toThrow('responsable');
  });
  it('solo la receptora actual recibe, reenvía y devuelve; dos clics producen un solo paso', async () => {
    const id = await egreso(); const d = await snapshot(id);
    const results = await Promise.allSettled([1,2].map(() => act(db, users.arriendos.id, id, d.revision, 1, 'send', 'administrativa')));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.query('SELECT * FROM steps WHERE document_id=$1', [id])).toHaveLength(1);
    await expect(step('arriendos', id, 'receive')).rejects.toThrow('responsable');
    await expect(step('administrativa', id, 'send', 'contabilidad')).rejects.toThrow('recepción');
    await step('administrativa', id, 'receive'); await step('administrativa', id, 'send', 'gerencia'); await step('gerencia', id, 'receive');
    const current = await snapshot(id);
    const decisions = await Promise.allSettled([1,2].map(() => act(db, users.gerencia.id, id, current.revision, 1, 'authorize')));
    expect(decisions.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((await detail(db, users.gerencia, id)).decisions.filter(d => d.kind === 'AUTHORIZE')).toHaveLength(1);
  });
});

describe('Administración, sesiones y Gerencia', () => {
  it('el administrador no escala a Gerencia, y desactivar revoca sesiones conservando el historial', async () => {
    const input = { email: 'nuevo@test.example', name: 'Cuenta de prueba', area: 'cartera', admin: false, active: true, password: 'Prueba-segura-2026!' };
    await expect(manageUser(db, users.admin.id, { ...input, area: 'gerencia' })).rejects.toThrow('Solo una cuenta');
    await expect(manageUser(db, users.admin.id, { ...input, id: users.gerencia.id, area: 'gerencia', email: users.gerencia.email })).rejects.toThrow('Solo una cuenta');
    const id = await manageUser(db, users.admin.id, input);
    const token = await login(db, input.email, input.password);
    expect((await sessionUser(db, token))?.id).toBe(id);
    await manageUser(db, users.admin.id, { ...input, id, active: false, password: undefined });
    expect(await sessionUser(db, token)).toBeNull();
    expect((await db.query('SELECT * FROM admin_events WHERE target_id=$1', [id]))).toHaveLength(2);
    await expect(createDocument(db, id, 'EGRESO', 'No permitido')).rejects.toThrow('desactivada');
    await expect(manageUser(db, users.gerencia.id, { ...input, id: users.gerencia.id, email: users.gerencia.email, area: 'cartera' })).rejects.toThrow('al menos una');
    const gerenciaId = await manageUser(db, users.gerencia.id, { ...input, email: 'gerencia2@test.example', area: 'gerencia' });
    expect((await db.query<User>('SELECT * FROM users WHERE id=$1', [gerenciaId]))[0].area_id).toBe('gerencia');
    await expect(createDocument(db, users.admin.id, 'EGRESO', 'Sin área')).rejects.toThrow('área documental');
  });
  it('no permite alterar los registros de seguridad', async () => {
    await expect(db.exec('DELETE FROM admin_events')).rejects.toThrow('inmutable');
  });
});

describe('Validación real de archivos', () => {
  it('rechaza extensiones engañosas, PDF activo, imagen principal y tamaño excesivo', async () => {
    await expect(storeFile(new File(['texto'], 'falso.pdf'), true)).rejects.toThrow('PDF real');
    await expect(storeFile(new File(['%PDF-1.7\n/JavaScript(alert)\n%%EOF'], 'activo.pdf'), true)).rejects.toThrow('acciones activas');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9VQAAAAASUVORK5CYII=', 'base64');
    await expect(storeFile(new File([png], 'imagen.pdf'), true)).rejects.toThrow('PDF real');
    const image = await storeFile(new File([png], 'soporte.png'), false);
    expect(image.mime).toBe('image/png'); await discardStored(image.storage_key);
    await expect(storeFile(new File([new Uint8Array(16*1024*1024)], 'grande.pdf'), true)).rejects.toThrow('MB');
  });
});
