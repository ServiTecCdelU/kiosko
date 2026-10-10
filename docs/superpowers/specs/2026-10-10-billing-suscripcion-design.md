# Billing de la suscripción — diseño

Fecha: 2026-10-10. SQL: `supabase/49_billing_suscripcion.sql` (correr antes de deployar).
Variable de entorno nueva: `MP_SAAS_TOKEN` (Access Token de producción de la cuenta de
Mercado Pago de ServiTec, la que cobra las suscripciones). Sin ella, el botón de pago no
aparece y todo sigue funcionando con pagos manuales.

## Problema

Hasta hoy el cobro mensual era un cartel del día 7 al 10 y un botón "Marcar pago del mes"
en el superadmin. No se cobraba desde el sistema, no quedaba historial y un comercio
activo que no pagaba seguía operando igual.

## Decisiones

| Decisión | Motivo |
|---|---|
| **Pago por mes con Checkout Pro** (un link de Mercado Pago por mes), no débito automático | Es como pagan los comercios chicos en Argentina: cuando pueden, desde el celular. El débito automático con tarjeta (preapproval) queda para después si se pide. |
| La plata entra a la cuenta de **ServiTec** (`MP_SAAS_TOKEN`), nunca a la del comercio | El cobro de Mercado Pago de cada comercio (QR y Point) sigue siendo con su propia cuenta y no se mezcla. |
| `comercios.suscripcion_hasta` pasa a significar **"pagado hasta fin de ese mes"** | Antes guardaba el día 10 del ciclo. La migración 49 convierte lo existente. El aviso del día 7 al 10 sigue funcionando porque compara el mes. |
| Un pago aprobado **extiende un mes**: el actual si estaba vencida o sin fecha, el siguiente si estaba al día (RPC `aplicar_pago_saas`, idempotente por pago de MP) | Pagar dos veces seguidas cubre dos meses; el webhook de MP avisa varias veces y no duplica. |
| **Bloqueo por falta de pago** con la misma escalera que la prueba: aviso los últimos 5 días, **10 días de gracia** después del vencimiento, y luego modo consulta (`pago_vencido`) | El comercio ve venir el corte y nunca pierde datos. Los 10 días de gracia son el "hasta el día 10" de siempre. |
| Solo se bloquea si el **plan tiene precio > 0** y el comercio **tiene `suscripcion_hasta`** | Precio 0 = no se cobra. Un comercio activo sin fecha (lo activó el superadmin sin cobrar) no se bloquea nunca. Nadie queda afuera por un olvido de configuración. |
| En modo consulta por falta de pago, `/api/billing` sigue abierto | Si no, el comercio bloqueado no podría pagar para salir del bloqueo. |
| Precios en la tabla `saas_planes`, editables por el superadmin | Con inflación los precios cambian seguido; no van en código. Arrancan en 0. |
| Pagos manuales (efectivo, transferencia) van a la misma tabla `saas_pagos` con `metodo = manual` | Un solo historial por comercio, sin importar cómo pagó. |
| La demo nunca paga ni se bloquea | Igual que con la prueba. |

## Precio por plan y por caja (migración 52, decidido 2026-10-10)

| Plan | Precio | Cajas incluidas | Caja extra | Tope |
|---|---|---|---|---|
| Free | $0 | 1 | — | sin tope |
| Básico | $20.000 | 1 | no disponible | 1 caja |
| Pro | $40.000 | 1 | $10.000 por mes | sin tope |

- El monto del mes es `precio del plan + (cajas activas − incluidas) × precio por caja extra`
  (`montoMensual` en `lib/suscripcion.ts`). Las cajas son los puestos activos del comercio.
- El tope se aplica al crear o reactivar un puesto (`/api/puestos`): el Básico no deja pasar
  de 1 y avisa que hay que pasar a Pro.
- Las sucursales son comercios distintos (stock y caja propios) y pagan cada una. Un descuento
  por varias sucursales del mismo dueño queda para cuando aparezca el primer caso.
- Cada pago guarda cuántas cajas se cobraron (`saas_pagos.cajas`).

## Flujo de pago

1. Admin → `/suscripcion` (o el botón "Pagar" de los carteles): ve plan, precio, hasta cuándo
   está pagado y el historial.
2. "Pagar con Mercado Pago" → `POST /api/billing/pagar` crea una fila `saas_pagos`
   pendiente y una preferencia de Checkout Pro (`external_reference = saas:<pagoId>`,
   `notification_url = /api/billing/webhook`). Se abre el link de pago.
3. Mercado Pago avisa al webhook (público). Se consulta el pago **con el token de
   ServiTec** (un aviso falso no puede hacer pasar otro pago), y si está aprobado se llama
   a `aplicar_pago_saas`. Se invalida el cache de acceso del comercio.
4. El comercio vuelve a tener acceso completo al instante.

## Datos

- `saas_planes (plan, nombre, precio_mensual, descripcion)`.
- `saas_pagos (comercio_id, plan, monto, periodo 'YYYY-MM', metodo, estado, mp_preference_id, mp_payment_id único, nota, usuario_nombre, aprobado_at)`.
- RPC `aplicar_pago_saas(p_pago_id, p_mp_payment_id)`.

## Pantallas

- `/suscripcion` (admin): tarjeta de estado + historial + botón de pago. Tarjeta resumida
  en el inicio. Los carteles de acceso y de pago mensual llevan ahí.
- Superadmin: botón **Planes** (precios), y en Administrar comercio: historial de pagos y
  "Registrar pago manual".

## Tests

- `lib/suscripcion.test.ts`: período y fecha que cubre un pago, textos.
- `lib/acceso-comercio.test.ts`: aviso, gracia y bloqueo por pago; precio 0 y sin fecha no bloquean.
- `lib/permisos-api.test.ts`: webhook público, `/api/billing` admin y permitido en modo consulta.
