"use client";

// app/produccion/page.tsx — produccion del dia: lo horneado entra al stock a la
// mañana, el sobrante se descarta (o queda) al cierre, y el resumen de la semana
// muestra que conviene hornear de menos.
// Diseño: docs/superpowers/specs/2026-10-18-produccion-del-dia-design.md
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChefHat, Loader2, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { cantidadTexto, parseCantidad } from "@/lib/cantidad";
import { esFraccionable, simboloUnidad } from "@/lib/unidades";
import { diaArgentina, resumenPorProducto, totalesDelDia, type MovimientoProduccion } from "@/lib/produccion";
import { getCurrentUser } from "@/hooks/use-auth";
import { descartarSobrante, getProduccion, registrarProduccion } from "@/services/produccion-service";
import type { Product } from "@/lib/types";

const DIAS_RESUMEN = 7;

export default function ProduccionPage() {
  const [productos, setProductos] = useState<Product[] | null>(null);
  const [movs, setMovs] = useState<MovimientoProduccion[]>([]);
  const [horneado, setHorneado] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [descartando, setDescartando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await getProduccion(DIAS_RESUMEN);
      setProductos(r.productos);
      setMovs(r.movimientos);
    } catch {
      toast.error("No se pudo cargar la producción");
      setProductos([]);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const hoy = diaArgentina(new Date());
  const delDia = useMemo(() => totalesDelDia(movs, hoy), [movs, hoy]);
  const resumen = useMemo(() => resumenPorProducto(movs), [movs]);
  const porId = useMemo(() => new Map((productos ?? []).map((p) => [p.id, p])), [productos]);

  const cargados = (productos ?? [])
    .map((p) => ({ p, cantidad: parseCantidad(horneado[p.id] ?? "") }))
    .filter((x): x is { p: Product; cantidad: number } => x.cantidad !== null);
  const errorCantidad = cargados.find((x) => !esFraccionable(x.p.unidad) && !Number.isInteger(x.cantidad));

  const registrar = async () => {
    if (cargados.length === 0 || errorCantidad) return;
    setGuardando(true);
    const usuario = getCurrentUser()?.nombre;
    let hechos = 0;
    try {
      for (const { p, cantidad } of cargados) {
        await registrarProduccion(p.id, cantidad, usuario);
        hechos++;
      }
      toast.success(`Producción registrada (${hechos} producto${hechos === 1 ? "" : "s"})`);
      setHorneado({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar la producción", {
        description: hechos > 0 ? `Se registraron ${hechos} antes del error.` : undefined,
      });
    } finally {
      setGuardando(false);
      cargar();
    }
  };

  const descartar = (p: Product) => {
    toast(`¿Descartar ${cantidadTexto(p.stock, p.unidad)} de ${p.name}?`, {
      description: "Sale del stock como merma (sobrante del día). Si lo vas a vender mañana, no lo descartes.",
      action: {
        label: "Descartar",
        onClick: async () => {
          setDescartando(p.id);
          try {
            await descartarSobrante(p.id, p.stock, getCurrentUser()?.nombre);
            toast.success(`${p.name}: sobrante descartado`);
            cargar();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "No se pudo descartar");
          } finally {
            setDescartando(null);
          }
        },
      },
    });
  };

  const sobrantes = (productos ?? []).filter((p) => p.stock > 0);

  return (
    <AppShell title="Producción">
      {!productos ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-2xl" />)}</div>
      ) : productos.length === 0 ? (
        <div className="card-premium mx-auto max-w-lg rounded-2xl p-6 text-center">
          <ChefHat className="mx-auto h-8 w-8 text-primary" />
          <h2 className="mt-2 font-semibold">Todavía no hay productos elaborados</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            En Stock, editá lo que hacen ustedes (pan, facturas, tortas…) y activá <b>“Lo elaboramos acá”</b>.
            Después, cada mañana cargás acá lo horneado y al cierre ves lo que sobró.
          </p>
          <Button className="mt-4 rounded-2xl" asChild><Link href="/stock">Ir a Stock</Link></Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Produccion de hoy */}
          <section className="card-premium rounded-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <div>
                <h2 className="font-semibold">Producción de hoy</h2>
                <p className="text-xs text-muted-foreground">Tipeá lo que salió del horno y registralo: se suma al stock.</p>
              </div>
              <Button className="rounded-xl" disabled={cargados.length === 0 || !!errorCantidad || guardando} onClick={registrar}>
                {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Registrar producción{cargados.length > 0 ? ` (${cargados.length})` : ""}
              </Button>
            </div>
            {errorCantidad && (
              <p className="px-4 pt-2 text-xs text-destructive">{errorCantidad.p.name} va por unidad: la cantidad tiene que ser entera.</p>
            )}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Hecho hoy</TableHead>
                    <TableHead className="text-right">Vendido hoy</TableHead>
                    <TableHead className="text-right">Queda</TableHead>
                    <TableHead className="text-right">Horneado ahora</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productos.map((p) => {
                    const t = delDia.get(p.id);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="cifra text-right">{t?.producido ? cantidadTexto(t.producido, p.unidad) : "—"}</TableCell>
                        <TableCell className="cifra text-right">{t?.vendido ? cantidadTexto(t.vendido, p.unidad) : "—"}</TableCell>
                        <TableCell className={cn("cifra text-right font-semibold", p.stock <= 0 && "text-muted-foreground")}>
                          {cantidadTexto(p.stock, p.unidad)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            value={horneado[p.id] ?? ""}
                            onChange={(e) => setHorneado((h) => ({ ...h, [p.id]: e.target.value }))}
                            inputMode="decimal"
                            placeholder={esFraccionable(p.unidad) ? simboloUnidad(p.unidad) : "unid."}
                            className="ml-auto h-8 w-24 rounded-lg text-right"
                            aria-label={`Horneado ahora de ${p.name}`}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </section>

          {/* Cierre del dia */}
          <section className="card-premium rounded-2xl p-4">
            <h2 className="font-semibold">Cierre del día</h2>
            <p className="text-xs text-muted-foreground">
              Lo que sobra queda para mañana. Si se tira o se regala, descartalo: sale del stock como merma y suma en el resumen.
            </p>
            {sobrantes.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No sobra nada.</p>
            ) : (
              <ul className="mt-3 divide-y rounded-xl border">
                {sobrantes.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="text-sm">
                      {p.name} · sobra <b className="cifra">{cantidadTexto(p.stock, p.unidad)}</b>
                    </span>
                    <Button
                      size="sm" variant="outline" className="rounded-xl"
                      disabled={descartando === p.id} onClick={() => descartar(p)}
                    >
                      {descartando === p.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1 h-3.5 w-3.5" />}
                      Descartar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Resumen de la semana */}
          <section className="card-premium rounded-2xl">
            <div className="border-b px-4 py-3">
              <h2 className="font-semibold">Últimos {DIAS_RESUMEN} días</h2>
              <p className="text-xs text-muted-foreground">Lo que más se descarta es lo que conviene hornear de menos.</p>
            </div>
            {resumen.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">Todavía no hay producción registrada.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Producido</TableHead>
                      <TableHead className="text-right">Vendido</TableHead>
                      <TableHead className="text-right">Descartado</TableHead>
                      <TableHead className="text-right">% descartado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resumen.map((r) => {
                      const p = porId.get(r.productoId);
                      return (
                        <TableRow key={r.productoId}>
                          <TableCell className="font-medium">{p?.name ?? "—"}</TableCell>
                          <TableCell className="cifra text-right">{cantidadTexto(r.producido, p?.unidad)}</TableCell>
                          <TableCell className="cifra text-right">{cantidadTexto(r.vendido, p?.unidad)}</TableCell>
                          <TableCell className="cifra text-right">{cantidadTexto(r.descartado, p?.unidad)}</TableCell>
                          <TableCell className={cn("cifra text-right font-semibold", r.pct >= 15 ? "text-warning" : "text-muted-foreground")}>
                            {r.pct.toLocaleString("es-AR")}%
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
