'use client';
export async function command<T = unknown>(name: string, payload: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch('/api/commands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: name, payload }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No fue posible completar la solicitud.');
  return data.result as T;
}
export async function upload(id: string, revision: number, file: File, role: string) {
  const form = new FormData();
  form.set('file', file); form.set('revision', String(revision)); form.set('role', role);
  const response = await fetch(`/api/documents/${id}/upload`, { method: 'POST', body: form });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo cargar el archivo.');
}
