import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { z } from 'zod';
import { database } from '../src/lib/db';
import { createDocument, saveDocument, attachFile, act, detail } from '../src/lib/documents';
import { generatePDF } from '../src/lib/pdf';
import { storeFile } from '../src/lib/storage';
import { AREAS, type User, type Doc } from '../src/lib/types';

const db = await database();
try {
  if (process.env.NODE_ENV === 'production') throw new Error('Los datos ficticios no se habilitan en producción.');
  const password = z.string().min(12).max(72).refine(p => Buffer.byteLength(p, 'utf8') <= 72, 'Máximo 72 bytes UTF-8.').parse(process.env.DEMO_PASSWORD);
  const passwordHash = await hash(password, 12);
  await db.transaction(async sql => {
    await sql.exec('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');
    const existing = await sql.query('SELECT 1 FROM users');
    if (existing.length) { console.log('La base ya contiene usuarios; no se alterarán cuentas ni contraseñas.'); return; }
    for (const [area, name] of [...Object.entries(AREAS), ['admin', 'Administración de usuarios']]) {
      const id = randomUUID();
      await sql.query('INSERT INTO users(id,email,name,password_hash,area_id,is_admin) VALUES($1,$2,$3,$4,$5,$6)', [id, `${area}@demo.ftf.test`, `${name} · Demo`, passwordHash, area === 'admin' ? null : area, area === 'admin']);
      await sql.query("INSERT INTO admin_events(id,actor_id,target_id,action,details) VALUES($1,$2,$2,'DEMO_PROVISION',$3)", [randomUUID(), id, JSON.stringify({ fictional: true, area: area === 'admin' ? null : area })]);
    }
  });
  const [arriendos] = await db.query<User>("SELECT * FROM users WHERE email='arriendos@demo.ftf.test'");
  const [cartera] = await db.query<User>("SELECT * FROM users WHERE email='cartera@demo.ftf.test'");
  const anyDocs = await db.query('SELECT 1 FROM documents LIMIT 1');
  if (!anyDocs.length && arriendos && cartera) {
    const id = await createDocument(db, arriendos.id, 'EGRESO', 'Mantenimiento preventivo · Inmueble de prueba');
    await saveDocument(db, arriendos.id, id, 0, 'Mantenimiento preventivo · Inmueble de prueba', { date: '2026-11-10', payment: 'TRANSFERENCIA', owner: 'Propietaria ficticia: Laura Ejemplo', tenant: 'Arrendatario ficticio: Andrés Prueba', payee: 'Servicios de Prueba S.A.S.', amount: '285000.50', concept: 'DATOS FICTICIOS. Revisión preventiva de instalaciones y mantenimiento del inmueble de demostración. Este egreso no representa una obligación ni un pago real.', ct: 'DEMO-001' });
    const data = await detail(db, arriendos, id);
    const bytes = await generatePDF(data);
    const support = await storeFile(new File([new Uint8Array(bytes)], 'soporte-ficticio.pdf', { type: 'application/pdf' }), false);
    await attachFile(db, arriendos.id, id, 1, support, 'ATTACHMENT');
    await act(db, arriendos.id, id, 2, 1, 'send', 'administrativa', 'Revisar el concepto y los soportes de este ejemplo ficticio.');
    const draft = await createDocument(db, arriendos.id, 'EGRESO', 'Borrador · Servicios del inmueble de demostración');
    await saveDocument(db, arriendos.id, draft, 0, 'Borrador · Servicios del inmueble de demostración', { payment: 'EFECTIVO', concept: 'Borrador incompleto para practicar el diligenciamiento.' });
    const uploaded = await createDocument(db, cartera.id, 'UPLOAD', 'Cuenta de cobro ficticia · Noviembre');
    const main = await storeFile(new File([new Uint8Array(bytes)], 'documento-principal-ficticio.pdf', { type: 'application/pdf' }), true);
    await attachFile(db, cartera.id, uploaded, 0, main, 'MAIN');
    const [doc] = await db.query<Doc>('SELECT * FROM documents WHERE id=$1', [uploaded]);
    await act(db, cartera.id, uploaded, doc.revision, 1, 'send', 'tesoreria', 'Documento cargado como PDF, sin diligenciar plantilla.');
  }
  console.log('Datos ficticios listos. Cuentas: {área}@demo.ftf.test y admin@demo.ftf.test. Contraseña: DEMO_PASSWORD del entorno.');
} finally { await db.close(); }
