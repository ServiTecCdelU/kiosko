"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Store, Delete, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { login } from "@/services/auth-service";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];
const PIN_LENGTH = 4;

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [working, setWorking] = useState(false);

  const submit = useCallback(
    async (value: string) => {
      setWorking(true);
      try {
        const user = await login(value);
        toast.success(`Hola, ${user.nombre}`);
        router.replace(user.rol === "admin" ? "/" : "/pos");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "PIN incorrecto");
        setPin("");
      } finally {
        setWorking(false);
      }
    },
    [router],
  );

  const press = useCallback(
    (key: string) => {
      if (working) return;
      if (key === "del") {
        setPin((p) => p.slice(0, -1));
        return;
      }
      if (!key) return;
      setPin((p) => {
        if (p.length >= PIN_LENGTH) return p;
        const next = p + key;
        if (next.length === PIN_LENGTH) submit(next);
        return next;
      });
    },
    [working, submit],
  );

  return (
    <main className="bg-mesh flex min-h-screen flex-col items-center justify-center gap-8 bg-muted/30 p-6">
      <div className="flex flex-col items-center gap-3">
        <div className="grad-brand shadow-brand flex h-16 w-16 items-center justify-center rounded-3xl text-white">
          <Store className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Kiosko Despensa</h1>
        <p className="text-sm text-muted-foreground">Ingresá tu PIN</p>
      </div>

      <div className="flex items-center gap-3" aria-label="PIN">
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-4 w-4 rounded-full border-2 transition-colors",
              i < pin.length ? "border-primary bg-primary" : "border-muted-foreground/40",
            )}
          />
        ))}
      </div>

      <div className="grid w-full max-w-[260px] grid-cols-3 gap-3">
        {KEYS.map((key, i) => {
          if (key === "") return <span key={i} />;
          const isDel = key === "del";
          return (
            <button
              key={i}
              onClick={() => press(key)}
              disabled={working}
              className={cn(
                "flex h-16 items-center justify-center rounded-2xl border bg-card text-xl font-semibold transition-colors",
                "hover:bg-accent hover:text-accent-foreground active:scale-95",
                isDel && "text-muted-foreground",
              )}
            >
              {isDel ? <Delete className="h-5 w-5" /> : key}
            </button>
          );
        })}
      </div>

      {working && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
    </main>
  );
}
