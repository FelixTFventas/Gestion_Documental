import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Database, Sql } from './db';
import { assert } from './errors';
import { AREAS, type Area, type Detail, type Doc, type Egreso, type User, type Version, type StoredFile, type Decision, type HistoryEvent } from './types';

const text = z.string().trim().max(500).optional();
const fields = z.object({
  date: z.string().refine(s => !s || (/^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s), 'Fecha inválida').optional(),
  payment: z.enum(['EFECTIVO', 'TRANSFERENCIA']).optional(),
  owner: text, tenant: text, payee: text,
  amount: z.string().refine(s => !s || (/^\d{1,16}(\.\d{1,2})?$/.test(s) && /[1-9]/.test(s)), 'El valor debe ser positivo, con máximo dos decimales').optional(),
  concept: z.string().trim().max(20000).optional(), receiver: text, identity: text, ct: text,
  description: z.string().trim().max(20000).optional()
});
const subjectSchema = z.string().trim().min(1, 'Escribe un asunto').max(200);
type Step = { id: string; sender_area: Area; recipient_area: Area; version: number; closed_at: string | null };

export async function freshActor(sql: Sql, id: string): Promise<User> {
  const [user] = await sql.query<User>('SELECT id,email,name,area_id,is_admin,active FROM users WHERE id=$1 FOR SHARE', [id]);
  assert(user?.active, 'La cuenta está desactivada o no existe.', 401);
  return user;
}
async function event(sql: Sql, user: User, doc: Doc, action: string, note = '', details: Record<string, string> = {}) {
  await sql.query('INSERT INTO events(id,document_id,version,step_id,actor_id,actor_name,area_id,action,note,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [randomUUID(), doc.id, doc.current_version, doc.current_step, user.id, user.name, user.area_id, action, note, JSON.stringify(details)]);
}
async function canRead(sql: Sql, user: User, doc: Doc) {
  if (user.area_id === 'gerencia' || user.area_id === doc.origin_area) return true;
  if (!user.area_id) return false;
  const rows = await sql.query('SELECT 1 FROM steps WHERE document_id=$1 AND (sender_area=$2 OR recipient_area=$2) LIMIT 1', [doc.id, user.area_id]);
  return rows.length > 0;
}
async function accessibleDoc(sql: Sql, user: User, id: string, lock = false): Promise<Doc> {
  assert(z.uuid().safeParse(id).success, 'Documento no disponible.', 404);
  const [doc] = await sql.query<Doc>(`SELECT * FROM documents WHERE id=$1 ${lock ? 'FOR UPDATE' : ''}`, [id]);
  assert(doc && await canRead(sql, user, doc), 'Documento no disponible.', 404);
  return doc;
}
function editable(user: User, doc: Doc) {
  assert(user.area_id === doc.origin_area && user.area_id === doc.responsible_area && ['DRAFT','RETURNED'].includes(doc.status), 'Solo el área de origen puede corregir un borrador o un documento devuelto a su área.', 403);
}
function current(user: User, doc: Doc, revision: number) {
  assert(doc.revision === revision, 'El documento cambió. Actualiza la página antes de continuar.', 409);
  assert(user.area_id && user.area_id === doc.responsible_area, 'La acción corresponde al área responsable actual.', 403);
  assert(doc.status !== 'AUTHORIZED', 'Esta versión ya fue autorizada.', 409);
}
async function touch(sql: Sql, doc: Doc) {
  await sql.query('UPDATE documents SET subject=$2,status=$3,responsible_area=$4,current_version=$5,current_step=$6,revision=revision+1,updated_at=now() WHERE id=$1', [doc.id, doc.subject, doc.status, doc.responsible_area, doc.current_version, doc.current_step]);
}
async function draft(sql: Sql, user: User, doc: Doc): Promise<Version> {
  const [version] = await sql.query<Version>('SELECT * FROM versions WHERE document_id=$1 AND number=$2', [doc.id, doc.current_version]);
  if (!version.frozen) return version;
  const next = doc.current_version + 1;
  await sql.query('INSERT INTO versions(document_id,number,subject,data,amount,created_by) VALUES($1,$2,$3,$4,$5,$6)', [doc.id, next, version.subject, JSON.stringify(version.data), version.amount, user.id]);
  await sql.query('INSERT INTO version_files(document_id,version,file_id,role) SELECT document_id,$3,file_id,role FROM version_files WHERE document_id=$1 AND version=$2', [doc.id, doc.current_version, next]);
  doc.current_version = next;
  await event(sql, user, doc, 'CORRECTED', 'Se preparó una nueva versión. Las decisiones anteriores no se trasladan.');
  return { ...version, number: next, frozen: false };
}
export async function createDocument(db: Database, actorId: string, kind: string, subject: string) {
  assert(kind === 'EGRESO' || kind === 'UPLOAD', 'Tipo de documento inválido.');
  const name = subjectSchema.parse(subject || (kind === 'EGRESO' ? 'Formato de egreso' : 'Documento cargado'));
  return db.transaction(async sql => {
    const user = await freshActor(sql, actorId);
    assert(user.area_id, 'La administración de usuarios no concede un área documental.', 403);
    const id = randomUUID();
    const [doc] = await sql.query<Doc>('INSERT INTO documents(id,subject,kind,origin_area,responsible_area,created_by) VALUES($1,$2,$3,$4,$4,$5) RETURNING *', [id, name, kind, user.area_id, user.id]);
    await sql.query('INSERT INTO versions(document_id,number,subject,created_by) VALUES($1,1,$2,$3)', [id, name, user.id]);
    await event(sql, user, doc, 'CREATED');
    return id;
  });
}
export async function saveDocument(db: Database, actorId: string, id: string, revision: number, subject: string, input: Egreso) {
  const name = subjectSchema.parse(subject);
  const data = fields.parse(input);
  return db.transaction(async sql => {
    const user = await freshActor(sql, actorId);
    const doc = await accessibleDoc(sql, user, id, true);
    current(user, doc, revision); editable(user, doc);
    await draft(sql, user, doc);
    await sql.query('UPDATE versions SET data=$3,amount=$4,subject=$5 WHERE document_id=$1 AND number=$2', [id, doc.current_version, JSON.stringify(data), data.amount || null, name]);
    doc.subject = name;
    await touch(sql, doc);
    await event(sql, user, doc, 'SAVED');
    return doc.current_version;
  });
}
export async function attachFile(db: Database, actorId: string, id: string, revision: number, file: Omit<StoredFile, 'role'>, role: string) {
  assert(role === 'MAIN' || role === 'ATTACHMENT', 'Tipo de anexo inválido.');
  return db.transaction(async sql => {
    const user = await freshActor(sql, actorId);
    const doc = await accessibleDoc(sql, user, id, true);
    current(user, doc, revision); editable(user, doc);
    assert(role !== 'MAIN' || (doc.kind === 'UPLOAD' && file.mime === 'application/pdf'), 'El documento principal debe ser un PDF.');
    await draft(sql, user, doc);
    const count = await sql.query<{ count: string }>('SELECT count(*) FROM version_files WHERE document_id=$1 AND version=$2', [id, doc.current_version]);
    assert(Number(count[0].count) < 30, 'Se permiten hasta 30 archivos por versión.');
    await sql.query('INSERT INTO files(id,storage_key,original_name,mime,size,sha256,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7)', [file.id, file.storage_key, file.original_name, file.mime, file.size, file.sha256, user.id]);
    if (role === 'MAIN') await sql.query("DELETE FROM version_files WHERE document_id=$1 AND version=$2 AND role='MAIN'", [id, doc.current_version]);
    await sql.query('INSERT INTO version_files(document_id,version,file_id,role) VALUES($1,$2,$3,$4)', [id, doc.current_version, file.id, role]);
    await touch(sql, doc);
    await event(sql, user, doc, 'FILE_ADDED', file.original_name, { role });
  });
}
export async function removeFile(db: Database, actorId: string, id: string, revision: number, fileId: string) {
  return db.transaction(async sql => {
    const user = await freshActor(sql, actorId);
    const doc = await accessibleDoc(sql, user, id, true);
    current(user, doc, revision); editable(user, doc);
    assert(z.uuid().safeParse(fileId).success, 'Archivo inválido.');
    const [file] = await sql.query<{ original_name: string }>('SELECT f.original_name FROM version_files vf JOIN files f ON f.id=vf.file_id WHERE vf.document_id=$1 AND vf.version=$2 AND f.id=$3', [id, doc.current_version, fileId]);
    assert(file, 'Archivo no disponible.', 404);
    await draft(sql, user, doc);
    await sql.query('DELETE FROM version_files WHERE document_id=$1 AND version=$2 AND file_id=$3', [id, doc.current_version, fileId]);
    await touch(sql, doc);
    await event(sql, user, doc, 'FILE_REMOVED', file.original_name);
  });
}
export async function act(db: Database, actorId: string, id: string, revision: number, version: number, action: string, target?: string, inputNote = '') {
  const note = z.string().trim().max(5000).parse(inputNote);
  return db.transaction(async sql => {
    const user = await freshActor(sql, actorId);
    const doc = await accessibleDoc(sql, user, id, true);
    current(user, doc, revision);
    assert(version === doc.current_version, 'La versión solicitada ya no es la vigente.', 409);
    const [v] = await sql.query<Version>('SELECT * FROM versions WHERE document_id=$1 AND number=$2', [id, version]);
    const [step] = doc.current_step ? await sql.query<Step>('SELECT * FROM steps WHERE id=$1', [doc.current_step]) : [];
    if (action === 'receive') {
      assert(doc.status === 'PENDING' && step && !step.closed_at && step.recipient_area === user.area_id, 'No hay un envío pendiente para recibir.', 409);
      await sql.query('UPDATE steps SET received_by=$2,received_at=now() WHERE id=$1', [step.id, user.id]);
      doc.status = 'RECEIVED';
      await event(sql, user, doc, 'RECEIVED', note);
    } else if (action === 'visa' || action === 'authorize') {
      assert(doc.status === 'RECEIVED' && step && !step.closed_at && step.version === version, 'Primero confirma la recepción de esta versión.', 409);
      if (action === 'authorize') assert(user.area_id === 'gerencia', 'Solo Gerencia puede autorizar.', 403);
      else assert(user.area_id === 'administrativa' || user.area_id === 'contabilidad', 'Esta área no tiene un espacio de visto bueno en la plantilla.', 403);
      const kind = action === 'authorize' ? 'AUTHORIZE' : 'VISA';
      const exists = await sql.query('SELECT 1 FROM decisions WHERE document_id=$1 AND version=$2 AND kind=$3 AND area_id=$4', [id, version, kind, user.area_id]);
      assert(!exists.length, 'La decisión ya está registrada para esta versión.', 409);
      await sql.query('INSERT INTO decisions(id,document_id,version,kind,area_id,actor_id,actor_name) VALUES($1,$2,$3,$4,$5,$6,$7)', [randomUUID(), id, version, kind, user.area_id, user.id, user.name]);
      if (action === 'authorize') {
        doc.status = 'AUTHORIZED';
        await sql.query("UPDATE steps SET closed_at=now(),outcome='AUTHORIZED' WHERE id=$1", [step.id]);
      }
      await event(sql, user, doc, action === 'authorize' ? 'AUTHORIZED' : 'VISA', note);
    } else if (action === 'send') {
      assert(['DRAFT','RETURNED','RECEIVED'].includes(doc.status), 'Confirma la recepción antes de reenviar.', 409);
      if (doc.status === 'RETURNED' && user.area_id !== doc.origin_area) assert(note.length, 'Añade una nota de aclaración para reenviar la misma versión.');
      assert(target && Object.hasOwn(AREAS, target) && target !== user.area_id, 'Selecciona otra área de destino.');
      if (doc.kind === 'EGRESO') {
        assert(v.data.date && v.data.payment && v.data.payee?.trim() && v.amount && v.data.concept?.trim(), 'Para enviar exige fecha, forma de pago, Pagado a, valor positivo y concepto.');
      } else {
        const main = await sql.query("SELECT 1 FROM version_files WHERE document_id=$1 AND version=$2 AND role='MAIN'", [id, version]);
        assert(main.length, 'Adjunta el PDF principal antes de enviar.');
      }
      if (!v.frozen) await sql.query('UPDATE versions SET frozen=true WHERE document_id=$1 AND number=$2', [id, version]);
      if (step && !step.closed_at) await sql.query("UPDATE steps SET closed_at=now(),outcome='FORWARDED' WHERE id=$1", [step.id]);
      const next = randomUUID();
      await sql.query('INSERT INTO steps(id,document_id,version,sender_area,recipient_area,sender_id,note) VALUES($1,$2,$3,$4,$5,$6,$7)', [next, id, version, user.area_id, target, user.id, note]);
      doc.current_step = next; doc.status = 'PENDING'; doc.responsible_area = target as Area;
      await event(sql, user, doc, 'SENT', note, { from: user.area_id!, to: target });
    } else if (action === 'return') {
      assert((['PENDING','RECEIVED'].includes(doc.status) || (doc.status === 'RETURNED' && user.area_id !== doc.origin_area && v.frozen)) && step && !step.closed_at, 'No hay un paso asignado para devolver. El origen debe corregir y reenviar.', 409);
      assert(note.length > 0, 'Indica qué falta o debe corregirse.');
      const destination = doc.status === 'RETURNED' && user.area_id !== doc.origin_area && target === doc.origin_area ? doc.origin_area : step.sender_area;
      assert(destination !== user.area_id, 'No puedes devolver a tu propia área.');
      await sql.query("UPDATE steps SET closed_at=now(),outcome='RETURNED' WHERE id=$1", [step.id]);
      const next = randomUUID();
      await sql.query('INSERT INTO steps(id,document_id,version,sender_area,recipient_area,sender_id,note) VALUES($1,$2,$3,$4,$5,$6,$7)', [next, id, version, user.area_id, destination, user.id, note]);
      doc.current_step = next; doc.status = 'RETURNED'; doc.responsible_area = destination;
      await event(sql, user, doc, 'RETURNED', note, { from: user.area_id!, to: destination });
    } else assert(false, 'Acción desconocida.');
    await touch(sql, doc);
  });
}
export async function listDocuments(db: Database, user: User, filter = 'mine', search = '', state = '') {
  if (!user.area_id) return [];
  const where = `($1='gerencia' OR d.origin_area=$1 OR EXISTS(SELECT 1 FROM steps s WHERE s.document_id=d.id AND (s.sender_area=$1 OR s.recipient_area=$1)))`;
  const clauses: Record<string, string> = {
    inbox: "d.responsible_area=$1 AND d.status IN ('PENDING','RECEIVED','RETURNED')",
    sent: 'EXISTS(SELECT 1 FROM steps s WHERE s.document_id=d.id AND s.sender_area=$1)',
    mine: '(d.origin_area=$1 OR EXISTS(SELECT 1 FROM steps s WHERE s.document_id=d.id AND s.recipient_area=$1))',
    all: "$1='gerencia'"
  };
  return db.query<Doc>(`SELECT d.*,visible.subject FROM documents d JOIN LATERAL (
    SELECT v.subject FROM versions v WHERE v.document_id=d.id AND ($1='gerencia' OR $1=d.origin_area OR EXISTS(SELECT 1 FROM steps s WHERE s.document_id=d.id AND s.version=v.number AND (s.sender_area=$1 OR s.recipient_area=$1))) ORDER BY v.number DESC LIMIT 1
  ) visible ON true WHERE ${where} AND ${clauses[filter] || clauses.mine} AND ($2='' OR visible.subject ILIKE $2 OR ('EG-' || lpad(d.number::text,6,'0')) ILIKE $2) AND ($3='' OR d.status=$3) ORDER BY d.updated_at DESC LIMIT 200`, [user.area_id, search ? `%${search.slice(0, 200)}%` : '', state]);
}
export async function detail(db: Database, user: User, id: string, requestedVersion?: number): Promise<Detail> {
  const doc = await accessibleDoc(db, user, id);
  const versions = await db.query<{ number: number; frozen: boolean }>(`SELECT v.number,v.frozen FROM versions v WHERE v.document_id=$1 AND ($2='gerencia' OR $2=$3 OR EXISTS(SELECT 1 FROM steps s WHERE s.document_id=v.document_id AND s.version=v.number AND (s.sender_area=$2 OR s.recipient_area=$2))) ORDER BY v.number DESC`, [id, user.area_id, doc.origin_area]);
  // Un participante no ve correcciones que todavía no se le han enviado.
  const selected = requestedVersion ?? versions[0]?.number;
  assert(versions.some(v => v.number === selected), 'Versión no disponible para tu área.', 404);
  const [version] = await db.query<Version>('SELECT * FROM versions WHERE document_id=$1 AND number=$2', [id, selected]);
  doc.subject = version.subject;
  const files = await db.query<StoredFile>('SELECT f.*,vf.role FROM version_files vf JOIN files f ON f.id=vf.file_id WHERE vf.document_id=$1 AND vf.version=$2 ORDER BY vf.role DESC,f.created_at', [id, selected]);
  const decisions = await db.query<Decision>('SELECT * FROM decisions WHERE document_id=$1 AND version=$2 ORDER BY created_at', [id, selected]);
  const events = await db.query<HistoryEvent>('SELECT * FROM events WHERE document_id=$1 ORDER BY sequence', [id]);
  const [step] = doc.current_step ? await db.query<Step>('SELECT * FROM steps WHERE id=$1', [doc.current_step]) : [];
  return { doc, version, versions, files, decisions, events, returnArea: step?.sender_area ?? null };
}
