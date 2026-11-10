export const AREAS = {
  gerencia: 'Gerencia', administrativa: 'Dirección Administrativa', tesoreria: 'Tesorería',
  contabilidad: 'Contabilidad', arriendos: 'Arriendos', cartera: 'Cartera'
} as const;
export type Area = keyof typeof AREAS;
export type User = { id: string; email: string; name: string; area_id: Area | null; is_admin: boolean; active: boolean };
export type Status = 'DRAFT' | 'PENDING' | 'RECEIVED' | 'RETURNED' | 'AUTHORIZED';
export const STATUS: Record<Status, string> = { DRAFT: 'Borrador', PENDING: 'Pendiente de recepción', RECEIVED: 'Recibido', RETURNED: 'Devuelto para corrección', AUTHORIZED: 'Autorizado' };
export const ACTIONS: Record<string, string> = { CREATED: 'Documento creado', SAVED: 'Borrador guardado', CORRECTED: 'Nueva versión preparada', SENT: 'Enviado', RECEIVED: 'Recepción confirmada', VISA: 'Visto bueno registrado', RETURNED: 'Devuelto para corrección', AUTHORIZED: 'Autorizado por Gerencia', FILE_ADDED: 'Archivo adjuntado', FILE_REMOVED: 'Archivo retirado' };
export type Egreso = { date?: string; payment?: 'EFECTIVO' | 'TRANSFERENCIA'; owner?: string; tenant?: string; payee?: string; amount?: string; concept?: string; receiver?: string; identity?: string; ct?: string; description?: string };
export type Doc = { id: string; number: string; subject: string; kind: 'EGRESO' | 'UPLOAD'; origin_area: Area; responsible_area: Area; status: Status; current_version: number; current_step: string | null; revision: number; created_at: string; updated_at: string };
export type Version = { document_id: string; number: number; subject: string; data: Egreso; amount: string | null; frozen: boolean; created_at: string };
export type StoredFile = { id: string; storage_key: string; original_name: string; mime: string; size: number; sha256: string; role: 'MAIN' | 'ATTACHMENT' };
export type Decision = { id: string; kind: 'VISA' | 'AUTHORIZE'; area_id: Area; actor_name: string; created_at: string; version: number };
export type HistoryEvent = { id: string; action: string; actor_name: string; area_id: Area; version: number; note: string; details: Record<string, string>; created_at: string };
export type Detail = { doc: Doc; version: Version; versions: { number: number; frozen: boolean }[]; files: StoredFile[]; decisions: Decision[]; events: HistoryEvent[]; returnArea: Area | null };
export const consecutive = (number: string | number) => `EG-${String(number).padStart(6, '0')}`;
export function cop(value?: string | null) {
  if (!value) return '—';
  const [integer, fraction = ''] = value.split('.');
  return `$ ${BigInt(integer).toLocaleString('es-CO')},${fraction.padEnd(2, '0')}`;
}
export const dateTime = (value: string) => new Date(value).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' });
