# Auditoría de pagos y cuenta corriente

Revisión de los flujos de cobro (efectivo, transferencia, mixto, fiado, MP QR,
MP Point) y de la cuenta corriente. Fecha: 2026-08-13.

**Método**: lectura del código y de las migraciones SQL. Lo marcado como
`[verificado en vivo]` se probó contra el sistema real; el resto surge del
código y **no está probado en vivo todavía** (no hay base de datos de prueba
separada: el `dev` local y el deploy usan el mismo Supabase, así que toda venta
de test mueve stock, caja y reportes de verdad).

---

## 🔴 Críticos — CORREGIDOS (requiere correr `supabase/18_correcciones_pagos.sql`)

### 1. ✅ El límite de crédito no se valida nunca

`clientes.limite_credito` se guarda, se muestra en la ficha del cliente… y no
se controla en ningún lado.

- `process_sale_kiosko` (versión vigente, `15_servicio_sin_stock.sql:52-63`)
  solo valida que el cliente exista, esté activo y sea del comercio.
- En el POS, `cart-panel.tsx:67` solo exige que haya un cliente elegido
  (`faltaCliente`), sin mirar el saldo ni el límite.

**Consecuencia**: un cliente con límite de $10.000 puede llevar fiado por
$500.000 sin que el sistema diga nada.

**Corrección**: validar en la RPC (que es donde no se puede esquivar):
si `limite_credito > 0` y `saldo + p_total > limite_credito`, abortar. Además,
avisar en el POS antes de confirmar, mostrando saldo actual y límite.

### 2. ✅ Pago aprobado + venta fallida = plata sin venta

En `app/api/mercadopago/webhook/route.ts`, cuando llega un pago aprobado se
llama a `procesarVenta`. Si esa función falla, se devuelve 500 y el registro
queda en `pendiente`.

`procesarVenta` puede fallar por causas reales y frecuentes:
- **Stock insuficiente**: entre que se generó el QR y que el cliente pagó,
  otra venta se llevó la última unidad.
- **Caja cerrada**: el `cajaId` se captura al generar el cobro; si se cerró la
  caja antes de que el cliente pagara, la RPC aborta.

**Consecuencia**: el cliente pagó, la plata está en Mercado Pago, y la venta no
existe. Mercado Pago reintenta la notificación, pero va a fallar siempre por el
mismo motivo. Nadie se entera: el cajero solo ve el diálogo girando.

**Corrección**: ante un fallo al procesar, marcar el registro con un estado
tipo `error` guardando el motivo, mostrarlo en el diálogo del POS ("el pago
entró pero no se pudo registrar la venta — revisar"), y dejar esos casos
visibles en alguna pantalla para resolverlos a mano.

### 3. ✅ Los scripts SQL del repo no permiten los métodos de pago de Mercado Pago

La última definición del constraint está en `06_multitenant.sql:182-184`:

```sql
check (payment_method in ('efectivo','transferencia','mixto','fiado','qr'))
```

No incluye `mercadopago`, `mercadopago_point` ni `tarjeta`, que son los valores
que la aplicación escribe hoy. Ninguna migración posterior (`16`, `17`) lo
corrige.

Como las ventas con MP Point **sí funcionan** en la base actual, el constraint
real debe haber quedado distinto de lo que dicen los scripts.

**Consecuencia**: si algún día se rehace la base desde los scripts (comercio
nuevo, restauración, entorno de prueba), todos los cobros de Mercado Pago van a
fallar con violación de constraint.

**Corrección**: agregar una migración `18` que actualice el constraint a la
lista real de métodos, y confirmar qué constraint tiene hoy la base productiva.

---

## 🟠 Altos — CORREGIDOS

### 4. ✅ Anular una venta de Mercado Pago no devuelve la plata

`anular_venta_kiosko` devuelve el stock y revierte el fiado, pero no toca el
pago de Mercado Pago: la plata sigue en la cuenta. Tampoco se cancela ni marca
el registro de `pagos_mp_pendientes` asociado.

**Corrección mínima**: avisar en el diálogo de anulación, cuando el método es
`mercadopago` o `mercadopago_point`, que la devolución hay que hacerla a mano
desde la app de Mercado Pago.

### 5. ✅ Los diálogos de MP QR y MP Point esperan para siempre

`mercadopago-point-dialog.tsx` y `mercadopago-qr-dialog.tsx` consultan el estado
cada 2 segundos sin límite de tiempo. Si el cliente se arrepiente y nadie
cancela, el diálogo queda girando indefinidamente y bloquea la caja.

**Corrección**: expirar a los ~3-5 minutos, cancelar el cobro y avisar.

---

## 🟡 Medios — CORREGIDOS (el 6 y el 8 requieren correr `supabase/19_signo_ajuste_cuenta.sql`)

### 6. ✅ Las anulaciones de fiado se muestran mal en la ficha del cliente

`anular_venta_kiosko` (`09_anulacion_caja_mov.sql`) inserta el movimiento de
reversa con `monto = -total` y `tipo = 'ajuste'`, pero la convención documentada
en `05_clientes_fiado.sql:33` dice que `monto` es **siempre positivo** y que el
signo lo determina el tipo.

En `cliente-detail-dialog.tsx:152` se renderiza `{esPago ? "-" : "+"}` + monto,
así que un ajuste negativo sale con doble signo (`+-$1.500`) y en color de
cargo, como si fuera deuda nueva en vez de una reversa.

**Corrección**: unificar el criterio — guardar el monto positivo y que el tipo
mande, o contemplar el signo al renderizar.

### 7. ✅ Los botones de Mercado Pago quedan habilitados sin conexión

Ambos métodos necesitan internet, pero se pueden elegir estando offline: recién
falla al confirmar, con un toast. Convendría deshabilitarlos cuando
`isOnline === false`, como ya se hace conceptualmente con el fiado.

### 8. ✅ En caja y reportes, Mercado Pago se mezcla con "transferencia"

`caja-service.ts:118` y `reportes-service.ts:91` agrupan `transferencia`,
`mercadopago`, `mercadopago_point` y `tarjeta` en un solo total. Para el arqueo
de efectivo está bien (nada de eso es efectivo), pero no se puede saber cuánto
entró por Mercado Pago sin mirar la app de MP.

---

## ✅ Revisado y correcto

- **Anulación de fiado**: revierte el saldo del cliente y deja el movimiento en
  cuenta corriente, todo en la misma transacción.
- **Anulación con caja cerrada**: se bloquea, para no alterar un arqueo firmado.
- **Precios autoritativos**: `procesar-venta.ts` recalcula precios y ofertas
  desde la base, ignorando lo que manda el cliente. No se puede falsear el total.
- **Stock**: se valida y descuenta con `for update` dentro de la transacción;
  los productos sin stock controlado se saltean bien.
- **Fiado y offline**: el fiado no se encola offline (necesita validar saldo en
  el momento), y los métodos de MP salen antes de llegar al camino offline.
- **El fiado no mueve la caja**: correcto, se excluye del arqueo.
- **`registrar_pago_cuenta`**: valida que el monto sea mayor a cero y bloquea la
  fila del cliente antes de actualizar.

---

## Pendiente de probar en vivo

Nada de esto se puede verificar leyendo código:

1. **MP QR de punta a punta** — el QR aparece en pantalla, pero falta pagar uno
   y confirmar que la venta se registra. `[el Point sí está verificado en vivo]`
2. **Venta fiada** — que cargue la deuda y aparezca en la ficha del cliente.
3. **Pago de cuenta corriente** — que baje el saldo y quede el movimiento.
4. **Anulación de una venta fiada** — que devuelva el stock y borre la deuda
   (acá se vería el problema 6).
5. **Arqueo de caja** — con ventas de varios métodos mezclados, que los totales
   cierren.
6. **Venta mixta** — que la división efectivo/transferencia quede bien.

Conviene hacerlo con productos de prueba y montos chicos, y anular las ventas
después. Ojo: anular no arregla el fiado si antes se registró un pago.
