# Plan de mejoras — Kiosko Despensa

Análisis del código actual + qué necesita realmente un kiosko o despensa de barrio en Argentina, para decidir qué construir después.

- **Fecha de análisis**: 2026-08-06
- **Método**: lectura del código fuente (no solo la UI) — `services/*`, `supabase/*.sql`, `app/*` — para basar cada punto en algo verificable, no en supuestos.
- Este documento **complementa** a `PLAN.md` (que ya cubre seguridad/SaaS/deuda técnica). Acá el foco es: *¿qué le falta al sistema para ser el POS del día a día de un kiosko o una despensa real?*

---

## 1. Qué tiene el sistema hoy (verificado en código)

| Módulo | Estado real |
|---|---|
| POS | Venta con escaneo, búsqueda, atajos de teclado, pago efectivo/transferencia/mixto/fiado. Precio autoritativo desde la BD (`app/api/ventas/route.ts`). |
| Stock | Alta manual, **importación masiva desde Excel** (recién agregada), ajuste de stock con motivo, ofertas por producto, dashboard con contadores, filtro por rubro. |
| Caja | Apertura/cierre con arqueo, diferencia calculada. **No tiene** retiros/aportes/gastos ni anulación de venta (hay un SQL preparado en `supabase/09_anulacion_caja_mov.sql` que nunca se aplicó ni se codeó — ver `PLAN.md`). |
| Clientes / fiado | Cuenta corriente con saldo y movimientos. |
| Reportes | Resumen por método de pago, ventas por día, top productos. |
| Sincronización | Trae catálogo (nombre/precio/rubro) desde la distribuidora, upsert por código. |
| Costo/margen | **El campo existe** (`productos.precio_base`) y se sincroniza desde la distribuidora, pero **no se usa en ningún lado**: no aparece en reportes, no es editable en "Editar producto", el importador de Excel no lo carga. Hoy es un dato muerto. |

---

## 2. Cómo trabaja realmente un kiosko/despensa (lo que no se ve en un diagrama de tablas)

Esto es lo que determina qué construir, en orden de impacto real:

1. **Inflación constante → listas de precios cambian todo el tiempo.** No es un caso raro, es semanal. El importador de Excel que ya armamos es la funcionalidad más usada del sistema, no un extra — y hoy **descarta el costo**, que es justamente el dato que más cambia.
2. **El margen es la pregunta del día, no del mes.** "¿Con este aumento de la distribuidora, a cuánto tengo que vender esto para no perder plata?" Sin costo cargado, el sistema no puede contestar eso.
3. **Plata en efectivo que sale de la caja sin ser "venta".** Pagarle al repartidor de gaseosas, sacar plata para el colectivo, un préstamo a un empleado. Si el sistema no lo registra, el arqueo del cierre **nunca cierra**, y ahí es donde el dueño deja de confiar en el sistema y vuelve al cuaderno.
4. **El error de cobro pasa todos los días.** Cobrar dos veces, escanear mal, el cliente se arrepiente. Hoy no hay forma de anular sin tocar la base de datos a mano.
5. **Fiado es informal y de memoria colectiva ("los Fernández", "el de la esquina").** Ya está resuelto razonablemente bien en el sistema — es uno de los puntos fuertes actuales.
6. **Mitad del catálogo de un kiosko no tiene código de barras**: cigarrillos sueltos, golosinas sueltas, fotocopias, recarga de celular, alfajores de la caja sin escanear. Hoy la única forma de cargarlos es escribir el nombre — lento en el mostrador con cliente esperando.
7. **La despensa vende por peso** (fiambre, verdura, queso) y **por lote/bulto** (ya soportado: `lote`), pero no hay un modo "vender por kg" — solo unidades.
8. **Vencimientos importan más en despensa que en kiosko** (lácteos, fiambres, conservas cerca de la fecha).
9. **Épocas del año concentran ventas**: útiles escolares en marzo, helados en verano, sidra/pan dulce en diciembre — nada del sistema ayuda a anticipar reposición estacional, pero es secundario frente a lo anterior.

---

## 3. Plan de mejoras — priorizado por impacto real, no por tamaño técnico

### 🔴 Prioridad 1 — Sin esto el dueño no puede cerrar el día con confianza

| # | Ítem | Por qué es prioridad 1 | Alcance técnico |
|---|---|---|---|
| 1 | ✅ **Costo de producto usable de punta a punta** | Es el dato que ya existe y se tira a la basura. Sin esto no hay reporte de rentabilidad posible. | Hecho: columna "Costo" en el importador de Excel (opcional), campo editable en "Editar producto" con margen % en vivo, y columna "Margen" en la tabla de stock. |
| 2 | ✅ **Reporte de rentabilidad** | "¿Qué rubro me deja plata y cuál no?" es la pregunta que un dueño de despensa hace todas las semanas. | Hecho: KPI de margen bruto, margen por producto en "Más vendidos" y nueva tabla "Rentabilidad por rubro" en `/reportes`, usando `precio_base` actual (no histórico) contra lo vendido. |
| 3 | ✅ **Retiros, aportes y gastos de caja** | Sin esto el arqueo de cierre da diferencia todos los días y el sistema pierde credibilidad en la primera semana de uso real. | Hecho: `supabase/09_anulacion_caja_mov.sql` (ejecutar si no se hizo aún) + `/api/caja/movimiento` + botones Aporte/Retiro/Gasto en `/caja` con historial. El cierre de caja ahora calcula `apertura + ventas_efectivo + aportes − retiros − gastos`. |
| 4 | ✅ **Anulación de venta** | El error de cobro es diario, no una excepción. | Hecho: `/api/ventas/anular` (RPC `anular_venta_kiosko`), listado "Ventas de esta caja" en `/caja` con botón Anular (solo rol admin), devuelve stock automáticamente y revierte saldo de fiado si corresponde. Reportes y resumen de caja excluyen ventas anuladas. |

### 🟠 Prioridad 2 — Amplía qué tipo de comercio puede usar el sistema sin quejarse

| # | Ítem | Detalle |
|---|---|---|
| 5 | ✅ **Grilla de productos rápidos / favoritos** | Hecho: toggle "Producto rápido" en "Editar producto" + grilla en el POS que aparece cuando no hay búsqueda activa. Cubre el 30-40% del catálogo sin código de barras (cigarrillos, golosinas sueltas, fotocopias). |
| 6 | ✅ **Venta por peso/kg** | Hecho: campo `unidad` ("un"/"kg") por producto, diálogo de peso al agregar al carrito un producto por kg, cantidades decimales en el carrito (stock y cantidad ya eran `numeric` en la BD, no hizo falta tocar la RPC de venta). |
| 7 | ✅ **Control de vencimientos** | Hecho: campo `fecha_vencimiento` editable en "Editar producto" + banner de aviso en `/stock` ("N productos vencen en los próximos 7 días"). |
| 8 | ✅ **Combos y precio por cantidad** | Hecho: `oferta_tipo = 'combo'` en `lib/pricing.ts` (`precioLinea`), UI en el diálogo de Oferta ("cada cuántas unidades" + "precio del combo"), badge Nx$ / 2x1 en POS y stock, y `/api/ventas` recalcula el subtotal autoritativo con combos incluidos (no confía en el cliente). |
| 9 | ✅ **Impresión de ticket** | Hecho: layout térmico 80mm imprimible desde el navegador (`window.print()`), se dispara automáticamente al confirmar el cobro + botón "Reimprimir" en el header del POS. ESC/POS por WebUSB queda como mejora posterior si un comercio pide impresión silenciosa sin diálogo del navegador. |

### 🟡 Prioridad 3 — Operación diaria más prolija (no bloquea vender, pero se nota rápido)

| # | Ítem | Detalle |
|---|---|---|
| 10 | ✅ **Gastos como categoría propia en reportes** | Hecho: KPI "Gastos" y "Ganancia neta" (margen bruto − gastos) en `/reportes`, usando los movimientos de caja tipo `gasto` ya existentes del ítem 3. |
| 11 | ✅ **Turnos / múltiples cajeros por caja** | Hecho: tabla "Vendido por cajero" en `/caja` (se muestra automáticamente cuando más de un usuario cobró en la misma caja), sin necesidad de cerrar y reabrir caja por turno. |
| 12 | ✅ **Suspender venta / ticket en espera** | Hecho: botón "Suspender" en el carrito del POS, guarda el carrito en el dispositivo y lo recupera después desde "En espera" en el header. |
| 13 | ✅ **Auditoría de cambios de precio** | Hecho: tabla `producto_auditoria`, se registra automáticamente cada cambio manual de precio (quién y cuándo) y se muestra un historial dentro de "Editar producto". |
| 14 | ✅ **Recarga de celular / servicios como "producto especial"** | Hecho: columna `stock_controlado` + `process_sale_kiosko` actualizada para saltar la validación y el descuento de stock en productos marcados como "servicio" (toggle en "Editar producto"). POS y stock ya no muestran alertas de stock bajo/agotado para estos productos. |

### 🔵 Prioridad 4 — Diferenciales que justifican precio frente a la competencia

| # | Ítem | Detalle |
|---|---|---|
| 15 | ✅ **Modo offline (PWA)** | Hecho: service worker manual (`public/sw.js`, sin tocar `next.config.mjs`) que cachea la app shell; catálogo completo cacheado en IndexedDB (`lib/offline/db.ts`) para buscar y cobrar sin señal; las ventas offline se guardan en una cola local y se sincronizan solas al volver la conexión (`hooks/use-offline-sync.ts`). El fiado no se puede cobrar offline (necesita validar saldo en el momento). |
| 16 | ✅ **Cobro con QR de Mercado Pago** | Hecho: nuevo método de pago "MP" en el POS, genera un QR (Checkout Pro) que el cliente escanea; la venta real recién se registra cuando el webhook de Mercado Pago confirma el pago aprobado (`process_sale_kiosko` no se dispara antes). Requiere completar `MP_ACCESS_TOKEN` y `NEXT_PUBLIC_APP_URL` en `.env.local` y correr `supabase/16_mercadopago_qr.sql`. El fiado y el modo offline no aplican a este método (necesita conexión y confirmación en el momento). |
| 16b | ✅ **Cobro con lector Mercado Pago Point** | Extra no planeado originalmente: método "MP Point" que manda el cobro directo al lector físico emparejado (Point Integration API) — el cliente paga apoyando/insertando la tarjeta en el lector, sin QR. Reutiliza el mismo webhook y tabla `pagos_mp_pendientes` del ítem 16. Requiere `supabase/17_mercadopago_point.sql`. **Verificado contra un lector real** (Newland N950): cobra, el webhook confirma y la venta se registra. Ver "Puesta en marcha del lector Point" más abajo. |
| 16c | ✅ **Tarjeta manual (posnet de banco/Prisma/Payway)** | Extra no planeado: método "Tarjeta" simple para cuando el posnet es de un banco/procesadora sin integración de API — el cajero cobra aparte en el posnet físico y marca la venta como pagada acá, se contabiliza como transferencia. |
| 17 | ✅ **Historial de precios por producto** | Hecho: la auditoría de precios (ítem 13) ahora también registra los cambios que vienen de la importación de Excel y de la sincronización con la distribuidora (antes solo capturaba ediciones manuales). Nueva tabla "Mayores aumentos de precio (últimos 30 días)" en `/reportes`, cruzando todo el catálogo para detectar qué subió más y cuándo. |

---

## 3b. Puesta en marcha del lector Point

Pasos necesarios para que el método "MP Point" funcione. Todos son obligatorios;
si falta uno, el cobro no llega al lector o la venta no se registra.

1. **`MP_ACCESS_TOKEN`** — Access Token de **producción** (empieza con `APP_USR-`).
   Los lectores físicos no funcionan con credenciales `TEST-`. De las cuatro
   credenciales que muestra el panel de MP solo se usa esta: Public Key, Client ID
   y Client Secret no hacen falta.
2. **`NEXT_PUBLIC_APP_URL`** — la URL pública del deploy, sin barra final.
3. **Webhook en el panel de MP** — Developers → Tus integraciones → Webhooks,
   modo Producción, evento **"Pagos"** (aparece como *Pagos (legacy)*, es el correcto:
   nuestro webhook espera `type=payment`), URL `<APP_URL>/api/mercadopago/webhook`.
   A diferencia del QR, el cobro Point **no** manda `notification_url` por request,
   así que sin esto la tarjeta se cobra y la venta nunca se registra.
4. **Lector en modo PDV** — de fábrica viene en `STANDALONE` y rechaza los cobros
   por API. Se cambia con `PATCH /api/mercadopago/dispositivos`
   (`{"deviceId": "..."}`) y **hay que reiniciar el lector** para que tome efecto.
   Verificar con `GET /api/mercadopago/dispositivos` que diga `operatingMode: "PDV"`.
   En PDV el lector deja de cobrar por su cuenta desde su propio menú.
5. **`supabase/17_mercadopago_point.sql`** aplicado.

### Cancelar un cobro

Mercado Pago solo deja cancelar por API mientras el cobro no llegó a la pantalla
del lector. Una vez que se muestra (`current_state ON_TERMINAL`) responde 409 y
hay que cancelarlo con la tecla del propio lector. En ese caso el pago **se deja
en `pendiente` a propósito**: si el cliente igual termina pagando, el webhook
registra la venta. Marcarlo como cancelado haría entrar la plata sin venta.

Si un lector queda trabado con un cobro viejo ("there is already..."), se libera
con `POST /api/mercadopago/point/destrabar` (`{"deviceId": "..."}`), que cancela
los cobros pendientes registrados para ese lector.

### QR

El QR del ítem 16 (método "MP") se muestra en la **pantalla del POS**, no en la
del lector. El lector no puede mostrar QR con la Point Integration API que usamos:
para eso habría que migrar a la Orders API de MP, que unifica Point + QR.

---

## 4. Lo que NO conviene priorizar todavía

- **Facturación AFIP/ARCA**: correcto dejarlo para un plan "Pro" más adelante (ya está así en `PLAN.md`); la mayoría de kioskos chicos operan con monotributo y ticket no fiscal informal.
- **Panel de superadmin / onboarding self-service**: solo importa cuando haya más de 3-5 comercios reales usando el sistema en simultáneo.
- **Balanza electrónica con lectura de código EAN embebido (prefijo 20-29)**: útil, pero es una integración de hardware específica — conviene resolver primero "venta por kg" a mano (ítem 6) y recién después la lectura automática, cuando haya un cliente real con balanza que la pida.

---

## 5. Orden recomendado de implementación

1. **Costo + reporte de rentabilidad** (ítems 1-2): son cambios chicos sobre código ya existente (`import-service.ts`, `editar-producto-dialog.tsx`, `reportes-service.ts`) con el mayor impacto en la percepción de "esto me sirve para mi negocio".
2. **Retiros/aportes/gastos + anulación de venta** (ítems 3-4): el SQL ya está escrito, solo falta aplicarlo y programar el código — es directamente el ítem de mejor relación esfuerzo/impacto de toda la lista.
3. **Grilla de productos rápidos** (ítem 5): mejora diaria de velocidad de cobro, no requiere cambios de esquema grandes.
4. **Venta por peso + vencimientos** (ítems 6-7): abre el sistema a despensas con fiambrería/verdulería, hoy mal cubiertas.
5. Resto de prioridad 2 y 3 según feedback real del primer comercio que use el sistema en producción — no conviene seguir planificando en el vacío más allá de este punto.
