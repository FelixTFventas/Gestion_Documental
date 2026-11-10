import Link from 'next/link';
import { Archive, ArrowUpRight, Check, ShieldCheck } from 'lucide-react';
import { dateTime, type Decision } from '@/lib/types';

export function CompletionCard({ closure, selectedVersion, canOpen, documentId }: { closure: Decision; selectedVersion: number; canOpen: boolean; documentId: string }) {
  return <section className="completion-card" aria-labelledby="completion-title">
    <div className="completion-seal"><ShieldCheck size={32} strokeWidth={1.6} /></div>
    <div className="completion-content"><span className="eyebrow">CIERRE DEL TRÁMITE</span><h2 id="completion-title">Trámite finalizado</h2><p>Autorizado por Gerencia. El documento llegó al final de su recorrido.</p>
      <dl className="completion-facts"><div><dt>Autorizado por</dt><dd>{closure.actor_name}</dd></div><div><dt>Fecha de cierre</dt><dd>{dateTime(closure.created_at)}</dd></div><div><dt>Versión autorizada</dt><dd>v{closure.version}{selectedVersion !== closure.version && canOpen && <Link href={`/documents/${documentId}?version=${closure.version}`}>Ver versión <ArrowUpRight size={13} /></Link>}</dd></div></dl>
      <div className="completion-availability"><Check size={16} /><strong>Sin acciones pendientes.</strong><span>Disponible para consulta, descarga e impresión.</span></div>
      <small>La autorización corresponde solo a la versión indicada. No es ejecución de pago ni firma electrónica.</small>
    </div>
    <Link href="/?tab=finished" className="button secondary"><Archive size={16} /> Ver finalizados</Link>
  </section>;
}
