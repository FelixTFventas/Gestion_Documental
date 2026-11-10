import Link from 'next/link';
import { Archive, ArrowDownLeft, ArrowRight, Check, FileText, FolderOpen, MapPin, Plus, Route, Search, ShieldCheck } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { database } from '@/lib/db';
import { documentCounts, listDocuments } from '@/lib/documents';
import { STATUS, consecutive, dateTime } from '@/lib/types';
import { currentTask, workflowSummary } from '@/lib/tracking';
import { Shell } from '@/components/shell';

export const dynamic = 'force-dynamic';
const trays = {
  inbox: { title: 'Por atender', description: 'Estas tareas están en manos de tu área. Abre un documento para continuar.', empty: 'Tu área no tiene tareas pendientes.' },
  circulation: { title: 'En circulación', description: 'Sigue los documentos abiertos: dónde están y qué falta para continuar.', empty: 'No hay documentos en circulación con estos filtros.' },
  finished: { title: 'Finalizados', description: 'Trámites cerrados automáticamente con la autorización de Gerencia. Listos para consultar, descargar e imprimir.', empty: 'Aún no hay trámites finalizados con estos filtros.' },
  sent: { title: 'Enviados', description: 'Documentos remitidos por tu área y su ubicación actual.', empty: 'Tu área todavía no ha enviado documentos.' },
  mine: { title: 'Documentos de mi área', description: 'Borradores propios, documentos recibidos y trámites finalizados de tu área.', empty: 'No hay documentos de tu área con estos filtros.' },
  all: { title: 'Vista general', description: 'Vista de Gerencia: todos los documentos y su situación actual.', empty: 'No hay documentos con estos filtros.' }
};

export default async function Home({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; state?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const tab = params.tab && Object.hasOwn(trays, params.tab) ? params.tab as keyof typeof trays : 'inbox';
  const db = await database();
  const [docs, counts] = await Promise.all([listDocuments(db, user, tab, params.q, params.state), documentCounts(db, user)]);
  const tray = trays[tab];
  return <Shell user={user} active={tab} counts={counts}>
    <section className="workspace-hero">
      <div><span className="eyebrow">CENTRO DOCUMENTAL / FTF</span><h1>Todo en orden.</h1><p>Ubica cada documento.<br /><strong>Conoce el siguiente paso y cuándo termina.</strong></p></div>
      {user.area_id && <div className="hero-actions"><span className="hero-access"><ShieldCheck size={16} /> {counts.total} documentos a tu alcance</span><Link href="/documents/new" className="button primary"><Plus size={18} /> Nuevo documento</Link></div>}
    </section>
    {!user.area_id ? <div className="notice">Tu rol permite gestionar usuarios, no consultar documentos. Ingresa a <Link href="/admin">Usuarios y permisos</Link>.</div> : <>
      <div className="stat-grid operational-stats">
        {([
          ['inbox', 'Por atender', 'Tu área tiene el siguiente paso', ArrowDownLeft],
          ['circulation', 'En circulación', 'Trámites abiertos y su ubicación', Route],
          ['finished', 'Finalizados', 'Autorizados por Gerencia · En archivo', Archive]
        ] as const).map(([key, title, description, Icon]) => <Link href={`/?tab=${key}`} key={key} className={`stat-card ${tab === key ? 'selected' : ''} stat-${key}`}>
          <div className="stat-top"><span className="stat-glyph"><Icon size={22} /></span><span>{title}</span>{key === 'finished' && <Check className="stat-check" size={17} />}</div>
          <div className="stat-value"><strong>{counts[key]}</strong><ArrowRight size={18} /></div><small>{description}</small>
        </Link>)}
      </div>
      <section className="panel document-list">
        <div className="panel-heading"><div><span className="eyebrow">BANDEJA DOCUMENTAL</span><h2>{tray.title}</h2><p className="muted small">{tray.description}</p></div><span className="count-chip">{docs.length} documentos</span></div>
        <form className="filters" method="GET">
          <input type="hidden" name="tab" value={tab} />
          <div className="search-input"><Search size={18} /><input name="q" defaultValue={params.q} placeholder="Buscar por consecutivo o asunto…" aria-label="Buscar por consecutivo o asunto" /></div>
          <select name="state" defaultValue={params.state || ''} aria-label="Filtrar por estado"><option value="">Todos los estados</option>{Object.entries(STATUS).map(([key, label]) => <option key={key} value={key}>{key === 'AUTHORIZED' ? 'Finalizado · Autorizado' : label}</option>)}</select>
          <button className="button secondary">Buscar</button>
        </form>
        <div className="table-scroll" role="region" aria-label="Lista de documentos" tabIndex={0}><table>
          <thead><tr><th>Documento</th><th>¿Dónde está?</th><th>¿Qué sigue?</th><th>Situación del trámite</th><th><span className="sr-only">Abrir</span></th></tr></thead>
          <tbody>{docs.map(doc => {
            const summary = workflowSummary(doc);
            return <tr key={doc.id} className={summary.finished ? 'document-finished' : ''}>
              <td><Link href={`/documents/${doc.id}`} className="document-cell"><span className="document-icon">{summary.finished ? <ShieldCheck size={22} /> : <FileText size={22} />}</span><span><strong>{doc.subject}</strong><small>{consecutive(doc.number)} <span>·</span> {doc.kind === 'EGRESO' ? 'Egreso' : 'PDF cargado'} <span>·</span> v{doc.visible_version}</small></span></Link></td>
              <td><div className={`location-cell ${summary.finished ? 'is-finished' : ''}`}>{summary.finished ? <Archive size={17} /> : <MapPin size={17} />}<span><strong>{summary.location}</strong><small>{summary.finished ? 'Cerrado por Gerencia' : 'Área responsable actual'}</small></span></div></td>
              <td><div className={`next-task ${!summary.finished && user.area_id === doc.responsible_area ? 'your-task' : ''}`}><strong>{currentTask(doc, user.area_id)}</strong><small>{summary.finished ? `${doc.authorized_by || 'Gerencia'} · ${dateTime(doc.authorized_at || doc.updated_at)}` : `Último movimiento: ${dateTime(doc.updated_at)}`}</small></div></td>
              <td><span className={`status status-${doc.status.toLowerCase()}`}>{summary.finished ? 'Finalizado' : STATUS[doc.status]}</span>{summary.finished && <span className="decision-caption">Autorizado por Gerencia</span>}</td>
              <td><Link href={`/documents/${doc.id}`} className="open-document" aria-label={`Abrir ${consecutive(doc.number)}`}><span>Ver</span><ArrowRight size={18} /></Link></td>
            </tr>;
          })}</tbody>
        </table></div>
        {!docs.length && <div className="empty-state">{tab === 'finished' ? <Archive size={38} /> : <FolderOpen size={38} />}<h3>{tray.empty}</h3><p>{tab === 'finished' ? 'Los documentos aparecerán aquí cuando Gerencia los autorice. Recibir o dar visto bueno no finaliza el trámite.' : 'Puedes cambiar los filtros o iniciar un documento nuevo.'}</p><Link className="button secondary" href={tab === 'finished' ? '/?tab=circulation' : '/documents/new'}>{tab === 'finished' ? 'Ver documentos en circulación' : 'Crear documento'}<ArrowRight size={16} /></Link></div>}
        <div className="list-foot"><span>Hasta 200 documentos · Horario de Colombia</span><span>Acceso según tu área · Sin documentos ajenos al trámite</span></div>
      </section>
      <div className="closure-explainer"><ShieldCheck size={26} /><div><strong>La autorización marca el final.</strong><p>Cuando Gerencia autoriza, el trámite pasa a <b>Finalizados</b>. Conserva su PDF, soportes e historial, sin tareas pendientes.</p></div><span>No equivale a un pago ejecutado.</span></div>
    </>}
  </Shell>;
}
