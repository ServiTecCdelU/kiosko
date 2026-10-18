// app/api/publico/tienda/route.ts — catalogo publico de la tienda online (plan Tienda).
// Sin sesion: lo ve cualquiera con el link.
//
// Solo lectura y solo lo que se puede mostrar al publico (lib/server/tienda.ts): nombre,
// precio de lista y oferta (el precio final lo calcula lib/pricing.ts igual que la caja),
// rubro, foto, unidad y si HAY stock. Nunca costo, margen ni cantidad de stock.
import { NextResponse } from "next/server";
import { productosDeTienda, slugValido, tiendaDeSlug } from "@/lib/server/tienda";

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug")?.trim().toLowerCase() ?? "";
  if (!slugValido(slug)) return NextResponse.json({ error: "Tienda inexistente" }, { status: 404 });

  try {
    const tienda = await tiendaDeSlug(slug);
    if (!tienda) return NextResponse.json({ error: "Tienda inexistente" }, { status: 404 });
    if (!tienda.abierta) {
      return NextResponse.json({ abierta: false, nombre: tienda.nombre }, { headers: { "Cache-Control": "no-store" } });
    }
    const productos = (await productosDeTienda(tienda.comercioId))
      .filter((p) => tienda.config.mostrarSinStock || p.hayStock)
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
    return NextResponse.json(
      {
        abierta: true,
        nombre: tienda.nombre,
        mensaje: tienda.config.mensaje,
        whatsapp: tienda.whatsapp,
        retiro: tienda.config.retiro,
        envio: tienda.config.envio,
        pagoOnline: tienda.pagoOnline,
        productos,
      },
      // Precios y stock cambian: cache corto en el CDN para aguantar visitas.
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } },
    );
  } catch {
    return NextResponse.json({ error: "No se pudo cargar la tienda" }, { status: 500 });
  }
}
