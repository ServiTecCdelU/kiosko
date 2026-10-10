// herramientas/agente-impresora/agente.js — agente local de impresion.
//
// Corre en la PC del mostrador y recibe los tickets ESC/POS desde el navegador
// (la app esta en internet y no puede llegar a la impresora del local).
// Solo escucha en 127.0.0.1: nada de afuera de esta PC puede hablarle.
//
//   node agente.js            (o doble click en agente.bat)
//
// Endpoints:
//   GET  /estado    -> { ok, version, impresoras: [...] }
//   POST /imprimir  -> { impresora: "POS-80" | "192.168.1.50:9100", datos: "<base64>" }
//
// Sin dependencias. Node 18 o mas nuevo.
"use strict";

const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn, execFile } = require("node:child_process");

const VERSION = "1.0.0";
const PUERTO = Number(process.env.AGENTE_PUERTO || 9123);
const ES_WINDOWS = process.platform === "win32";
const MAX_BODY = 2 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Impresoras de Windows: un PowerShell persistente que carga winspool una sola
// vez (Add-Type tarda ~1 s) y despues atiende cada ticket al instante.
// ---------------------------------------------------------------------------
let ps = null;
let psCola = Promise.resolve();

function arrancarPowerShell() {
  const script = path.join(__dirname, "imprimir-raw.ps1");
  const proc = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let buffer = "";
  const esperando = [];
  proc.stdout.setEncoding("utf8");
  proc.stdout.on("data", (chunk) => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf("\n")) >= 0) {
      const linea = buffer.slice(0, i).replace(/\r$/, "");
      buffer = buffer.slice(i + 1);
      const r = esperando.shift();
      if (r) r(linea);
    }
  });
  proc.stderr.setEncoding("utf8");
  proc.stderr.on("data", (d) => process.stderr.write(`[powershell] ${d}`));
  proc.on("exit", (code) => {
    console.log(`PowerShell termino (codigo ${code}); se vuelve a arrancar en el proximo ticket.`);
    while (esperando.length) esperando.shift()("ERR PowerShell se cerro");
    if (ps && ps.proc === proc) ps = null;
  });
  ps = {
    proc,
    pedir(linea) {
      return new Promise((resolve) => {
        esperando.push(resolve);
        proc.stdin.write(linea + "\n");
      });
    },
  };
  return ps;
}

function imprimirWindows(impresora, datos) {
  // Serializado: la impresora recibe un ticket por vez.
  const tarea = async () => {
    const tmp = path.join(os.tmpdir(), `ticket-${crypto.randomUUID()}.bin`);
    fs.writeFileSync(tmp, datos);
    try {
      const p = ps || arrancarPowerShell();
      const respuesta = await Promise.race([
        p.pedir(`${impresora}\t${tmp}`),
        new Promise((_, rej) => setTimeout(() => rej(new Error("la impresora no respondio en 20 s")), 20000)),
      ]);
      if (respuesta !== "OK") {
        // Segunda chance: copy /b a la impresora compartida (si el dueño la compartio).
        try {
          await copiarAImpresoraCompartida(impresora, tmp);
        } catch {
          throw new Error(String(respuesta).replace(/^ERR\s*/, "") || "No se pudo imprimir");
        }
      }
    } finally {
      fs.unlink(tmp, () => {});
    }
  };
  const resultado = psCola.then(tarea, tarea);
  psCola = resultado.catch(() => {});
  return resultado;
}

function copiarAImpresoraCompartida(impresora, archivo) {
  return new Promise((resolve, reject) => {
    execFile("cmd.exe", ["/c", "copy", "/b", archivo, `\\\\localhost\\${impresora}`], { windowsHide: true }, (err, _out, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve();
    });
  });
}

function imprimirUnix(impresora, datos) {
  return new Promise((resolve, reject) => {
    const p = execFile("lp", ["-d", impresora, "-o", "raw"], (err, _out, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve();
    });
    p.stdin.end(datos);
  });
}

function imprimirRed(host, puerto, datos) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: puerto });
    socket.setTimeout(8000);
    socket.on("connect", () => socket.end(datos));
    socket.on("close", () => resolve());
    socket.on("timeout", () => { socket.destroy(); reject(new Error(`La impresora de red ${host}:${puerto} no responde`)); });
    socket.on("error", (e) => reject(new Error(`No se pudo conectar a ${host}:${puerto}: ${e.message}`)));
  });
}

function listarImpresoras() {
  return new Promise((resolve) => {
    if (!ES_WINDOWS) return resolve([]);
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", "Get-Printer | Select-Object -ExpandProperty Name"],
      { windowsHide: true, timeout: 10000 },
      (err, out) => {
        if (err) return resolve([]);
        resolve(out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
      },
    );
  });
}

async function imprimir(impresora, datos) {
  const red = /^([\w.-]+):(\d{2,5})$/.exec(impresora);
  if (red) return imprimirRed(red[1], Number(red[2]), datos);
  if (!impresora) throw new Error("Falta el nombre de la impresora");
  if (ES_WINDOWS) return imprimirWindows(impresora, datos);
  return imprimirUnix(impresora, datos);
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
function cors(res, req) {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  // Chrome exige esto cuando una pagina https le habla a localhost.
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  res.setHeader("Access-Control-Max-Age", "600");
}

function json(res, status, cuerpo) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(cuerpo));
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const partes = [];
    req.on("data", (c) => {
      total += c.length;
      if (total > MAX_BODY) {
        reject(new Error("Ticket demasiado grande"));
        req.destroy();
        return;
      }
      partes.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(partes).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  cors(res, req);
  const url = new URL(req.url, "http://127.0.0.1");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }
  try {
    if (req.method === "GET" && (url.pathname === "/estado" || url.pathname === "/")) {
      return json(res, 200, { ok: true, version: VERSION, impresoras: await listarImpresoras() });
    }
    if (req.method === "POST" && url.pathname === "/imprimir") {
      let body;
      try {
        body = JSON.parse(await leerCuerpo(req));
      } catch {
        return json(res, 400, { error: "JSON invalido" });
      }
      if (typeof body.datos !== "string" || !body.datos) return json(res, 400, { error: "Faltan los datos a imprimir" });
      const datos = Buffer.from(body.datos, "base64");
      const impresora = String(body.impresora || "").trim();
      await imprimir(impresora, datos);
      console.log(`${new Date().toLocaleTimeString()}  impreso ${datos.length} bytes en "${impresora}"`);
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: "Ruta desconocida" });
  } catch (e) {
    console.error("Error:", e.message);
    return json(res, 500, { error: e.message || "No se pudo imprimir" });
  }
});

server.listen(PUERTO, "127.0.0.1", () => {
  // Solo ASCII: la consola de Windows no siempre muestra bien los acentos.
  console.log(`Agente de impresion ${VERSION} escuchando en http://127.0.0.1:${PUERTO}`);
  console.log("Dejar esta ventana abierta. En el sistema: Punto de venta > Impresora > Agente local.");
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") console.error(`El puerto ${PUERTO} ya esta en uso. El agente ya esta abierto en otra ventana?`);
  else console.error("No se pudo iniciar el agente:", e.message);
  process.exit(1);
});
