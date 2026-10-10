# Factura A y B (responsable inscripto) — diseño

Fecha: 2026-10-10. SQL: `supabase/48_factura_a_b.sql` (correr antes de deployar).
Extiende `2026-10-03-facturacion-afip-design.md`, que cubría solo Factura C (monotributo).

## Problema

Muchos supermercados chicos son responsables inscriptos: no pueden emitir Factura C.
Necesitan Factura B al público y Factura A a otros inscriptos, con el IVA discriminado por
alícuota. Desde la migración 47 cada producto tiene su alícuota, que es lo que faltaba.

## Normativa (verificada 2026-10)

- **Tipos**: Factura A = 1, NC A = 3, Factura B = 6, NC B = 8 (C = 11 / 13 ya estaban).
- **Quién recibe qué**: un emisor inscripto emite **A** a responsables inscriptos (con CUIT
  obligatorio, `CondicionIVAReceptorId = 1`) y **B** a consumidor final (5), monotributo (6)
  y exento (4). Un monotributista sigue emitiendo C a todos.
- **WSFEv1 para A/B**: `ImpNeto` = gravado sin IVA, `ImpIVA` = suma de IVA, `ImpOpEx` =
  exento, y el array `Iva` con `AlicIva {Id, BaseImp, Importe}` por alícuota. Debe cumplirse
  `ImpTotal = ImpNeto + ImpIVA + ImpOpEx` al centavo. Ids de alícuota: 3 = 0 %, 4 = 10,5 %,
  5 = 21 %, 6 = 27 %, 8 = 5 %, 9 = 2,5 %. El orden en el XML es el del XSD: `Iva` va
  después de `CbtesAsoc`.
- **Comprobante impreso**: la A discrimina neto, IVA por alícuota y total, y lleva CUIT y
  condición del receptor. La B muestra precios finales y, por la **RG 5614/2024**
  (transparencia fiscal al consumidor), la leyenda "IVA contenido" con el importe.
- La identificación obligatoria desde $10.000.000 (RG 5700) aplica igual.

## Decisiones

| Decisión | Motivo |
|---|---|
| `afip_config.condicion_iva` (`monotributo` / `responsable_inscripto`) | Un solo dato decide todo: con monotributo nada cambia; con inscripto se emite A o B según el receptor. |
| `clientes.condicion_iva` opcional | Un cliente inscripto cargado una vez recibe Factura A sola, también en modo automático. |
| Los precios del catálogo son finales: el neto se calcula hacia atrás (`precio / (1 + alícuota)`) | Es como trabaja el mostrador. El IVA de cada ítem sale de `productos.iva` **actual** (no histórico), igual que el costo en reportes. |
| Desglose en `lib/afip/iva.ts`, puro y testeado, con ajuste del último centavo | AFIP exige que las sumas cierren exacto; el redondeo por alícuota puede dejar un centavo de diferencia, que se carga a la alícuota mayor. |
| El desglose se guarda en la fila de `facturas` (`neto`, `iva`, `exento`, `alicuotas`) | Lo que se declaró a AFIP queda fijo aunque cambie el IVA del producto después. |
| Alícuota 0 % del catálogo = operación **exenta** (`ImpOpEx`) | Es el caso real (leche, agua, libros). No se usa el Id 3 "0 %". |
| Nota de crédito A/B: desglose proporcional al de la factura original | Una NC parcial por devolución acredita la misma mezcla de alícuotas. Mantiene las sumas exactas con el mismo ajuste de centavo. |
| Descuento o recargo del ticket | Se prorratea entre los ítems antes de desglosar, así el total facturado es el cobrado. |
| El punto de venta de un inscripto se da de alta como "Factura Electrónica - Web Services" (sin "Monotributo") | El tutorial lo dice según la condición elegida. |

## Pantallas

- Tutorial de facturación, paso "Tus datos fiscales": selector **Condición frente al IVA**.
- Ventas → Facturar: si el emisor es inscripto, selector de condición del cliente
  (consumidor final, responsable inscripto, monotributo, exento). Inscripto exige CUIT.
- POS → Facturar: usa la condición del cliente de la venta si la tiene; si no, consumidor final.
- Clientes → Nuevo cliente: condición frente al IVA (opcional).
- Comprobante impreso A/B/C con las leyendas correspondientes.

## Fuera de alcance

- Percepciones y otros tributos (`ImpTrib` sigue en 0).
- Factura M y comprobantes de exportación.
- CAEA (contingencia).
