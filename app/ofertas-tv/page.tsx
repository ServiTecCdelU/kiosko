"use client";
// app/ofertas-tv/page.tsx — pantalla de ofertas para una tele en el local (ver
// components/ofertas/pantalla-tv.tsx). Requiere sesion iniciada.
import { AuthGuard } from "@/components/auth/auth-guard";
import { PantallaOfertas } from "@/components/ofertas/pantalla-tv";

export default function OfertasTvPage() {
  return (
    <AuthGuard>
      <PantallaOfertas />
    </AuthGuard>
  );
}
