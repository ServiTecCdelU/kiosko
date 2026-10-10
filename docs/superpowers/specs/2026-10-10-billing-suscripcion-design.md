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
| Básico | $30.000 | 1 | no disponible | 1 caja |
| Pro | $60.000 | 1 | $10.000 por mes | sin tope |

(Precios actualizados por la migración 55 el 2026-10-10; antes $20.000 / $40.000. El
superadmin los puede seguir editando.)

- El monto del mes es `precio del plan + (cajas activas − incluidas) × precio por caja extra`
  (`montoMensual` en `lib/suscripcion.ts`). Las cajas son los puestos activos del comercio.
- El tope se aplica al crear o reactivar un puesto (`/api/puestos`): el Básico no deja pasar
  de 1 y avisa que hay que pasar a Pro.
- Las sucursales son comercios distintos (stock y caja propios) y pagan cada una.
- Cada pago guarda cuántas cajas se cobraron (`saas_pagos.cajas`).

## Sucursales del mismo dueño (migración 53)

- Tabla `saas_grupos` (nombre, `descuento_pct`) y `comercios.grupo_id`. El superadmin arma el grupo
  desde Administrar comercio ("Sucursales"): crea el grupo con su porcentaje y asigna cada comercio.
- La sucursal **más antigua** del grupo (por fecha de alta, sin contar las dadas de baja) paga
  completo; las demás pagan `plan + cajas extra` con el descuento. Así no hay que marcar una
  "principal" a mano y nadie termina con todas las sucursales descontadas.
- El descuento aplicado queda en cada pago (`saas_pagos.descuento_pct`) y se ve en Suscripción.

## Funciones por plan (decidido 2026-10-10)

| Función | Básico | Pro | Free (lo asigna el superadmin) |
|---|---|---|---|
| POS, caja, stock, clientes, reportes, cobro con QR de Mercado Pago | sí | sí | sí |
| Cajas | 1 | sin tope ($10.000 c/u extra) | sin tope |
| **Facturación electrónica ARCA** (A, B, C, NC, CAEA) | **no** | sí | sí |
| **Lector Point de Mercado Pago** | **no** | sí | sí |

- Reglas puras: `planIncluyeFacturacion` y `planIncluyePoint` en `lib/suscripcion.ts` (solo
  `basico` queda afuera; sin plan o `free` no se bloquea nada). El tope de cajas ya estaba
  (`puedeSumarCaja`, `errorAlSumarCaja`).
- Servidor: `lib/server/plan.ts` (`motivoSinFacturacion`: demo o Básico; `motivoSinPoint`).
  Facturación: la emisión (`configActiva` en `facturar.ts`, cubre POS manual y automático, NC
  y CAEA) y las rutas de `/api/afip` que escriben; `GET /api/afip/config` devuelve
  `planPermite`. Point: `/api/mercadopago/point/cobrar` y `/api/mercadopago/dispositivos`
  responden 403.
- El plan viaja al navegador en la sesión (`Usuario.plan`, `datosDeComercio`) solo para los
  avisos; al cambiar de plan en `/suscripcion` se actualiza el usuario guardado sin recargar.
- Pantallas, con el modal reutilizable `components/plan/modal-plan-pro.tsx` (botón a
  `/suscripcion`): `/facturacion` en Básico lo muestra al entrar y detrás una tarjeta bloqueada
  (`aviso-plan-pro.tsx`); la tarjeta de Mercado Pago en Básico habla solo de QR y reemplaza el
  webhook del Point por "Lector Point: plan Pro" con el modal; el diálogo de puestos en Básico
  con una caja activa abre el modal al agregar o reactivar otra; el POS rechaza Point con un
  aviso (hoy los botones de MP están comentados en el carrito).
- Bajar de Pro a Básico conserva la configuración de ARCA y de Mercado Pago; solo deja de
  emitir y de usar el Point hasta volver a Pro. El confirm del cambio lo avisa.

## Cambio de plan por el comercio (decidido 2026-10-10, sin migración)

El dueño cambia solo entre Básico y Pro desde `/suscripcion` (`POST /api/billing/plan`,
`cambiarPlan` en `lib/server/billing.ts`, regla pura `validarCambioDePlan` en
`lib/suscripcion.ts`). "Free" lo asigna únicamente el superadmin.

- **Aplica al instante y no toca lo ya pagado**: `suscripcion_hasta` queda igual, el mes
  siguiente se cobra al precio del plan nuevo. No hay prorrateo ni cobro de diferencia
  (simple de explicar; subir a Pro a mitad de mes regala ese resto de mes).
- **Bajar a Básico** exige una sola caja activa: si hay más, se rechaza y se pide
  desactivar las que sobran (Caja → Cajas).
- Los links de pago de Mercado Pago **pendientes** quedaron con el precio viejo: se marcan
  rechazados con nota "Anulado por cambio de plan". Si igual se pagan, el webhook los
  acredita (la RPC aplica cualquier pago no aprobado), así que la plata nunca se pierde.
- Con **débito automático** autorizado, la ruta llama a `sincronizarDebito` y el monto del
  preapproval se actualiza en Mercado Pago en el acto.
- El cache de acceso se invalida (`olvidarAcceso`): el modo consulta y los avisos dependen
  del precio del plan.

## Débito automático (migración 54, decidido 2026-10-10)

El dueño puede autorizar **una vez** con su tarjeta y Mercado Pago cobra solo cada mes
(API de suscripciones, `preapproval`, con la cuenta de ServiTec). El link mensual sigue
existiendo como alternativa; con el débito autorizado no se ofrece, para no cobrar dos veces.

- `saas_debitos (comercio_id pk, preapproval_id único, estado pending|authorized|paused|cancelled,
  monto, payer_email, init_point, proximo_cobro, cancelado_at)`: una por comercio, se
  reemplaza al reactivar después de cancelar. `saas_pagos.mp_preapproval_id` liga cada cobro.
- `POST /api/billing/debito` (admin, pasa en modo consulta): crea la suscripción en MP con
  `status: pending`, `auto_recurring {1 month, monto de hoy}`, `payer_email` del usuario
  (correo de Google), `external_reference = saas-sub:<comercioId>`, `back_url = /suscripcion`.
  Devuelve `init_point`; el dueño la autoriza ahí. `DELETE` la cancela en MP (lo pagado
  sigue vigente hasta fin de mes).
- Cada cobro mensual aprobado se aplica como un pago más: fila en `saas_pagos`
  (`metodo mercadopago`, nota "Débito automático", `mp_payment_id` único = idempotente) y
  `aplicar_pago_saas` → un mes más de `suscripcion_hasta`. Misma gracia de 10 días si el
  débito falla (MP lo deja `paused` y se avisa en la tarjeta).
- **Sincronización** (`sincronizarDebito`): trae el estado real de MP, actualiza
  `transaction_amount` si el monto de hoy cambió (cajas, plan, descuento) y aplica los
  cobros aprobados que falten (`/authorized_payments/search`). Corre en cada
  `GET /api/billing` y en el webhook (`subscription_preapproval`,
  `subscription_authorized_payment`), así no depende de que MP avise.

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

- `/suscripcion` (admin): tarjeta de estado + bloque "Tu plan" (Básico / Pro con precio,
  plan actual y botón de cambio) + débito automático + historial + botón de pago. Se
  llega desde la tarjeta "Suscripción" del inicio. Los carteles de acceso y de pago
  mensual llevan ahí.
- Superadmin: botón **Planes** (precios), y en Administrar comercio: historial de pagos y
  "Registrar pago manual".

## Tests

- `lib/suscripcion.test.ts`: período y fecha que cubre un pago, textos, monto por cajas y
  validación del cambio de plan.
- `lib/acceso-comercio.test.ts`: aviso, gracia y bloqueo por pago; precio 0 y sin fecha no bloquean.
- `lib/permisos-api.test.ts`: webhook público, `/api/billing` admin y permitido en modo consulta.
