// app/api/auth/login/route.ts — login por PIN de empleados (43_cajas_y_dispositivos.sql).
//
// - Solo en una PC REGISTRADA por el dueño (cookie kiosko_dispositivo validada
//   contra la base). El comercio sale de la PC, nunca de lo que mande el
//   navegador: el PIN se busca solo dentro de ese comercio, asi dos kioscos
//   pueden tener el mismo PIN sin cruzarse jamas.
// - 5 PIN equivocados bloquean ESA PC 15 minutos (guardado en la base: vale en
//   todos los servidores).
// - PIN de 6. El viejo de 4 entra una ultima vez y obliga a elegir uno de 6.
// - El PIN publico de la demo siempre entra a la demo (lib/server/demo.ts).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ipDe, limpiarIntentos, registrarFallo, segundosBloqueado } from "@/lib/server/limite-intentos";
import { loginDemo, respuestaLoginPin, type UsuarioPin } from "@/lib/server/demo";
import { dispositivoDe } from "@/lib/server/dispositivo";
import { esPinParaEntrar } from "@/lib/pin";
import { DEMO_PIN } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FALLOS = 5;
const MINUTOS_BLOQUEO = 15;

function minutosHasta(iso: string): number {
  return Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 60_000));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const pin = String(body?.pin ?? "").trim();
  if (!pin) return NextResponse.json({ error: "Ingresá el PIN" }, { status: 400 });

  // Demo: PIN publico, sin PC registrada. Limite por IP (en memoria) como antes.
  if (pin === DEMO_PIN) {
    const ip = ipDe(req);
    const espera = segundosBloqueado(ip);
    if (espera > 0) return NextResponse.json({ error: `Demasiados intentos. Esperá ${espera} segundos.` }, { status: 429 });
    const demo = await loginDemo(pin);
    if (!demo.ok) return NextResponse.json({ error: demo.error }, { status: demo.status });
    limpiarIntentos(ip);
    return respuestaLoginPin(demo.usuario);
  }

  const pc = await dispositivoDe(req);
  if (!pc) {
    return NextResponse.json(
      { error: "Esta PC no está registrada. Pedile al dueño que la registre en Caja → Registrar esta PC.", pcNoRegistrada: true },
      { status: 403 },
    );
  }

  const clave = `disp:${pc.id}`;
  const { data: intento } = await supabaseAdmin.from("login_intentos").select("bloqueado_hasta").eq("clave", clave).maybeSingle();
  if (intento?.bloqueado_hasta && new Date(intento.bloqueado_hasta) > new Date()) {
    return NextResponse.json(
      { error: `Demasiados PIN equivocados en esta PC. Probá en ${minutosHasta(intento.bloqueado_hasta)} minutos.` },
      { status: 429 },
    );
  }

  const fallo = async () => {
    const { data: hasta } = await supabaseAdmin.rpc("registrar_fallo_login", { p_clave: clave, p_max: MAX_FALLOS, p_minutos: MINUTOS_BLOQUEO });
    const msg = hasta
      ? `Demasiados PIN equivocados en esta PC. Probá en ${minutosHasta(hasta as string)} minutos.`
      : "PIN incorrecto";
    return NextResponse.json({ error: msg }, { status: hasta ? 429 : 401 });
  };

  if (!esPinParaEntrar(pin)) return fallo();

  // El PIN se verifica dentro de Postgres (bcrypt via pgcrypto), SOLO en el comercio de la PC.
  const { data, error } = await supabaseAdmin.rpc("verificar_pin_comercio", { p_comercio_id: pc.comercioId, p_pin: pin });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const usuario = (Array.isArray(data) ? data[0] : data) as UsuarioPin | undefined;
  if (!usuario || usuario.comercio_id !== pc.comercioId) return fallo();

  const { data: extra } = await supabaseAdmin.from("usuarios").select("debe_cambiar_pin").eq("id", usuario.id).maybeSingle();
  const debeCambiarPin = extra?.debe_cambiar_pin === true;
  // Un PIN de 4 solo sirve para pasar al nuevo: si el empleado ya tiene el de 6, no entra.
  if (pin.length !== 6 && !debeCambiarPin) return fallo();

  await Promise.all([
    supabaseAdmin.from("login_intentos").delete().eq("clave", clave),
    supabaseAdmin.from("dispositivos").update({ ultimo_uso: new Date().toISOString() }).eq("id", pc.id),
  ]);
  return respuestaLoginPin(usuario, { debeCambiarPin, puestoId: pc.puestoId, puestoNombre: pc.puestoNombre });
}
