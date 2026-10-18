// app/tienda/[slug]/page.tsx — tienda online publica del comercio (plan Tienda).
// Sin sesion. Los datos salen de /api/publico/tienda (components/tienda/catalogo-tienda.tsx);
// aca solo el titulo para buscadores y para cuando se comparte el link.
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CatalogoTienda } from "@/components/tienda/catalogo-tienda";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await supabaseAdmin.from("comercios").select("nombre").eq("slug", slug.toLowerCase()).maybeSingle();
  const nombre = data?.nombre ?? "Tienda";
  return {
    title: `${nombre} · Pedí online`,
    description: `Mirá los productos, precios y ofertas de ${nombre} y hacé tu pedido por WhatsApp.`,
  };
}

export default async function TiendaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CatalogoTienda slug={slug.toLowerCase()} />;
}
