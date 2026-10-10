"use client";

// app/facturacion/page.tsx — facturacion electronica AFIP/ARCA (solo admin).
// En la demo publica muestra que es una funcion de la version paga.
import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { AvisoVersionPaga, useEsDemo } from "@/components/home/aviso-version-paga";
import { AsistenteAfip } from "@/components/facturacion/asistente-afip";
import { ContingenciaCaea } from "@/components/facturacion/contingencia-caea";
import { MercadoPagoCard } from "@/components/home/mercadopago-card";
import { getConfigAfip, type EstadoConfigAfip } from "@/services/facturacion-service";

export default function FacturacionPage() {
  const esDemo = useEsDemo();
  const [estado, setEstado] = useState<EstadoConfigAfip | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (esDemo) return;
    getConfigAfip().then(setEstado).catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar"));
  }, [esDemo]);

  return (
    <AppShell title="Facturación electrónica">
      <>
        {esDemo || estado?.demo ? (
          <div className="mx-auto max-w-3xl">
            <AvisoVersionPaga
              icono={FileText}
              titulo="Facturación electrónica AFIP/ARCA"
              descripcion="Emití Factura A, B o C y sus notas de crédito desde el punto de venta, con CAE y QR de AFIP, automática o a pedido."
            />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !estado ? (
          <div className="mx-auto max-w-3xl space-y-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            <AsistenteAfip estado={estado} onEstado={setEstado} />
            {estado.activo && <ContingenciaCaea onEstado={setEstado} />}
            {/* Cobros con Mercado Pago del comercio (QR y Point): antes estaba en el inicio. */}
            <MercadoPagoCard />
          </div>
        )}
      </>
    </AppShell>
  );
}
