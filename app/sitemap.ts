// app/sitemap.ts — sitemap de las paginas publicas. En produccion se sirve en
// https://www.servitec.net.ar/comercio/sitemap.xml (Next le agrega el basePath):
// esa es la URL que se carga en Search Console. Las pantallas privadas y los
// paneles de cada comercio no van (salen con noindex, ver proxy.ts).
import type { MetadataRoute } from "next";
import { conBase, siteOrigin } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteOrigin();
  const url = (ruta: string) => `${base}${conBase(ruta)}`;
  return [
    { url: url("/"), changeFrequency: "weekly", priority: 1 },
    { url: url("/registro"), changeFrequency: "monthly", priority: 0.8 },
    { url: url("/terms"), changeFrequency: "yearly", priority: 0.2 },
    { url: url("/privacy"), changeFrequency: "yearly", priority: 0.2 },
  ];
}
