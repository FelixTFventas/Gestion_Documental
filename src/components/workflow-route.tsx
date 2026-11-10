'use client';
import { useEffect, useRef, useState } from 'react';
import { Archive, ArrowLeft, ArrowRight, Check, CircleDot, FilePenLine, RotateCcw } from 'lucide-react';
import { AREAS, dateTime, type Detail } from '@/lib/types';

export function WorkflowRoute({ data }: { data: Detail }) {
  const { doc, steps, closure } = data;
  const finished = doc.status === 'AUTHORIZED';
  const returns = steps.filter(step => step.assignment_action === 'RETURNED').length;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ overflow: false, atStart: true, atEnd: false });
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const update = () => setScroll({ overflow: element.scrollWidth > element.clientWidth + 2, atStart: element.scrollLeft < 2, atEnd: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2 });
    const revealCurrent = () => {
      const target = element.querySelector<HTMLElement>('[aria-current="step"], .route-archive');
      if (target) element.scrollLeft = target.offsetLeft - element.clientWidth / 2 + target.offsetWidth / 2;
      update();
    };
    revealCurrent();
    const observer = new ResizeObserver(revealCurrent);
    observer.observe(element);
    element.addEventListener('scroll', update, { passive: true });
    return () => { observer.disconnect(); element.removeEventListener('scroll', update); };
  }, [doc.current_step, doc.status]);
  function move(direction: number) {
    scrollRef.current?.scrollBy({ left: direction * 330, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  return <section className="panel workflow-route" aria-labelledby="route-title">
    <div className="route-heading"><div><span className="eyebrow">TRAZABILIDAD</span><h2 id="route-title">Recorrido del documento</h2><p>Áreas que realmente participaron, en el orden del trámite.</p></div><div className="route-counts"><span>{steps.length} movimientos</span>{returns > 0 && <span className="return-count"><RotateCcw size={13} />{returns} {returns === 1 ? 'devolución' : 'devoluciones'}</span>}{scroll.overflow && <div className="route-controls"><button type="button" aria-label="Ver pasos anteriores" aria-controls="route-circulation" disabled={scroll.atStart} onClick={() => move(-1)}><ArrowLeft size={16} /></button><button type="button" aria-label="Ver pasos siguientes" aria-controls="route-circulation" disabled={scroll.atEnd} onClick={() => move(1)}><ArrowRight size={16} /></button></div>}</div></div>
    <div ref={scrollRef} id="route-circulation" className="route-scroll" role="region" aria-label="Ruta de circulación" tabIndex={0}><ol className="route-track">
      <li className={`route-stop route-origin ${!steps.length ? 'is-current' : 'is-done'}`} aria-current={!steps.length ? 'step' : undefined}>
        <span className="route-marker">{steps.length ? <Check size={18} /> : <FilePenLine size={18} />}</span><div><span className="route-step-label">ORIGEN</span><strong>{AREAS[doc.origin_area]}</strong><span>{steps.length ? 'Documento preparado' : 'Preparar y enviar borrador'}</span><small>v1 · {dateTime(doc.created_at)}</small></div>
      </li>
      {steps.map((step, index) => {
        const active = step.id === doc.current_step && !finished;
        const returned = step.assignment_action === 'RETURNED';
        const label = step.outcome === 'AUTHORIZED' ? 'Autorizado' : step.outcome === 'RETURNED' ? 'Devuelto con observaciones' : step.closed_at ? 'Paso completado' : active ? doc.status === 'PENDING' ? 'Pendiente de recepción' : doc.status === 'RETURNED' ? 'Corrección pendiente' : 'En revisión' : 'Paso registrado';
        return <li key={step.id} className={`route-stop ${active ? 'is-current' : 'is-done'} ${returned ? 'is-return' : ''}`} aria-current={active ? 'step' : undefined}>
          <span className="route-marker">{active ? <CircleDot size={19} /> : returned ? <RotateCcw size={17} /> : <Check size={18} />}</span><div><span className="route-step-label">{returned ? 'DEVOLUCIÓN' : `PASO ${String(index + 1).padStart(2, '0')}`}</span><strong>{AREAS[step.recipient_area]}</strong><span>{label}</span><small>v{step.version} · {dateTime(step.sent_at)}</small></div>
        </li>;
      })}
      {finished && <li className="route-stop route-archive is-done"><span className="route-marker"><Archive size={19} /></span><div><span className="route-step-label">CIERRE</span><strong>Archivo</strong><span>Trámite finalizado</span><small>v{closure?.version || doc.current_version} · Sin tareas pendientes</small></div></li>}
    </ol></div>
    <div className="route-foot">{finished ? <><Archive size={15} /> El recorrido terminó con la autorización de Gerencia.</> : <><ArrowRight size={15} /> El siguiente destino lo elige el área responsable. No hay áreas intermedias obligatorias.</>}</div>
  </section>;
}
