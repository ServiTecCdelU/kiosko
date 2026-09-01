# Reposición Predictiva + Ofertas Automáticas por Vencimiento — Plan de Implementación

> **Para ejecución agéntica:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para ejecutar este plan tarea por tarea. Los pasos usan checkboxes (`- [ ]`) para seguimiento.

**Objetivo:** Convertir datos que el kiosko ya guarda (historial de ventas y fechas de vencimiento) en dos funciones activas: (1) saber cuántos días de stock quedan por producto según su ritmo real de venta, y (2) sugerir automáticamente una oferta de descuento a productos por vencer, reutilizando el motor de ofertas que ya existe.

**Arquitectura:** Dos features aditivas, sin romper nada existente. La reposición predictiva se resuelve con una RPC de Postgres nueva (lee `ventas.items` jsonb + `productos.stock`) expuesta como una acción más de `/api/consultas/productos`. La oferta por vencimiento es lógica pura de negocio (sin tabla nueva) que decide un `%` de descuento sugerido según días restantes, y reutiliza `setOferta` (ya existente) para aplicarlo.

**Tech Stack:** Next.js 16 (App Router), Supabase Postgres (RPC), `node:test` para lógica pura, TypeScript.

---

## ⚠️ Antes de tocar código: correr este SQL en Supabase (proyecto del KIOSKO)

Por regla del proyecto (`CLAUDE.md`), esta RPC nueva se informa primero. Correr en el SQL Editor de Supabase, **después** de `24_pago_con_recargo.sql`:

```sql
-- 25_reposicion_predictiva.sql
-- ============================================================
-- Kiosko Despensa — Reposición predictiva
-- Calcula, por producto, cuántas unidades se vendieron en los
-- últimos N días y en cuántos días se agotaría el stock actual
-- a ese ritmo. Solo lee (ventas + productos), no escribe nada.
-- ============================================================

create or replace function productos_reposicion_predictiva(
  p_comercio_id text,
  p_dias        integer default 14
) returns table (
  producto_id      text,
  nombre           text,
  stock_actual     numeric,
  stock_minimo     numeric,
  unidades_vendidas numeric,
  velocidad_diaria numeric,
  dias_restantes   numeric
)
language sql
stable
as $$
  with ventas_periodo as (
    select
      (item->>'productId')::text as producto_id,
      sum((item->>'quantity')::numeric) as cantidad
    from ventas
    cross join lateral jsonb_array_elements(ventas.items) as item
    where ventas.caja_id in (
            select id from caja where comercio_id = p_comercio_id
          )
      and ventas.estado = 'completada'
      and ventas.created_at >= now() - (p_dias || ' days')::interval
    group by 1
  )
  select
    p.id,
    p.name,
    p.stock,
    p.stock_minimo,
    coalesce(v.cantidad, 0) as unidades_vendidas,
    round(coalesce(v.cantidad, 0) / p_dias::numeric, 3) as velocidad_diaria,
    case
      when coalesce(v.cantidad, 0) <= 0 then null
      else round(p.stock / (v.cantidad / p_dias::numeric), 1)
    end as dias_restantes
  from productos p
  left join ventas_periodo v on v.producto_id = p.id
  where p.comercio_id = p_comercio_id
    and p.disabled = false
    and p.stock_controlado is distinct from false
    and coalesce(v.cantidad, 0) > 0
  order by dias_restantes asc nulls last;
$$;
```

**Por qué así:** `ventas.items` es jsonb (no hay tabla `venta_items`, confirmado en `supabase/01_schema.sql:69`), así que se desarma con `jsonb_array_elements`. Se filtra `estado = 'completada'` para no contar ventas anuladas (columna agregada en `09_anulacion_caja_mov.sql`). El join con `caja` acota por comercio porque `ventas` no tiene `comercio_id` propio — lo hereda de la caja en la que se hizo la venta.

Avisame cuando lo hayas corrido para tildar la Tarea 1.

- [ ] **SQL corrido en Supabase** (usuario confirma antes de seguir con Tarea 3 en adelante)

---

## Progreso

Este archivo se actualiza a medida que se completan tareas. Estado inicial: todo pendiente.

| Tarea | Estado |
|---|---|
| 1. SQL en Supabase | ✅ hecho — confirmado por el usuario |
| 2. Lógica pura: sugerencia de oferta por vencimiento | ✅ hecho — commit `78f1f72`, 52/52 tests OK |
| 3. Endpoint `/api/consultas/productos` acción `reposicion` | ✅ hecho — commit `bea0c40` |
| 4. `services/products-service.ts`: `getReposicionPredictiva` | ✅ hecho — commit `b7fe226` |
| 5. UI: tarjeta "Reposición" en `/stock` | ✅ hecho — commit `740a009` |
| 6. UI: botón "Aplicar oferta sugerida" en vencimientos | ✅ hecho — commit `885948c` |
| 7. Verificación final (`npm test`, `npm run build`) | ✅ hecho — 52/52 tests, build OK |

---

### Tarea 2: Lógica pura — sugerencia de oferta por vencimiento

**Files:**
- Create: `lib/oferta-vencimiento.ts`
- Test: `lib/oferta-vencimiento.test.ts`

Regla de negocio: cuanto más cerca vence, mayor el descuento sugerido. Franjas simples y explicables al dueño del kiosko:
- `dias <= 1` → 40%
- `dias <= 3` → 25%
- `dias <= 7` → 15%
- `dias > 7` → sin sugerencia (`null`)

- [ ] **Step 1: Escribir el test que falla**

```typescript
// lib/oferta-vencimiento.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { sugerirDescuentoVencimiento } from "./oferta-vencimiento.ts";

test("sugiere 40% si vence hoy o mañana", () => {
  assert.equal(sugerirDescuentoVencimiento(0), 40);
  assert.equal(sugerirDescuentoVencimiento(1), 40);
});

test("sugiere 25% si vence en 2 o 3 dias", () => {
  assert.equal(sugerirDescuentoVencimiento(2), 25);
  assert.equal(sugerirDescuentoVencimiento(3), 25);
});

test("sugiere 15% si vence en 4 a 7 dias", () => {
  assert.equal(sugerirDescuentoVencimiento(4), 15);
  assert.equal(sugerirDescuentoVencimiento(7), 15);
});

test("no sugiere nada si faltan mas de 7 dias", () => {
  assert.equal(sugerirDescuentoVencimiento(8), null);
});

test("no sugiere nada si ya vencio (dias negativos) -- se maneja aparte", () => {
  assert.equal(sugerirDescuentoVencimiento(-1), 40);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test`
Expected: FAIL — `Cannot find module './oferta-vencimiento.ts'` (el archivo no existe todavía).

- [ ] **Step 3: Implementación mínima**

```typescript
// lib/oferta-vencimiento.ts — sugerencia de descuento por proximidad de vencimiento.
// Puro: sin dependencias de React ni de Supabase, para poder testearlo con node:test.

/**
 * Devuelve el % de descuento sugerido segun los dias que faltan para vencer.
 * `dias` puede ser negativo si el producto ya vencio (se trata igual que "vence hoy").
 * Devuelve null si todavia falta demasiado para justificar una oferta.
 */
export function sugerirDescuentoVencimiento(dias: number): number | null {
  const d = Math.max(dias, 0);
  if (d <= 1) return 40;
  if (d <= 3) return 25;
  if (d <= 7) return 15;
  return null;
}

/** Dias enteros entre hoy y la fecha de vencimiento (puede ser negativo). */
export function diasHastaVencimiento(fechaVencimiento: Date, hoy: Date = new Date()): number {
  const msPorDia = 1000 * 60 * 60 * 24;
  const soloFecha = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((soloFecha(fechaVencimiento).getTime() - soloFecha(hoy).getTime()) / msPorDia);
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test`
Expected: PASS — los 5 tests de `oferta-vencimiento.test.ts` en verde.

- [ ] **Step 5: Commit**

```bash
git add lib/oferta-vencimiento.ts lib/oferta-vencimiento.test.ts
git commit -m "feat: agregar logica de sugerencia de descuento por vencimiento"
```

---

### Tarea 3: Endpoint — acción `reposicion` en `/api/consultas/productos`

**Files:**
- Modify: `app/api/consultas/productos/route.ts` (agregar un `case` nuevo al `switch`, junto a `"vencimientos"`, línea ~161)

- [ ] **Step 1: Agregar el case (no hay test de RPC en este repo — `npm run test:db` cubre RPC contra base real, ver Tarea 3b)**

Insertar dentro del `switch (accion)`, después del bloque `case "vencimientos":`:

```typescript
    case "reposicion": {
      const dias = acotar(body?.dias, 14, 90);
      const { data, error } = await supabaseAdmin.rpc("productos_reposicion_predictiva", {
        p_comercio_id: comercioId,
        p_dias: dias,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ productos: data ?? [] });
    }
```

- [ ] **Step 2: Verificar tipos y build**

Run: `npm run build`
Expected: build sin errores nuevos relacionados a este archivo.

- [ ] **Step 3: Commit**

```bash
git add app/api/consultas/productos/route.ts
git commit -m "feat: exponer reposicion predictiva en consultas de productos"
```

### Tarea 3b (opcional, solo si tenés `.env.test.local` configurado): test de integración de la RPC

**Files:**
- Create: `tests/db/reposicion-predictiva.test.ts` (seguir el patrón de archivos existentes en `tests/db/`)

- [ ] **Step 1:** Revisar un test existente en `tests/db/` (por ejemplo el de `process_sale_kiosko`) para copiar el patrón de setup/teardown de comercio aislado.
- [ ] **Step 2:** Escribir un test que cree un comercio de prueba, un producto, dos ventas completadas con ese producto, y verifique que `productos_reposicion_predictiva` devuelve `unidades_vendidas` y `dias_restantes` coherentes con los datos insertados.
- [ ] **Step 3:** Correr `npm run test:db` y confirmar que pasa (o que se skipea si no hay base de test configurada).
- [ ] **Step 4:** Commit.

```bash
git add tests/db/reposicion-predictiva.test.ts
git commit -m "test: cubrir rpc de reposicion predictiva contra base de prueba"
```

---

### Tarea 4: `services/products-service.ts` — `getReposicionPredictiva`

**Files:**
- Modify: `services/products-service.ts` (agregar función nueva, junto a `getVencimientosProximos`, línea ~188)

- [ ] **Step 1: Agregar el tipo y la función**

```typescript
export interface ReposicionItem {
  productoId: string;
  nombre: string;
  stockActual: number;
  stockMinimo: number;
  unidadesVendidas: number;
  velocidadDiaria: number;
  diasRestantes: number | null;
}

function mapReposicion(d: Record<string, any>): ReposicionItem {
  return {
    productoId: d.producto_id,
    nombre: d.nombre,
    stockActual: Number(d.stock_actual) || 0,
    stockMinimo: Number(d.stock_minimo) || 0,
    unidadesVendidas: Number(d.unidades_vendidas) || 0,
    velocidadDiaria: Number(d.velocidad_diaria) || 0,
    diasRestantes: d.dias_restantes != null ? Number(d.dias_restantes) : null,
  };
}

/** Productos con menos dias de stock restante segun su ritmo real de venta. */
export async function getReposicionPredictiva(dias = 14): Promise<ReposicionItem[]> {
  const { productos } = await consultar<{ productos: Record<string, any>[] }>(
    "/api/consultas/productos", "reposicion", { dias },
  );
  return productos.map(mapReposicion);
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npm run build`
Expected: sin errores de tipos.

- [ ] **Step 3: Commit**

```bash
git add services/products-service.ts
git commit -m "feat: agregar servicio de reposicion predictiva"
```

---

### Tarea 5: UI — tarjeta "Reposición" en `/stock`

**Files:**
- Modify: `app/stock/page.tsx` (mismo patrón que el estado `vencimientos` ya presente, líneas ~52 y donde se llama `getVencimientosProximos`)

- [ ] **Step 1: Agregar el estado y la carga de datos**

Junto a la declaración `const [vencimientos, setVencimientos] = useState<Product[]>([]);`:

```typescript
  const [reposicion, setReposicion] = useState<ReposicionItem[]>([]);
```

Agregar el import:

```typescript
import {
  getProductsPage, setOferta, getStockStats, getCategorias, updateProduct, getVencimientosProximos,
  getReposicionPredictiva, logCambioPrecio,
  type SetOfertaInput, type StockStats, type UpdateProductInput, type ReposicionItem,
} from "@/services/products-service";
```

Buscar el `useEffect` donde se llama `getVencimientosProximos()` y agregar la llamada en paralelo:

```typescript
    getReposicionPredictiva(14).then(setReposicion).catch(() => setReposicion([]));
```

- [ ] **Step 2: Renderizar la tarjeta**

Ubicar el bloque donde se renderiza la lista de `vencimientos` (buscar `vencimientos.map` en el JSX) y agregar, antes o después, una tarjeta equivalente:

```tsx
        {reposicion.length > 0 && (
          <div className="rounded-2xl border bg-card p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <PackagePlus className="h-4 w-4 text-amber-600" />
              Reposición urgente
            </div>
            <ul className="space-y-1 text-sm">
              {reposicion.slice(0, 8).map((r) => (
                <li key={r.productoId} className="flex items-center justify-between">
                  <span>{r.nombre}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {r.diasRestantes != null ? `${r.diasRestantes} días de stock` : "sin ventas recientes"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
```

(`PackagePlus` ya está importado de `lucide-react` en este archivo — línea 8.)

- [ ] **Step 3: Probar en el navegador**

Run: `npm run dev`, abrir `/stock`, confirmar que la tarjeta aparece cuando hay productos con ventas recientes y no rompe el resto de la página.

- [ ] **Step 4: Commit**

```bash
git add app/stock/page.tsx
git commit -m "feat: mostrar reposicion predictiva en pantalla de stock"
```

---

### Tarea 6: UI — "Aplicar oferta sugerida" en vencimientos

**Files:**
- Modify: `app/stock/page.tsx` (mismo bloque de `vencimientos`)

- [ ] **Step 1: Importar la lógica pura**

```typescript
import { sugerirDescuentoVencimiento, diasHastaVencimiento } from "@/lib/oferta-vencimiento";
```

- [ ] **Step 2: Agregar el botón junto a cada producto por vencer**

En el bloque donde se renderiza `vencimientos.map(...)`, agregar por cada producto:

```tsx
{vencimientos.map((p) => {
  const dias = p.fechaVencimiento ? diasHastaVencimiento(p.fechaVencimiento) : null;
  const sugerido = dias != null ? sugerirDescuentoVencimiento(dias) : null;
  return (
    <li key={p.id} className="flex items-center justify-between gap-2">
      <span>{p.name}</span>
      {sugerido != null && !tieneOferta(p) && (
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await setOferta(p.id, { activa: true, tipo: "porcentaje", valor: sugerido });
            toast.success(`Oferta del ${sugerido}% aplicada a ${p.name}`);
            getVencimientosProximos().then(setVencimientos);
          }}
        >
          Aplicar {sugerido}% off
        </Button>
      )}
    </li>
  );
})}
```

- [ ] **Step 3: Probar en el navegador**

Run: `npm run dev`, ir a `/stock`, marcar un producto con `fecha_vencimiento` cercana (desde el diálogo de edición existente), confirmar que aparece el botón con el % correcto y que al aplicarlo el producto queda con oferta activa (verificable en la lista general de productos).

- [ ] **Step 4: Commit**

```bash
git add app/stock/page.tsx
git commit -m "feat: aplicar oferta sugerida a productos por vencer"
```

---

### Tarea 7: Verificación final

- [ ] **Step 1:** `npm test` — todos los tests unitarios en verde, incluyendo `lib/oferta-vencimiento.test.ts`.
- [ ] **Step 2:** `npm run build` — sin errores de compilación.
- [ ] **Step 3:** Actualizar la tabla de "Progreso" al inicio de este archivo, marcando cada tarea como `✅ hecho`.
- [ ] **Step 4:** Un solo commit final si quedó algo suelto, luego `git push origin main` (regla del proyecto: un commit y push cuando todo funciona).

---

## Fuera de alcance de este plan (para un plan futuro)

- Score de riesgo de fiado (requiere más historial de pagos para calibrar umbrales).
- Dashboard comparativo multi-sucursal.
- Modo offline del POS.
- Sync bidireccional con la Distribuidora (pedido de reposición desde el kiosko).

Estos quedaron identificados en la conversación de mejoras pero no se planifican en detalle acá para no mezclar alcances.
