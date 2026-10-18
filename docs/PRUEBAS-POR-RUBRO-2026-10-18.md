# Prueba por rubro — 2026-10-18

Se crearon 9 comercios de prueba por el alta real (panadería, ferretería, verdulería,
carnicería, dietética, kiosco, supermercado, almacén y librería; servidor local contra la
base de producción, todos con nombre "PRUEBA …") y se operó cada uno como lo haría el
dueño: carga de productos, apertura y cierre de caja, ventas por unidad y por peso,
etiquetas de balanza, ofertas, fiado, cuotas, mixto, descuentos, anulación, devolución,
compras a proveedor, cajeros con PIN en PCs registradas y reportes. La panadería se probó
además desde el navegador.

No se probó: Mercado Pago, AFIP, impresión física, cola offline, importación de Excel.

Los comercios de prueba siguen en la base y se pueden borrar desde el superadmin.

**Estado al cierre del día: todo lo encontrado quedó resuelto.** La balanza conectada a
la PC falta probarla con una balanza real (sección 2). Cada arreglo se probó contra el servidor local y, lo de pantalla,
también en el navegador.

---

## 1. Errores

### A. Graves — resueltos (commit `34f247f`)

1. **Producto por kg "sin control de stock" no se podía vender** ("Stock máximo (0kg)").
   El diálogo de peso ahora respeta `stockControlado` y suma lo que ya está en el carrito.
2. **Etiqueta de balanza con precio embebido se cobraba como peso** ($3.000 → 3 kg,
   $18.000). En el POS, "Impresora y balanza" permite elegir por PC si la etiqueta trae
   peso o importe; con importe, el peso sale del precio por kg del sistema.
3. **El cajero podía cambiar precios, ofertas y stock por API.** Nivel "gestión" (admin y
   encargado) en `lib/permisos-api.ts`; el alta rápida del POS sigue abierta. El cambio
   de precio lo audita el servidor (se borró la ruta de auditoría que mandaba el navegador).
4. **Los cobros de fiado en efectivo no entraban a la caja** (sobrante en el cierre). El
   cobro elige efectivo o transferencia; el efectivo entra como aporte en la caja abierta.
5. **Total de la venta sin redondear** (`899.0999999999999`). Total a centavos.

### B. Medios — resueltos (commit `8235910`, migración 61)

6. **Peso con 2 decimales y punto** en carrito y ticket → 3 decimales y coma en carrito,
   ticket, ticketera, Zebra y pantalla del cliente.
7. **Ventas sin caja** → el servidor exige caja abierta del comercio; con Mercado Pago se
   valida antes de cobrar.
8. **Productos por unidad con cantidades fraccionadas** → solo enteros (kg, m, l con 3 decimales).
9. **Descuento mayor al total** → rechazado. (Tope por rol para el cajero: no se definió.)
10. **Pago de fiado mayor a la deuda** → rechazado con el monto que debe.
11. **La devolución figuraba como gasto "Sin categoría"** → en reportes se resta de las
    ventas y de lo vendido por producto; un cambio sin reembolso no resta.
12. **Débito y crédito sumados como transferencia** → tarjeta aparte en arqueo,
    consolidado y reportes (`ventas.tarjeta_amount`, `caja.total_tarjeta`).
13. **Reposición sugería servicios** → se excluyen los productos sin control de stock.

### C. Menores (commit `97e4211`, migración 62)

14. Clic en un producto sin stock no avisaba → avisa y sugiere qué hacer. **Resuelto.**
15. Rótulos al vender por kg en Producto nuevo y en el listado de Stock ("Precio por kg",
    "/kg", stock en kg). **Resuelto.**
16. Dos etiquetas de balanza del mismo producto se suman en una línea. **Se dejó así:** se
    cobra igual y ofertas y tope de stock funcionan mejor con una línea.
17. `diasSinPagar: -1` → nunca negativo. **Resuelto.**
18. Id de venta con contador global (`venta_337`) → id aleatorio; el número de ticket
    sigue por comercio. **Resuelto.**
19. En la caja el fiado cuenta en la cantidad de ventas pero no en el total. **Se dejó
    así:** un test lo pide a propósito; es decisión de producto.

### D. Encontrados después — resueltos

- **Anular una venta con devoluciones** devolvía de nuevo todo el stock y toda la parte
  fiada. Ahora no se puede anular; lo que falta se devuelve (commit `97da629`, migración 70).

---

## 2. Huecos por rubro

| Hueco | Estado |
|---|---|
| Cantidad tipeable en el carrito y "150*" en el buscador | Hecho (`3fa4222`) |
| Venta de "varios" / precio libre (recargas, fotocopias) | Hecho: productos de precio libre y botón "Varios" en el POS (`3fa4222`, migración 64) |
| Venta por importe en productos por kg ("$2.000 de almendras") | Hecho: pestaña "Por importe" en el diálogo de peso (`3fa4222`) |
| Unidades metro y litro | Hecho (`3fa4222`, migración 63) |
| Aumento masivo de precios por rubro o % | Hecho: "Aumentar precios" en Stock, con vista previa y auditoría (`3fa4222`, migración 65) |
| Presupuestos | Hecho: armar desde el POS, PDF, pasar a venta con precio respetado (`5cdeaeb`, migración 66) |
| Pago mixto con parte a fiado | Hecho, con límite de crédito, arqueo, reportes y anulación (`f17b239`, migración 67); su devolución baja primero la deuda (`97da629`, migración 69) |
| El rubro del alta no cambiaba nada | Hecho: productos típicos del rubro, unidad y control de stock iniciales (`16ee63d`) |
| Panadería: producción del día | Hecho: pantalla Producción con cierre y resumen semanal (`129296f`, migración 68) |
| Balanza conectada a la PC | Hecho, **sin probar con una balanza física**: Systel (los 4 protocolos del manual oficial), Kretz, Moretti, CAS, Dibal y Toledo, con detección automática (spec `2026-10-18-balanza-conectada-design.md`) |

Especificaciones de lo grande en `docs/superpowers/specs/2026-10-18-*-design.md`.

---

## 3. Lo que anduvo bien desde el principio

- Alta self-service por rubro y plan, con Caja 1..N y límite de 3 altas por hora por IP.
- Precios autoritativos: combo "2 kg x $3.000" sobre kilos, −20 %, cuotas con recargo,
  mixto con recargo solo sobre la parte a crédito, todos exactos.
- Stock en kg con 3 decimales; anulación devuelve stock; devolución parcial por peso exacta.
- Límite de crédito del fiado; validación de CUIT del proveedor; compra a cuenta corriente
  suma stock y actualiza costo.
- Cajeros con PIN: PIN obvio y repetido rechazados, login solo en PC registrada, el PIN de
  un comercio no entra en la PC de otro, una caja por cajero/puesto, consolidado
  multi-caja, reportes vedados al cajero.
- Aislamiento entre comercios: en cada prueba nueva se verificó que otro comercio no ve
  los datos (presupuestos, producción).
