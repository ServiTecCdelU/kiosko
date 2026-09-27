"use client";
// components/superadmin/comercio-fila.tsx — un comercio en una fila compacta:
// lo esencial a la vista y dos acciones (entrar a su panel / administrar).
import { Check, CircleDollarSign, Loader2, LogIn, Mail, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ESTADO_COLOR, PLAN_LABEL, pagoAlDia, type Comercio } from "@/components/superadmin/comun";

interface ComercioFilaProps {
  comercio: Comercio;
  entrando: boolean;
  onEntrar: (c: Comercio) => void;
  onAdministrar: (c: Comercio) => void;
}

export function ComercioFila({ comercio: c, entrando, onEntrar, onAdministrar }: ComercioFilaProps) {
  const alDia = pagoAlDia(c);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/40">
      <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
        <span className="grad-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white">
          {c.nombre.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold leading-tight">{c.nombre}</p>
          <p className="cifra truncate text-xs text-muted-foreground">
            {c.uso.productos} productos · {c.uso.ventas} ventas · {c.uso.usuarios} empleados
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className={cn("capitalize", ESTADO_COLOR[c.estado])}>{c.estado}</Badge>
        <Badge variant="outline">{PLAN_LABEL[c.plan]}</Badge>
        <Badge
          variant="outline"
          className={cn(alDia ? "border-success/50 text-success" : "border-warning text-warning")}
          title={alDia ? "Pago del mes registrado" : "Falta registrar el pago de este mes"}
        >
          {alDia ? <Check className="h-3 w-3" /> : <CircleDollarSign className="h-3 w-3" />}
        </Badge>
        <Badge
          variant="outline"
          className={cn(c.uso.accesos === 0 && "border-destructive/50 text-destructive")}
          title="Correos con acceso de Google"
        >
          <Mail className="mr-1 h-3 w-3" />{c.uso.accesos}
        </Badge>
      </div>

      <div className="flex shrink-0 gap-1.5">
        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => onAdministrar(c)}>
          <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Administrar
        </Button>
        <Button size="sm" className="rounded-xl" disabled={entrando} onClick={() => onEntrar(c)}>
          {entrando ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <LogIn className="mr-1.5 h-3.5 w-3.5" />}
          Entrar
        </Button>
      </div>
    </li>
  );
}
