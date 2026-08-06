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
| 8 | **Combos y precio por cantidad** | `lib/pricing.ts` ya resuelve oferta por producto individual; falta "3x2", "2do al 70%", "llevando 6 unidades, $X c/u". Muy pedido en bebidas y golosinas. |
| 9 | **Impresión de ticket** | No hay ni térmica ni PDF. Layout imprimible 58/80mm desde el navegador como primer paso (sin hardware especial); ESC/POS por WebUSB como mejora posterior. |

### 🟡 Prioridad 3 — Operación diaria más prolija (no bloquea vender, pero se nota rápido)

| # | Ítem | Detalle |
|---|---|---|
| 10 | **Gastos/proveedores como categoría propia** | Separado de "retiro de caja": registrar compras a proveedores con su monto, para que el reporte de rentabilidad sea real (no solo margen teórico por lista de precios, sino gasto real). |
| 11 | **Turnos / múltiples cajeros por caja** | Hoy la caja es una sola por día. Un kiosko familiar suele tener 2 turnos (mamá a la mañana, hijo a la tarde) — sería útil poder ver "vendido por cajero" dentro del mismo día sin cerrar y volver a abrir caja. |
| 12 | **Suspender venta / ticket en espera** | Cliente que "ya vuelvo, dejame esto" mientras se atiende a otro. Guardar el carrito actual y recuperarlo después, sin perderlo. |
| 13 | **Auditoría de cambios de precio y ajustes de stock** | Quién cambió qué y cuándo — ya hay `stock_movimientos` con `usuario`, falta lo mismo para cambios de precio manual (no solo por sync/import). Protege al dueño frente a errores o abuso de un empleado. |
| 14 | **Recarga de celular / servicios como "producto especial"** | Muy común en kioskos: se cobra pero no es "stock" tradicional. Se puede modelar como producto con `stock` infinito/no controlado, marcándolo explícitamente en vez de forzarlo con truco de stock alto. |

### 🔵 Prioridad 4 — Diferenciales que justifican precio frente a la competencia

| # | Ítem | Detalle |
|---|---|---|
| 15 | **Modo offline (PWA)** | Ya está en `PLAN.md` como bloqueante de venta — se mantiene acá porque es el diferencial más fuerte: un local que no puede dejar de cobrar cuando se corta el wifi. |
| 16 | **Cobro con QR de Mercado Pago** | La estructura de `comercios` ya lo contempla (ver `PLAN.md`); falta el flujo de generación de QR + webhook. |
| 17 | **Historial de precios por producto** | Ver cómo evolucionó el precio de un producto en el tiempo — útil para decidir cuándo actualizar la lista y detectar productos que un proveedor aumentó de más. |

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
