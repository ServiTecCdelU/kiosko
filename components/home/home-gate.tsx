"use client";

import { useAuth } from "@/hooks/use-auth";
import { HomeDashboard } from "./home-dashboard";

// "/" muestra la landing a quien no tiene sesión (y mientras se lee la
// sesión, para que la landing salga renderizada desde el servidor); con
// sesión muestra el dashboard de siempre.
export function HomeGate({ landing }: { landing: React.ReactNode }) {
  const { user, ready } = useAuth();
  if (ready && user) return <HomeDashboard />;
  return <>{landing}</>;
}
