import { LandingEffects } from "./landing-effects";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { Hero } from "./hero";
import { Rubros } from "./rubros";
import { Diferencias } from "./diferencias";
import { CtaMovil } from "./cta-movil";
import { Flow, Problem } from "./flow-problem";
import { Benefits, Modules } from "./benefits-modules";
import { CtaFinal, Faq, Security, Steps } from "./closing-sections";

// Tema propio de la landing (azul oscuro): pisa las variables del tema del
// sistema solo dentro de este contenedor. Ver .landing-theme en globals.css.
export function Landing() {
  // pb-24 en el celular: que la barra fija de abajo (CtaMovil) no tape el pie.
  return (
    <div className="landing-theme min-h-screen bg-background pb-24 text-foreground sm:pb-0">
      <LandingEffects />
      <SiteHeader />
      <main>
        <Hero />
        <Diferencias />
        <Rubros />
        <Flow />
        <Problem />
        <Benefits />
        <Modules />
        <Steps />
        <Security />
        <Faq />
        <CtaFinal />
      </main>
      <SiteFooter />
      <CtaMovil />
    </div>
  );
}
