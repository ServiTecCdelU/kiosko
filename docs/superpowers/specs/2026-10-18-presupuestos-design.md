# Presupuestos — diseño (2026-10-18)

## Problema

En la prueba por rubro (ferretería) faltó lo más pedido en el mostrador: "pasame un
presupuesto". Hoy hay que armar el carrito, anotar a mano o sacar captura, y cuando el
cliente vuelve se arma todo de nuevo, a precios que pueden haber cambiado.

## Qué hace

1. **Armar**: en el POS, con el carrito cargado, botón **"Presupuesto"**. Pide cliente
   (opcional, texto libre o un cliente de la cuenta corriente), validez en días (15 por
   defecto) y una nota. Se guarda y se descarga el PDF.
2. **Listar**: pantalla **Presupuestos** (dueño, encargado y cajero): número, fecha,
   cliente, total, vencimiento y estado. Acciones: PDF, **Pasar a venta**, Anular.
3. **Pasar a venta**: abre el POS con el carrito del presupuesto. Se puede cambiar
   (sacar, sumar, cambiar cantidades) y se cobra como cualquier venta.
4. **Precio respetado**: mientras el presupuesto está vigente, cada producto que figura
   en él se cobra al **menor** entre el precio presupuestado y el actual (si aumentó, se
   respeta lo prometido; si bajó, el cliente paga menos). Productos agregados que no
   estaban en el presupuesto van a precio actual. Vencido, todo va a precio actual.
5. Al cobrar, el presupuesto queda **Vendido** con el id de la venta.

No reserva stock (un presupuesto no es una venta). Sin conexión no se puede crear.

## Datos (migración `66_presupuestos.sql`)

```sql
create table presupuestos (
  id            text primary key,              -- presu_<uuid sin guiones>
  comercio_id   text not null references comercios(id),
  numero        bigint not null,               -- 1, 2, 3... por comercio (comercio_contadores)
  cliente_id    text references clientes(id),
  cliente_nombre text,
  items         jsonb not null,                -- [{productId,name,quantity,price,subtotal,unidad}]
  total         numeric not null,
  validez_dias  integer not null,
  vence         date not null,                 -- fecha argentina
  estado        text not null default 'vigente' check (estado in ('vigente','vendido','anulado')),
  venta_id      text references ventas(id),
  notas         text,
  creado_por_nombre text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (comercio_id, numero)
);
```

Más la RPC `crear_presupuesto` que toma el número del contador y hace el insert en una
transacción (dos mostradores no pueden sacar el mismo número).

"Vencido" no se guarda: se calcula (`vigente` y `vence` < hoy) para no depender de un cron.

## Reglas en el servidor

- **Precios del presupuesto**: los calcula el servidor al crearlo, con la misma lógica
  que la venta (`precioLinea`, ofertas vigentes, precio libre con el importe del POS).
  El navegador no fija precios.
- **Venta con `presupuestoId`** (`lib/server/procesar-venta.ts`): si el presupuesto es del
  comercio, está `vigente` y no venció, la línea de un producto presupuestado se cobra a
  `min(precio actual de la línea, precio presupuestado × cantidad)`. La regla es pura
  (`lib/presupuesto.ts`, testeada). Si no se cumple alguna condición, se cobra a precio
  actual sin error (el presupuesto no frena una venta).
- Después de la venta, `update presupuestos set estado='vendido', venta_id=… where estado='vigente'`.
- Anular: solo un presupuesto `vigente`.
- Todas las consultas filtran por `comercio_id` de la sesión (aislamiento SaaS).

## Permisos y rutas

- `/api/presupuestos` (POST crear, PATCH anular): cualquier rol con sesión (es mostrador).
- `/api/consultas/presupuestos` (listar, obtener): lectura, sigue andando en modo consulta.
- Pantalla `/presupuestos` en `lib/nav.ts` para encargado y cajero; `presupuestos` en
  `RUTAS_RESERVADAS`.

## Fuera de alcance (por ahora)

- Datos fiscales del comercio en el PDF (CUIT, domicilio): el PDF lleva el nombre del
  comercio. Se puede sumar cuando la configuración de AFIP los tenga.
- Enviar por WhatsApp/mail desde la app (se descarga el PDF y se comparte).
- Convertir parcialmente (vender una parte y dejar el resto presupuestado).
