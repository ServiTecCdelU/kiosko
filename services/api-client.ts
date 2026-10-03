// services/api-client.ts — helper para las consultas que pasaron al servidor.
//
// Las lecturas ya no van con el anon key desde el navegador: se piden a una
// ruta por dominio que expone un conjunto CERRADO de acciones. El cliente
// nunca manda nombres de tabla ni filtros libres, solo el nombre de una accion
// conocida y sus parametros.
// El comercio NO viaja en el body: el servidor lo toma de la cookie de sesion.
import { sesionVencida } from "@/hooks/use-auth";
import { apiUrl } from "@/lib/utils/api-url";

export async function consultar<T>(
  ruta: string,
  accion: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(apiUrl(ruta), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accion, ...params }),
  });

  if (res.status === 401) sesionVencida();
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "No se pudo consultar");
  return data as T;
}
