'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { ArrowLeft, Check, CheckCheck, CheckCircle2, Download, Eye, FileText, History, Paperclip, PencilLine, Printer, RotateCcw, Save, Send, ShieldCheck, Trash2, UploadCloud } from 'lucide-react';
import { ACTIONS, AREAS, STATUS, consecutive, cop, dateTime, type Detail, type User } from '@/lib/types';
import { command, upload } from './client';

export function DocumentDetail({ data, user }: { data: Detail; user: User }) {
  const { doc, version, versions, files, decisions, events, returnArea } = data;
  const router = useRouter(); const frame = useRef<HTMLIFrameElement>(null);
  const isCurrent = version.number === doc.current_version;
  const editable = isCurrent && user.area_id === doc.origin_area && user.area_id === doc.responsible_area && ['DRAFT','RETURNED'].includes(doc.status);
  const responsible = isCurrent && user.area_id === doc.responsible_area && doc.status !== 'AUTHORIZED';
  const [tab, setTab] = useState(editable ? 'edit' : 'preview');
  const [busy, setBusy] = useState(false); const [pending, startTransition] = useTransition();
  const [error, setError] = useState(''); const [dirty, setDirty] = useState(false);
  const [action, setAction] = useState(''); const [note, setNote] = useState('');
  const [target, setTarget] = useState<string>(returnArea || 'administrativa');
  const main = files.find(f => f.role === 'MAIN');
  const base = `/api/documents/${doc.id}`;
  const pdfUrl = doc.kind === 'EGRESO' ? `${base}/pdf?version=${version.number}` : main ? `${base}/files/${main.id}?version=${version.number}` : '';
  const authorized = decisions.some(d => d.kind === 'AUTHORIZE');
  const lastCirculation = [...events].reverse().find(e => ['SENT','RETURNED'].includes(e.action));
  const disabled = busy || pending;
  async function perform(fn: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await fn(); startTransition(() => router.refresh()); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function doAction() {
    await perform(() => command('act', { id: doc.id, revision: doc.revision, version: version.number, action, target, note }));
  }
  function printPDF() {
    setTab('preview');
    if (frame.current) { try { frame.current.contentWindow?.focus(); frame.current.contentWindow?.print(); } catch { window.open(pdfUrl, '_blank', 'noopener'); } }
    else window.open(pdfUrl, '_blank', 'noopener');
  }
  return <>
    <Link href="/" className="back-link"><ArrowLeft size={16} /> Volver a documentos</Link>
    <div className="page-heading detail-heading"><div><span className="eyebrow">{consecutive(doc.number)} <span className="muted">/ {doc.kind === 'EGRESO' ? 'FORMATO DE EGRESO' : 'DOCUMENTO CARGADO'}</span></span><h1>{doc.subject}</h1><p className="muted">Origen: {AREAS[doc.origin_area]} <span className="dot">·</span> Creado el {dateTime(doc.created_at)}</p></div><label className="version-picker">Versión<select aria-label="Versión del documento" value={version.number} onChange={e => router.push(`/documents/${doc.id}?version=${e.target.value}`)}>{versions.map(v => <option key={v.number} value={v.number}>v{v.number} {v.frozen ? '· Enviada' : '· Borrador'}</option>)}</select></label></div>
    {!isCurrent && <div className="notice">Estás consultando una versión anterior. Sus decisiones no se aplican a versiones posteriores. <Link href={`/documents/${doc.id}`}>Consultar la última versión disponible</Link></div>}
    <section className="status-panel"><div className="status-summary"><span className={`status status-${doc.status.toLowerCase()}`}>{STATUS[doc.status]}</span><span className="responsible">Responsable actual <strong>{AREAS[doc.responsible_area]}</strong></span></div><div className="inline-actions">
      {responsible && doc.status === 'PENDING' && <button className="button primary" disabled={disabled} onClick={() => perform(() => command('act', { id: doc.id, revision: doc.revision, version: version.number, action: 'receive' }))}><CheckCheck size={17} /> Marcar como recibido</button>}
      {responsible && doc.status === 'RECEIVED' && (user.area_id === 'administrativa' || user.area_id === 'contabilidad') && !decisions.some(d => d.kind === 'VISA' && d.area_id === user.area_id) && <button className="button secondary" disabled={disabled} onClick={() => setAction('visa')}><Check size={17} /> Visto bueno</button>}
      {responsible && doc.status === 'RECEIVED' && user.area_id === 'gerencia' && <button className="button primary authorize" disabled={disabled} onClick={() => { setTab('preview'); setAction('authorize'); }}><ShieldCheck size={17} /> Autorizar</button>}
      {responsible && (['PENDING','RECEIVED'].includes(doc.status) || (doc.status === 'RETURNED' && user.area_id !== doc.origin_area)) && <button className="button secondary" disabled={disabled || dirty} onClick={() => setAction('return')}><RotateCcw size={16} /> Devolver</button>}
      {responsible && ['DRAFT','RECEIVED','RETURNED'].includes(doc.status) && <button className="button primary" disabled={disabled || dirty} onClick={() => setAction('send')}><Send size={16} /> Enviar a un área</button>}
    </div></section>
    {error && <div className="notice error" role="alert">{error}</div>}
    {lastCirculation?.note && <div className={`routing-note ${lastCirculation.action === 'RETURNED' ? 'correction' : ''}`}><strong>{lastCirculation.action === 'RETURNED' ? 'Corrección solicitada' : 'Nota del último envío'}</strong><p>{lastCirculation.note}</p><small>{lastCirculation.actor_name} · {AREAS[lastCirculation.area_id]} · v{lastCirculation.version}</small></div>}
    {dirty && <div className="notice">Tienes cambios sin guardar. Guarda el borrador antes de adjuntar archivos, cambiar de pestaña o enviar. El PDF refleja únicamente los datos guardados.</div>}
    {authorized && <div className="authorization-note"><CheckCircle2 size={21} /><div><strong>Esta versión cuenta con autorización de Gerencia.</strong><span>Decisión interna del trámite. No representa ejecución de pago ni firma electrónica.</span></div></div>}
    {action && <section className="panel action-form"><h2>{{ send: 'Enviar documento', return: 'Devolver para corrección', visa: 'Registrar visto bueno', authorize: `Autorizar versión ${version.number}` }[action]}</h2>
      <p className="muted small">{action === 'send' ? 'El envío conserva el contenido de esta versión y asigna un nuevo paso al área elegida.' : action === 'return' ? 'Explica qué falta. La tarea vuelve al remitente de este paso, sin borrar su historial.' : action === 'visa' ? 'El visto bueno es una revisión expresa de tu área. No equivale a autorización de Gerencia.' : 'La autorización quedará vinculada a esta versión exacta, con tu usuario y fecha, y cerrará el paso.'}</p>
      <form onSubmit={e => { e.preventDefault(); doAction(); }} className="stack">
        {action === 'send' && <label>Área de destino<select value={target === user.area_id ? '' : target} required onChange={e => setTarget(e.target.value)}><option value="">Selecciona un área</option>{Object.entries(AREAS).filter(([id]) => id !== user.area_id).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}
        {action === 'return' && <label>Devolver a<select value={target === doc.origin_area && doc.status === 'RETURNED' && user.area_id !== doc.origin_area ? doc.origin_area : returnArea || ''} onChange={e => setTarget(e.target.value)}><option value={returnArea || ''}>{returnArea ? AREAS[returnArea] : 'Remitente del paso'}</option>{doc.status === 'RETURNED' && user.area_id !== doc.origin_area && returnArea !== doc.origin_area && <option value={doc.origin_area}>{AREAS[doc.origin_area]} · Área de origen</option>}</select></label>}
        <label>{action === 'return' ? 'Qué falta o debe corregirse *' : 'Nota u observación (opcional)'}<textarea value={note} maxLength={5000} onChange={e => setNote(e.target.value)} required={action === 'return'} rows={3} placeholder={action === 'return' ? 'Describe la corrección requerida…' : 'Añade contexto para el siguiente paso…'} /></label>
        <div className="form-actions"><button type="button" className="button secondary" onClick={() => { setAction(''); setNote(''); }}>Cancelar</button><button disabled={disabled} className="button primary">{disabled ? 'Procesando…' : 'Confirmar'}</button></div>
      </form>
    </section>}
    <div className="detail-grid"><section className="panel detail-content"><div className="tabs" role="tablist" aria-label="Contenido del documento">{[
      ...(editable ? [['edit',doc.kind === 'EGRESO' ? 'Datos del formato' : 'Datos del documento',PencilLine]] : []), ['preview','Vista previa',Eye], ['files',`Soportes (${files.filter(f => f.role === 'ATTACHMENT').length})`,Paperclip], ['history','Historial',History]
    ].map(([key,title,Icon]) => { const Glyph = Icon as typeof Eye; return <button key={String(key)} className={tab === key ? 'active' : ''} role="tab" aria-selected={tab === key} disabled={dirty && key !== tab} onClick={() => setTab(String(key))}><Glyph size={17} />{String(title)}</button>; })}</div>
      {tab === 'edit' && <form className="document-form" onChange={() => setDirty(true)} onSubmit={e => {
        e.preventDefault(); const form = new FormData(e.currentTarget); const saved: Record<string, string> = {};
        for (const [key,value] of form.entries()) if (key !== 'subject' && typeof value === 'string' && value !== '') saved[key] = value.trim();
        perform(() => command('save', { id: doc.id, revision: doc.revision, subject: form.get('subject'), data: saved }));
      }}>
        <div className="section-caption"><span className="step-number">01</span><div><h2>{doc.kind === 'EGRESO' ? 'Datos del egreso' : 'Datos del documento'}</h2><p>El borrador puede quedar incompleto. Los campos * son obligatorios al enviar.</p></div></div>
        <label>Asunto<input name="subject" defaultValue={doc.subject} maxLength={200} required /></label>
        {doc.kind === 'EGRESO' ? <>
          <div className="form-grid"><label>Fecha *<input name="date" type="date" defaultValue={version.data.date} /></label><label>Forma de pago *<select name="payment" defaultValue={version.data.payment || ''}><option value="">Selecciona una opción</option><option value="EFECTIVO">Efectivo</option><option value="TRANSFERENCIA">Transferencia</option></select></label><label>Propietario<input name="owner" defaultValue={version.data.owner} maxLength={500} placeholder="Opcional, si aplica" /></label><label>Arrendatario<input name="tenant" defaultValue={version.data.tenant} maxLength={500} placeholder="Opcional, si aplica" /></label><label>Pagado a *<input name="payee" defaultValue={version.data.payee} maxLength={500} placeholder="Persona o entidad" /></label><label>Valor en pesos colombianos *<input name="amount" inputMode="decimal" type="text" pattern="[0-9]{1,16}([.][0-9]{1,2})?" defaultValue={version.data.amount} placeholder="Ej. 250000.00" /><small className="field-help">Sin separadores de miles. Usa punto para decimales.</small></label></div>
          <label>Concepto *<textarea name="concept" rows={5} defaultValue={version.data.concept} maxLength={20000} placeholder="Describe el motivo del egreso…" /></label>
          <div className="section-caption divided"><span className="step-number">02</span><div><h2>Referencias y recibido físico</h2><p>Opcionales. Puedes dejarlos vacíos para diligenciar a mano al imprimir.</p></div></div>
          <div className="form-grid"><label>Recibe<input name="receiver" maxLength={500} defaultValue={version.data.receiver} /></label><label>N.º C. C.<input name="identity" maxLength={500} defaultValue={version.data.identity} /></label><label>CT N.º<input name="ct" maxLength={500} defaultValue={version.data.ct} /><small className="field-help">Referencia opcional; significado por confirmar.</small></label></div>
        </> : <label>Descripción (opcional)<textarea name="description" rows={5} defaultValue={version.data.description} maxLength={20000} /></label>}
        <div className="form-bottom"><p>Los vistos buenos y la autorización se registran como acciones independientes.</p><button className="button primary" disabled={disabled}><Save size={17} />{disabled ? 'Guardando…' : 'Guardar borrador'}</button></div>
      </form>}
      {tab === 'preview' && <div className="preview"><div className="preview-toolbar"><span><FileText size={17} /> {consecutive(doc.number)} · v{version.number}</span><div>{pdfUrl && <><a href={`${pdfUrl}&download=1`} className="button secondary small-button"><Download size={15} /> Descargar PDF</a><button className="button secondary small-button" onClick={printPDF}><Printer size={15} /> Imprimir</button></>}</div></div>{pdfUrl ? <><iframe ref={frame} key={`${doc.revision}-${version.number}`} title="Vista previa del documento PDF" src={pdfUrl} className="pdf-frame" /><p className="preview-help">Si tu navegador no muestra el visor, <a href={pdfUrl} target="_blank" rel="noreferrer">abre el PDF en otra pestaña</a>. Imprime en horizontal, ajustado al área imprimible.</p></> : <div className="empty-state"><UploadCloud size={36} /><h3>Aún no hay un PDF principal</h3><p>Cárgalo en la pestaña de soportes antes de enviar.</p><button className="button secondary" onClick={() => setTab('files')}>Cargar PDF</button></div>}</div>}
      {tab === 'files' && <div className="file-panel"><h2>Documento y soportes</h2><p className="muted small">Los anexos se conservan como archivos independientes. Solo el origen puede modificarlos antes de enviar o al recibir una devolución.</p>{files.map(file => <div className="file-row" key={file.id}><span className="document-icon"><FileText size={20} /></span><div><strong>{file.original_name}</strong><small>{file.role === 'MAIN' ? 'Documento principal' : 'Soporte'} · {(file.size / 1024).toFixed(1)} KB · {file.mime.split('/')[1].toUpperCase()}</small></div><a className="icon-button" aria-label={`Ver ${file.original_name}`} href={`${base}/files/${file.id}?version=${version.number}`} target="_blank" rel="noreferrer"><Eye size={18} /></a><a className="icon-button" aria-label={`Descargar ${file.original_name}`} href={`${base}/files/${file.id}?version=${version.number}&download=1`}><Download size={18} /></a>{editable && <button disabled={disabled} className="icon-button danger" aria-label={`Retirar ${file.original_name}`} onClick={() => { if (window.confirm('¿Retirar este archivo de la versión editable? Las versiones enviadas lo conservarán.')) perform(() => command('removeFile', { id: doc.id, revision: doc.revision, fileId: file.id })); }}><Trash2 size={17} /></button>}</div>)}
        {editable && <form className="upload-form" onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); const file = form.get('file'); if (file instanceof File && file.size) perform(() => upload(doc.id, doc.revision, file, String(form.get('role')))); }}><label>Agregar archivo<select name="role"><option value="ATTACHMENT">Soporte (PDF, JPG o PNG)</option>{doc.kind === 'UPLOAD' && <option value="MAIN">{main ? 'Reemplazar' : 'Cargar'} PDF principal</option>}</select></label><label className="upload-zone"><UploadCloud size={26} /><strong>Selecciona un archivo desde tu computador</strong><span>PDF, JPG o PNG · Máximo 15 MB · Hasta 30 archivos por versión</span><input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required /></label><button disabled={disabled || dirty} className="button primary"><Paperclip size={16} />{disabled ? 'Cargando…' : 'Adjuntar archivo'}</button></form>}
        {!files.length && !editable && <p className="empty-state">Esta versión no tiene anexos.</p>}
      </div>}
      {tab === 'history' && <div className="history-panel"><h2>Historial del trámite</h2><p className="muted small">Registro independiente del contenido. Recibir, revisar y autorizar son acciones distintas.</p><ol className="timeline">{events.map(ev => <li key={ev.id}><span className={`timeline-mark ${ev.action === 'AUTHORIZED' ? 'approved' : ''}`}>{ev.action === 'AUTHORIZED' ? <ShieldCheck size={14} /> : <span />}</span><div className="timeline-title"><strong>{ACTIONS[ev.action] || ev.action}</strong><time>{dateTime(ev.created_at)}</time></div><p>{ev.actor_name} · {AREAS[ev.area_id]} <span className="version-chip">v{ev.version}</span></p>{ev.details.to && <p className="history-destination">{AREAS[ev.details.from as keyof typeof AREAS]} → {AREAS[ev.details.to as keyof typeof AREAS]}</p>}{ev.note && <blockquote>{ev.note}</blockquote>}</li>)}</ol></div>}
    </section><aside className="document-aside"><section className="panel summary-card"><span className="eyebrow">EN ESTE DOCUMENTO</span><h3>Resumen del trámite</h3><dl><dt>Consecutivo</dt><dd>{consecutive(doc.number)}</dd><dt>Versión consultada</dt><dd>v{version.number} · {version.frozen ? 'Contenido congelado' : 'Editable'}</dd><dt>Área de origen</dt><dd>{AREAS[doc.origin_area]}</dd>{doc.kind === 'EGRESO' && <><dt>Valor guardado</dt><dd className="amount">{cop(version.amount)}</dd></>}<dt>Autorización de esta versión</dt><dd>{authorized ? 'Registrada por Gerencia' : 'Sin autorización'}</dd></dl></section><div className="paper-note"><ShieldCheck size={23} /><h3>La trazabilidad importa.</h3><p>El envío conserva esta versión. Las correcciones generan una nueva, sin reemplazar el historial anterior.</p></div></aside></div>
  </>;
}
