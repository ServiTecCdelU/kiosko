"use client";

// app/[comercio]/page.tsx — panel (dashboard) del comercio en /<slug>, ej: /demo.
// "/" queda siempre como landing publica. Si alguien abre el slug de otro
// comercio se lo manda al suyo: los datos siempre salen de la cookie de sesion,
// el slug de la URL es solo para que el link se vea con el nombre del comercio.
import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { HomeDashboard } from "@/components/home/home-dashboard";
import { panelHref } from "@/lib/panel";

export default function PanelComercioPage({ params }: { params: Promise<{ comercio: string }> }) {
  const { comercio } = use(params);
  const { user, ready, rol } = useAuth();
  const router = useRouter();
  const slug = user?.comercioSlug;
  const esSuyo = !!slug && slug === decodeURIComponent(comercio).toLowerCase();

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      // El link del panel identifica al comercio: el login por PIN ya lo trae puesto.
      router.replace(`/login?comercio=${encodeURIComponent(decodeURIComponent(comercio).toLowerCase())}`);
      return;
    }
    // El dashboard es solo del admin (como antes en "/"); el resto va al POS.
    if (rol !== "admin") {
      router.replace("/pos");
      return;
    }
    if (slug && !esSuyo) router.replace(panelHref(slug));
  }, [ready, user, rol, slug, esSuyo, router, comercio]);

  if (!ready || !user || rol !== "admin" || !esSuyo) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <HomeDashboard />;
}
