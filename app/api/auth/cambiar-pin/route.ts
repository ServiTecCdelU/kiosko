// app/api/auth/cambiar-pin/route.ts — el empleado elige su PIN de 6 numeros.
// Lo usa quien entro con el PIN viejo de 4 (sesion con cambiarPin: proxy.ts no
// le deja hacer otra cosa). Esta bajo /api/auth (publico en proxy.ts): la
// sesion se valida aca. Al terminar se emite una sesion normal.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { crearCookieSesion, getSesion } from "@/lib/server/sesion";
import { errorPinRepetido, errorPinReservado } from "@/lib/server/demo";
import { errorPinNuevo } from "@/lib/pin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sesion = getSesion(req);
  if (!sesion || sesion.superadmin) return NextResponse.json({ error: "Tu sesion vencio. Volve a ingresar." }, { status: 401 });

  const pin = String((await req.json().catch(() => null))?.pin ?? "");
  const invalido = errorPinNuevo(pin);
  if (invalido) return NextResponse.json({ error: invalido }, { status: 400 });

  const { data: u, error } = await supabaseAdmin
    .from("usuarios")
    .select("id, nombre, rol, activo, email, telefono")
    .eq("id", sesion.usuarioId)
    .eq("comercio_id", sesion.comercioId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!u || !u.activo || u.rol === "admin") return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });

  const otro = (await errorPinReservado(sesion.comercioId, pin)) ?? (await errorPinRepetido(sesion.comercioId, pin, u.id));
  // No se dice de quien es el PIN repetido: quien lo prueba no tiene por que saberlo.
  if (otro) return NextResponse.json({ error: "Ese PIN no se puede usar. Elegí otro." }, { status: 400 });

  // El hash lo calcula Postgres (crypt) dentro de actualizar_empleado_kiosko.
  const { error: errPin } = await supabaseAdmin.rpc("actualizar_empleado_kiosko", {
    p_id: u.id, p_nombre: u.nombre, p_rol: u.rol, p_activo: true, p_email: u.email, p_telefono: u.telefono, p_pin: pin,
  });
  if (errPin) return NextResponse.json({ error: errPin.message }, { status: 400 });
  await supabaseAdmin.from("usuarios").update({ debe_cambiar_pin: false }).eq("id", u.id).eq("comercio_id", sesion.comercioId);

  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", crearCookieSesion({ usuarioId: u.id, comercioId: sesion.comercioId, rol: u.rol }));
  return res;
}
