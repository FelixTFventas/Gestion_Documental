'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, FilePlus2, UploadCloud } from 'lucide-react';
import { command, upload } from './client';
export function NewDocument({ allowed }: { allowed: boolean }) {
  const [kind, setKind] = useState('EGRESO'); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [created, setCreated] = useState(''); const router = useRouter();
  if (!allowed) return <div className="notice error">Tu cuenta no tiene un área asignada para crear documentos.</div>;
  return <div className="narrow-page"><Link href="/" className="back-link"><ArrowLeft size={16} /> Volver a documentos</Link><div className="page-heading"><div><span className="eyebrow">NUEVO TRÁMITE</span><h1>¿Cómo quieres comenzar?</h1><p className="muted">Prepara un formato institucional o incorpora un PDF existente.</p></div></div>
    <form className="stack" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError(''); const data = new FormData(e.currentTarget);
      try {
        const { id } = await command<{ id: string }>('create', { kind, subject: String(data.get('subject') || '') }); setCreated(id);
        const file = data.get('file'); if (kind === 'UPLOAD' && file instanceof File && file.size) await upload(id, 0, file, 'MAIN');
        router.push(`/documents/${id}`);
      } catch (e) { setError((e as Error).message); setBusy(false); }
    }}>
      <div className="choice-grid">{[['EGRESO','Diligenciar formato de egreso','Campos editables, PDF institucional y circulación interna.',FilePlus2],['UPLOAD','Subir documento','Conserva tu PDF original y envíalo al área correspondiente.',UploadCloud]].map(([value,title,description,Icon]) => { const Glyph = Icon as typeof FilePlus2; return <label className={`choice-card ${kind === value ? 'selected' : ''}`} key={String(value)}><input type="radio" name="kind" value={String(value)} checked={kind === value} onChange={() => setKind(String(value))} /><Glyph size={30} /><h3>{String(title)}</h3><p>{String(description)}</p></label>; })}</div>
      <section className="panel form-section"><h2>Identificación del documento</h2><label>Asunto<input name="subject" required maxLength={200} placeholder={kind === 'EGRESO' ? 'Ej. Egreso por mantenimiento · Inmueble de prueba' : 'Ej. Factura de servicios · Noviembre'} /></label>{kind === 'UPLOAD' && <label className="upload-zone"><UploadCloud size={27} /><strong>Selecciona el PDF principal</strong><span>Solo PDF · Máximo 15 MB por archivo</span><input type="file" name="file" accept="application/pdf" required /></label>}<p className="muted small">Se creará un borrador privado para tu área. Podrás completar datos y adjuntar soportes antes de enviarlo.</p></section>
      {error && <div role="alert" className="notice error">{error} {created && <Link href={`/documents/${created}`}>Abrir el borrador creado para continuar.</Link>}</div>}
      <div className="form-actions"><Link href="/" className="button secondary">Cancelar</Link><button disabled={busy || Boolean(created)} className="button primary">{busy ? 'Creando…' : 'Crear borrador'}<ArrowRight size={17} /></button></div>
    </form>
  </div>;
}
