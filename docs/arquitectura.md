# Decisiones de arquitectura · V1

## Límites del servidor

Las páginas verifican la sesión antes de consultar datos. Los comandos usan una ruta POST con validación Zod y control estricto de Origin; los servicios vuelven a leer la cuenta activa y sus permisos dentro de la transacción. Las rutas de lectura, PDF y archivos aplican la misma política documental. Ocultar un botón nunca es la barrera de seguridad.

El cliente no decide quién puede autorizar, qué versión está vigente ni qué área es responsable. El identificador del actor sale de la sesión, nunca del formulario. Todas las consultas usan parámetros SQL; los únicos fragmentos SQL dinámicos proceden de listas internas fijas.

## Estado y pasos

| Acción | Estado de entrada | Requisitos | Resultado |
| --- | --- | --- | --- |
| Crear | — | Área asignada | Borrador del origen, v1 |
| Guardar / adjuntar / retirar | Borrador o Devuelto | Origen y responsable actual | Misma versión editable, o nueva versión si la anterior fue enviada |
| Enviar | Borrador, Recibido o Devuelto | Responsable actual, destino diferente, datos completos; nota si un intermediario aclara una devolución | Congela versión, cierra paso previo, nuevo paso Pendiente |
| Recibir | Pendiente | Receptora actual | Recibido; evento independiente |
| Visto bueno | Recibido | Dirección Administrativa o Contabilidad, receptora actual | Decisión por versión; el paso continúa abierto |
| Devolver | Pendiente o Recibido | Receptora actual y motivo | Cierra paso y crea asignación Devuelta al remitente |
| Devolver al origen | Devuelto | Área intermedia responsable y motivo | Asignación Devuelta al origen |
| Autorizar | Recibido | Gerencia responsable, versión vigente | Decisión por versión, paso cerrado, Autorizado |

Las asignaciones de devolución se almacenan también como pasos para conservar quién remitió y quién recibió la tarea de corrección. Su estado documental es **Devuelto**, no un envío ordinario pendiente de recepción. El evento y el desenlace del paso distinguen ambas situaciones. Cuando el origen prepara v2, el paso de devolución conserva la referencia a v1; el nuevo envío relaciona v2 y cierra la tarea de corrección.

No existe cierre por pago, ni una aprobación implícita por recepción o reenvío. No se permite corregir un documento autorizado: una eventual reapertura será una función futura con reglas explícitas, no una mutación silenciosa del egreso aprobado.

## Congelación e historial

- `documents` contiene el consecutivo, estado y asignación actuales, además de `revision` para concurrencia.
- `versions` conserva asunto, campos y monto `numeric(18,2)` por versión. El monto se transporta como cadena decimal, nunca se convierte a `number` para almacenarlo o formatearlo.
- `version_files` vincula objetos privados inmutables a versiones. Una corrección copia las relaciones de la versión anterior y permite reemplazarlas sin afectar el original.
- `steps` registra los envíos y tareas de devolución. Un índice único parcial garantiza un solo paso abierto por documento.
- `decisions` almacena revisiones y autorización por versión exacta, con usuario, nombre histórico, área y fecha.
- `events` es un historial append-only, con secuencia para ordenar eventos incluso si comparten fecha en una transacción. `admin_events` es un registro separado de seguridad.
- Los triggers impiden cambios accidentales en versiones congeladas, relaciones de archivos enviadas e historial. No sustituyen la autorización de la aplicación ni protegen frente a un superusuario PostgreSQL.

El documento puede tener una versión vigente en corrección que aún no sea visible para un participante. La consulta selecciona su última versión remitida, y no revela el asunto editado de un borrador nuevo. Gerencia y origen sí consultan todas las versiones; la vista general no concede a Gerencia acciones sobre pasos asignados a otra área.

## Atomicidad y archivos

Cada transición bloquea la fila documental y verifica `revision` y versión antes de modificarla. Estado, pasos, decisiones y eventos se confirman en la misma transacción. Un doble clic recibe conflicto, sin duplicar decisiones ni dejar pasos abiertos múltiples.

PostgreSQL y el filesystem no comparten una transacción distribuida. La carga valida el permiso antes de leer el archivo, escribe con clave aleatoria y vuelve a validar permisos/revisión antes de vincularlo en una transacción. Si falla, elimina el objeto recién creado. Si el proceso termina inesperadamente entre escritura y vinculación, puede quedar un objeto huérfano; no queda accesible mediante la API. La limpieza futura debe comparar objetos contra la tabla `files`, respetar un período de gracia y no eliminar objetos referenciados por versiones históricas.

## Alcance operativo

V1 está preparada para un servidor Node y PostgreSQL con disco privado persistente. El adaptador PGlite facilita desarrollo/pruebas, no varias réplicas ni producción. No hay antivirus, motor de firma electrónica, envío por correo ni integración con sistemas de pagos. “Enviar a un área” significa asignación en la bandeja interna, no entrega por un canal externo.

Antes de usar datos reales: configurar TLS, backups, permisos de sistema y BD mínimos, análisis antimalware según riesgo, límites del proxy, revisión institucional de la plantilla y validación de impresión física. Los cambios de versión del PDF no convierten los vistos buenos en una firma electrónica.
