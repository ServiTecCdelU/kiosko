"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface BarcodeScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (codigo: string) => void;
}

export function BarcodeScannerDialog({ open, onOpenChange, onDetected }: BarcodeScannerDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const { DecodeHintType, BarcodeFormat } = await import("@zxing/library");
        // Limitar a los formatos de codigo de barras de productos (no QR) acelera muchisimo la deteccion.
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 80 });

        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const trasera = devices.find((d) => /back|rear|trasera|environment/i.test(d.label));
        const deviceId = trasera?.deviceId ?? devices[devices.length - 1]?.deviceId;

        const controls = await reader.decodeFromVideoDevice(deviceId, videoRef.current!, (result) => {
          if (result && !cancelled) {
            onDetected(result.getText());
          }
        });
        if (cancelled) {
          controls.stop();
        } else {
          controlsRef.current = controls;
        }
      } catch {
        if (!cancelled) setError("No se pudo acceder a la cámara. Revisá los permisos del navegador.");
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, onDetected]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Escanear código de barras</DialogTitle>
        </DialogHeader>
        <div className="overflow-hidden rounded-xl bg-black">
          {error ? (
            <p className="p-6 text-center text-sm text-destructive">{error}</p>
          ) : (
            <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline />
          )}
        </div>
        <p className="text-center text-xs text-muted-foreground">Apuntá la cámara al código de barras del producto</p>
      </DialogContent>
    </Dialog>
  );
}
