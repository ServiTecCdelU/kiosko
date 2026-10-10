"use client";

// components/compras/cuenta-corriente-tab.tsx — cuanto se le debe a cada proveedor,
// registrar pagos (a cuenta o a una compra) y anularlos.
// Spec: docs/superpowers/specs/2026-10-10-proveedores-cuenta-corriente-design.md
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Banknote, Loader2, Wallet, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils/format";
import { errorPago, repartirPago, resumenSaldos, type CompraConSaldo } from "@/lib/proveedores-saldo";
import { estadoPago, ordenarPorUrgencia, resumenPagos, textoPago, type EstadoPago } from "@/lib/proveedores-vencimientos";
import { hoyArgentinaISO } from "@/lib/oferta-vigencia";
import {
  actualizarVencimientoCompra, anularPagoProveedor, getComprasConSaldo, getPagosProveedor, registrarPagoProveedor,
  type Compra, type PagoMetodo, type PagoProveedor, type Proveedor,
} from "@/services/compras-service";

const CLASE_ESTADO: Record<EstadoPago, string> = {
  vencido: "text-destructive font-semibold",
  hoy: "text-destructive font-semibold",
  pronto: "text-warning font-semibold",
  ok: "text-muted-foreground",
  "sin-fecha": "text-muted-foreground",
};
import { getCajasAbiertas } from "@/services/caja-service";
import { getCurrentUser } from "@/hooks/use-auth";
import type { Caja } from "@/lib/types";

const METODO_LABEL: Record<PagoMetodo, string> = { efectivo: "Efectivo", transferencia: "Transferencia", otro: "Otro" };

function aConSaldo(c: Compra): CompraConSaldo {
  return { id: c.id, proveedorId: c.proveedorId, total: c.total, pagado: c.pagado, createdAt: c.createdAt, vence: c.vence };
}

export function CuentaCorrienteTab({ proveedores }: { proveedores: Proveedor[] }) {
  const [compras, setCompras] = useState<Compra[] | null>(null);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [pagos, setPagos] = useState<PagoProveedor[] | null>(null);
  const [pagoOpen, setPagoOpen] = useState(false);
  const [compraPago, setCompraPago] = useState<string | undefined>(undefined);

  const cargar = useCallback(async () => {
    try {
      setCompras(await getComprasConSaldo());
    } catch {
      toast.error("No se pudo cargar la cuenta corriente");
      setCompras([]);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!seleccionado) return;
    setPagos(null);
    getPagosProveedor(seleccionado).then(setPagos).catch(() => setPagos([]));
  }, [seleccionado, compras]);

  const hoy = hoyArgentinaISO();
  const saldos = useMemo(() => resumenSaldos((compras ?? []).map(aConSaldo)), [compras]);
  const pagos_ = useMemo(() => resumenPagos(compras ?? [], hoy), [compras, hoy]);
  const nombreDe = (id: string) => proveedores.find((p) => p.id === id)?.nombre ?? "—";
  const deudaTotal = saldos.reduce((s, x) => s + x.saldo, 0);
  const comprasDelSeleccionado = ordenarPorUrgencia((compras ?? []).filter((c) => c.proveedorId === seleccionado), hoy);
  const provSel = seleccionado ? proveedores.find((p) => p.id === seleccionado) : undefined;

  const cambiarVence = async (c: Compra, valor: string) => {
    const nuevo = valor || null;
    if ((c.vence ?? null) === nuevo) return;
    try {
      await actualizarVencimientoCompra(c.id, nuevo);
      setCompras((prev) => (prev ?? []).map((x) => (x.id === c.id ? { ...x, vence: nuevo ?? undefined } : x)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la fecha");
    }
  };

  const abrirPago = (compraId?: string) => {
    setCompraPago(compraId);
    setPagoOpen(true);
  };

  const anular = async (p: PagoProveedor) => {
    if (!window.confirm(`¿Anular el pago de ${formatCurrency(p.monto)}? El saldo vuelve a las compras.`)) return;
    try {
      const r = await anularPagoProveedor(p.id, getCurrentUser()?.id);
      toast.success(r.gastoConservado
        ? "Pago anulado. El gasto de caja quedó porque esa caja ya se cerró: si corresponde, registrá un aporte."
        : "Pago anulado");
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo anular el pago");
    }
  };

  if (compras === null) return <Skeleton className="h-64 w-full rounded-2xl" />;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="card-premium rounded-2xl border-0">
          <CardContent className="p-4">
            <div className="eyebrow flex items-center gap-1.5"><Wallet className="h-4 w-4" /> Deuda con proveedores</div>
            <p className="cifra-hero text-money mt-1.5 text-4xl">{formatCurrency(deudaTotal)}</p>
            <p className="text-xs text-muted-foreground">{saldos.length} proveedor(es) · {compras.length} compra(s) con saldo</p>
            {(pagos_.vencidas > 0 || pagos_.proximas > 0) && (
              <p className="mt-1 text-xs">
                {pagos_.vencidas > 0 && <span className="font-semibold text-destructive">{pagos_.vencidas} vencida(s) · {formatCurrency(pagos_.montoVencido)}</span>}
                {pagos_.vencidas > 0 && pagos_.proximas > 0 && <span className="text-muted-foreground"> · </span>}
                {pagos_.proximas > 0 && <span className="font-semibold text-warning">{pagos_.proximas} vence(n) esta semana · {formatCurrency(pagos_.montoProximo)}</span>}
              </p>
            )}
          </CardContent>
        </Card>
        {saldos.map((s) => (
          <button
            key={s.proveedorId}
            onClick={() => setSeleccionado(s.proveedorId)}
            className={cn(
              "rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-muted/40",
              seleccionado === s.proveedorId && "border-primary",
            )}
          >
            <p className="font-semibold">{nombreDe(s.proveedorId)}</p>
            <p className="cifra text-2xl font-bold">{formatCurrency(s.saldo)}</p>
            <p className="text-xs text-muted-foreground">
              {s.compras} compra(s){s.desde ? ` · desde ${formatDate(new Date(s.desde))}` : ""}
              {s.proximoVencimiento ? ` · vence ${s.proximoVencimiento.split("-").reverse().join("/")}` : ""}
            </p>
          </button>
        ))}
      </div>

      {saldos.length === 0 && (
        <Card className="card-premium rounded-2xl">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No se le debe nada a ningún proveedor. Las compras en cuenta corriente aparecen acá hasta que se pagan.
          </CardContent>
        </Card>
      )}

      {seleccionado && (
        <Card className="card-premium rounded-2xl">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">{provSel?.nombre ?? nombreDe(seleccionado)}</CardTitle>
            <Button className="rounded-2xl" onClick={() => abrirPago()} disabled={comprasDelSeleccionado.length === 0}>
              <Banknote className="mr-2 h-4 w-4" /> Registrar pago
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-semibold">Compras con saldo</p>
              {comprasDelSeleccionado.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin saldo pendiente.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead className="hidden sm:table-cell">Remito</TableHead>
                        <TableHead>Pagar antes del</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Pagado</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                        <TableHead className="w-24" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comprasDelSeleccionado.map((c) => {
                        const v = estadoPago(c.vence, hoy);
                        return (
                        <TableRow key={c.id}>
                          <TableCell className="whitespace-nowrap text-sm">{formatDateTime(c.createdAt)}</TableCell>
                          <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{c.remito ?? "—"}</TableCell>
                          <TableCell>
                            <input
                              type="date"
                              defaultValue={c.vence ?? ""}
                              onBlur={(e) => cambiarVence(c, e.target.value)}
                              className="h-8 rounded-lg border bg-transparent px-2 text-xs"
                              aria-label="Fecha pactada de pago"
                            />
                            {textoPago(v, c.vence) && <p className={cn("mt-0.5 text-xs", CLASE_ESTADO[v.estado])}>{textoPago(v, c.vence)}</p>}
                          </TableCell>
                          <TableCell className="cifra text-right">{formatCurrency(c.total)}</TableCell>
                          <TableCell className="cifra text-right text-muted-foreground">{formatCurrency(c.pagado)}</TableCell>
                          <TableCell className="cifra text-right font-semibold text-warning">{formatCurrency(c.saldo)}</TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="outline" className="h-7 rounded-lg" onClick={() => abrirPago(c.id)}>Pagar</Button>
                          </TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold">Pagos</p>
              {pagos === null ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : pagos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todavía no hay pagos registrados.</p>
              ) : (
                <ul className="divide-y rounded-xl border">
                  {pagos.map((p) => (
                    <li key={p.id} className={cn("flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm", p.anuladoAt && "opacity-60")}>
                      <div>
                        <span className="cifra font-semibold">{formatCurrency(p.monto)}</span>
                        <span className="ml-2 text-muted-foreground">{METODO_LABEL[p.metodo]} · {formatDateTime(p.fecha)}</span>
                        {p.nota && <span className="ml-2 text-muted-foreground">· {p.nota}</span>}
                        {p.anuladoAt && <Badge variant="outline" className="ml-2 border-destructive/50 text-destructive">anulado</Badge>}
                      </div>
                      {!p.anuladoAt && (
                        <Button size="sm" variant="ghost" className="h-7 rounded-lg text-muted-foreground" onClick={() => anular(p)}>
                          <Undo2 className="mr-1 h-3.5 w-3.5" /> Anular
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {seleccionado && (
        <PagoProveedorDialog
          open={pagoOpen}
          onOpenChange={setPagoOpen}
          proveedorId={seleccionado}
          proveedorNombre={provSel?.nombre ?? nombreDe(seleccionado)}
          compras={comprasDelSeleccionado}
          compraId={compraPago}
          onRegistrado={cargar}
        />
      )}
    </div>
  );
}

// ── Diálogo de pago ───────────────────────────────────────────

interface PagoDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  proveedorId: string;
  proveedorNombre: string;
  compras: Compra[];
  compraId?: string;
  onRegistrado: () => Promise<void> | void;
}

function PagoProveedorDialog({ open, onOpenChange, proveedorId, proveedorNombre, compras, compraId, onRegistrado }: PagoDialogProps) {
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<PagoMetodo>("efectivo");
  const [cajaId, setCajaId] = useState("");
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);

  const conSaldo = useMemo(() => compras.map(aConSaldo), [compras]);
  const compra = compraId ? compras.find((c) => c.id === compraId) : undefined;

  useEffect(() => {
    if (!open) return;
    setMonto(compra ? String(compra.saldo) : "");
    setMetodo("efectivo");
    setNota("");
    getCajasAbiertas().then((cs) => {
      setCajas(cs);
      setCajaId(cs.length === 1 ? cs[0].id : "");
    }).catch(() => setCajas([]));
  }, [open, compra]);

  const montoNum = Number(monto) || 0;
  const error = errorPago(montoNum, conSaldo, compraId);
  const reparto = !compraId && montoNum > 0 && !error ? repartirPago(montoNum, conSaldo) : [];

  const confirmar = async () => {
    if (error) return;
    setGuardando(true);
    try {
      const u = getCurrentUser();
      const r = await registrarPagoProveedor({
        proveedorId, monto: montoNum, metodo, compraId,
        cajaId: metodo === "efectivo" && cajaId ? cajaId : undefined,
        nota: nota.trim() || undefined, usuarioId: u?.id, usuarioNombre: u?.nombre,
      });
      toast.success(r.cajaMovId ? "Pago registrado y descontado de la caja como gasto" : "Pago registrado");
      onOpenChange(false);
      await onRegistrado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar el pago");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Banknote className="h-4 w-4 text-primary" /> Pago a {proveedorNombre}</DialogTitle>
          <DialogDescription>
            {compra
              ? `Compra del ${formatDateTime(compra.createdAt)} · saldo ${formatCurrency(compra.saldo)}`
              : "A cuenta: se aplica a las compras más viejas primero."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1 block text-xs">Monto</Label>
            <Input type="number" inputMode="decimal" autoFocus value={monto} onChange={(e) => setMonto(e.target.value)} className="rounded-xl" />
            {monto && error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          </div>
          <div>
            <Label className="mb-1 block text-xs">Forma de pago</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(METODO_LABEL) as PagoMetodo[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetodo(m)}
                  className={cn(
                    "rounded-xl border py-2 text-sm font-medium transition-colors",
                    metodo === m ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
                  )}
                >
                  {METODO_LABEL[m]}
                </button>
              ))}
            </div>
          </div>
          {metodo === "efectivo" && (
            <div>
              <Label className="mb-1 block text-xs">Sale de la caja</Label>
              <select
                value={cajaId}
                onChange={(e) => setCajaId(e.target.value)}
                className="border-input h-9 w-full rounded-xl border bg-transparent px-3 text-sm shadow-xs outline-none"
              >
                <option value="">No descontar de ninguna caja</option>
                {cajas.map((c) => (
                  <option key={c.id} value={c.id}>{c.puestoNombre ?? "Caja"} · {c.abiertaPorNombre ?? "abierta"}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">Si elegís una caja, queda como gasto "Mercadería" y el arqueo cierra solo.</p>
            </div>
          )}
          <div>
            <Label className="mb-1 block text-xs">Nota (opcional)</Label>
            <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: transferencia Banco Nación" className="rounded-xl" maxLength={300} />
          </div>
          {reparto.length > 1 && (
            <p className="text-xs text-muted-foreground">
              Se aplica a {reparto.length} compras: {reparto.map((a) => formatCurrency(a.monto)).join(" + ")}.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="rounded-xl" disabled={guardando || !!error} onClick={confirmar}>
            {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Registrar pago
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
