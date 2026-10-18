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
