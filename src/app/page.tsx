import Link from 'next/link';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, FileText, FolderOpen, Plus, Search } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { database } from '@/lib/db';
import { listDocuments } from '@/lib/documents';
import { AREAS, STATUS, consecutive, dateTime, type Status } from '@/lib/types';
import { Shell } from '@/components/shell';
export const dynamic = 'force-dynamic';
export default async function Home({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; state?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const tab = params.tab || 'inbox';
  const db = await database();
  const docs = await listDocuments(db, user, tab, params.q, params.state);
  const counts = user.area_id ? await db.query<{ inbox: string; sent: string; mine: string }>(`SELECT
    (SELECT count(*) FROM documents WHERE responsible_area=$1 AND status IN ('PENDING','RECEIVED','RETURNED')) AS inbox,
    (SELECT count(DISTINCT document_id) FROM steps WHERE sender_area=$1) AS sent,
    (SELECT count(*) FROM documents WHERE origin_area=$1 OR EXISTS(SELECT 1 FROM steps s WHERE s.document_id=documents.id AND s.recipient_area=$1)) AS mine`, [user.area_id]) : [{ inbox: '0', sent: '0', mine: '0' }];
  const labels: Record<string, string> = { inbox: 'Por atender', sent: 'Enviados', mine: 'Documentos de mi área', all: 'Vista general' };
  return <Shell user={user} active={tab}>
    <div className="page-heading"><div><span className="eyebrow">CENTRO DOCUMENTAL</span><h1>Todo en orden.</h1><p className="muted">Consulta tus documentos y continúa los trámites de tu área.</p></div>{user.area_id && <Link href="/documents/new" className="button primary"><Plus size={18} /> Nuevo documento</Link>}</div>
    {!user.area_id ? <div className="notice">Tu rol permite gestionar usuarios, no consultar documentos. Ingresa a <Link href="/admin">Usuarios y permisos</Link>.</div> : <>
      <div className="stat-grid">{([
        ['inbox', 'Por atender', 'Documentos que requieren tu área', ArrowDownLeft],
        ['sent', 'Enviados', 'Trámites remitidos por tu área', ArrowUpRight],
        ['mine', 'Documentos de mi área', 'Propios y recibidos', FolderOpen]
      ] as const).map(([key, title, description, Icon]) => <Link href={`/?tab=${key}`} key={key} className={`stat-card ${tab === key ? 'selected' : ''}`}><div className="stat-top"><span>{title}</span><Icon size={20} /></div><strong>{counts[0][key]}</strong><small>{description}</small></Link>)}</div>
      <section className="panel document-list"><div className="panel-heading"><div><h2>{labels[tab] || labels.mine}</h2><span className="muted small">Un documento, un historial completo.</span></div><span className="count-chip">{docs.length} documentos</span></div>
        <form className="filters" method="GET"><input type="hidden" name="tab" value={tab} /><div className="search-input"><Search size={18} /><input name="q" defaultValue={params.q} placeholder="Buscar por consecutivo o asunto…" aria-label="Buscar por consecutivo o asunto" /></div><select name="state" defaultValue={params.state || ''} aria-label="Filtrar por estado"><option value="">Todos los estados</option>{Object.entries(STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><button className="button secondary">Buscar</button></form>
        <div className="table-scroll"><table><thead><tr><th>Documento</th><th>Estado</th><th>Área responsable</th><th>Actualización</th><th><span className="sr-only">Abrir</span></th></tr></thead><tbody>{docs.map(doc => <tr key={doc.id}><td><Link href={`/documents/${doc.id}`} className="document-cell"><span className="document-icon"><FileText size={21} /></span><span><strong>{doc.subject}</strong><small>{consecutive(doc.number)} <span>·</span> {doc.kind === 'EGRESO' ? 'Formato de egreso' : 'PDF cargado'} <span>·</span> v{doc.current_version}</small></span></Link></td><td><span className={`status status-${doc.status.toLowerCase()}`}>{STATUS[doc.status as Status]}</span></td><td>{AREAS[doc.responsible_area]}</td><td className="muted small">{dateTime(doc.updated_at)}</td><td><Link href={`/documents/${doc.id}`} className="icon-button" aria-label={`Abrir ${consecutive(doc.number)}`}><ArrowRight size={18} /></Link></td></tr>)}</tbody></table></div>
        {!docs.length && <div className="empty-state"><FolderOpen size={36} /><h3>No hay documentos en esta bandeja</h3><p>Cuando tu área reciba un trámite, aparecerá aquí.<br />También puedes crear un documento o cambiar los filtros.</p><Link className="button secondary" href="/documents/new"><Plus size={16} /> Crear documento</Link></div>}
        <div className="list-foot">Se muestran hasta 200 documentos · Horario de Colombia</div>
      </section>
      <div className="workflow-tip"><span className="tip-number">01 — 05</span><p><strong>Un recorrido claro, de principio a fin.</strong> Borrador → Envío → Recepción → Revisión → Autorización de Gerencia.</p><span>Recibir no es autorizar.</span></div>
    </>}
  </Shell>;
}
