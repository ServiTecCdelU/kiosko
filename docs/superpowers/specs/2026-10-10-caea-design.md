# CAEA: facturar cuando AFIP no responde — diseño

Fecha: 2026-10-10. SQL: `supabase/51_caea.sql` (correr antes de deployar).
Extiende `2026-10-03-facturacion-afip-design.md`.

## Qué es

AFIP entrega por adelantado un **CAEA** (Código de Autorización Electrónico Anticipado) por
quincena: orden 1 cubre del 1 al 15, orden 2 del 16 a fin de mes. Se puede pedir desde 5
días antes de que empiece la quincena. Si el servicio de CAE está caído, los comprobantes
salen con ese código y numeración propia, y después hay que **informarlos** uno por uno
con `FECAEARegInformativo` antes de la **fecha tope** que AFIP indica (unos días después
de terminar la quincena). Si en una quincena con CAEA no se emitió nada, se informa
"sin movimiento" (`FECAEASinMovimientoInformar`). Verificado contra el manual de WSFEv1
(2026-10).

## Decisiones

| Decisión | Motivo |
|---|---|
| **Opcional por comercio** (`afip_config.caea_activo`, por defecto apagado) | Un monotributista chico que factura a pedido no lo necesita. Quien lo activa asume informar los comprobantes (el sistema lo hace solo, pero conviene saberlo). |
| El sistema **pide el CAEA solo**: después de cada CAE exitoso revisa (en `after()`) si falta el de la quincena actual o la siguiente y lo pide | Cuando AFIP se cae no se puede pedir nada: hay que tenerlo de antes. También hay botón manual. |
| **Fallback automático**: si al pedir el CAE AFIP no responde (error reintentable: red, timeout, servidores caídos) y hay un CAEA vigente para hoy, el comprobante se autoriza con el CAEA | Es el objetivo: que el mostrador siga facturando. Un rechazo de AFIP (datos mal) **no** es contingencia: se marca rechazado como siempre. |
| Numeración local en contingencia: `max(último autorizado en AFIP si se pudo, máximo local autorizado) + 1` | Sin AFIP no hay `FECompUltimoAutorizado`. El punto de venta es exclusivo de este sistema, así que el máximo local es el real. Cuando AFIP vuelve, los CAE siguen desde el máximo entre ambos, así un CAEA todavía no informado no choca. |
| Los comprobantes CAEA se **informan** cuando vuelve a haber conexión: después de cada CAE exitoso (en `after()`) y con un botón manual | Sin cron. El uso normal del sistema dispara el informe. |
| El impreso dice **CAEA** en vez de CAE, con el vencimiento de la quincena, y el QR lleva `tipoCodAut: "A"` | Lo exige AFIP para que el comprobante sea válido. |
| `facturas.tipo_autorizacion` (`CAE` / `CAEA`), `caea`, `caea_informada`, `caea_error` | Un comprobante CAEA es `autorizada` desde que se emite; "informada" es un paso posterior y visible. |
| El NC de una factura CAEA se emite igual (asocia el comprobante por número) | No cambia nada en la NC. |

## Fuera de alcance

- Informar "sin movimiento" automáticamente: se ofrece como botón en la pantalla de contingencia
  cuando la quincena terminó sin comprobantes CAEA. (AFIP lo pide; si no se hace, no bloquea.)
- Punto de venta separado para CAEA: se usa el mismo. Si AFIP exige uno propio para algún
  contribuyente, lo dirá al informar y queda en `caea_error`.

## Pantalla

Facturación (solo admin, con la facturación activa): tarjeta **Contingencia (CAEA)** con el
interruptor, el CAEA de la quincena actual y el de la siguiente (número, vigencia, fecha tope),
botón "Pedir ahora", y los comprobantes CAEA pendientes de informar con botón "Informar a AFIP".

## Tests

- `lib/afip/caea.test.ts`: quincena y orden de una fecha, próxima quincena, vigencia, cuándo pedir.
- `lib/afip/mensajes.test.ts`: armado y lectura de `FECAEASolicitar`, `FECAEARegInformativo`.
