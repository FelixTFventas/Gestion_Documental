import 'dotenv/config';
import { test, expect, type Page } from '@playwright/test';
const password = process.env.DEMO_PASSWORD!;
const origin = new URL(process.env.APP_URL || 'http://127.0.0.1:3000').origin;
async function signIn(page: Page, area: string) {
  await page.goto('/login');
  if (!page.url().includes('/login')) { await page.getByRole('button', { name: 'Cerrar sesión' }).click(); await expect(page).toHaveURL(/login/); }
  await page.getByLabel('Correo electrónico').fill(`${area}@demo.ftf.test`);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Ingresar al archivo' }).click();
  await expect(page).toHaveURL(/\/$/);
}
async function action(page: Page, name: string, note?: string, area?: string) {
  await page.getByRole('button', { name, exact: true }).click();
  if (area) await page.getByLabel('Área de destino').selectOption(area);
  if (note) await page.getByRole('textbox', { name: /Nota u observación|Qué falta/ }).fill(note);
  const response = page.waitForResponse(r => r.url().endsWith('/api/commands') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  expect((await response).ok()).toBeTruthy();
  await expect(page.getByRole('button', { name: 'Confirmar', exact: true })).toHaveCount(0);
}
async function receive(page: Page) {
  await page.getByRole('button', { name: 'Marcar como recibido', exact: true }).click();
  await expect(page.locator('.status-summary .status')).toHaveText('Recibido');
}
test('egreso completo: PDF, soporte, devolución, corrección, revisiones y autorización', async ({ page, browser }) => {
  await signIn(page, 'arriendos');
  await page.getByRole('link', { name: 'Nuevo documento', exact: true }).first().click();
  await page.getByLabel('Asunto', { exact: true }).fill(`Egreso de aceptación ${Date.now()}`);
  await page.getByRole('button', { name: 'Crear borrador', exact: true }).click();
  await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+$/);
  const path = new URL(page.url()).pathname;
  await page.getByLabel('Fecha *', { exact: true }).fill('2026-11-10');
  await page.getByRole('combobox', { name: 'Forma de pago *', exact: true }).selectOption('TRANSFERENCIA');
  await page.getByLabel('Propietario', { exact: true }).fill('Propietaria ficticia');
  await page.getByLabel('Arrendatario', { exact: true }).fill('Arrendatario ficticio');
  await page.getByLabel('Pagado a *', { exact: true }).fill('Proveedor ficticio S.A.S.');
  await page.getByLabel('Valor en pesos colombianos *').fill('725000.25');
  await page.getByRole('textbox', { name: 'Concepto *', exact: true }).fill('Concepto inicial de mantenimiento');
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await expect(page.getByText('Tienes cambios sin guardar.', { exact: false })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Vista previa', exact: true }).click();
  await expect(page.getByTitle('Vista previa del documento PDF')).toBeVisible();
  const pdfUrl = await page.getByTitle('Vista previa del documento PDF').getAttribute('src');
  const pdf = await page.request.get(pdfUrl!); expect(pdf.status()).toBe(200); expect((await pdf.body()).subarray(0,4).toString()).toBe('%PDF');
  const download = page.waitForEvent('download'); await page.getByRole('link', { name: 'Descargar PDF' }).click(); expect((await download).suggestedFilename()).toMatch(/v1.pdf/);
  await page.getByRole('tab', { name: /Soportes/ }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'soporte-ficticio.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9VQAAAAASUVORK5CYII=', 'base64') });
  await page.getByRole('button', { name: 'Adjuntar archivo', exact: true }).click();
  // La actualización vuelve a la pestaña de datos; consultar el soporte guardado.
  await expect(page.getByRole('tab', { name: 'Soportes (1)' })).toBeVisible();
  await action(page, 'Enviar a un área', 'Revisión inicial', 'administrativa');
  await expect(page.locator('.status-summary .status')).toHaveText('Pendiente de recepción');
  await signIn(page, 'administrativa'); await page.goto(path); await receive(page);
  await action(page, 'Devolver', 'Detallar el concepto del servicio');
  await expect(page.locator('.status-summary .status')).toHaveText('Devuelto para corrección');
  await signIn(page, 'arriendos'); await page.goto(path);
  await page.getByRole('textbox', { name: 'Concepto *', exact: true }).fill('Concepto corregido: revisión detallada del servicio ficticio');
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await expect(page.getByLabel('Versión del documento')).toHaveValue('2');
  await action(page, 'Enviar a un área', 'Corrección realizada', 'administrativa');
  await signIn(page, 'administrativa'); await page.goto(path); await receive(page);
  await action(page, 'Visto bueno'); await action(page, 'Enviar a un área', '', 'contabilidad');
  await signIn(page, 'contabilidad'); await page.goto(path); await receive(page);
  await action(page, 'Visto bueno');
  const base = `/api${path}`;
  const current = await (await page.request.get(base)).json();
  const badAuth = await page.request.post('/api/commands', { headers: { Origin: origin }, data: { command: 'act', payload: { id: path.split('/').pop(), revision: current.doc.revision, version: 2, action: 'authorize' } } });
  expect(badAuth.status()).toBe(403);
  await action(page, 'Enviar a un área', '', 'gerencia');
  await signIn(page, 'gerencia'); await page.goto(path); await receive(page);
  await expect(page.getByText('Sin autorización', { exact: true })).toBeVisible();
  const management = await (await page.request.get(base)).json();
  const staleAuth = await page.request.post('/api/commands', { headers: { Origin: origin }, data: { command: 'act', payload: { id: management.doc.id, revision: management.doc.revision, version: 1, action: 'authorize' } } });
  expect(staleAuth.status()).toBe(409);
  expect((await (await page.request.get(base)).json()).doc.revision).toBe(management.doc.revision);
  await action(page, 'Autorizar');
  await expect(page.locator('.status-summary .status')).toHaveText('Autorizado');
  const authPdf = await page.request.get(`${pdfUrl!.split('?')[0]}?version=2`); expect(authPdf.status()).toBe(200);
  await page.getByRole('tab', { name: 'Historial', exact: true }).click();
  await expect(page.locator('.timeline').getByText('Detallar el concepto del servicio', { exact: true })).toBeVisible();
  await expect(page.getByText('Visto bueno registrado', { exact: true })).toHaveCount(2);
  await expect(page.getByText('Recepción confirmada', { exact: true })).toHaveCount(4);
  await expect(page.getByText('Autorizado por Gerencia', { exact: true })).toHaveCount(1);
  await page.screenshot({ path: 'test-results/tramite-autorizado.png', fullPage: true });
  const stranger = await browser.newContext(); const strangerPage = await stranger.newPage();
  await signIn(strangerPage, 'cartera');
  const forbiddenPdf = await strangerPage.request.get(`${pdfUrl!.split('?')[0]}?version=2`); expect(forbiddenPdf.status()).toBe(404);
  expect((await strangerPage.request.get(`${base}/files/${current.files[0].id}?version=2&download=1`)).status()).toBe(404);
  await strangerPage.goto(path); await expect(strangerPage.getByRole('heading', { name: 'Documento no disponible' })).toBeVisible();
  await stranger.close();
});

test('PDF existente de Cartera a Tesorería y administración sin acceso documental', async ({ page }) => {
  await signIn(page, 'cartera');
  // Obtener un PDF de demostración que ya pertenece a Cartera.
  await page.goto('/?tab=sent'); await page.getByRole('link', { name: /Cuenta de cobro ficticia/ }).first().click();
  const source = await page.getByTitle('Vista previa del documento PDF').getAttribute('src');
  const bytes = await (await page.request.get(source!)).body();
  await page.getByRole('link', { name: 'Nuevo documento', exact: true }).first().click();
  await page.getByText('Subir documento', { exact: true }).click();
  await page.getByLabel('Asunto', { exact: true }).fill(`PDF cargado de aceptación ${Date.now()}`);
  await page.locator('input[type=file]').setInputFiles({ name: 'principal.pdf', mimeType: 'application/pdf', buffer: bytes });
  await page.getByRole('button', { name: 'Crear borrador', exact: true }).click();
  await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+$/); const path = new URL(page.url()).pathname;
  await action(page, 'Enviar a un área', 'Registrar recibido sin plantilla', 'tesoreria');
  await signIn(page, 'tesoreria'); await page.goto(path); await receive(page);
  await page.getByRole('tab', { name: 'Historial', exact: true }).click();
  await expect(page.getByText('Recepción confirmada', { exact: true })).toHaveCount(1);
  await signIn(page, 'admin'); await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Documento no disponible' })).toBeVisible();
  await page.goto('/admin'); await expect(page.getByRole('heading', { name: 'Usuarios y permisos' })).toBeVisible();
});

test('rechaza peticiones de otros orígenes y descargas sin sesión', async ({ request }) => {
  const response = await request.post('/api/commands', { headers: { Origin: 'https://otro.example' }, data: { command: 'create', payload: { kind: 'EGRESO' } } });
  expect(response.status()).toBe(403);
  const file = await request.get('/api/documents/00000000-0000-4000-8000-000000000000/pdf?version=1');
  expect(file.status()).toBe(401);
});

test('la bandeja se adapta a móvil sin desbordar la pantalla', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'arriendos');
  await expect(page.getByRole('heading', { name: 'Todo en orden.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/inicio-movil.png', fullPage: true });
});
