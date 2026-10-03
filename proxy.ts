// proxy.ts — guardia central de /api (Next 16: reemplaza a middleware.ts).
//
// Antes de que corra cualquier ruta de la API:
// 1. se valida la cookie de sesion firmada y el rol (lib/permisos-api.ts);
// 2. si el request ESCRIBE, se controla que el comercio no este en solo
//    lectura (prueba vencida, suspendido o baja: lib/acceso-comercio.ts).
// Asi ninguna ruta queda abierta por olvidarse un chequeo adentro del handler.
// Corre en runtime Node (default de proxy), por eso puede usar la
// verificacion HMAC de lib/server/sesion.ts y consultar la base.
import { NextResponse, type NextRequest } from "next/server";
import { getSesion } from "@/lib/server/sesion";
import { autorizar, reglaDeRuta } from "@/lib/permisos-api";
import { esLectura } from "@/lib/acceso-comercio";
import { accesoDeComercio, mensajeSoloLectura } from "@/lib/server/acceso";

export async function proxy(request: NextRequest) {
  // nextUrl.pathname ya viene sin el basePath (/comercio en produccion).
  const ruta = request.nextUrl.pathname;
  const regla = reglaDeRuta(ruta, request.method);
  if (regla === "publica" || regla === "superadmin") return NextResponse.next();

  const sesion = getSesion(request);
  const status = autorizar(regla, sesion);
  if (status === 401) {
    return NextResponse.json({ error: "Tu sesion vencio. Volve a ingresar." }, { status: 401 });
  }
  if (status === 403) {
    return NextResponse.json({ error: "No tenes permiso para esta accion" }, { status: 403 });
  }

  // El superadmin en modo soporte puede operar aunque el comercio este bloqueado.
  if (sesion && !sesion.soporte && !esLectura(ruta, request.method)) {
    const acceso = await accesoDeComercio(sesion.comercioId);
    if (acceso.nivel === "solo_lectura") {
      return NextResponse.json(
        { error: mensajeSoloLectura(acceso), soloLectura: true, motivo: acceso.motivo },
        { status: 403 },
      );
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
