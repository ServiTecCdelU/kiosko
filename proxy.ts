// proxy.ts — guardia central de /api (Next 16: reemplaza a middleware.ts).
//
// Antes de que corra cualquier ruta de la API se valida la cookie de sesion
// firmada y el rol segun lib/permisos-api.ts. Asi ninguna ruta queda abierta
// por olvidarse un chequeo adentro del handler. Corre en runtime Node (default
// de proxy), por eso puede usar la verificacion HMAC de lib/server/sesion.ts.
import { NextResponse, type NextRequest } from "next/server";
import { getSesion } from "@/lib/server/sesion";
import { autorizar, reglaDeRuta } from "@/lib/permisos-api";

export function proxy(request: NextRequest) {
  // nextUrl.pathname ya viene sin el basePath (/comercio en produccion).
  const regla = reglaDeRuta(request.nextUrl.pathname, request.method);
  const status = autorizar(regla, regla === "publica" ? null : getSesion(request));

  if (status === 401) {
    return NextResponse.json({ error: "Tu sesion vencio. Volve a ingresar." }, { status: 401 });
  }
  if (status === 403) {
    return NextResponse.json({ error: "No tenes permiso para esta accion" }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
