import React from "react";
import { Toaster } from "sonner";
import "@/app/globals.css";

// Todo el sistema (panel, POS, login, tienda, etc.) vive en este grupo para que
// el Tailwind completo (globals.css, ~140 KB) y los toasts no se carguen en la
// landing pública (app/page.tsx), que tiene su propio CSS (app/landing.css).
export default function SistemaLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      {children}
      <Toaster richColors position="top-center" />
    </>
  );
}
