# Multi-caja: varios cajeros con cajón propio — Spec de diseño

- **Fecha**: 2026-09-18
- **Fase**: 1 del `docs/PLAN-MAESTRO-2026-09-18.md` (ítems 1.1 a 1.5)
- **Estado**: diseño — el SQL de la sección 3 debe ejecutarlo el usuario ANTES de implementar código.

---

## 1. Problema

El sistema hoy fuerza **una sola caja abierta por comercio**
(`idx_caja_una_abierta_por_comercio`, `supabase/21_una_caja_abierta.sql`) y toda
la app asume "la caja abierta":

- `/pos` resuelve la caja con `getCajaAbierta()` (`app/pos/page.tsx:70`), que
  consulta la acción `cajaAbierta` (`app/api/consultas/caja/route.ts:35`) —
  devuelve *la única* caja abierta del comercio.
- `/caja` opera siempre sobre esa única caja: apertura, cierre, arqueo,
  retiros/aportes/gastos.
- El arqueo esperado mezcla el efectivo de todos los cajeros en un solo cajón.

En un supermercado hay varios cajeros **simultáneos, cada uno con su cajón
físico de efectivo**. Con el modelo actual no se puede saber cuánta plata
debería haber en cada cajón, ni responsabilizar a cada cajero por su diferencia
de arqueo.

Lo que **ya juega a favor** (no hay que tocarlo):

- `process_sale_kiosko` ya recibe `p_caja_id` explícito y valida que esté
  abierta (`supabase/07_multitenant_rpc.sql:53`).
- `ventas.caja_id` y `caja_movimientos.caja_id` ya existen.
- `caja.abierta_por` / `abierta_por_nombre` ya registran quién abrió.
- `getVentasPorCajero()` ya desglosa ventas por cajero dentro de una caja.

## 2. Decisiones de diseño

| Decisión | Motivo |
|---|---|
| Se agrega la entidad **`puestos`** (Caja 1, Caja 2, …) y `caja.puesto_id` | El cajón físico es del *puesto*, no del cajero. Los cajeros rotan de puesto entre turnos; el histórico "qué pasó en la Caja 2 el martes" necesita el puesto como eje. |
| La restricción pasa a ser **una caja abierta por puesto** (no por comercio) | Es la traducción directa del mundo físico: un cajón no puede tener dos turnos abiertos a la vez. |
| Además, **una caja abierta por cajero** | Un cajero no puede tener dos cajones abiertos a su nombre; evita ventas imputadas a un turno equivocado. |
| El POS resuelve **"mi caja"** = la caja abierta donde `abierta_por` = usuario logueado | Cada venta cae en el cajón del cajero que la cobra, sin selector manual en cada venta. Si el usuario no tiene caja abierta, el POS lo manda a abrir una eligiendo puesto libre. |
| Un **admin/encargado sin caja propia** puede vender eligiendo explícitamente en qué caja abierta imputar | Caso real: el dueño cubre un puesto un rato. Se elige una vez (se recuerda en el estado del POS), no por venta. |
| Compatibilidad kiosko de 1 persona: se **auto-crea el puesto "Caja 1"** por comercio y el flujo actual queda idéntico | El producto sigue sirviendo a kioskos sin que perciban el cambio: un solo puesto ⇒ mismo comportamiento de hoy. |
| Nuevo rol **`encargado`** entre admin y cajero | Autoriza anulaciones, abre/cierra/arquea cualquier caja y ve el consolidado del día, sin acceder a reportes históricos, usuarios ni sincronización. |
| El **consolidado del día** es una consulta sobre `caja` agrupada, no una tabla nueva | Los datos ya están por caja; sumar no requiere esquema. |
| Las cajas cerradas viejas quedan con `puesto_id` del puesto "Caja 1" backfilled | Historial consistente sin migración destructiva. |
| `anular_venta_kiosko` no cambia | Ya exige "la caja de la venta sigue abierta", que con multi-caja sigue siendo la regla correcta (el cajón correcto recibe la devolución del efectivo). La devolución post-cierre es Fase 3.5, fuera de este alcance. |

### Matriz de permisos resultante

| Acción | cajero | encargado | admin |
|---|---|---|---|
| Vender en su propia caja | ✅ | ✅ | ✅ |
| Vender imputando a caja de otro | ❌ | ✅ | ✅ |
| Abrir/cerrar su caja | ✅ | ✅ | ✅ |
| Abrir/cerrar/arquear caja de otro | ❌ | ✅ | ✅ |
| Retiros/aportes/gastos en su caja | ✅ | ✅ | ✅ |
| Anular venta | ❌ | ✅ | ✅ |
| Ver consolidado del día (todas las cajas) | ❌ | ✅ | ✅ |
| Administrar puestos (crear/renombrar/desactivar) | ❌ | ❌ | ✅ |
| Reportes históricos, usuarios, sincronización, stock | ❌ | ❌ | ✅ |

*(Stock queda admin-only como hoy; si el día a día pide dárselo al encargado, es un cambio de una línea en `lib/nav.ts`.)*

## 3. Cambios de esquema (SQL exacto — ejecutar ANTES de codear)

Archivo nuevo: `supabase/26_multi_caja.sql`. No destructivo.

```sql
-- 26_multi_caja.sql
-- Multi-caja: puestos fisicos de cobro, una caja abierta por puesto y por
-- cajero, y rol intermedio "encargado".

-- 1. Puestos de cobro (el cajon fisico)
create table if not exists puestos (
  id          text primary key,
  comercio_id text not null references comercios(id),
  nombre      text not null,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (comercio_id, nombre)
);
create index if not exists idx_puestos_comercio on puestos (comercio_id) where activo;

-- 2. Cada caja (turno) pertenece a un puesto
alter table caja add column if not exists puesto_id text references puestos(id);

-- 3. Puesto inicial "Caja 1" por comercio existente + backfill del historial
insert into puestos (id, comercio_id, nombre)
select 'puesto_' || substr(md5(random()::text || c.id), 1, 12), c.id, 'Caja 1'
from comercios c
where not exists (select 1 from puestos p where p.comercio_id = c.id);

update caja set puesto_id = (
  select p.id from puestos p
  where p.comercio_id = caja.comercio_id
  order by p.created_at limit 1
)
where puesto_id is null;

-- 4. Restriccion nueva: una caja abierta POR PUESTO (reemplaza la de comercio).
--    coalesce: si algun insert viejo dejara puesto_id null, cae al comportamiento
--    anterior (una sola abierta por comercio) en vez de permitir infinitas.
drop index if exists idx_caja_una_abierta_por_comercio;
create unique index if not exists idx_caja_una_abierta_por_puesto
  on caja (comercio_id, coalesce(puesto_id, ''))
  where estado = 'abierta';

-- 5. Una caja abierta por cajero
create unique index if not exists idx_caja_una_abierta_por_cajero
  on caja (comercio_id, abierta_por)
  where estado = 'abierta' and abierta_por is not null;

-- 6. Rol "encargado"
--    La tabla usuarios no tiene check de rol (01_schema.sql); si que lo validan
--    las funciones de alta/edicion (25_usuarios_crud.sql). Se re-crean con el
--    rol nuevo admitido. [Nota de implementacion: copiar el cuerpo actual de
--    crear_usuario_pin / actualizar_usuario cambiando solo la lista de roles a
--    ('admin','encargado','cajero').]
```

> El punto 6 se materializa en el plan de implementación re-declarando las dos
> funciones de `25_usuarios_crud.sql` con la lista de roles ampliada — el resto
> del cuerpo no cambia.

**No cambian**: `process_sale_kiosko`, `anular_venta_kiosko`,
`registrar_movimiento_caja` (todas ya operan por `caja_id`).

## 4. Cambios de aplicación

### 4.1 API

| Ruta / acción | Cambio |
|---|---|
| `POST /api/caja` (abrir) | Recibe `puestoId` obligatorio. Valida puesto activo del comercio. Los índices únicos nuevos hacen cumplir "un turno por puesto / por cajero" aunque la app se equivoque (mismo criterio que `21_una_caja_abierta.sql`). |
| `PATCH /api/caja` (cerrar) | Sin cambio de contrato; el arqueo ya se recalcula server-side por `caja_id`. |
| `consultas/caja` acción `cajaAbierta` | Se reemplaza por dos acciones: `cajaDelUsuario` (`abierta_por = usuarioId`) y `cajasAbiertas` (lista de todas las abiertas con su puesto — para encargado/admin y para el selector del POS). |
| `consultas/caja` acción nueva `consolidadoDia` | Cajas del día (abiertas y cerradas) con totales por caja + suma global + diferencias de arqueo por cajero. |
| `app/api/puestos/route.ts` (nueva) | CRUD admin de puestos (crear, renombrar, activar/desactivar). Patrón de `/api/usuarios`. |
| `consultas/puestos` (nueva) | Listar puestos activos + si tienen caja abierta (para el diálogo de apertura). |

### 4.2 `/pos`

- Al montar: `cajaDelUsuario`. Si no hay → banner actual "no hay caja abierta"
  pasa a ofrecer **"Abrir caja"** con selector de puesto libre (diálogo, no
  navegación a `/caja`).
- admin/encargado sin caja propia: además del abrir, opción "usar caja de…"
  (lista de `cajasAbiertas`); la elección queda en el estado de la sesión del POS.
- La venta manda el `cajaId` resuelto, como hoy (`app/api/ventas/route.ts:26`).
- Indicador permanente en la barra del POS: nombre del puesto de la caja activa.

### 4.3 `/caja`

- **Cajero**: ve solo su caja (apertura con selector de puesto, resumen, movimientos, cierre). Igual que hoy pero "su" caja en vez de "la" caja.
- **Encargado/admin**: grilla de tarjetas, una por puesto — estado (abierta/cerrada/sin abrir), cajero, apertura, ventas, y acciones abrir/cerrar/arquear sobre cualquiera. Debajo, el **consolidado del día**: total vendido por medio de pago, suma de cajones y tabla de diferencias de arqueo por cajero (ranking antifraude).
- Historial: se agrega columna Puesto.

### 4.4 Roles

- `lib/types.ts`: `UserRol = "admin" | "encargado" | "cajero"`.
- `lib/nav.ts`: encargado ve POS + Caja + Ventas (hoy es binario admin/todo, cajero/POS).
- `/usuarios`: el select de rol suma "Encargado".
- Anulación en `/caja` y `/ventas`: habilitada para `rol !== "cajero"` (hoy chequea `admin`).

## 5. Casos borde

| Caso | Comportamiento |
|---|---|
| Kiosko con un solo puesto | Idéntico a hoy: "Caja 1" auto-creada, un turno por vez. |
| Cajero cierra sesión sin cerrar caja | La caja queda abierta a su nombre; al volver a loguearse la retoma. Encargado/admin puede cerrarla por él (queda `cerrada_por` distinto de `abierta_por` — ya soportado por el esquema). |
| Dos cajeros intentan abrir el mismo puesto a la vez | El índice único por puesto rechaza al segundo; la API traduce el error a "El puesto ya tiene una caja abierta". |
| Desactivar un puesto con caja abierta | Prohibido: la API de puestos lo rechaza hasta que se cierre. |
| Venta MP QR/Point aprobada tarde (webhook) | Sin cambio: la venta ya guarda `caja_id` al crearse. |
| Anular venta de una caja ya cerrada | Sigue prohibido (regla existente de `anular_venta_kiosko`). Devolución post-cierre = Fase 3.5. |
| Usuario `encargado` en versión vieja del front | `lib/nav.ts` hoy trata "no admin" como cajero → degrada a solo POS, sin acceso indebido. Seguro por defecto. |

## 6. Fuera de alcance (a propósito)

- Devoluciones con caja cerrada (Fase 3.5).
- Transferencias de efectivo entre cajones (se cubre con retiro en una caja + aporte en otra, ya existente).
- `comercioId` desde sesión de servidor (Fase 2.1 — ortogonal a esto).
- Asignación de cajero a puesto por horario/turnos programados.

## 7. Testing

- **`npm test` (puro)**: agregar `lib/consolidado.ts` con la agregación del
  consolidado del día (suma por medio de pago, diferencias por cajero) y su
  `.test.ts` — misma filosofía que `lib/arqueo.ts`.
- **`npm run test:db`**: casos nuevos contra la base de prueba:
  1. Abrir dos cajas en el mismo puesto → falla la segunda.
  2. Mismo cajero abre en dos puestos → falla la segunda.
  3. Dos cajeros en dos puestos venden a la vez → cada venta cae en su caja y
     cada arqueo cierra por separado.
  4. `crear_usuario_pin` acepta rol `encargado` y rechaza roles inválidos.
- Manual: flujo completo con 2 puestos en dev (abrir, vender, retiro, cerrar,
  consolidado).

## 8. Orden de implementación sugerido (para el plan)

1. SQL `26_multi_caja.sql` + funciones de usuarios con rol nuevo → **usuario ejecuta**.
2. Tipos + roles + nav (`lib/types.ts`, `lib/nav.ts`).
3. API: puestos (CRUD + consulta), `cajaDelUsuario` / `cajasAbiertas`, apertura con `puestoId`.
4. `/pos`: resolución de caja propia + diálogo de apertura + selector para encargado/admin.
5. `/caja`: vista cajero, grilla de puestos, consolidado del día.
6. Tests db + `lib/consolidado.ts` + build + commit único.
