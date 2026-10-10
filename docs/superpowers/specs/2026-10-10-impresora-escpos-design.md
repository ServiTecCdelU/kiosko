# Impresora térmica ESC/POS y cajón de dinero — diseño

Fecha: 2026-10-10. Estado: implementado en el mismo commit que este spec.

## Problema

- El ticket salía solo de dos formas: ZPL a una Zebra ZD220 (`lib/server/zpl.ts`) o el
  diálogo de impresión del navegador (`window.print()`).
- La ruta `/api/imprimir-ticket` copia el ZPL a una impresora compartida **de la máquina
  donde corre Node**. En producción corre en Vercel, así que fallaba siempre: cada venta
  mostraba un toast de error y recién después abría el diálogo del navegador.
- Casi todos los supermercados chicos usan impresoras térmicas de 80 mm (Epson TM-T20,
  Xprinter, 3nStar, Sam4s, genéricas) que hablan **ESC/POS**, con un cajón de dinero
  enchufado a la impresora (puerto RJ11) que se abre con un comando de la impresora.
- El servidor SaaS no puede llegar a la impresora del local. Tiene que mandar el
  navegador.

## Decisión

1. **El ticket ESC/POS se arma en el navegador** con un módulo puro y testeado
   (`lib/escpos.ts`): bytes `Uint8Array` a partir del mismo `TicketData` que ya usan el
   ticket HTML y el ZPL. Sin dependencias nuevas.
2. **Dos formas de llegar a la impresora**, a elección por PC:
   - **WebUSB** (`lib/impresora/webusb.ts`): Chrome o Edge, el dueño elige la impresora
     una vez ("Conectar impresora USB") y el permiso queda guardado. No hay que instalar
     nada. Limitación conocida en Windows: si la impresora quedó tomada por el driver de
     Windows (`usbprint.sys`), Chrome no puede reclamarla; en ese caso se usa el agente.
   - **Agente local** (`herramientas/agente-impresora/agente.js`): un script Node sin
     dependencias que escucha en `http://127.0.0.1:9123` y manda los bytes a una
     impresora de Windows (por `winspool` vía PowerShell, con `copy /b` a la impresora
     compartida como segunda opción) o a una impresora de red (`host:9100`). Sirve para
     cualquier impresora que Windows vea, USB, serie o red, y no toca drivers.
3. **Modos**: `navegador` (default, igual que hoy), `webusb`, `agente`, `zebra` (la
   ruta ZPL de siempre, solo tiene sentido con la app corriendo en la misma PC).
   El modo `zebra` ya no es el default, así que en producción no hay más toast de error.
4. **Cajón**: comando `ESC p` (pin 2, y como respaldo pin 5). Se abre solo al cobrar en
   efectivo o mixto si está activado, y a mano con el botón "Abrir cajón" en el POS y
   en Caja. Con `navegador` o `zebra` el cajón no se puede abrir desde la app.
5. **Configuración por PC y por comercio** en `localStorage` con
   `claveDelComercioActual("kiosko:impresora")` (`lib/impresora/config.ts`):
   modo, ancho de papel (80 o 58 mm), abrir cajón al cobrar en efectivo, URL del agente
   e impresora elegida en el agente. No va a la base: la impresora es de la PC, no del
   comercio, igual que el lector Point.
6. **Ticket de prueba y diagnóstico** desde el diálogo "Impresora…" del POS
   (`components/pos/impresora-dialog.tsx`): imprime un ticket fijo, abre el cajón y
   lista las impresoras que ve el agente.

## Qué NO cubre esta versión

- ~~La factura electrónica sigue saliendo por el navegador.~~ Hecho el mismo día:
  `lib/escpos-comprobante.ts` arma la factura o nota de crédito (A, B o C) con el QR de
  AFIP impreso por la propia térmica (`GS ( k`, modelo 2, corrección M). Con modo `webusb`
  o `agente` sale por ESC/POS; con `navegador` o `zebra`, por `window.print()` como antes.
- Etiquetas de góndola y carteles: siguen por navegador o Zebra.
- Firefox y Safari no tienen WebUSB: ahí va agente o navegador.
- No se distribuye un `.exe` del agente. Hace falta Node instalado en la PC. Se puede
  empaquetar con Node SEA más adelante si algún comercio lo pide.

## Formato del ticket (ESC/POS)

Orden de bytes, en `generarTicketEscPos(ticket, opciones)`:

1. `ESC @` (reset), `ESC t 19` (página de códigos PC858). Para no depender de eso, el
   texto se **translitera a ASCII** (acentos fuera, `ñ`→`n`, `$` se mantiene).
2. Encabezado centrado: nombre del comercio en doble alto y negrita, "Ticket no
   fiscal", fecha y número.
3. Ítems: nombre en una o más líneas (corte por palabra a 48 o 32 columnas), después
   una línea `cantidad x precio` a la izquierda y `subtotal` a la derecha.
4. Total en doble alto y negrita, forma de pago, vuelto, cuotas, recargo, pagador y
   cajero, igual que el ticket HTML.
5. "Usted ahorró" y "Hoy en oferta" si vienen.
6. "Gracias por su compra", 4 líneas de avance y corte parcial `GS V 66 0`.
7. Si `abrirCajon`: `ESC p 0 25 250` antes del texto (el cajón se abre al toque,
   sin esperar a que termine de imprimir).

Columnas: 80 mm → 48, 58 mm → 32 (fuente A estándar). El ancho es configurable y los
tests cubren ambos.

## Transporte WebUSB

- `navigator.usb.requestDevice({ filters: [{ classCode: 7 }] })` (clase USB
  "printer"). Se acepta cualquier dispositivo que tenga un endpoint OUT bulk.
- Al conectar: `open()`, `selectConfiguration(1)` si hace falta, `claimInterface` de la
  primera interfaz con endpoint OUT, `transferOut` en bloques de 16 KB.
- El permiso persiste: `navigator.usb.getDevices()` lo recupera sin volver a pedirlo.

## Agente local

- `GET /estado` → `{ ok, version, impresoras: string[] }` (lista de Windows por
  `Get-Printer`, vacía en otros sistemas).
- `POST /imprimir` con `{ impresora?: string, datos: string (base64) }`. Si
  `impresora` tiene la forma `host:puerto` manda por TCP; si no, a la impresora de
  Windows con ese nombre.
- CORS abierto a cualquier origen y respuesta a `Access-Control-Request-Private-Network`
  (Chrome exige ese preflight cuando una página https habla con localhost).
- Solo escucha en `127.0.0.1`. No tiene autenticación porque solo acepta conexiones
  de la misma PC.
- Se arranca con `node agente.js` o `agente.bat`; para que arranque con Windows se
  pone un acceso directo al `.bat` en la carpeta de Inicio.

## Cambios en código

| Archivo | Cambio |
|---|---|
| `lib/escpos.ts` + `lib/escpos.test.ts` | Generador puro de bytes (nuevo) |
| `lib/impresora/config.ts` | Lectura y guardado de la configuración por PC y comercio (nuevo) |
| `lib/impresora/webusb.ts` | Transporte WebUSB (nuevo) |
| `lib/impresora/agente.ts` | Cliente del agente local (nuevo) |
| `lib/impresora/imprimir.ts` | `imprimirTicket(ticket)` y `abrirCajon()` que eligen el transporte según el modo (nuevo) |
| `components/pos/impresora-dialog.tsx` | Diálogo de configuración y prueba (nuevo) |
| `app/pos/page.tsx` | Usa `imprimirTicket` de la capa nueva; botones "Impresora…" y "Abrir cajón" |
| `app/caja/page.tsx` | Botón "Abrir cajón" |
| `herramientas/agente-impresora/` | Agente local y README (nuevo) |
| `docs/CONTEXTO.md`, `CLAUDE.md` | Sección de impresión actualizada |

Sin SQL: no hay columnas ni tablas nuevas.
