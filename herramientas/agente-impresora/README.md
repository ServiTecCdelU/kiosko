# Agente de impresión

Programita que corre en la PC del mostrador y le pasa los tickets a la impresora
térmica. Hace falta cuando la impresión directa por USB (Chrome/Edge) no anda, o
cuando la impresora es de red o está instalada en Windows con su driver.

El sistema está en internet y no puede llegar solo a la impresora del local: el
navegador le manda el ticket al agente (`http://127.0.0.1:9123`) y el agente se lo
escribe a la impresora. Solo acepta conexiones de la misma PC.

## Instalación (una vez por PC)

1. Instalar **Node.js** (versión LTS) desde <https://nodejs.org>. Siguiente, siguiente, listo.
2. Copiar esta carpeta (`agente-impresora`) a la PC, por ejemplo en `C:\agente-impresora`.
3. Abrir `agente.bat` (doble click). Tiene que decir
   `Agente de impresion 1.0.0 escuchando en http://127.0.0.1:9123`. Dejar la ventana abierta.
4. En el sistema: **Punto de venta → Impresora → "Impresora térmica por el agente local"**,
   tocar **Buscar impresoras**, elegir la impresora y tocar **Imprimir ticket de prueba**.

Para que arranque solo con Windows: botón derecho sobre `agente.bat` → *Crear acceso
directo*, y mover ese acceso directo a la carpeta de Inicio (`Win + R`, escribir
`shell:startup`, Enter).

## Qué impresoras sirven

- **USB o serie instalada en Windows** (Epson TM-T20, Xprinter, 3nStar, Sam4s, genéricas
  de 80 o 58 mm): se elige por su nombre de Windows. El agente le escribe los bytes
  crudos sin pasar por el driver, así que cualquier driver sirve, incluso
  "Generic / Text Only".
- **De red (Ethernet o Wi-Fi)**: en vez del nombre se escribe `IP:9100`, por ejemplo
  `192.168.1.50:9100`. No hace falta instalarla en Windows.

El cajón de dinero va enchufado al conector RJ11 de la impresora; el ticket ya lleva
la orden de abrirlo cuando se cobra en efectivo, y en el sistema hay un botón
"Abrir cajón" para abrirlo sin vender.

## Si algo falla

- *"No responde el agente de impresión"*: la ventana del agente está cerrada. Abrir
  `agente.bat`.
- *"No existe la impresora ... en Windows"*: el nombre no coincide. Tocar **Buscar
  impresoras** y elegirla de la lista.
- *"La impresora no acepta el trabajo"*: está apagada, sin papel o en pausa en la cola
  de Windows (Dispositivos e impresoras → ver qué se está imprimiendo).
- Sale el ticket pero con caracteres raros: el ticket se manda solo en ASCII, así que
  revisar que la impresora esté en modo ESC/POS (no en modo "etiqueta" ni ZPL).
- Para cambiar el puerto: `set AGENTE_PUERTO=9200` antes de `node agente.js`, y poner
  la misma URL en el sistema.

## Detalle técnico

- `agente.js`: servidor HTTP en `127.0.0.1:9123`, sin dependencias.
  `GET /estado` lista las impresoras de Windows; `POST /imprimir` recibe
  `{ impresora, datos (base64) }`.
- `imprimir-raw.ps1`: PowerShell que queda abierto y escribe en la impresora con
  `winspool.drv` (`OpenPrinter` / `WritePrinter` con tipo de datos RAW). Si eso falla y
  la impresora está compartida, prueba `copy /b` a `\\localhost\<nombre>`.
- En Linux o Mac manda por `lp -o raw`.
