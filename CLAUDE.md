# CLAUDE.md

Guía para Claude Code al trabajar en este repositorio.

**Siempre responder en español.**

NOMBRE: Kiosko Despensa — POS + backoffice SaaS multi-comercio para kioscos,
despensas y supermercados chicos (nombre comercial: **MultiComercioPanel**, marca ServiTec).

> **Al empezar en una computadora nueva o sin contexto: leer `docs/CONTEXTO.md`.**
> Ahí están las decisiones de producto, la arquitectura real, el deploy, el estado
> de cada funcionalidad y lo pendiente.

## Decisión de producto
Se vende como **SaaS multi-comercio** (muchos comercios con suscripción, no
instalación por cliente). Todo el dominio es multi-tenant: cualquier tabla nueva
lleva `comercio_id` y toda consulta se filtra por el comercio de la sesión.

## Relación con la Distribuidora
Sistema independiente, hermano de `Distribuidora J&J` (`../../Distribuidora J&J`).
Comparte stack y estilo visual pero tiene **base de datos Supabase propia y separada**.

- **Sincronización**: trae el catálogo (nombre, precio, categoría) desde la API pública
  de la distribuidora (`DISTRIBUIDORA_API_URL` + `/api/public/productos`) y hace upsert
  por código. **Nunca pisa el stock local** — el stock del kiosko es propio.
- No comparte ventas, caja ni stock con la distribuidora.

## Commands

```bash
npm run dev       # Servidor de desarrollo
npm run build     # Build de producción (errores TS ignorados — ver next.config.mjs)
npm run lint      # ESLint
npm run start     # Servidor de producción
npm test          # Tests unitarios (node:test nativo, sin dependencias)
npm run test:db   # Tests contra una base Supabase de PRUEBA (ver abajo)
```

### Tests
Se usa el runner incorporado de Node (`node:test`), sin librerías extra. Los
archivos son `lib/**/*.test.ts` y los imports entre módulos locales necesitan
la extensión `.ts` (Node resuelve ESM de forma estricta).

`npm test` cubre la lógica pura: precios y ofertas (`pricing`, `oferta-*`),
arqueo, consolidado multi-caja, crédito, compras, balanza EAN-13,
recomendaciones, aviso de pago, etc. Corre en milisegundos y no toca ninguna base.

`npm run test:db` (`tests/db/`) prueba las RPC de Postgres —venta, anulación,
reposición— contra una base **real**. Si no está configurada, los tests se
saltan solos; nunca fallan por eso.

#### Armar la base de prueba (una sola vez)
1. Crear un proyecto Supabase nuevo y **gratuito**, aparte del de producción.
2. Correr ahí todas las migraciones `supabase/NN_*.sql`, en orden.
3. Crear `.env.test.local` en la raíz (está en `.gitignore`):
   ```
   TEST_SUPABASE_URL=https://xxxx.supabase.co
   TEST_SUPABASE_SERVICE_KEY=sb_secret_...
   ```

**Los tests borran datos.** Cada uno crea su propio comercio aislado y lo limpia
al terminar, pero por las dudas el arnés aborta si `TEST_SUPABASE_URL` coincide
con la URL de producción. Nunca apuntar esto al proyecto real.

## Reglas del Proyecto

### Antes de hacer cambios
- Analizar el código existente y mantener la arquitectura actual.
- No romper estilos ni componentes existentes. Revisar estilos antes de tocar visual.
- **Si el cambio requiere columnas o tablas nuevas en Supabase**: informar el SQL exacto
  (`ALTER TABLE` / `CREATE TABLE`) ANTES de escribir el código que las usa. El usuario
  ejecuta el SQL primero y después se implementa el código.
- El SQL nuevo va en `supabase/NN_descripcion.sql` con el siguiente número libre
  (hoy la última es `40`), no destructivo y re-ejecutable cuando se pueda.
- Features grandes: spec en `docs/superpowers/specs/AAAA-MM-DD-<tema>-design.md` antes de codear.
- Lógica de plata nueva: test en `lib/**/*.test.ts` (y en `tests/db/` si toca una RPC).

### Convenciones de arquitectura (no romper)
- **El navegador no consulta Supabase directo** (anon key revocado, RLS cerrado).
  Lecturas: `consultar()` de `services/api-client.ts` → `/api/consultas/<dominio>` con
  acciones cerradas. Escrituras: rutas `/api/*` con `lib/supabase-admin.ts` + RPCs.
- **`proxy.ts` es la guardia de toda `/api`**: sin sesión → 401, rol insuficiente → 403.
  La regla de cada ruta está en `lib/permisos-api.ts` (falla cerrado: una ruta nueva pide
  sesión). Si una ruta nueva es solo de admin, sumarla a `RUTAS_ADMIN`.
- **Modo consulta**: un comercio con la prueba vencida (+3 días de gracia), suspendido o
  dado de baja no puede escribir; `proxy.ts` corta todo lo que no sea lectura
  (`esLectura` en `lib/acceso-comercio.ts`). Si una ruta nueva solo lee pero va por POST,
  ponerla bajo `/api/consultas/`.
- **`comercioId` sale de la sesión del servidor** (`comercioIdDeSesion` en
  `lib/server/sesion.ts`), nunca del body del request.
- **Todo `fetch` a rutas propias usa `apiUrl()`** (`lib/utils/api-url.ts`): en producción
  la app corre bajo `BASE_PATH=/comercio`. URLs absolutas para metadatos: `lib/site.ts`.
- Precio siempre autoritativo en el servidor (`lib/server/procesar-venta.ts`).
- Fechas de negocio en hora argentina: `lib/server/fecha-argentina.ts`.
- Un slug de comercio no puede ser una ruta de la app: `RUTAS_RESERVADAS` en `lib/panel.ts`
  (agregar ahí cualquier ruta nueva de primer nivel).

### Después de hacer cambios — commit y push
Un solo commit y push cuando todo funcione o se terminen todos los cambios de un mensaje.
1. `npm run build` y verificar que no haya errores.
2. `git add` de los archivos modificados.
3. Commit con mensaje en español, imperativo.
4. `git push origin main`.

### Commit conventions (Conventional Commits)
- `feat:` nuevas funcionalidades · `fix:` correcciones · `refactor:` mejoras internas
- `style:` cambios visuales · `docs:` documentación · `chore:` tareas varias
- **NUNCA** agregar `Co-Authored-By` ni referencias a Claude/AI en los commits.

### Estilo visual
- Border-radius estándar: `rounded-2xl`
- Paleta principal: teal/cyan (mismas variables CSS que la distribuidora), identidad
  "Mostrador" (teal noche + lima dinero) aplicada en todas las pantallas
- shadcn/ui (new-york), Tailwind v4, lucide-react

### Prohibiciones
- No instalar librerías nuevas sin consultar.
- No crear componentes nuevos si ya existe uno similar — reutilizar.
- No modificar `next.config.mjs`.
- No commitear secretos: `.env.local` y `supabase.txt` están en `.gitignore`.

## Stack
- Next.js 16 (App Router), React 19, Tailwind CSS v4, shadcn/ui
- Supabase PostgreSQL (proyecto propio) + Supabase Auth solo para login con Google
- Forms: react-hook-form + zod · Charts: recharts · Toasts: sonner
- Excel: xlsx-js-style · PDF: jspdf + autotable · Códigos: @zxing (lector), qrcode
- Impresión: ZPL directo a Zebra ZD220 (`lib/server/zpl.ts`) con fallback al navegador
- PWA con cola de ventas offline (`lib/offline/`)
- Deploy: Vercel (proyecto `kiosko`), servido en `www.servitec.net.ar/comercio`

## Auth y roles
- Admin del comercio: Google · Cajero/encargado: PIN · Superadmin del SaaS: Google +
  tabla `superadmins` (panel `/superadmin`, puede entrar a un comercio en modo soporte).
- Roles `admin` / `encargado` / `cajero`; visibilidad de pantallas en `lib/nav.ts`.
- Sesión: cookie `kiosko_sesion` firmada con HMAC (12 h). Demo pública: slug `demo`, PIN `1234`.
- Alta self-service en `/registro`: Google → formulario → comercio en prueba (RPC atómica
  `registrar_comercio_autoservicio`, migración 40). Un correo de Google = un comercio.
- Buscar por correo con `.ilike()` **siempre** con `patronCorreoExacto()` (`lib/correo.ts`):
  `_` y `%` son comodines y dejarían entrar a otra cuenta.

## Variables de Entorno
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`SESSION_SECRET`, `BASE_PATH`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`,
`MP_TOKEN_KEY`, `IMPRESORA_ZPL_RAW`, `DISTRIBUIDORA_API_URL`.
Detalle de cada una en `docs/CONTEXTO.md` §5.

## Roadmap
Referencia viva: `docs/PLAN-MAESTRO-2026-09-18.md` (fases 0–4 prácticamente completas).
Pendientes actuales resumidos en `docs/CONTEXTO.md` §6: backup por comercio,
facturación electrónica AFIP/ARCA, billing de suscripción.
