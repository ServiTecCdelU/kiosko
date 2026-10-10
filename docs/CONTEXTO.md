# Contexto del proyecto — para retomar en otra computadora

Documento de arranque rápido para Claude Code (o cualquier persona) que abre el
repo por primera vez. Resume decisiones de producto, arquitectura real y qué
queda pendiente. Actualizado: **2026-10-03**.

Leer en este orden: `CLAUDE.md` (reglas) → este archivo → el spec puntual de
`docs/superpowers/specs/` si se toca esa área.

---

## 1. Qué es y hacia dónde va

- **Producto**: POS + backoffice para kioscos, despensas y supermercados chicos
  de Argentina. Nombre comercial en la landing/metadatos: **MultiComercioPanel**
  (marca **ServiTec**). El repo y el paquete se siguen llamando `kiosko`.
- **Decisión estratégica (2026-06-19)**: se vende como **SaaS multi-comercio**
  (una plataforma, muchos comercios con suscripción mensual), no como
  instalación por cliente. Por eso todo el dominio es multi-tenant desde el
  principio (`comercio_id` en todas las tablas). Cada comercio cobra con
  su propia cuenta de Mercado Pago.
- **Tres perfiles de comercio** a los que apunta: kiosko (1 operador),
  despensa (fiado + pesables + vencimientos), supermercado (varios cajeros).
- **Proyecto hermano**: `Distribuidora J&J` (`../../Distribuidora J&J`). Solo
  se le lee el catálogo por API pública; base de datos separada.

## 2. Despliegue y URLs

- Hosting: **Vercel**, proyecto `kiosko` (`.vercel/project.json`, no se commitea).
- Repo: `github.com/ServiTecCdelU/kiosko`, rama `main` (se pushea directo).
- Producción se sirve detrás de un proxy en **`https://www.servitec.net.ar/comercio`**
  → en ese deploy `BASE_PATH=/comercio`. En local `BASE_PATH` va vacío.
- Ruteo:
  - `/` → landing pública (`components/landing/`).
  - `/<slug>` → panel de un comercio (`app/[comercio]/`). Los slugs no pueden
    chocar con rutas fijas: ver `RUTAS_RESERVADAS` en `lib/panel.ts`.
  - `/login`, `/pos`, `/caja`, `/stock`, `/ventas`, `/clientes`, `/compras`,
    `/promociones`, `/reportes`, `/usuarios`, `/sincronizacion`.
  - `/superadmin` → panel del dueño del SaaS (todos los comercios).
  - `/pantalla-cliente` y `/ofertas-tv` → pantallas secundarias (visor del
    cliente y TV de ofertas).
- **Alta self-service** (`/registro`, CTA "Probar gratis" de la landing y link en el
  login): "Continuar con Google"; si el correo no tiene comercio, `google-verify` deja
  una cookie firmada `kiosko_registro` (30 min) y lleva al formulario (nombre del
  comercio, rubro, nombre, WhatsApp). `POST /api/registro` llama a la RPC atómica
  `registrar_comercio_autoservicio` (migración 40): comercio en prueba de 14 días +
  admin con ese correo + "Caja 1". Un correo de Google = un comercio; máximo 3 altas
  por IP por hora. Rubro, WhatsApp y origen quedan en `comercios.config`. El panel
  nuevo muestra la tarjeta "Primeros pasos" y el superadmin ve el badge "nuevo".
  Spec: `docs/superpowers/specs/2026-10-03-autoregistro-design.md`.
- **Facturación electrónica AFIP/ARCA** (`/facturacion`, solo admin: **tutorial de 7 pasos** en
  `components/facturacion/tutorial/`, con lo de ARCA como lista para tildar y los errores de ARCA
  explicados en `lib/afip/explicar-error.ts`; spec
  `docs/superpowers/specs/2026-10-03-facturacion-afip-design.md`): Factura C y Nota de
  crédito C con certificado propio de cada comercio. El sistema genera la clave (cifrada
  con `AFIP_CERT_KEY`) y el CSR; el dueño sube el `.crt`. Emisión manual (botón Facturar
  en POS y Ventas) o automática (`after()` en `/api/ventas` y en el webhook de MP).
  Anular o devolver una venta facturada emite la NC sola. Numeración con lock
  (`tomar_lock_afip`) y recuperación por `FECompConsultar` para no duplicar. El acceso WSAA
  se guarda cifrado en `afip_tokens`; si AFIP responde 600 se renueva y se reintenta una
  vez. **Producción de AFIP exige TLS `SECLEVEL=1`** (`lib/server/afip/soap.ts`): sin eso,
  falla con "dh key too small". Dependencia: `node-forge` (solo firmar CMS y generar CSR).
- **Aislamiento SaaS** (auditoría 2026-10-03, reglas en `CLAUDE.md`). Lo que se corrigió:
  login por PIN buscaba en todos los comercios (ahora `verificar_pin_comercio` + código del
  comercio recordado por dispositivo, PIN único por comercio); la sincronización con la
  distribuidora iba fija a `comercio_1` (ahora por comercio, upsert por `(comercio_id, dist_id)`);
  historial de sincronización sin filtro; ids legibles que revelaban datos de otros; 8 tablas con
  `comercio_id default 'comercio_1'` y 4 RPC con ese default (migración 42); funciones viejas sin
  comercio (migración 42); número de ticket de una secuencia global (ahora por comercio,
  `comercio_contadores`); y en el navegador cola offline, catálogo, tickets en espera, caja, lector
  Point y nombre de carteles compartidos entre comercios de la misma PC (ahora por comercio).
- **Modo offline**: service worker bajo el basePath (antes no se registraba en producción y habría
  cacheado la API), catálogo completo paginado, caja recordada sin conexión, y la cola **nunca
  descarta una venta cobrada**: las rechazadas quedan en "Ventas sin conexión" para resolverlas
  (`lib/offline/cola.ts`, candado entre pestañas en `lib/offline/candado.ts`).
- **Backup por comercio**: el admin descarga "Copia de tus datos" desde su panel y el
  superadmin el de cualquier comercio (botón Backup en Administrar). Es un Excel con una
  hoja por tema; las hojas y columnas están en `lib/backup-hojas.ts` (solo se leen esas
  columnas, nunca `*`: el PIN y el token de MP no salen). Lo arma `lib/server/backup.ts`
  paginando de a 1000 filas. Es una lectura (GET), así que anda en modo consulta. No hay
  restauración: para desastres están los backups diarios de Supabase.
- **Demo pública**: comercio con slug `demo`, PIN `1234` (publicado a propósito
  en el login, `lib/demo.ts`). Datos de 15 días regenerables con
  `supabase/38_demo_datos.sql` (solo toca filas `demo_*`).

## 3. Arquitectura (lo que hay que saber antes de tocar código)

### Acceso a datos — todo pasa por el servidor
- El **anon key está revocado y RLS cerrado** (`22_cerrar_anon_rls.sql`). El
  navegador **no** consulta Supabase directo.
- Lecturas: `services/api-client.ts → consultar(ruta, accion, params)` hace POST
  a `/api/consultas/<dominio>`, que expone un **conjunto cerrado de acciones**
  (el cliente nunca manda tablas ni filtros libres).
- Escrituras: rutas `/api/<dominio>` que usan `lib/supabase-admin.ts` (service
  role) y RPCs de Postgres para lo transaccional.
- Lógica de servidor compartida en `lib/server/` (venta, caja, reportes, MP,
  ofertas, ZPL, sesión, rate limit, fecha argentina).

### Sesión y tenant
- Cookie propia `kiosko_sesion`, **firmada con HMAC** (`lib/server/sesion.ts`),
  12 h. El `comercioId` **se toma de la sesión del servidor**
  (`comercioIdDeSesion`), nunca del body. Sin sesión no hay comercio (ya no hay
  fallback a `comercio_1`).
- **`proxy.ts` protege toda `/api`**: valida la cookie y el rol antes de que corra
  la ruta (401 sin sesión, 403 sin permiso). La regla de cada ruta vive en
  `lib/permisos-api.ts` (con tests): públicas solo `/api/auth/*` y el webhook de MP;
  empleados, compras, proveedores, importación, sincronización, reportes y la
  conexión de MP son solo admin. Una ruta nueva pide sesión por defecto.
- **Prueba y estado del comercio** (`lib/acceso-comercio.ts`, con tests): los últimos
  5 días de prueba se avisa; al vencer `trial_hasta` hay 3 días de gracia y después
  **modo consulta** (puede entrar, ver y exportar, pero no vender ni editar).
  `suspendido` y `baja` pasan a modo consulta al instante. Lo aplica `proxy.ts` en
  cada escritura (estado cacheado 60 s, `lib/server/acceso.ts`); el cartel es
  `components/layout/aviso-acceso-banner.tsx`. Exentos: la demo y el superadmin en
  modo soporte. Las ventas de la cola offline que el servidor no puede tomar
  (sesión vencida o modo consulta) **quedan en cola**, no se descartan.
- En el navegador, `useAuth` valida la cookie una vez por carga y un 401 en
  `consultar()` manda al login.
- Login:
  - **Admin del comercio** → Google (Supabase Auth, PKCE en el navegador:
    `app/auth/callback/page.tsx`; verificación server-side en
    `app/api/auth/google-verify`).
  - **Cajero / encargado** → PIN de 6 números, **solo en una PC registrada** por el dueño
    (Caja → PCs…). La PC queda atada a su comercio y su caja; la cajera pone su PIN y entra
    directo a esa caja. 5 errores bloquean la PC 15 min. Quien tenía PIN de 4 entra una última
    vez y elige uno de 6 (`/cambiar-pin`; hasta hacerlo, `proxy.ts` le bloquea la API).
    Cada caja puede tener su punto de venta de AFIP (Caja → Puestos…).
  - **Superadmin** → misma cuenta Google, matcheada contra la tabla `superadmins`.
    Puede "Entrar" a un comercio en modo soporte (`sesion.soporte`).
- Roles: `admin`, `encargado`, `cajero`. Qué ve cada uno: `lib/nav.ts`.
- `hooks/use-auth.ts` guarda el usuario en `sessionStorage` solo para la UI;
  la autorización real es la cookie.

### basePath
- Todo `fetch` a rutas propias usa `apiUrl()` (`lib/utils/api-url.ts`) para
  sumar `NEXT_PUBLIC_BASE_PATH`. Olvidarlo rompe producción (pasó varias veces:
  ver commits `fix: ... BASE_PATH`).
- Metadatos/OG con URL absoluta: `lib/site.ts` (`conBase`, `siteOrigin`).

### Dinero
- Precio **autoritativo en el servidor** (`lib/server/procesar-venta.ts` +
  `lib/pricing.ts`); el cliente no puede fijar precios.
- Venta atómica: RPC `process_sale_kiosko` (stock, movimientos, caja, fiado con
  límite de crédito). Anulación: `anular_venta_kiosko`. Devolución con caja ya
  cerrada: migración 29.
- Multi-caja: una caja abierta **por puesto**, caja por cajero, consolidado del
  día (`lib/consolidado.ts`).
- Mercado Pago QR y Point: `lib/server/mercadopago.ts`, `app/api/mercadopago/*`
  (webhook confirma la venta usando la misma lógica de `procesar-venta`).
  **Cada comercio usa su propia cuenta**: el admin pega su Access Token en la tarjeta
  "Cobros con Mercado Pago" del panel; se valida contra MP y se guarda cifrado con
  AES-256-GCM (`lib/server/cifrado.ts`, `lib/server/mercadopago-credencial.ts`,
  migración 39). El webhook identifica el comercio por `?comercio=` (QR) o por la
  cuenta de MP que cobró (`user_id`, Point). La demo no puede conectar MP.

### Impresión
- **El ticket se imprime desde el navegador** (el servidor está en Vercel y no llega a
  la impresora del local). Modo por PC y por comercio en `localStorage`
  (`lib/impresora/config.ts`), se elige en POS → "Impresora":
  - `navegador` (default): `window.print()` del ticket HTML (`components/pos/ticket-print.tsx`).
  - `webusb`: bytes **ESC/POS** (`lib/escpos.ts`, puro y testeado; 80 o 58 mm, corte,
    cajón) directo a la térmica por WebUSB (`lib/impresora/webusb.ts`, Chrome/Edge).
    En Windows, si el driver `usbprint.sys` tiene la impresora, Chrome no la puede
    reclamar: ahí va el agente.
  - `agente`: los mismos bytes al **agente local** (`herramientas/agente-impresora/`,
    Node sin dependencias en `127.0.0.1:9123`) que escribe en la impresora de Windows
    por `winspool` (PowerShell) o en una de red (`host:9100`). README en la carpeta.
  - `zebra`: ZPL a la **Zebra ZD220** por `/api/imprimir-ticket` (`lib/server/zpl.ts`);
    solo sirve con la app corriendo en la misma PC que la impresora.
  - Si la impresora falla, siempre se cae al ticket del navegador. Orquestador:
    `lib/impresora/imprimir.ts` (`imprimirTicket`, `abrirCajon`).
- **Cajón de dinero**: enchufado a la impresora (RJ11). Se abre solo al cobrar en
  efectivo o mixto (opción) y a mano con "Abrir cajón" en POS y Caja. Solo con
  `webusb` o `agente`. Spec: `docs/superpowers/specs/2026-10-10-impresora-escpos-design.md`.
- La factura electrónica (`components/facturacion/comprobante-fiscal.tsx`) sigue por
  navegador con su QR; pasarla a ESC/POS es el siguiente paso.
- Etiquetas de góndola, carteles A4/A5/A6, folleto e imagen de oferta para
  WhatsApp/Instagram (`lib/imagen-oferta.ts`, `lib/cartel-temas.ts`).

### Offline / PWA
- PWA instalable (`public/manifest.json`, `public/sw.js`). El service worker
  **no cachea en localhost**.
- Cola de ventas offline en IndexedDB (`lib/offline/`, `hooks/use-offline-sync.ts`).

## 4. Base de datos (Supabase propio)

- Migraciones en `supabase/NN_*.sql`, **numeradas y en orden** (hoy 01 → 47).
  Se corren a mano en el SQL Editor de Supabase. Una base nueva = correrlas
  todas en orden (`04_rls_off` queda neutralizada por `22_cerrar_anon_rls`).
- Después de una base nueva: dar de alta el primer superadmin (comentario al
  pie de `33_superadmin.sql`) y configurar el proveedor Google en
  Authentication → Providers (sección 2 del spec de login Google).
- Tablas principales: `comercios`, `usuarios`, `superadmins`, `puestos`,
  `productos`, `stock_movimientos`, `ventas`, `caja` (+ movimientos de caja),
  `clientes` (+ cuenta corriente, puntos), `proveedores`, `compras` (+ `proveedor_pagos`),
  `inventarios` (+ items), `producto_lotes`, `ofertas`/combos (+ historial), sorteos/premios, `sync_log`.
- La siguiente migración es **`48_*.sql`**. Las **44 a 47** (cuenta corriente de proveedores y
  categoría de gastos, inventario, lotes de vencimiento, IVA) se corren **antes** de deployar
  el código que las usa, en ese orden (la 46 redefine funciones que la 44 ya tocó).
  La **42** (`42_aislamiento_saas.sql`) se corre
  **después** de deployar el código del mismo commit (borra funciones que el código viejo usaba). Regla: informar el SQL exacto al
  usuario **antes** de escribir el código que lo usa; el usuario lo corre.
- Las claves reales están en `.env.local` y en `supabase.txt` (ambos en
  `.gitignore`). En otra PC hay que copiarlas a mano: **nunca commitearlas**.

## 5. Variables de entorno

| Variable | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente Supabase del navegador (solo Auth de Google) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role, server-only (todo el acceso a datos) |
| `SESSION_SECRET` | Firma de la cookie (si falta, usa el service role key) |
| `BASE_PATH` | `/comercio` en producción, vacío en local |
| `NEXT_PUBLIC_SITE_URL` | Dominio público para OG (default `www.servitec.net.ar`) |
| `NEXT_PUBLIC_APP_URL` | URL técnica del deploy (webhooks de Mercado Pago) |
| `AFIP_CERT_KEY` | Clave AES-256 (32 bytes base64) que cifra la clave privada AFIP y el acceso WSAA de cada comercio. **Si se pierde, cada comercio genera un pedido de certificado nuevo.** Local y producción usan la misma base: tiene que ser el mismo valor en `.env.local` y en Vercel. |
| `MP_TOKEN_KEY` | Clave AES-256 (32 bytes base64) que cifra el token de MP de cada comercio. **Si se pierde, cada comercio vuelve a cargar su token.** `MP_ACCESS_TOKEN` ya no se usa. |
| `IMPRESORA_ZPL_RAW` | Destino RAW de la Zebra |
| `DISTRIBUIDORA_API_URL` | Sincronización de catálogo |

Tests de integración: `.env.test.local` con `TEST_SUPABASE_URL` y
`TEST_SUPABASE_SERVICE_KEY` de un proyecto Supabase **de prueba** (ver CLAUDE.md).

## 6. Estado de funcionalidades (2026-10-03)

Hecho y en producción: POS con lector y balanza EAN-13 de peso embebido, pago
mixto/fiado/recargo/MP QR/MP Point, tickets en espera, caja con arqueo y
movimientos, multi-caja con puestos y rol encargado, anulación y devolución
post-cierre, stock con vencimientos, favoritos, importación Excel, auditoría de
precios, reposición predictiva, recomendaciones; proveedores y compras con
costo/margen; clientes con fiado, límite de crédito y puntos; ofertas con
vigencia, combos, simulador, historial y ranking, centro de ofertas, carteles,
pantalla TV, premio por compras y sorteos; reportes con Excel/PDF; empleados;
superadmin con modo soporte; aviso de pago mensual (día 7 al 10); landing;
demo con datos; panel por slug; impresora térmica ESC/POS (USB o agente local)
con cajón de dinero; cuenta corriente de proveedores con pagos parciales y bultos en
la recepción; recuento físico de stock (`/stock/inventario`) y mermas con motivo;
vencimientos por lote; IVA por producto; reportes por hora y día de la semana, gastos
por categoría y pérdidas (todo 2026-10-10, specs en `docs/superpowers/specs/2026-10-10-*`).

### Lo que falta para un supermercado (relevado 2026-10-10)

Los seis puntos relevados ese día están hechos. Quedan como siguientes pasos naturales:
- Factura A/B (responsable inscripto), ahora que cada producto tiene IVA.
- Factura electrónica por ESC/POS (hoy sale por el navegador con su QR).
- Recordatorios de vencimiento de pago a proveedores (`compras.vence` ya existe).
- Descontar lotes al vender (hoy la cantidad del lote es informativa).

### Pendiente (lo que sigue del plan maestro)

| # | Ítem | Nota |
|---|---|---|
| 4.1 | Offline completo | Existe la cola de ventas; verificar alcance real antes de prometerlo. |
| — | Factura A/B (responsable inscripto) y CAEA (contingencia) | La v1 cubre Factura C + NC C (monotributo). |
| — | **Probar la facturación con una CUIT real en homologación** | Lo que no se pudo probar sin certificado: CAE real, NC real, impresión con QR. |
| — | Billing de suscripción automático | Hoy solo hay aviso de pago mensual. |

Criterio adoptado: no planificar en el vacío — priorizar según el dolor real
del primer comercio en producción.

## 7. Mapa de documentación

| Archivo | Qué es | Vigencia |
|---|---|---|
| `CLAUDE.md` | Reglas del proyecto y comandos | **Vigente** |
| `docs/CONTEXTO.md` | Este archivo | **Vigente** |
| `docs/PLAN-MAESTRO-2026-09-18.md` | Roadmap consolidado | Vigente como roadmap; su sección 1 quedó vieja (ver §6 acá) |
| `docs/superpowers/specs/*` | Diseños por feature (login PIN, multi-caja, proveedores, devoluciones, login Google) | Referencia del área |
| `docs/superpowers/plans/*` | Planes de implementación ya ejecutados | Historia |
| `docs/ESTUDIO-MERCADO-Y-PLAN.md` | Estudio de mercado y dirección visual "Mostrador" | Referencia de producto |
| `PLAN.md`, `PLAN_MEJORAS.md` | Planes de agosto | Historia (reemplazados por el plan maestro) |
| `AUDITORIA_PAGOS.md` | Auditoría de cobros y cuenta corriente | Historia (corregido en migraciones 18–19) |
| `implementacion-de-ticket-a-ZPL.md` | Notas del ticket Zebra | Referencia de impresión |
