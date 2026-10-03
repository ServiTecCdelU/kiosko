// lib/server/mercadopago-credencial.ts — token de Mercado Pago de cada comercio (server-only).
//
// El token se guarda cifrado (lib/server/cifrado.ts, clave MP_TOKEN_KEY) en
// comercios.mp_token_cifrado y se descifra solo aca, en el servidor, en el
// momento de llamar a MP. Nunca vuelve al navegador: la pantalla solo ve los
// ultimos 4 caracteres (mp_token_final). Ver supabase/39_mercadopago_por_comercio.sql.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cifrar, claveTokensMP, descifrar } from "@/lib/server/cifrado";
import { cuentaDelTokenMP, esTokenDePrueba } from "@/lib/server/mercadopago";

/** El comercio no conecto su cuenta: el POS lo muestra tal cual. */
export class MPNoConectado extends Error {
  constructor() {
    super("Mercado Pago no esta conectado. El administrador lo conecta desde el panel del comercio.");
    this.name = "MPNoConectado";
  }
}

export interface EstadoConexionMP {
  conectado: boolean;
  tokenFinal: string | null;
  sandbox: boolean;
  cuentaId: string | null;
  conectadoAt: string | null;
}

export async function estadoConexionMP(comercioId: string): Promise<EstadoConexionMP> {
  const { data, error } = await supabaseAdmin
    .from("comercios")
    .select("mp_token_cifrado, mp_token_final, mp_sandbox, mp_user_id, mp_conectado_at")
    .eq("id", comercioId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    conectado: !!data?.mp_token_cifrado,
    tokenFinal: data?.mp_token_final ?? null,
    sandbox: data?.mp_sandbox === true,
    cuentaId: data?.mp_user_id ?? null,
    conectadoAt: data?.mp_conectado_at ?? null,
  };
}

/** Access token descifrado del comercio. Tira MPNoConectado si no hay. */
export async function tokenMPDeComercio(comercioId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("comercios")
    .select("mp_token_cifrado")
    .eq("id", comercioId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.mp_token_cifrado) throw new MPNoConectado();
  return descifrar(data.mp_token_cifrado, claveTokensMP());
}

/**
 * Valida el token contra Mercado Pago y lo guarda cifrado. Validar primero
 * evita dejar el comercio "conectado" con un token que despues rechaza cada cobro.
 */
export async function conectarMP(comercioId: string, tokenCrudo: string): Promise<EstadoConexionMP> {
  const token = tokenCrudo.trim();
  if (!/^(APP_USR|TEST)-[\w-]{20,}$/.test(token)) {
    throw new Error("Eso no parece un Access Token de Mercado Pago (empieza con APP_USR- o TEST-)");
  }

  const cuenta = await cuentaDelTokenMP(token);
  const { error } = await supabaseAdmin
    .from("comercios")
    .update({
      mp_token_cifrado: cifrar(token, claveTokensMP()),
      mp_token_final: token.slice(-4),
      mp_sandbox: esTokenDePrueba(token),
      mp_user_id: cuenta.userId,
      mp_conectado_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", comercioId);
  if (error) throw new Error(error.message);

  return estadoConexionMP(comercioId);
}

export async function desconectarMP(comercioId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("comercios")
    .update({
      mp_token_cifrado: null,
      mp_token_final: null,
      mp_sandbox: false,
      mp_user_id: null,
      mp_conectado_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", comercioId);
  if (error) throw new Error(error.message);
}

/**
 * Comercios conectados a una cuenta de MP. Lo usa el webhook cuando el aviso no
 * trae el comercio en la URL (Point avisa a la URL fija de la cuenta). Puede
 * haber mas de uno: un mismo dueño con su cuenta en dos locales.
 */
export async function comerciosDeCuentaMP(cuentaId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("comercios")
    .select("id")
    .eq("mp_user_id", cuentaId)
    .not("mp_token_cifrado", "is", null);
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => c.id as string);
}
