# Verificación de entrega

Fecha: 10 de noviembre de 2026. Entorno: Windows, Node.js 24.14.1, Next.js 16.4.6. Datos exclusivamente ficticios.

## Comprobaciones realizadas

- `npm run typecheck`: sin errores de TypeScript.
- `npm test`: 11 pruebas aprobadas con el motor PostgreSQL embebido en memoria.
- La misma suite de 11 pruebas pasó con PostgreSQL **17.11 real**, iniciado temporalmente en loopback, con base nueva y migraciones reales. Se detuvo el proceso PostgreSQL temporal al finalizar; no se instaló un servicio del sistema.
- `npm run build`: compilación de producción correcta.
- `npm audit --omit=dev`: ninguna vulnerabilidad reportada al verificar la entrega.
- Recorridos de navegador en Chromium: egreso con soporte y descarga, devolución y corrección a v2, vistos buenos y autorización de Gerencia; PDF existente de Cartera a Tesorería; acceso indebido y peticiones de otro origen rechazadas.
- Comprobación móvil a 390 × 844: bandeja sin desbordamiento horizontal de la página; el listado mantiene su desplazamiento dentro de la tabla.

## Evidencias automatizadas

La suite de servidor comprueba monto decimal exacto, conservación de v1, inaccesibilidad del borrador v2 para un receptor anterior, historial inmutable, revocación de sesiones, restricciones de Gerencia y solicitudes concurrentes. Las pruebas de PDF extraen sus textos y verifican coordenadas dentro de cada página, orientación horizontal y conservación del final de un concepto largo y los espacios inferiores.

Las pruebas de navegador hacen solicitudes directas al servidor: autorización desde Contabilidad (403), versión antigua desde Gerencia (409, sin cambiar la revisión), documento y soporte de un área ajena (404), acceso sin sesión (401) y origen externo (403). Las capturas de ejemplo se guardan en `test-results/`, fuera del control de versiones.

## Límites de esta verificación

No se ha usado una impresora física ni se ha certificado el formato como documento fiscal. Falta confirmar dimensiones definitivas, CT N.º y función de la casilla manuscrita. El envío es interno a las bandejas, no por correo. No hay despliegue remoto, firma electrónica ni ejecución de pagos. CI quedó configurado para PostgreSQL 17, pero sus ejecuciones en GitHub dependen de que los cambios se publiquen en el remoto.
