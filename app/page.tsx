import { Landing } from "@/components/landing/landing";
import { IMAGEN_OG, conBase, siteOrigin } from "@/lib/site";
import { jsonLdLanding } from "@/lib/marketing/seo";

// "/" es siempre la landing publica. El panel de cada comercio vive en
// /<slug> (app/[comercio]/page.tsx).
export default function HomePage() {
  // Datos estructurados (schema.org): organizacion, la app con sus planes y
  // las preguntas frecuentes, para que Google entienda y muestre mejor la pagina.
  const jsonLd = jsonLdLanding(`${siteOrigin()}${conBase("/")}`, IMAGEN_OG.url);
  return (
    <>
      {jsonLd.map((bloque, i) => (
        <script
          key={i}
          type="application/ld+json"
          // JSON generado por nosotros (lib/marketing/seo.ts), sin datos del usuario.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(bloque).replace(/</g, "\\u003c") }}
        />
      ))}
      <Landing />
    </>
  );
}
