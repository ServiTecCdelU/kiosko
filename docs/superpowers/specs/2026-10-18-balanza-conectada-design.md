# Balanza conectada a la PC — diseño (2026-10-18)

## Problema

Panaderías, verdulerías y carnicerías pesan en una balanza y después tipean el peso en
el POS (o imprimen etiqueta). Los clientes usan sobre todo **Systel Cuora**; también son
comunes Kretz, Moretti, CAS, Dibal y Toledo/Prix.

## Qué hace

- **"Impresora y balanza" → Balanza conectada a la PC** (por PC, en localStorage como la
  impresora): marca, "Conectar balanza" (elige el puerto, Chrome/Edge con Web Serial),
  **"Detectar y probar"** (prueba los protocolos en el orden de esa marca y guarda el
  que responde), "Leer peso", y ajustes avanzados (protocolo, velocidad, cómo leer los
  números sin coma) con los bytes recibidos a la vista para diagnosticar.
- **POS**: al abrir el diálogo de peso de un producto por kg, si la balanza está
  activada, el peso se lee solo; con peso inestable o plato vacío reintenta ~5 s;
  "Leer de nuevo" y tipear siguen disponibles.

## Protocolos

Fuente: Systel, "Información sobre conexión serie de balanzas y básculas con PC",
Rev 10 (soporte.systel-global.com), y manuales de usuario Kretz.
Puerto: **9600 baudios, 8 bits, sin paridad, 1 bit de parada**. El manual de Systel
dice que el protocolo disponible depende del modelo y la fecha de fabricación y que hay
que probar los cuatro: eso hace "Detectar y probar".

| Id | Pedido | Respuesta |
|---|---|---|
| `systel-a` | `$05` | `STX` + peso (6/7 car., como el visor; sin coma = gramos) + `ETX` + XOR de STX..ETX. `$11` = inestable |
| `systel-b` | `$07` | peso (5/6 car.) + `e`/`i` (estable/inestable) + XOR |
| `torrey` | `P` | `CR` + peso con punto (`-###.###`). Systel C, Kretz, Torrey |
| `cas` | `W` | `STX` + peso + `CR`. Systel D, CAS |
| `continuo` | — | la balanza manda el peso todo el tiempo; se usa la última línea completa |

Implementación: `lib/balanza-serie.ts` (puro: pedidos y lectura de tramas, testeado con
los ejemplos del manual: 710 g = `02 30 30 30 37 31 30 03 07`), `lib/balanza-puerto.ts`
(Web Serial; testeado con una balanza simulada), `components/pos/balanza-serie-section.tsx`.

## Limitaciones conocidas

- **No se probó con una balanza física.** Las tramas siguen el manual de Systel; las de
  Kretz/Moretti/CAS/Dibal/Toledo se cubren con los modos Torrey, CAS y continuo, que son
  los que documentan esas marcas, pero conviene verificarlas en el local.
- **Cuora por USB**: los manuales de la Cuora/Cuora Max hablan de comunicación a PC por
  USB. Si Windows la ve como puerto COM (driver USB-serie), funciona igual; si usa un
  protocolo USB propio, Chrome no la ve como puerto serie y hay que usar el RS-232 (si el
  modelo lo trae) o la etiqueta con código de balanza, que ya funciona.
- Solo Chrome y Edge (Web Serial). Firefox y Safari no tienen la API.

## Systel Cuora: etiquetas, ticket y Qendra (agregado el mismo día)

Fuente: manual Cuora Neo (Systel, cód. 36832 rev. 07) e instructivo "Metodología para
interconectar datos entre un sistema de administración y Qendra".

**Códigos que imprime la Cuora** (configurables en Configuración → Códigos de barra):
- Producto por peso: `20 PPPP IIIIII X`; por unidad: `21 PPPP IIIIII X`. De fábrica el
  código de producto tiene 4 dígitos y el importe 6, con centavos. Las fotos del manual
  usan 5+5. En "Impresora y balanza" se elige "importe con centavos" y el largo del
  código (4 o 5). Ojo: 5 dígitos de importe con centavos llegan solo a $999,99.
- Ticket de varios productos: `22 AA IIIIIIII X`. Trae **solo el total**: el manual dice
  que no se puede incluir el código de artículo. Con "Leer el ticket de la balanza
  (código 22)", el POS lo cobra como una línea "Varios". No descuenta stock ni sabe qué
  verduras fueron.
- Para que el POS tome cada verdura con su kg e importe, la balanza tiene que imprimir
  **una etiqueta por producto** (modo etiqueta). Simulado en
  `lib/balanza-verduleria.test.ts` y probado en el POS.

**Precios hacia la balanza (Qendra):** Stock → "Balanza" arma el CSV del instructivo
(`Sección;PLU;Descripción;Nº PLU;Precio1;Precio2;P/U;Vencimiento;Ingredientes`, `;`,
sin encabezado, Windows-1252, CRLF) con los productos cuyo código es un PLU 1-4000, y lo
guarda en la carpeta que vigila Qendra (Chrome/Edge) o lo descarga. `lib/qendra.ts`.
- Código de PLU (el del código de barras) = `productos.codigo`, 1-99997. Número de PLU
  (posición en la memoria, 1-4000): el mismo si entra; si no, la primera libre.
- **Va el precio con la oferta de hoy** (porcentaje o monto fijo, con su vigencia). El
  POS saca el peso del importe con ese mismo precio, así que la caja cobra lo que dice
  la etiqueta. Los combos ("2 kg x $3.000") la balanza no los puede hacer: van a precio
  de lista y se avisan; la caja aplica el combo igual. Hay que volver a enviar cuando
  empieza o termina una oferta (si la balanza queda desactualizada, la caja cobra igual
  el importe de la etiqueta y solo se corre el peso que se descuenta del stock).
