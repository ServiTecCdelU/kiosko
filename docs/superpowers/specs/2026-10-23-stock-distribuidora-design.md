# Stock compartido con la distribuidora — diseño

**Fecha:** 2026-10-23 · **Comercios:** Supermercado Patricia (kiosko) ↔ Distribuidora Patricia (`distribuidora J&J`)

## Objetivo
Mover **solo stock** entre el super y la distribuidora, en los dos sentidos, de forma
simple, viendo el stock de ambos lados desde los dos sistemas, sin tocar a ningún otro
comercio del SaaS.

## Reglas
- Los productos son los mismos: el kiosko ya los tiene por la sincronización del catálogo
  (`productos.dist_id` = `productos.id` de la distribuidora). Productos sin `dist_id`
  (altas propias del super) no participan.
- Cada lado tiene **su** stock (`productos.stock` en cada base). Nunca se suman ni se
  pisan: una transferencia resta en el origen y suma en el destino.
- Precios, ventas y caja no se tocan.
- Pantalla **nueva** en cada sistema (no se agrega a pantallas existentes):
  - Kiosko: `/distribuidora` (admin y encargado), solo si el comercio está vinculado.
  - Distribuidora: `/stock-super` (admin).
- Cantidades enteras (unidades). Lo fraccionable (kg, etc.) no se transfiere.

## Aislamiento
- Tabla `distribuidora_vinculo` en el kiosko: **un solo** comercio activo (índice único).
  Cualquier otro comercio recibe 403 y no ve la pestaña.
- Toda consulta del kiosko filtra por ese `comercio_id` y por `dist_id`.
- Entre servidores, clave compartida en variables de entorno (nunca en el navegador):
  kiosko `DISTRIBUIDORA_STOCK_CLAVE`, distribuidora `KIOSKO_STOCK_CLAVE` (mismo valor) y
  `KIOSKO_API_URL`. Comparación en tiempo constante.

## Orquestación (siempre el servidor del kiosko)
Dos bases distintas: no hay transacción común. Se registra la transferencia y se avanza
por estados; los dos lados son idempotentes por id, así que reintentar nunca duplica.

1. Se crea `transferencias_distribuidora` en `pendiente`.
2. **Origen primero** (si no hay stock, falla acá y no se movió nada → `fallida`):
   - a_comercio: distribuidora `mover_stock_kiosko(id, producto, -n)` → `origen_ok`.
   - a_distribuidora: kiosko `aplicar_transferencia_comercio` (resta) → `origen_ok`.
3. **Destino**:
   - a_comercio: kiosko `aplicar_transferencia_comercio` (suma) → `completa`.
   - a_distribuidora: distribuidora `mover_stock_kiosko(id, producto, +n)` → `completa`.
4. Si se corta entre 2 y 3, queda en `origen_ok`: la pantalla lo muestra y se reintenta
   (al abrirla y con un botón).

Desde la distribuidora, su pantalla llama a su propia API (con sesión admin), que llama al
kiosko con la clave; el kiosko orquesta igual que arriba.

## APIs
Kiosko
- `POST /api/consultas/distribuidora` (`stock`): productos con `dist_id`, stock propio y
  stock de la distribuidora, y transferencias abiertas.
- `POST /api/distribuidora/transferir` `{ productoId, cantidad, direccion }` y
  `POST /api/distribuidora/reintentar` — regla `gestion`.
- `POST /api/integracion/distribuidora/{stock,transferir}` — sin sesión, con clave
  (lo que usa la distribuidora).

Distribuidora
- `POST /api/integracion/kiosko/stock` `{ ids }` y `POST /api/integracion/kiosko/mover`
  `{ transferenciaId, productoId, delta }` — con clave (lo que usa el kiosko).
- `GET/POST /api/stock-super` — `requireAuth` admin, para su pantalla.

## Pantalla (igual en los dos)
Buscador, tabla: producto · stock super · stock distribuidora · cantidad ·
botones **→ Al super** / **→ A la distribuidora**. Aviso arriba si hay transferencias a
medio camino, con "Reintentar". Últimos movimientos abajo.

## SQL
- Kiosko: `supabase/77_stock_distribuidora.sql`.
- Distribuidora: `migrations/2026-10-23-stock-kiosko.sql`.
