import { AREAS, type Area, type Doc } from './types';

// Proyección de lectura: no agrega estados ni decisiones que el servidor no registró.
export function workflowSummary(doc: Pick<Doc, 'status' | 'origin_area' | 'responsible_area'>) {
  const finished = doc.status === 'AUTHORIZED';
  const tasks = {
    DRAFT: 'Completar y enviar el borrador',
    PENDING: 'Confirmar recepción',
    RECEIVED: doc.responsible_area === 'gerencia' ? 'Revisar y decidir la autorización' : 'Revisar y continuar el trámite',
    RETURNED: doc.responsible_area === doc.origin_area ? 'Corregir y reenviar' : 'Aclarar o devolver al origen',
    AUTHORIZED: 'Sin acciones pendientes'
  };
  return { finished, location: finished ? 'Archivo' : AREAS[doc.responsible_area], task: tasks[doc.status], label: finished ? 'Finalizado' : doc.status === 'RETURNED' ? 'En corrección' : doc.status === 'DRAFT' ? 'Borrador' : 'En circulación' };
}

export function currentTask(doc: Pick<Doc, 'status' | 'origin_area' | 'responsible_area'>, area: Area | null) {
  const summary = workflowSummary(doc);
  if (summary.finished) return summary.task;
  return area === doc.responsible_area ? `Tu área: ${summary.task.toLowerCase()}` : `${AREAS[doc.responsible_area]}: ${summary.task.toLowerCase()}`;
}
