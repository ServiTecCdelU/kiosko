# Implementación: de PDF a ZPL directo (ticket dinámico sin sobrante/corte)

## Contexto del problema

Hoy el flujo es: la app genera un PDF del ticket → se manda a imprimir vía el driver de Windows (ZDesigner) → el driver imprime en una página de tamaño fijo (ancho x alto configurados en Preferencias de impresión).

Como el alto es fijo pero el contenido de cada ticket varía (5 líneas o 40 líneas), siempre sobra papel en blanco o falta espacio y se corta el ticket.

**Solución:** dejar de usar el driver de Windows para esto. La app le manda directamente a la impresora un archivo de texto en lenguaje **ZPL** (Zebra Programming Language), calculando el alto exacto según cuántas líneas tiene ese ticket puntual. La impresora corta justo donde termina el contenido.

Supuesto de stack: Node.js (por Claude Code) corriendo en Windows, impresora Zebra ZD220 conectada por USB. Si tu stack es otro (Python, .NET, etc.) el código cambia pero la lógica es la misma.

---

## 1. Cómo se le habla a la impresora sin pasar por el driver normal

El driver "ZDesigner ZD220-203dpi ZPL" que instalaste sirve para imprimir desde Word, navegador, etc. Pero para mandar ZPL crudo conviene tener una **segunda instalación de la misma impresora física**, en modo RAW:

1. Panel de control → Dispositivos e impresoras → Agregar impresora.
2. Elegir "La impresora que quiero no está en la lista" → "Agregar impresora local".
3. Usar el mismo puerto (USB001, el que ya usa la ZDesigner).
4. Como driver, elegir **"Generic" / "Generic / Text Only"** (no el de Zebra).
5. Nombrarla algo como `ZD220-RAW`.
6. En Propiedades de esa impresora nueva → Avanzado → tipo de datos: dejar en **RAW**.

Esta impresora nueva no interpreta nada, solo tira bytes crudos al puerto. Ahí es donde mandás el ZPL. La otra (ZDesigner normal) la dejás para imprimir cosas normales si hace falta.

---

## 2. Lo básico de ZPL que vas a necesitar

Un ticket ZPL arranca y termina así:

```
^XA
... contenido ...
^XZ
```

Comandos clave:

- `^PW440` → ancho de impresión en puntos (440 = 56mm a 203dpi aprox. 8 puntos/mm).
- `^LL960` → **largo de la etiqueta**, en puntos. Este es el que vas a calcular dinámicamente por ticket.
- `^FO x,y` → posición (origen del campo) en puntos, desde arriba-izquierda.
- `^A0N,altura,ancho` → fuente y tamaño.
- `^FD texto^FS` → el texto del campo, termina con `^FS`.
- `^GB ancho,alto,espesor^FS` → dibuja una línea o caja (para separadores tipo `----`).

Cálculo de puntos: a 203 dpi, 1mm ≈ 8 puntos. Un rollo de 56mm de ancho da `^PW448` (56*8).

---

## 3. Cálculo dinámico del alto (`^LL`)

La clave de todo. Antes de armar el ZPL, contás cuántas líneas va a tener el ticket (encabezado + items + separadores + total + footer), y calculás:

```
alto_por_linea_normal = 30 puntos   (aprox, a probar y ajustar)
alto_por_linea_titulo  = 40 puntos
margen_superior_inferior = 40 puntos

alto_total = margen_superior_inferior
           + (cantidad_lineas_normales * alto_por_linea_normal)
           + (cantidad_lineas_titulo * alto_por_linea_titulo)
```

Ese `alto_total` (en puntos) es lo que va en `^LL`. Así cada ticket sale con el largo justo, sin sobrante ni corte.

---

## 4. Generar el ZPL desde los datos del ticket (en vez del PDF)

En lugar de armar un PDF, la app arma directamente el texto ZPL a partir de los mismos datos (items, precios, total, etc.) que hoy usa para el PDF. Ejemplo simplificado en Node.js:

```javascript
function generarZPL(ticket) {
  const PW = 448; // ancho en puntos (56mm)
  let y = 20;
  const lineHeight = 30;
  let body = "";

  function linea(texto, opts = {}) {
    const font = opts.bold ? "^A0N,35,35" : "^A0N,25,25";
    body += `^FO10,${y}${font}^FD${texto}^FS\n`;
    y += opts.bold ? 40 : lineHeight;
  }

  function separador() {
    body += `^FO10,${y}^GB${PW - 20},2,2^FS\n`;
    y += 15;
  }

  linea(ticket.negocio, { bold: true });
  linea(new Date(ticket.fecha).toLocaleString());
  separador();

  for (const item of ticket.items) {
    linea(item.nombre);
    linea(`${item.cantidad} x $${item.precioUnit}   $${item.subtotal}`);
  }

  separador();
  linea(`TOTAL: $${ticket.total}`, { bold: true });
  linea(`Pago: ${ticket.formaPago}`);
  linea(`Atendio: ${ticket.cajero}`);

  const alto = y + 40; // margen final

  return `^XA\n^PW${PW}\n^LL${alto}\n${body}^XZ`;
}
```

Esto devuelve un string ZPL con el alto ya ajustado al contenido real.

---

## 5. Mandar el ZPL a la impresora (Windows, Node.js)

Opción simple sin dependencias nativas complicadas: escribir el ZPL a un archivo temporal y copiarlo en modo binario a la impresora RAW compartida.

```javascript
const fs = require("fs");
const { execSync } = require("child_process");

function imprimirZPL(zpl) {
  const tmpPath = "C:\\temp\\ticket.zpl";
  fs.writeFileSync(tmpPath, zpl, "binary");

  // "ZD220-RAW" es el nombre de la impresora RAW que creaste en el paso 1
  // Hay que compartirla (Propiedades > Compartir > compartir esta impresora)
  execSync(`copy /b "${tmpPath}" "\\\\localhost\\ZD220-RAW"`);
}
```

Alternativa más prolija, sin pasar por `copy`: usar el paquete npm `printer` (node-printer), que manda bytes RAW directo a la cola de Windows sin necesitar que la impresora esté compartida:

```javascript
const printer = require("printer");

function imprimirZPL(zpl) {
  printer.printDirect({
    data: zpl,
    printer: "ZD220-RAW",
    type: "RAW",
    success: () => console.log("Impreso"),
    error: (err) => console.error("Error al imprimir:", err),
  });
}
```

(`npm install printer` — este paquete tiene binarios nativos, en Windows puede pedir build tools; si da problemas, la opción del `copy /b` con la impresora compartida funciona igual sin instalar nada extra.)

---

## 6. Flujo completo

```
datos del ticket (items, total, etc.)
        │
        ▼
generarZPL(ticket)  →  string ZPL con ^LL calculado dinámicamente
        │
        ▼
imprimirZPL(zplString)  →  manda bytes RAW a la impresora
        │
        ▼
la Zebra imprime exactamente el largo del ticket y corta ahí
```

El PDF deja de ser necesario para imprimir (podés seguir generándolo aparte si lo necesitás para otra cosa, como guardar un archivo o mandarlo por mail, pero no para la impresora térmica).

---

## 7. Ajustes que vas a tener que calibrar a mano, probando

- `alto_por_linea_normal` y `alto_por_linea_titulo`: dependen del tamaño de fuente ZPL que elijas. Se ajustan imprimiendo un ticket de prueba y comparando.
- Si el texto se corta a los costados, revisar `^PW` (ancho) y el ancho de fuente en `^A0N,alto,ancho`.
- Oscuridad/velocidad de impresión también se pueden mandar por ZPL (`^MD` para darkness, `^PR` para velocidad) si en algún momento hace falta ajustarlas por código en vez del driver.

