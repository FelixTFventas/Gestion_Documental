# Gestión documental · Félix Trujillo Falla Inmobiliaria

Primera versión de la aplicación interna: preparar egresos, guardar borradores, ver/descargar/imprimir PDF, adjuntar soportes y circular documentos entre áreas. También permite cargar un PDF existente sin diligenciar la plantilla.

**Todos los ejemplos y cuentas de demostración son ficticios.** El repositorio es público: no subir documentos reales, contraseñas, bases de datos ni archivos `.env`.

## Requisitos y arranque

- Node.js **24 LTS**, npm y PostgreSQL 17 (o Docker Compose).
- Windows, Linux o macOS. No requiere servicios de terceros para generar PDF ni fuentes de Internet en ejecución.

```sh
git clone https://github.com/FelixTFventas/Gestion_Documental.git
cd Gestion_Documental
npm ci
```

Copiar `.env.example` a `.env` (`Copy-Item .env.example .env` en PowerShell o `cp .env.example .env` en Linux). Configurar las variables antes de arrancar.

### Opción recomendada: PostgreSQL

```sh
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

Abrir **http://127.0.0.1:3000**. Usar exactamente ese origen; `APP_URL` protege las operaciones frente a solicitudes de otros sitios. Si se usa otro dominio o puerto, cambiarlo en `.env` y reiniciar.

`db:migrate` aplica las migraciones SQL en orden y dentro de transacciones, con bloqueo y checksum. No modificar una migración ya aplicada: crear otra. `db:seed` no cambia cuentas ni contraseñas existentes y solo agrega documentos iniciales si la base no contiene documentos.

### Alternativa local sin Docker

Cambiar la línea de `.env`:

```dotenv
DATABASE_URL=pglite://./.local/database
```

Después ejecutar `db:migrate`, `db:seed` y `dev` como arriba. PGlite es un motor PostgreSQL embebido persistente para **desarrollo de una sola instancia**, no SQLite ni el despliegue recomendado. **Detener el servidor antes de ejecutar migraciones, provisión o seed sobre PGlite**; no abrir el mismo directorio desde varios procesos. En producción se exige la conexión PostgreSQL; `ALLOW_LOCAL_PGLITE=true` es solo un escape explícito para comprobar localmente un build.

## Variables de entorno

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Conexión privada PostgreSQL; `pglite://...` solo para desarrollo |
| `APP_URL` | Origen exacto de la aplicación, sin rutas; HTTPS en producción |
| `STORAGE_PATH` | Directorio privado persistente, por defecto `./.local/files`; nunca dentro de `public` |
| `MAX_FILE_MB` | Máximo por archivo, 15 por defecto, límite técnico 50 |
| `DEMO_PASSWORD` | Contraseña de 12–72 caracteres para las cuentas ficticias |
| `BOOTSTRAP_EMAIL` | Correo de Gerencia inicial; solo durante la provisión |
| `BOOTSTRAP_PASSWORD` | Contraseña de provisión de 16–72 caracteres; retirarla después |
| `TEST_DATABASE_URL` | Opcional: PostgreSQL **vacío y descartable**, exclusivo de pruebas |

La contraseña de Compose es únicamente de desarrollo. Cambiar `POSTGRES_PASSWORD` y `DATABASE_URL` de forma coherente si se sustituye; no exponer el puerto a Internet. Para PostgreSQL remoto configurar TLS y credenciales conforme al proveedor, sin desactivar validación de certificados.

## Cuentas de demostración

Todas usan la contraseña definida en `DEMO_PASSWORD`. `.env.example` incluye `Demo-documental-2026!`, exclusivamente para trabajo local.

| Cuenta | Área / permiso |
| --- | --- |
| `arriendos@demo.ftf.test` | Arriendos |
| `administrativa@demo.ftf.test` | Dirección Administrativa |
| `contabilidad@demo.ftf.test` | Contabilidad |
| `gerencia@demo.ftf.test` | Gerencia, acceso general y autorización |
| `tesoreria@demo.ftf.test` | Tesorería |
| `cartera@demo.ftf.test` | Cartera |
| `admin@demo.ftf.test` | Administración de usuarios, **sin área ni acceso documental** |

Se incluyen un egreso remitido de Arriendos a Dirección Administrativa con soporte, un borrador incompleto de Arriendos y un PDF de Cartera enviado a Tesorería. Cambiar de cuenta mediante **Cerrar sesión**; no hay suplantación de usuarios.

## Uso

1. **Nuevo documento** → **Diligenciar formato de egreso** o **Subir documento**.
2. Completar los datos y **Guardar borrador**. Se admiten campos vacíos. El asunto identifica el documento; fecha, forma de pago, Pagado a, valor positivo y concepto se validan al enviar el egreso.
3. **Soportes** permite anexar PDF, JPG o PNG desde el computador. En documentos cargados se puede cargar/reemplazar el PDF principal. Las imágenes nunca se convierten a PDF. Máximo 30 archivos por versión.
4. **Vista previa** muestra exclusivamente los datos ya guardados. Permite **Descargar PDF** e **Imprimir**. El visor nativo puede solicitar abrir el archivo en otra pestaña; usar su botón de impresión o `Ctrl+P`. Seleccionar horizontal y ajustar al área imprimible.
5. **Enviar a un área** congela la versión, cierra el paso anterior y abre una tarea pendiente para la destinataria.
6. La receptora pulsa **Marcar como recibido**. Dirección Administrativa y Contabilidad pueden registrar explícitamente su **Visto bueno**, independiente de la recepción. El PDF no inventa revisiones ni firmas.
7. **Devolver** exige explicar qué falta y asigna la tarea al remitente de ese paso. Un área intermedia puede aclarar mediante nota y reenviar la misma versión, o devolver al origen. Solo el origen corrige campos o archivos cuando tiene el documento devuelto; la primera edición crea una nueva versión y conserva las anteriores.
8. Gerencia recibe, revisa en vista previa y puede **Autorizar**. La decisión cierra el paso y pertenece a esa versión exacta. No ejecuta pagos ni equivale a firma electrónica. En un PDF cargado, la decisión se consulta en el detalle y el historial: el archivo original no se modifica.

El recorrido es libre: no se impone la participación de Tesorería o Cartera. Ejemplo: Arriendos → Dirección Administrativa → Contabilidad → Gerencia.

El consecutivo es un identificador interno de búsqueda, no numeración fiscal ni garantía de secuencia sin saltos. PostgreSQL puede reservar números o consumirlos en transacciones que luego se revierten.

### Versiones y decisiones

El contenido enviado, el asunto y la relación de archivos se congelan. Cada decisión conserva usuario, nombre histórico, área, fecha y versión. Las versiones nuevas no heredan vistos buenos ni autorización. El PDF institucional es una **representación del contenido congelado más las decisiones registradas para esa versión**; puede reflejar un visto bueno o autorización posterior sin modificar el contenido enviado. No se reemplazan versiones anteriores ni los PDF originales cargados.

Un área participante conserva el acceso al historial, pero no a borradores nuevos ni a versiones que todavía no se le han remitido. El origen consulta todas sus versiones y Gerencia tiene acceso general. Incluso Gerencia solo puede recibir, devolver o autorizar cuando tiene asignado el paso correspondiente. Los eventos distinguen recepción, visto bueno y autorización.

## Administración y provisión inicial

**No ejecutar `db:seed` en una base real.** Para una instalación limpia:

1. Configurar PostgreSQL y ejecutar `npm run db:migrate`.
2. Establecer `BOOTSTRAP_EMAIL` y `BOOTSTRAP_PASSWORD` mediante un canal reservado en el servidor.
3. Ejecutar `npm run gerencia:provision` una sola vez.
4. Retirar ambas variables del entorno. Ingresar con esa cuenta y crear las cuentas individuales.

La cuenta inicial tiene dos permisos **independientes**: membresía de Gerencia y administración, para permitir la configuración inicial. El alta queda auditada como `BOOTSTRAP_GERENCIA`. El comando falla si ya existe cualquier cuenta de Gerencia; no es una vía de recuperación ni de escalamiento habitual.

En **Usuarios y permisos**, administración crea/desactiva usuarios y asigna áreas ordinarias. No puede crear, mover, reactivar, desactivar ni restablecer credenciales de una cuenta de Gerencia. Esas operaciones requieren una cuenta activa que ya pertenezca a Gerencia; disponer solo del rol administrativo no basta. Gerencia puede gestionar sus cuentas, pero necesita también el rol administrativo para conceder ese rol o gestionar cuentas ordinarias. Siempre queda al menos un gerente activo. Se recomienda provisionar una segunda cuenta individual de Gerencia para continuidad.

Cualquier cambio de cuenta revoca todas sus sesiones; no elimina usuarios, documentos ni historial. El registro de administración es independiente del documental y no almacena contraseñas. Si se pierde el acceso a todas las cuentas de Gerencia, la recuperación requiere un procedimiento excepcional de servidor, respaldos y auditoría institucional; no hay un endpoint público de recuperación privilegiada.

## Almacenamiento y seguridad

- Archivos privados con claves UUID, hash SHA-256, tamaño, nombre original y tipo detectado por contenido, no por extensión. PDF principal únicamente; anexos PDF/JPG/PNG. Los PDF incompletos o con mecanismos activos comunes se rechazan. Esto **no sustituye un antivirus** ni garantiza desactivar contenido malicioso ofuscado; para documentos externos en producción añadir análisis antimalware antes de habilitarlos.
- Descargas siempre a través de rutas autenticadas, verificando área, documento, versión y relación exacta con el archivo. Respuestas privadas sin caché, `nosniff`, visualización de originales con sandbox, sin rutas públicas de almacenamiento.
- Las imágenes y originales se conservan sin modificación. Retirar un soporte del borrador no elimina el objeto que necesitan versiones históricas. Los fallos de vinculación limpian el archivo recién escrito; un corte de proceso puede dejar un objeto huérfano. No hay purga automática: establecer política de retención y limpieza de huérfanos con respaldo.
- El adaptador de esta entrega es **disco privado**. Desplegar en un servidor Node con volumen persistente; no usar un filesystem efímero/serverless. Para varias réplicas se requiere volumen privado compartido o incorporar un adaptador de objetos privado. No está implementado S3.
- Contraseñas bcrypt, sesiones de 8 horas con token aleatorio almacenado como hash, cookie HttpOnly/SameSite Strict y Secure con HTTPS, control de origen y límite de intentos de acceso. Configurar además límites de solicitudes en el proxy para exposición pública.
- Autorización y transiciones validadas otra vez dentro de transacciones. Bloqueo de documento, revisión optimista y restricción de paso activo impiden doble envío/autorización; una petición obsoleta devuelve 409, sin aplicar eventos parciales.
- Triggers protegen contenido enviado, relación de adjuntos e historial. Usar una cuenta PostgreSQL de ejecución con privilegios mínimos, distinta del propietario de migraciones. No conceder permisos de propietario/superusuario a la aplicación en producción.
- Logs de errores sin contenido de formularios, archivos, notas ni credenciales. Configurar proxy y observabilidad para no registrar cuerpos ni cookies.
- Copiar conjuntamente PostgreSQL y `STORAGE_PATH`, cifrar backups y probar restauraciones. Mantener la base y el volumen fuera del acceso web directo.

## Pruebas

```sh
npm run typecheck
npm test
npm run build
```

La suite predeterminada aplica las migraciones reales a un PostgreSQL embebido en memoria y cubre los recorridos, precisión monetaria, permisos, versiones, historial inmutable, sesiones, Gerencia, concurrencia y generación de PDF. Examina el texto y las coordenadas del PDF horizontal multipágina para comprobar que no se cortan campos ni el bloque de firmas. No envía documentos a ningún servicio externo.

Las decisiones de arquitectura, la tabla de transiciones y los límites operativos están en [`docs/arquitectura.md`](docs/arquitectura.md).

Para ejecutar la misma suite contra PostgreSQL real, definir `TEST_DATABASE_URL` apuntando a una **base nueva, vacía y descartable** y ejecutar `npm test`. Si detecta tablas documentales existentes, se niega a continuar. La suite deja sus datos de prueba; no borra bases existentes. CI configura PostgreSQL 17 para estas pruebas.

Pruebas en navegador, con `.env`, migraciones y seed previamente preparados:

```sh
npx playwright install chromium
npm run test:e2e
```

Playwright arranca o reutiliza el servidor de desarrollo. Crea documentos ficticios adicionales en la base de demostración y verifica:

| Aceptación | Verificación |
| --- | --- |
| 1 | Formulario guardado, visor PDF, descarga y soporte desde el computador; geometría del PDF en suite de servidor |
| 2 | Dirección Administrativa recibe/devuelve con motivo, Arriendos corrige a v2 y conserva v1 |
| 3 | Dirección Administrativa y Contabilidad dan visto bueno y reenvían; no existe autorización anticipada |
| 4 | Gerencia autoriza desde vista previa; PDF incluye su decisión; eventos de recepción y revisión separados |
| 5 | PDF existente de Cartera a Tesorería, con recepción sin plantilla |
| 6 | Área ajena y administrador sin acceso, petición directa no autorizada, versión obsoleta y carreras rechazadas |

Para comprobar la impresión física, descargar un egreso corto y otro largo y revisar la vista de impresión del navegador; las pruebas no controlan márgenes/configuración de una impresora real. Capturas y trazas de navegador quedan en `test-results` cuando corresponde, ignoradas por Git. No ejecutar las pruebas de navegador con documentos reales.

## Producción

```sh
npm ci
npm run db:migrate
npm run build
npm start
```

Configurar primero PostgreSQL real, `APP_URL=https://...`, almacenamiento persistente privado, TLS/proxy inverso y provisión inicial sin seed. `start` escucha en 127.0.0.1 para publicarse exclusivamente mediante el proxy. No hay un despliegue remoto provisionado por esta entrega.

## Estructura

```text
migrations/                 Esquema, índices, restricciones y triggers
scripts/                    Migraciones, datos ficticios y provisión única
src/lib/auth.ts             Autenticación y sesiones
src/lib/admin.ts            Membresías privilegiadas y administración
src/lib/documents.ts        Permisos, versiones y circulación transaccional
src/lib/storage.ts          Validación y almacenamiento privado
src/lib/pdf.tsx             Formato institucional horizontal
src/app/                    Pantallas Next.js y rutas autenticadas
src/components/             Interfaz institucional
tests/                      Pruebas de servidor y PDF
e2e/                        Recorridos reales en navegador
```

## Referencia del papel y pendientes

Se utilizó la fotografía aportada y `logo.2.png` (incluido como `public/logo.png`). Se conserva el encabezado, fecha, propietario, arrendatario, Pagado a, valor, concepto, vistos buenos y recibido inferior. La anotación manuscrita de transferencia se transforma en un selector digital. Se parte de **A4 horizontal**, sin suponer medidas exactas de la hoja fotografiada; confirmar si se necesita Carta u otro tamaño.

Pendiente de confirmación institucional: significado de **CT N.º**, función de la casilla dibujada, dimensiones físicas definitivas y eventual ajuste de la denominación de Dirección Administrativa. CT N.º es texto opcional y la casilla no genera reglas. Los espacios de firma física pueden quedar vacíos. El acuse de recibido del sistema no diligencia automáticamente el recibido físico.

Fuera de esta versión: SIMI, OCR, conversión de fotografías, editor de plantillas, firma electrónica, ejecución de pagos, nómina, anticipos y parcialidades. Las licencias de las fuentes locales están en `public/fonts`; el logo es un recurso institucional suministrado por el solicitante.
