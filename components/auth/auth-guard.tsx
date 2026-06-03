"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { NAV_ITEMS } from "@/lib/nav";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, ready, rol } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const adminOnly = NAV_ITEMS.find((i) => i.href === pathname)?.adminOnly ?? false;

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (adminOnly && rol !== "admin") {
      router.replace("/pos");
    }
  }, [ready, user, rol, adminOnly, router]);

  if (!ready || !user || (adminOnly && rol !== "admin")) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
