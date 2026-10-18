# Plan Tienda ($80.000): catálogo y pedidos online — diseño (2026-10-18)

Estado: **etapas 1, 2 y 3 hechas (2026-10-18)**: catálogo, pedidos en el sistema y pago online, plan Tienda
(migraciones 72 a 74), configuración en Mi comercio. Pago online sin probar con MP real.

## Etapa 1 implementada

- Página pública `/tienda/<slug>` (`app/tienda/[slug]`, `components/tienda/catalogo-tienda.tsx`):
  buscador, rubros, "Ofertas de hoy", precio con oferta (`lib/pricing.ts`), carrito en el
  navegador del cliente, por kg de a 250 g (arranca en 500 g). El pedido abre WhatsApp
  con el mensaje armado (`lib/tienda.ts`, testeado).
- API pública `GET /api/publico/tienda?slug=` (regla "publica" en `lib/permisos-api.ts`):
  solo nombre, precio, oferta, rubro, foto, unidad y si hay stock. Abre si el plan la
  incluye (`planIncluyeTienda`: tienda o free), el dueño la activó, hay WhatsApp válido y
  el comercio tiene acceso completo. Caché de 60 s en el CDN.
- Mi comercio → Tienda online (`components/tienda/tienda-config.tsx`, `/api/comercio`):
  abrir/pausar, WhatsApp (normalizado a `549…`), bienvenida, retiro/envío, mostrar sin
  stock, link, QR para imprimir. Se guarda en `comercios.config.tienda`.
- Sin el plan: la sección explica la tienda y manda a Suscripción. El alta (`/registro`)
  todavía ofrece solo Básico y Pro; a Tienda se pasa desde Suscripción.

## Etapa 2 implementada (2026-10-18)

- Tabla `pedidos` + RPC `crear_pedido_tienda` (migración 73): número por comercio
  (`comercio_contadores`), estados nuevo → preparando → listo → entregado / cancelado.
- `POST /api/publico/tienda/pedido`: misma regla de tienda abierta que el catálogo
  (`lib/server/tienda.ts`); precios del servidor (`armarItemsPedido` + `precioLinea`);
  datos del cliente validados (`datosClienteValidos`, celular obligatorio); topes de 10
  por hora por IP y 3 por teléfono cada 15 min en el comercio.
- La tienda confirma "Pedido N° X enviado" y deja un botón opcional para avisar por
  WhatsApp con el número.
- Pantalla **Pedidos** (`app/pedidos`, plan Tienda, admin/encargado/cajero): se actualiza
  cada 20 s y suena al entrar uno; número de nuevos en el menú (cada 60 s); botones por
  estado y "Avisar por WhatsApp" al cliente con el mensaje del estado.
- **Pasar a venta**: `/pos?pedido=<id>` arma el carrito con los productos y el precio de
  hoy (lo de por kg se pesa ahí); la venta lleva `pedidoId` y deja el pedido entregado
  con su `venta_id` (`lib/server/procesar-venta.ts`). No reserva stock.

## Etapa 3 implementada (2026-10-18)

- Migración 74: `pedidos.pago_estado` (null / pendiente / aprobado / rechazado),
  `pago_ref` (`pedido:<id>`, único), `pago_id`, `pago_monto`.
- La tienda ofrece "Pagar ahora con Mercado Pago" solo si el comercio tiene MP conectado
  (`tiendaDeSlug().pagoOnline`). Al crear el pedido se genera la preferencia por el total
  con la cuenta del comercio y la vuelta a `/tienda/<slug>?pedido=N&pago=…`; si MP falla,
  el pedido queda y se paga al retirar.
- Webhook de MP (`app/api/mercadopago/webhook`): una referencia `pedido:` va a
  `registrarPagoDePedido` (pago consultado con el token del comercio, idempotente).
- **Regla de plata**: un pedido pagado online NO se cobra de nuevo (`prepararVenta` lo
  rechaza en caja, QR y Point). Se entrega desde Pedidos con **Entregar (ya pagó)**
  (`POST /api/pedidos/entregar`): venta al precio pagado (`procesarVentaDePedidoPagado`,
  subtotales del pedido, no un campo del input), como Mercado Pago, en la caja de quien
  entrega (o la única abierta), con las cantidades pedidas.
- Cancelar un pedido pagado avisa que hay que devolver el pago desde Mercado Pago (la
  devolución no es automática).
- **No probado con un pago real**: ningún comercio tiene MP conectado. Probado simulando
  el estado que deja el webhook.

## Problema

El comercio ya tiene en el sistema sus productos, precios, ofertas, fotos y stock. Hoy el
cliente final no los ve: pregunta por WhatsApp "¿tenés tal cosa? ¿a cuánto?" y el dueño
responde a mano. Un catálogo online que salga solo del sistema ahorra ese ida y vuelta y
trae pedidos.

## Planes

| | Básico | Pro | **Tienda (nuevo)** |
|---|---|---|---|
| Precio mensual | $30.000 | $60.000 | **$80.000** |
| Cajas | 1 | 1 + $10.000 c/u extra | 1 + $10.000 c/u extra |
| Sistema completo (POS, stock, caja, reportes…) | Sí | Sí | Sí |
| Facturación ARCA, Mercado Pago (QR y Point) | — | Sí | Sí |
| **Catálogo online + pedidos** | — | — | **Sí** |

Tienda = Pro + catálogo. Mismas reglas de billing (débito automático, gracia, grupos de
sucursales con descuento). Sin prueba vencida ni falta de pago, la tienda se apaga sola
(muestra "cerrado temporalmente"), igual que el modo consulta.

## Qué ve el cliente final

Dirección propia del comercio, por ejemplo `servitec.net.ar/comercio/tienda/<slug>`
(o un dominio propio más adelante). Sin cuenta ni contraseña.

- Logo, nombre, dirección, horario y WhatsApp del comercio.
- Productos por rubro, buscador, **fotos**, precio con la oferta del día (mismo cálculo
  que la caja, `lib/pricing.ts`), carteles de oferta.
- "Sin stock" o se ocultan, según elija el dueño. Por kg: "aprox. 1 kg" con precio por kg.
- Carrito → **pedido**: nombre, teléfono, retiro en el local o envío (dirección), forma
  de pago (efectivo / transferencia / Mercado Pago), nota.

## Qué ve el comercio

- **Pantalla "Pedidos"** (nueva, plan Tienda): pedidos nuevos con aviso (sonido y número
  en el menú), estados *nuevo → preparando → listo / en camino → entregado* o *cancelado*.
- **Pasar a venta** en el POS, como los presupuestos: carga el carrito, se pesan los
  productos por kg (el precio final sale de la balanza), se cobra y descuenta stock.
- Botón de WhatsApp al cliente con el estado del pedido ("¡Tu pedido está listo!").
- **Configuración de la tienda**: activar/pausar, horario, qué rubros o productos se
  muestran, retiro y/o envío (costo fijo o por zona, pedido mínimo), formas de pago,
  texto de bienvenida, link y **QR para imprimir** en el local.

## Etapas

1. **Catálogo + pedido por WhatsApp.** La tienda arma el pedido y abre WhatsApp con el
   mensaje listo al número del comercio. Sin tabla de pedidos. Rápido de lanzar y probar
   si los comercios lo usan.
2. **Pedidos en el sistema.** Tabla `pedidos` (con `comercio_id`), pantalla Pedidos,
   aviso, pasar a venta.
3. **Pago online con Mercado Pago** con la cuenta del comercio (ya conectada en Pro):
   el pedido queda pagado y al pasar a venta se registra como cobrado por MP.

## Arquitectura (resumen)

- Ruta pública de solo lectura `/api/publico/tienda/<slug>` (acciones cerradas: datos del
  comercio, rubros, productos). Lee solo productos activos, con precio, del comercio de
  ese slug y con tienda activa; **nunca** costo, margen, stock exacto (solo hay/no hay)
  ni nada del panel. Caché corta para aguantar visitas.
- `POST /api/publico/tienda/<slug>/pedido` (etapa 2): límite por IP y por teléfono,
  validación de precios en el servidor (como `procesar-venta.ts`), sin sesión.
- `proxy.ts`: las rutas `/api/publico/*` quedan abiertas (regla nueva "publica" en
  `lib/permisos-api.ts`), todo lo demás sigue cerrado.
- `tienda` en `RUTAS_RESERVADAS` (`lib/panel.ts`).
- Plan: `planIncluyeTienda(plan)` en `lib/suscripcion.ts`; `PLANES` suma `"tienda"`;
  tarifa editable en el superadmin como las otras.
- SEO: cada tienda con título, descripción y foto para compartir (`lib/site.ts`).

## Decisiones abiertas

1. **Nombre y precio**: "Tienda" a $80.000 (Pro + catálogo). ¿O $80.000 incluye algo más?
2. **Por qué etapa arrancar**: propuesta, la 1 (catálogo + WhatsApp) para salir rápido.
3. **Envíos**: ¿solo retiro y "envío a coordinar", o costo por zona desde el principio?
4. **Productos que se muestran**: ¿todos los que tienen precio, o el dueño elige?
5. **Dirección**: `servitec.net.ar/comercio/tienda/<slug>` o un dominio/subdominio aparte.
6. **Fotos**: hoy pocos productos tienen. ¿Sumamos fotos automáticas por código de barras
   (catálogo de la distribuidora / bases públicas) o las carga el dueño?
