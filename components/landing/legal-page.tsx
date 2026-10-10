// components/landing/legal-page.tsx — marco de las paginas legales publicas
// (/terms y /privacy): tema de la landing, marca, titulo, fecha y volver.
// Google Ads exige que la pagina de destino tenga politica de privacidad.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Brand } from "./shared";

export function LegalPage({ titulo, actualizado, children }: { titulo: string; actualizado: string; children: React.ReactNode }) {
  return (
    <div className="landing-theme min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-6 md:px-7">
        <Brand />
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white">
          <ArrowLeft className="size-4" /> Volver al inicio
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-24 pt-6 md:px-7">
        <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">{titulo}</h1>
        <p className="mt-2 font-mono text-xs text-muted-foreground">Última actualización: {actualizado}</p>
        <div className="prose-legal mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_li]:ml-5 [&_li]:list-disc [&_a]:text-sky-300 [&_a]:underline">
          {children}
        </div>
      </main>
    </div>
  );
}
