"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface BarcodeScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (codigo: string) => void;
}

// Recorte de la zona de lectura: solo se decodifica esta franja central, asi no
// agarra otros numeros/codigos que aparezcan arriba o abajo en el cuadro.
const CROP_WIDTH_PCT = 0.85;
const CROP_HEIGHT_PCT = 0.22;

export function BarcodeScannerDialog({ open, onOpenChange, onDetected }: BarcodeScannerDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let rafId: number | null = null;
    setError(null);

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const { DecodeHintType, BarcodeFormat, NotFoundException } = await import("@zxing/library");
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints);

        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();

        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d")!;

        const tick = () => {
          if (cancelled) return;
          if (video.readyState === video.HAVE_ENOUGH_DATA) {
            const vw = video.videoWidth;
            const vh = video.videoHeight;
            const cw = vw * CROP_WIDTH_PCT;
            const ch = vh * CROP_HEIGHT_PCT;
            const sx = (vw - cw) / 2;
            const sy = (vh - ch) / 2;
            canvas.width = cw;
            canvas.height = ch;
            ctx.drawImage(video, sx, sy, cw, ch, 0, 0, cw, ch);
            try {
              const result = reader.decodeFromCanvas(canvas);
              if (result) {
                onDetected(result.getText());
                return;
              }
            } catch (e) {
              if (!(e instanceof NotFoundException)) {
                // otros errores de decodificacion se ignoran, se sigue intentando
              }
            }
          }
          rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) setError("No se pudo acceder a la cámara. Revisá los permisos del navegador.");
      }
    })();

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, onDetected]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Escanear código de barras</DialogTitle>
        </DialogHeader>
        <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-black">
          {error ? (
            <p className="p-6 text-center text-sm text-destructive">{error}</p>
          ) : (
            <>
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
              <canvas ref={canvasRef} className="hidden" />
              {/* Guia visual: coincide con la franja que realmente se decodifica */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  className="rounded-lg border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
                  style={{ width: `${CROP_WIDTH_PCT * 100}%`, height: `${CROP_HEIGHT_PCT * 100}%` }}
                />
              </div>
            </>
          )}
        </div>
        <p className="text-center text-xs text-muted-foreground">Alineá el código dentro del rectángulo</p>
      </DialogContent>
    </Dialog>
  );
}
