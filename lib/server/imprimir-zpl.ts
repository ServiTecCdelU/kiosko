// lib/server/imprimir-zpl.ts — manda un string ZPL crudo (RAW) a la impresora Zebra
import { execFile } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// Nombre de la impresora Windows configurada en modo RAW (driver "Generic / Text Only").
// Debe estar compartida (Propiedades > Compartir > compartir esta impresora) para que
// "copy /b" pueda escribirle vía \\localhost\<nombre>.
const IMPRESORA_RAW = process.env.IMPRESORA_ZPL_RAW ?? "ZD220-RAW";

export async function imprimirZPL(zpl: string): Promise<void> {
  const tmpPath = join(tmpdir(), `ticket-${randomUUID()}.zpl`);
  // utf8 para que los bytes coincidan con el ^CI28 declarado en el ZPL.
  await writeFile(tmpPath, zpl, "utf8");

  try {
    await new Promise<void>((resolve, reject) => {
      execFile("cmd.exe", ["/c", "copy", "/b", tmpPath, `\\\\localhost\\${IMPRESORA_RAW}`], (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        resolve();
      });
    });
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}
