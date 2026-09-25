import { LandingEffects } from "./landing-effects";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { Hero } from "./hero";
import { Rubros } from "./rubros";
import { Flow, Problem } from "./flow-problem";
import { Benefits, Modules } from "./benefits-modules";
import { CtaFinal, Faq, Security, Steps } from "./closing-sections";

// Tema propio de la landing (azul oscuro): pisa las variables del tema del
// sistema solo dentro de este contenedor. Ver .landing-theme en globals.css.
export function Landing() {
  return (
    <div className="landing-theme min-h-screen bg-background text-foreground">
      <LandingEffects />
      <SiteHeader />
      <main>
        <Hero />
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
    </div>
  );
}
