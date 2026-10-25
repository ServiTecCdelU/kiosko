"use client";
// app/pantalla-cliente/page.tsx — 2do monitor mirando al cliente (ver
// components/ofertas/pantalla-cliente.tsx). Requiere sesion iniciada.
import { AuthGuard } from "@/components/auth/auth-guard";
import { PantallaCliente } from "@/components/ofertas/pantalla-cliente";

export default function PantallaClientePage() {
  return (
    <AuthGuard>
      <PantallaCliente />
    </AuthGuard>
  );
}
