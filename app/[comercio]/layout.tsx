// app/[comercio]/layout.tsx — metadatos del link del panel (/<slug>) para que
// al compartirlo por WhatsApp salga el nombre del comercio. Hereda la imagen y
// el resto de app/layout.tsx. No se indexa: es un panel privado.
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { IMAGEN_OG, OG_BASE, conBase } from "@/lib/site";

async function nombreDelComercio(slug: string): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin.from("comercios").select("nombre").eq("slug", slug).maybeSingle();
    return data?.nombre ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ comercio: string }> }): Promise<Metadata> {
  const { comercio } = await params;
  const slug = decodeURIComponent(comercio).toLowerCase();
  const nombre = await nombreDelComercio(slug);
  const titulo = nombre ? `${nombre} · MultiComercioPanel` : "MultiComercioPanel - ServiTec";
  const descripcion = nombre
    ? `Panel de gestión de ${nombre}: ventas, caja, stock y promociones.`
    : "Panel de gestión: ventas, caja, stock y promociones.";
  return {
    title: titulo,
    description: descripcion,
    robots: { index: false, follow: false },
    alternates: { canonical: conBase(`/${slug}`) },
    openGraph: { ...OG_BASE, title: titulo, description: descripcion, url: conBase(`/${slug}`) },
    twitter: { card: "summary_large_image", title: titulo, description: descripcion, images: [IMAGEN_OG.url] },
  };
}

export default function PanelComercioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
