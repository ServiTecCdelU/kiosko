// app/api/diagnostico/route.ts — chequeo temporal de configuracion.
// Devuelve SOLO los nombres de las variables de entorno presentes y si tienen
// contenido; nunca el valor. Sirve para detectar typos en los nombres.
// BORRAR esta ruta cuando el lector Point quede funcionando.
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ESPERADAS = [
  "MP_ACCESS_TOKEN",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

export async function GET() {
  const esperadas = ESPERADAS.map((nombre) => {
    const valor = process.env[nombre];
    return {
      nombre,
      presente: typeof valor === "string" && valor.length > 0,
      largo: valor?.length ?? 0,
      // para MP_ACCESS_TOKEN interesa saber si es de prueba o de produccion
      prefijo: nombre === "MP_ACCESS_TOKEN" && valor ? valor.slice(0, 8) : undefined,
    };
  });

  // Nombres parecidos que si existen delatan un typo (ej: "MP_ACCESSTOKEN")
  const parecidas = Object.keys(process.env)
    .filter((k) => /MP|MERCADO|APP_URL/i.test(k))
    .sort();

  return NextResponse.json({ esperadas, parecidas });
}
