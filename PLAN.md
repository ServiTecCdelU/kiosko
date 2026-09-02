# PLAN — Kiosko Despensa

Plan de producto y desarrollo para comercializar el sistema en kioskos y despensas chicas.

- **Fecha de análisis**: 2026-08-02
- **Estado del código analizado**: ~2.700 líneas de fuente, 8 migraciones SQL, módulos POS / caja / stock / clientes-fiado / reportes / sincronización.

---

## Estado actual (lo que ya está bien)

- RPC `process_sale_kiosko` **atómica**: valida caja abierta, descuenta stock, registra movimientos e inserta la venta en una sola transacción.
- Precio **autoritativo desde la BD** en `app/api/ventas/route.ts` — el cliente no puede manipular precios.
- Fundación **multi-tenant** ya cimentada (`comercios` + `comercio_id` en todas las tablas de dominio).
- Fiado / cuenta corriente con saldo y movimientos.
- POS con lector de código de barras, atajos de teclado (F2/F3/Esc) y pago mixto.
- Ofertas por producto (`lib/pricing.ts`).

---

## 🔴 Bloqueantes para vender

Sin esto no se le puede cobrar a un cliente real.

| # | Ítem | Detalle |
|---|---|---|
| 1 | **Auth desactivada** | `hooks/use-auth.ts:12` → `AUTH_DISABLED = true`, entra directo como admin demo. Cualquiera con la URL ve todo. |
| 2 | **RLS apagado + anon key en el bundle** | `supabase/04_rls_off.sql`. En multi-tenant, **un cliente puede leer las ventas de otro comercio** desde la consola del navegador. Solución: Supabase Auth + RLS por `comercio_id`, o pasar todas las operaciones por API routes con service role. Riesgo #1 del SaaS. |
| 3 | **`comercioId` viene del cliente** | `app/api/ventas/route.ts:22` lo toma del body → un tenant puede escribir en otro. Debe salir de la sesión del servidor. |
| 4 | **Tokens de Mercado Pago en texto plano** | `supabase/06_multitenant.sql`. Cifrar con Supabase Vault / pgcrypto antes de conectar cuentas reales. |
| 5 | **Impresión de ticket inexistente** | Ni térmica ni PDF. Es lo primero que pregunta un comercio. ESC/POS por WebUSB o layout 58/80mm imprimible desde el navegador. |

> **Decisión del 2026-08-02**: los ítems 1–4 (seguridad, RLS y Auth) se posponen — se aplicarán más adelante.

## 🟢 Alto valor comercial (lo que cierra la venta en la demo)

| # | Ítem | Detalle |
|---|---|---|
| 6 | **Modo offline (PWA)** | Un kiosko sin internet no puede dejar de vender. Service worker + cola de ventas en IndexedDB que sincroniza al volver. **Este diferencial solo ya justifica el precio** frente a la competencia web. |
| 7 | **Cobro con QR de Mercado Pago** | La estructura ya está en `comercios`; falta el flujo: generar QR, escuchar webhook, confirmar la venta sola. En Argentina es casi obligatorio. |
| 8 | **Productos pesables / balanza** | Fiambrería y verdulería. Hoy `quantity` es número pero no hay unidad (`kg`/`un`) ni lectura de códigos de balanza (EAN-13 con peso embebido, prefijo 20–29). Sin esto se pierden todas las despensas con fiambrería. |
| 9 | **Teclado de productos rápidos** | Grilla táctil de favoritos (cigarrillos, gaseosas, golosinas sueltas). Muchos productos de kiosko no tienen código de barras; hoy solo se busca escribiendo. |
| 10 | **Combos / 2x1 / precio por cantidad** | `lib/pricing.ts` ya cubre ofertas por producto; falta el nivel de combo. |

## 🟡 Operativas que piden todos

| # | Ítem | Detalle |
|---|---|---|
| 11 | **Anulación / devolución de venta** | No existe. Si el cajero se equivoca no hay forma de revertir sin tocar la BD. RPC inversa que devuelva stock y registre movimiento; nunca borrar la venta (`estado='anulada'`). |
| 12 | **Retiros y aportes de caja** | "Saqué 5.000 para el proveedor". Sin esto el arqueo nunca cierra y el cliente pierde confianza en el sistema. |
| 13 | **Gastos / proveedores** | Mismo motivo, y habilita el reporte de rentabilidad real. |
| 14 | **Suspender venta / tickets múltiples** | Cliente que vuelve al freezer mientras atendés al siguiente. |
| 15 | **Control de vencimientos** | Clave en despensa (lácteos, fiambre). Un campo + alerta en el dashboard. |
| 16 | **Auditoría de precios y ajustes de stock** | Quién y cuándo. Protege al dueño frente al empleado. |

## 🔵 Para que sea un SaaS vendible

| # | Ítem | Detalle |
|---|---|---|
| 17 | **Onboarding self-service** | Hoy crear un comercio es correr SQL a mano. Pantalla de alta + `trial_hasta` + bloqueo automático al vencer (los campos ya existen en `comercios`, falta el enforcement). |
| 18 | **Panel de superadmin** | Ver comercios, plan, estado, uso. Sin esto no se escala más allá de 5 clientes. |
| 19 | **Backup / exportación de datos** | Argumento de venta y requisito legal. |
| 20 | **Facturación AFIP/ARCA (Factura C / monotributo)** | El mayor diferenciador de precio del mercado argentino. Trabajo grande → plan Pro. |

## ⚙️ Deuda técnica

| # | Ítem | Detalle |
|---|---|---|
| 21 | **Cero tests** | En un sistema que maneja plata y stock. Mínimo: `lib/pricing.ts`, cálculo de vuelto y la RPC de venta. |
| 22 | **`next.config.mjs` ignora errores de TypeScript** | Se despliega con errores de tipo invisibles. |
| 23 | **Sin rate limiting en `/api/auth/login`** | Un PIN de 4 dígitos se fuerza en segundos. |
| 24 | **`app/api/stock/route.ts` no valida con zod** | Aunque zod ya está instalado. |
| 25 | **Falta índice compuesto `comercio_id`** | En `ventas` / `productos`. Se va a notar con varios tenants. |

---

## Orden recomendado

1. Ítems **1–5** (bloqueantes) — *pospuestos por decisión del usuario, excepto el 5*.
2. Ítems **11 y 12** — sin esto devuelven el producto la primera semana.
3. Ítems **6 y 7** — los diferenciales que justifican el precio.
4. Ítems **8 y 9** — amplían el mercado a despensas.
5. Ítems **17 y 18** — recién ahí se escala como SaaS.

---

# 🚧 EN CURSO — Anulación de venta + Movimientos de caja (ítems 11 y 12)

## Paso 1 — SQL (bloquea todo lo demás)

**Archivo**: `supabase/09_anulacion_caja_mov.sql` — ✅ creado, ⏳ **pendiente de ejecutar** por el usuario en el SQL Editor de Supabase.

No destructivo: usa `add column if not exists` / `create table if not exists`. No toca datos existentes.

### Contenido

**A) Anulación de ventas**
- `ventas`: nuevas columnas `estado` (`'completada'|'anulada'`), `anulada_at`, `anulada_por`, `anulada_por_nombre`, `motivo_anulacion` + índice parcial sobre `estado`.
- `stock_movimientos`: se amplía el check de `tipo` para admitir `'devolucion'`.
- RPC `anular_venta_kiosko(p_venta_id, p_comercio_id, p_usuario_id, p_usuario_nombre, p_motivo)`.

**B) Movimientos de caja**
- Tabla nueva `caja_movimientos` (`tipo` = `'retiro'|'aporte'|'gasto'`, `monto`, `concepto`, usuario, fecha) con FK a `comercios` y `caja`.
- `caja`: nuevas columnas `total_retiros`, `total_aportes`, `total_gastos`.
- RPC `registrar_movimiento_caja(p_caja_id, p_comercio_id, p_tipo, p_monto, p_concepto, p_usuario_id, p_usuario_nombre)`.
- RLS desactivado, en línea con `04_rls_off.sql`.

### Decisiones de diseño

| Decisión | Motivo |
|---|---|
| La venta anulada **no se borra**, se marca `estado='anulada'` | Trazabilidad. El número de ticket sigue existiendo y el dueño ve qué anuló cada cajero y por qué. |
| Solo se puede anular si **la caja sigue abierta** | Un arqueo cerrado y firmado no se puede alterar retroactivamente. |
| Stock devuelto con tipo `devolucion` (no `entrada`) | Para que el reporte de stock distinga una compra a proveedor de una anulación. |
| Si era fiado, se revierte el saldo del cliente (`cuenta_corriente_mov` tipo `ajuste`, monto negativo) | Sin esto el cliente quedaría debiendo una venta anulada. |
| Producto borrado del catálogo → anula igual, sin devolver stock | No bloquea la anulación por un producto que ya no existe. |
| `caja_movimientos` en tabla aparte, no columnas en `caja` | Hace falta el detalle ("saqué 5.000 para el proveedor Coca"), no solo el total. |
| Nuevo arqueo esperado = `apertura + ventas_efectivo + aportes − retiros − gastos` | Es la fórmula real del cajón de dinero. |

## Paso 2 — Código (después de ejecutar el SQL)

### Anulación
- [ ] `POST /api/ventas/[id]/anular` — service role, valida `comercioId` de sesión, llama a `anular_venta_kiosko`.
- [ ] `services/sales-service.ts`: `anularVenta()` + `getVentasDeCaja()`.
- [ ] `/caja`: historial de ventas del día con botón **Anular** + diálogo pidiendo motivo (solo rol `admin`).
- [ ] Badge visual de "anulada" y exclusión de todos los totales.

### Retiros / aportes / gastos
- [ ] `services/caja-service.ts`: `registrarMovimientoCaja()` + `getMovimientosCaja()`.
- [ ] `getResumenCaja()`: excluir ventas anuladas y sumar aportes / restar retiros y gastos.
- [ ] `/caja`: sección con botones **Retiro** / **Aporte** / **Gasto** y su listado.
- [ ] `cerrarCaja()`: guardar `total_retiros` / `total_aportes` / `total_gastos` y recalcular la diferencia real.
- [ ] Reutilizar componentes de diálogo existentes (no crear nuevos si ya hay similares).

### ⚠️ Riesgo a tener en cuenta
Hoy `getResumenCaja` (`services/caja-service.ts`) **no filtra por `estado`**. Si se aplica el SQL sin el código, las ventas anuladas seguirían contando en el arqueo. **Los dos cambios van juntos en el mismo commit.**

## Paso 3 — Cierre
- [ ] `npm run build` sin errores.
- [ ] `git add` de los archivos modificados.
- [ ] Commit: `feat: anulacion de ventas y movimientos de caja (retiros, aportes y gastos)`.
- [ ] `git push origin main`.

---

# 📋 Plan — De kiosko de 1 persona a supermercado con varios cajeros

- **Fecha de análisis**: 2026-09-02
- **Contexto del cambio**: el sistema se pensó y construyó para un kiosko/despensa
  con un solo operador. El destino real es un supermercado con varios cajeros
  trabajando en simultáneo, cada uno con su propio cajón de efectivo. Esto
  cambia qué es urgente — varios riesgos que eran teóricos con un solo usuario
  demo pasan a ser reales con personal real logueado con su propio PIN.
- Este plan **complementa** a `PLAN_MEJORAS.md` (foco: qué necesita un kiosko/
  despensa del día a día) y a la sección de arriba de este archivo (seguridad/
  SaaS/deuda técnica original). Ya se hizo desde entonces: login por PIN activo
  con roles admin/cajero (`hooks/use-auth.ts`), pantalla de administración de
  usuarios (`/usuarios`), RLS cerrado y anon key revocado (`22_cerrar_anon_rls.sql`).

## 🔴 Urgente por ser supermercado (no lo era con un solo operador)

| # | Ítem | Por qué ahora importa | Alcance técnico |
|---|---|---|---|
| 1 | **Una sola caja abierta por comercio** | `idx_caja_una_abierta_por_comercio` (`supabase/21_una_caja_abierta.sql`) impide tener 2 cajas abiertas a la vez. Con varios cajeros logueados con su propio PIN en puestos distintos, cada uno con su cajón de plata, hoy todo se mezcla en un arqueo único — no se puede saber cuánto efectivo debería haber en cada cajón por separado. | Cambio grande: sacar la restricción única, agregar noción de "puesto/caja" por cajero, y adaptar apertura/cierre, arqueo, `process_sale_kiosko` (ya recibe `caja_id` explícito, ver `supabase/07_multitenant_rpc.sql:53`) y las pantallas de `/caja` y `/pos` para trabajar por caja en vez de "la única caja abierta". Requiere spec y plan propios — es el ítem más grande de esta lista. |
| 2 | **`comercioId` viaja en el body de las rutas API, no sale de la sesión del servidor** | Con un solo usuario demo era un riesgo teórico. Con cajeros reales logueados, cualquiera con las herramientas de desarrollador del navegador puede en teoría mandar un `comercioId` ajeno. Hoy con un solo comercio no hay a dónde filtrar datos, pero hay que cerrarlo antes de confiar el sistema a más locales o a personal de menor confianza. | Server debe resolver `comercioId` desde una sesión/cookie firmada, no confiar en el valor que manda el cliente. Afecta ~21 rutas en `app/api/**/route.ts`. |
| 3 | **Login por PIN sin límite de intentos** | Un PIN de 4 dígitos son 10.000 combinaciones. Con una terminal de cajero desatendida en un local grande, alguien con tiempo podría probar PINs. | Contador de intentos fallidos por IP o por PIN con bloqueo temporal, en `verificar_pin` o en `app/api/auth/login/route.ts`. |
| 4 | **Token de Mercado Pago sin cifrar en la base** | `comercios.mp_access_token` en texto plano (`supabase/06_multitenant.sql`). Con más volumen de plata movida por MP en un súper, un backup o acceso filtrado a la base da control de los cobros. | Cifrar con pgcrypto o Supabase Vault; descifrar solo server-side al llamar a la API de MP. |

## 🟠 Amplía la operación real de un súper (no hacía falta en un kiosko)

| # | Ítem | Detalle |
|---|---|---|
| 5 | **Recepción de mercadería por proveedor/remito** | Hoy solo existe "ajuste de stock" genérico y la sincronización automática de catálogo. Un súper recibe de varios proveedores distintos y necesita historial de "qué entró, de quién, a qué costo" — no solo un `precio_base` único que se pisa. |
| 6 | **Rol intermedio "encargado de turno"** | Hoy es admin (ve todo) o cajero (solo POS). Un súper suele tener un encargado que autoriza anulaciones o hace arqueos sin ser el dueño. |
| 7 | **Balanza con código EAN de peso embebido** (prefijo 20-29) | Para un kiosko era prescindible (`PLAN_MEJORAS.md` sección 4 lo deprioriza a propósito); para una verdulería/carnicería de súper con volumen, pesar a mano cada producto en el POS es lento. |
| 8 | **Devoluciones de cliente días después** | La anulación actual (`anular_venta_kiosko`) solo funciona con la caja del día todavía abierta. Un súper recibe devoluciones de compras de días anteriores. |

## 🟡 Rendimiento a mayor escala

| # | Ítem | Detalle |
|---|---|---|
| 9 | **Búsqueda de productos con catálogo grande** | Un súper tiene mucho más surtido que un kiosko. No es urgente si no se sintió lento todavía, pero conviene revisar cómo responde la búsqueda del POS (`/api/consultas/productos`) con miles de productos antes de que sea un problema en producción. |

## Orden recomendado

1. **Ítem 1 (múltiples cajas)** primero — es el que más bloquea operar con varios
   cajeros simultáneos, que es justo el escenario real del súper. Requiere spec
   y plan de implementación propios (cambio de esquema + varias pantallas).
2. **Ítems 2-4 (seguridad)** — ninguno bloquea vender hoy con un solo comercio,
   pero conviene cerrarlos antes de sumar más locales o de que haya plata real
   en volumen circulando por MP.
3. **Ítems 5-8** según qué tan seguido se sienta la falta en el día a día real
   del primer súper que use el sistema — no conviene seguir planificando en el
   vacío más allá de este punto (mismo criterio que `PLAN_MEJORAS.md`).
