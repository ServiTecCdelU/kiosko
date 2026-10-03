"use client";

// components/home/backup-card.tsx — el dueño descarga todos los datos de su
// comercio en un Excel (una hoja por tema). Anda tambien en modo consulta.
import { useState } from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { descargarMiBackup } from "@/services/backup-service";

export function BackupCard() {
  const [descargando, setDescargando] = useState(false);

  const descargar = async () => {
    setDescargando(true);
    try {
      await descargarMiBackup();
      toast.success("Backup descargado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo descargar el backup");
    } finally {
      setDescargando(false);
    }
  };

  return (
    <section className="card-premium flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center" aria-labelledby="backup-titulo">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <FileSpreadsheet className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 id="backup-titulo" className="font-semibold text-foreground">Copia de tus datos</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Productos, clientes, ventas, caja, compras y más, en un Excel con una hoja por tema. Tus datos son tuyos.
        </p>
      </div>
      <Button onClick={descargar} disabled={descargando} variant="outline" className="shrink-0 rounded-xl">
        {descargando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
        {descargando ? "Preparando…" : "Descargar Excel"}
      </Button>
    </section>
  );
}
