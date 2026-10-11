"use client";
// components/superadmin/comercio-fila.tsx — un comercio en una fila: nombre y
// datos del alta, situacion (estado, plan, pago, accesos), uso y dos acciones
// (entrar a su panel / administrar). Las bajas se ven atenuadas.
import { Check, CircleDollarSign, Loader2, LogIn, Mail, MailX, RefreshCcw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/format";
import { DEMO_SLUG } from "@/lib/demo";
import {
  DEBITO_LABEL, ESTADO_LABEL, ESTADO_PUNTO, PLAN_CLASE, PLAN_LABEL, avisoAcceso, esNuevo, nombreRubro, pagoAlDia,
  type Comercio, type PreciosPlan,
} from "@/components/superadmin/comun";

interface ComercioFilaProps {
  comercio: Comercio;
  precios: PreciosPlan;
  entrando: boolean;
  onEntrar: (c: Comercio) => void;
  onAdministrar: (c: Comercio) => void;
}

const AVATAR_ESTADO: Record<Comercio["estado"], string> = {
  activo: "grad-brand text-white",
  prueba: "bg-warning/15 text-warning",
  suspendido: "bg-destructive/10 text-destructive",
  baja: "bg-muted text-muted-foreground",
};

function Uso({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <div className="min-w-[3.5rem] text-right">
      <p className="cifra text-sm font-semibold leading-tight">{valor.toLocaleString("es-AR")}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
    </div>
  );
}

export function ComercioFila({ comercio: c, precios, entrando, onEntrar, onAdministrar }: ComercioFilaProps) {
  const aviso = avisoAcceso(c, precios);
  const cobrable = c.estado === "activo" && (precios[c.plan] ?? 0) > 0;
  const alDia = pagoAlDia(c);
  const rubro = nombreRubro(c.config?.rubro);
  const esDemo = c.slug === DEMO_SLUG;
  const baja = c.estado === "baja";

  return (
    <li
      className={cn(
        "grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/40 sm:grid-cols-[minmax(0,1fr)_auto_auto] lg:grid-cols-[minmax(14rem,1.4fr)_minmax(0,1fr)_auto_auto]",
        baja && "opacity-60 hover:opacity-100",
      )}
    >
      {/* Identidad */}
      <div className="flex min-w-0 items-center gap-3">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base font-bold", AVATAR_ESTADO[c.estado])}>
          {c.nombre.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-1.5 font-semibold leading-tight">
            <span className="truncate">{c.nombre}</span>
            {esNuevo(c) && (
              <Badge className="h-5 shrink-0 rounded-md bg-primary px-1.5 text-[10px] uppercase" title="Se dio de alta solo en los últimos 7 días">nuevo</Badge>
            )}
            {esDemo && <Badge variant="outline" className="h-5 shrink-0 rounded-md px-1.5 text-[10px] uppercase">demo</Badge>}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            /{c.slug}
            {rubro && <> · {rubro}</>}
            <span className="hidden sm:inline"> · desde {formatDate(c.created_at)}</span>
          </p>
        </div>
      </div>

      {/* Situacion */}
      <div className="col-span-2 flex flex-wrap items-center gap-1.5 sm:col-span-1">
        <Badge variant="outline" className="gap-1.5 bg-card/60">
          <span className={cn("h-2 w-2 rounded-full", ESTADO_PUNTO[c.estado])} />
          {ESTADO_LABEL[c.estado]}
        </Badge>
        <Badge variant="outline" className={PLAN_CLASE[c.plan]}>{PLAN_LABEL[c.plan]}</Badge>
        {aviso && (
          <Badge variant="outline" className={aviso.clase} title={aviso.titulo}>{aviso.texto}</Badge>
        )}
        {c.debito && c.debito !== "cancelled" && (
          <Badge variant="outline" className={cn("gap-1", DEBITO_LABEL[c.debito].clase)} title={DEBITO_LABEL[c.debito].titulo}>
            <RefreshCcw className="h-3 w-3" /> {DEBITO_LABEL[c.debito].texto.replace("Débito ", "Déb. ")}
          </Badge>
        )}
        {cobrable && !aviso && (
          <Badge
            variant="outline"
            className={cn("gap-1", alDia ? "border-success/50 text-success" : "border-warning text-warning")}
            title={alDia ? "Pago del mes registrado" : "Falta registrar el pago de este mes"}
          >
            {alDia ? <Check className="h-3 w-3" /> : <CircleDollarSign className="h-3 w-3" />}
            {alDia ? "Al día" : "Sin pago"}
          </Badge>
        )}
        {!esDemo && (
          <Badge
            variant="outline"
            className={cn("gap-1", c.uso.accesos === 0 ? "border-destructive/50 text-destructive" : "text-muted-foreground")}
            title={c.uso.accesos === 0 ? "Nadie puede entrar con Google a este comercio" : "Correos con acceso de Google"}
          >
            {c.uso.accesos === 0 ? <><MailX className="h-3 w-3" /> Sin Google</> : <><Mail className="h-3 w-3" /> {c.uso.accesos}</>}
          </Badge>
        )}
      </div>

      {/* Uso */}
      <div className="hidden items-center gap-4 lg:flex">
        <Uso valor={c.uso.productos} etiqueta="prod." />
        <Uso valor={c.uso.ventas} etiqueta="ventas" />
        <Uso valor={c.uso.usuarios} etiqueta="empl." />
      </div>

      {/* Acciones */}
      <div className="col-start-2 row-start-1 flex shrink-0 justify-end gap-1.5 sm:col-start-auto sm:row-start-auto">
        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => onAdministrar(c)}>
          <Settings2 className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Administrar</span>
        </Button>
        <Button size="sm" className="rounded-xl" disabled={entrando} onClick={() => onEntrar(c)}>
          {entrando ? <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1.5" /> : <LogIn className="h-3.5 w-3.5 sm:mr-1.5" />}
          <span className="hidden sm:inline">Entrar</span>
        </Button>
      </div>

      <p className="cifra col-span-2 text-xs text-muted-foreground sm:col-span-3 lg:hidden">
        {c.uso.productos} productos · {c.uso.ventas} ventas · {c.uso.usuarios} empleados
      </p>
    </li>
  );
}
