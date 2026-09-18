# Plan Maestro — Kiosko · Despensa · Supermercado

- **Fecha**: 2026-09-18
- **Reemplaza como referencia viva a**: `PLAN.md`, `PLAN_MEJORAS.md` y
  `docs/ESTUDIO-MERCADO-Y-PLAN.md` (quedan como historia; varios de sus ítems ya
  están implementados y acá se consolida solo lo pendiente).
- **Objetivo**: un solo roadmap para ampliar y modernizar el sistema de modo que
  sirva a los tres perfiles de comercio: kiosko (1 operador), despensa
  (fiado + pesables + vencimientos) y supermercado (varios cajeros simultáneos).

---

## 1. Estado real del sistema (auditado hoy)

Lo que los planes anteriores pedían y **ya está hecho** (25 migraciones SQL, 10 pantallas):

| Área | Implementado |
|---|---|
| Venta | POS con lector de barras, atajos, pago mixto, RPC atómica `process_sale_kiosko`, precio autoritativo en servidor |
| Caja | Apertura/cierre/arqueo, retiros/aportes/gastos, anulación de venta (`anular_venta_kiosko`), una caja abierta por comercio |
| Clientes | Fiado / cuenta corriente con límite de crédito, pagos de cuenta, ajustes con signo |
| Precios | Ofertas, combos, venta por peso (diálogo de balanza), pago con recargo, auditoría de precios |
| Pagos | Mercado Pago QR y Point integrados, resolución de cobros MP |
| Stock | Movimientos, ajustes, favoritos, control de vencimientos, importación por lote, servicio sin stock |
| Seguridad | Login por PIN activo (`AUTH_DISABLED = false`), roles admin/cajero, CRUD de usuarios con hash bcrypt en Postgres, RLS cerrado + anon key revocado |
| Multi-tenant | Tabla `comercios` + `comercio_id` en todo el dominio |
| Otros | Sincronización de catálogo con la distribuidora, reportes + Excel, tests de lógica de plata (`pricing`, `arqueo`, `credito`) y tests de RPC contra base de prueba |
| En curso | **Impresión de ticket ZPL directo a Zebra ZD220** (`lib/server/zpl.ts`, `app/api/imprimir-ticket/`, sin commitear) |

**Conclusión**: el producto ya cubre kiosko y despensa. El salto pendiente es
**supermercado (multi-caja)** + endurecer seguridad + backoffice de compras.

---

## 2. Pendientes, por qué y para quién

### Fase 0 — Cerrar lo que está abierto (esta semana)

| # | Ítem | Perfil | Detalle |
|---|---|---|---|
| 0.1 | **Terminar y commitear el ticket ZPL** | Todos | Ya hay código sin commitear (`lib/server/zpl.ts`, `lib/server/imprimir-zpl.ts`, `app/api/imprimir-ticket/`). Probar con la ZD220 en modo RAW, ajustar alto dinámico `^LL`, build verde, un commit. |
| 0.2 | **Fallback de impresión** | Todos | Si la impresora RAW no responde, degradar al ticket HTML/print actual sin romper el cobro. |

### Fase 1 — Multi-caja para supermercado (el cambio grande)

Es el bloqueante único del escenario súper: hoy `21_una_caja_abierta.sql` fuerza
una sola caja abierta por comercio y todo el efectivo se mezcla en un arqueo.

| # | Ítem | Alcance |
|---|---|---|
| 1.1 | **Puestos de caja** | Tabla `puestos` (nombre, activo). Reemplazar el índice único "una caja abierta por comercio" por "una caja abierta por puesto". |
| 1.2 | **Apertura/cierre por cajero** | El cajero abre *su* caja en *su* puesto con su fondo inicial; el arqueo es por cajón, no global. `/caja` muestra la caja propia; el admin ve todas. |
| 1.3 | **Adaptar `process_sale_kiosko` y `/pos`** | La RPC ya recibe `caja_id` explícito (`07_multitenant_rpc.sql`); la UI debe resolver "la caja abierta de este usuario/puesto" en vez de "la única abierta". |
| 1.4 | **Rol "encargado"** | Intermedio entre admin y cajero: autoriza anulaciones y hace arqueos sin ver reportes/configuración del dueño. |
| 1.5 | **Reporte consolidado del día** | Suma de todas las cajas + detalle por cajero (ranking, diferencias de arqueo por persona — control antifraude que vende solo). |

> Requiere spec propio antes de codear (cambio de esquema + varias pantallas).
> El SQL exacto se informa antes de implementar, según regla del proyecto.

### Fase 2 — Seguridad antes de escalar (personal real, plata real)

| # | Ítem | Detalle |
|---|---|---|
| 2.1 | **`comercioId` desde sesión de servidor** | Hoy viaja en el body de ~21 rutas API. Resolverlo desde cookie/sesión firmada; el cliente no lo manda más. |
| 2.2 | **Rate limit del login por PIN** | Bloqueo temporal tras N intentos fallidos (en `verificar_pin` o en la ruta). Un PIN de 4 dígitos se fuerza en segundos. |
| 2.3 | **Cifrar tokens de Mercado Pago** | `comercios.mp_access_token` está en texto plano. pgcrypto o Supabase Vault; descifrado solo server-side. |
| 2.4 | **Validación zod en rutas que faltan** | Ej. `app/api/stock/route.ts`. |

### Fase 3 — Backoffice de compras (despensa y súper lo piden)

| # | Ítem | Detalle |
|---|---|---|
| 3.1 | **Proveedores + recepción de mercadería** | Tablas `proveedores`, `compras`, `compra_items`: qué entró, de quién, a qué costo. Hoy solo hay "ajuste de stock" genérico. |
| 3.2 | **Margen real por producto** | Con costo histórico de compras: rentabilidad verdadera en reportes. |
| 3.3 | **Sugerencia de reposición** | Stock mínimo + rotación de `stock_movimientos` → lista de "comprar hoy". |
| 3.4 | **Balanza con EAN de peso embebido** (prefijo 20–29) | El diálogo de peso ya existe; falta parsear el código de balanza para no tipear. Clave en fiambrería/verdulería de súper. |
| 3.5 | **Devolución post-cierre de caja** | `anular_venta_kiosko` exige caja abierta; un súper recibe devoluciones de días anteriores → RPC de devolución con nota de crédito interna. |

### Fase 4 — Modernización y diferenciales

| # | Ítem | Detalle |
|---|---|---|
| 4.1 | **Modo offline (PWA)** | Cola de ventas en IndexedDB (ya existe `lib/offline/`) + sincronización al volver la conexión. Diferencial fuerte vs. competencia web. |
| 4.2 | **Dashboard del dueño (mobile)** | Ventas en vivo, cajas abiertas, alertas de stock/vencimientos desde el celular. |
| 4.3 | **Búsqueda con catálogo grande** | Índice trigram / búsqueda difusa en Postgres para miles de productos (súper). Medir primero. |
| 4.4 | **Fidelización** (puntos por cliente) | Campos en `clientes`; la infraestructura de clientes ya existe. |
| 4.5 | **Identidad visual premium** | Aplicar la dirección "Mostrador" del estudio de mercado (teal noche + lima dinero, motion sobrio). |

### Fase 5 — SaaS (recién con 2+ comercios reales)

| # | Ítem |
|---|---|
| 5.1 | Onboarding self-service + enforcement de `trial_hasta` |
| 5.2 | Panel de superadmin (comercios, plan, uso) |
| 5.3 | Backup / exportación de datos por comercio |
| 5.4 | **Facturación electrónica AFIP/ARCA** (Factura C) — el mayor diferenciador de precio local; plan "Pro" |

---

## 3. Orden recomendado

1. **Fase 0** ya — hay trabajo a medio terminar en el working tree.
2. **Fase 1 (multi-caja)** — es lo único que impide operar el supermercado real,
   que es el destino declarado del sistema. Empieza con un spec propio.
3. **Fase 2 (seguridad)** — antes de sumar personal de menor confianza o un
   segundo comercio.
4. **Fases 3 y 4** según dolor real del primer súper en producción (no
   planificar en el vacío más allá de esto — criterio ya adoptado en `PLAN.md`).
5. **Fase 5** solo cuando haya demanda de un segundo cliente pago.

## 4. Reglas transversales

- Todo cambio de esquema: informar el SQL exacto **antes** de codear (el usuario lo ejecuta primero).
- Toda lógica de plata nueva: test en `lib/**/*.test.ts` y, si toca RPC, en `tests/db/`.
- Un commit por bloque funcional, `npm run build` verde antes de cada push.
