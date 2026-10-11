"use client";
// components/superadmin/metricas.tsx — dashboard del SaaS para tomar decisiones:
// altas por mes, conversion de la prueba, pasajes a Pro, bajas, debito automatico,
// ingresos cobrados, MRR y proyeccion a N meses (lib/superadmin-metricas.ts).
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Building2, CircleDollarSign, Minus, Percent, RefreshCcw, Sparkles, Table2, Timer, TrendingUp, Users,
} from "lucide-react";
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { calcularMetricas, type ComercioM, type DebitoM, type EventoM, type Metricas, type PagoM } from "@/lib/superadmin-metricas";
import { nombreRubro, preciosDe, superadminApi, type PlanSaas } from "@/components/superadmin/comun";

interface Crudo {
  comercios: ComercioM[];
  pagos: PagoM[];
  debitos: DebitoM[];
  eventos: EventoM[] | null;
  planes: PlanSaas[];
}

const VIZ = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)"] as const;
const PERDIDOS = "var(--destructive)";
const TOOLTIP_STYLE = { borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 12 };

const compacto = (n: number) => (Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(".0", "")}M` : Math.abs(n) >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
const pesos = (n: number) => formatCurrency(n);

export function Metricas() {
  const [crudo, setCrudo] = useState<Crudo | null>(null);
  const [meses, setMeses] = useState(12);
  const [horizonte, setHorizonte] = useState(6);
  const [verTabla, setVerTabla] = useState(false);

  useEffect(() => {
    superadminApi<Crudo>({ accion: "metricas" })
      .then(setCrudo)
      .catch((e) => toast.error(e instanceof Error ? e.message : "No se pudieron cargar las métricas"));
  }, []);

  const m = useMemo<Metricas | null>(() => {
    if (!crudo) return null;
    return calcularMetricas({ ...crudo, precios: preciosDe(crudo.planes), meses, horizonte });
  }, [crudo, meses, horizonte]);

  if (!m) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  const t = m.tasas;
  const ultimo = m.meses[m.meses.length - 1];
  const anterior = m.meses[m.meses.length - 2];
  const serie = [
    ...m.meses.map((x) => ({ ...x, proyectado: false, altasProy: null as number | null, pagandoEsp: null as number | null, pagandoCons: null as number | null, pagandoOpt: null as number | null, ingresosProy: null as number | null })),
    ...m.proyeccion.map((p) => ({
      periodo: p.periodo, etiqueta: p.etiqueta, proyectado: true,
      altas: null, altasAuto: null, altasManual: null, altasProy: p.altas,
      pagando: null, pagandoEsp: p.pagando.esperado, pagandoCons: p.pagando.conservador, pagandoOpt: p.pagando.optimista,
      ingresos: null, ingresosProy: p.ingresos.esperado,
      primerosPagos: null, pasaronAPro: null, bajas: null, suspendidos: null, debitosActivados: null, debitosCancelados: null, pagos: null, enUso: null,
    })),
  ];
  // La linea de proyeccion arranca desde el ultimo dato real para que no quede un hueco.
  const serieLinea = serie.map((x, i) =>
    i === m.meses.length - 1 ? { ...x, pagandoEsp: x.pagando, pagandoCons: x.pagando, pagandoOpt: x.pagando } : x,
  );
  const movimientos = m.meses.map((x) => ({ ...x, perdidos: x.bajas + x.suspendidos }));
  const ultimaProy = m.proyeccion[m.proyeccion.length - 1];

  return (
    <div className="space-y-5">
      {!m.conEventos && (
        <div className="flex items-start gap-2 rounded-2xl border border-warning/50 bg-warning/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>
            Todavía no corrió la migración <b>56_saas_eventos.sql</b>. Hasta entonces las <b>bajas por mes</b> no se conocen y
            los <b>pasajes a Pro</b> se infieren del primer pago en Pro. El resto de los números es exacto.
          </p>
        </div>
      )}

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmento etiqueta="Historia" valor={meses} opciones={[6, 12, 24]} sufijo="m" onChange={setMeses} />
        <Segmento etiqueta="Proyección" valor={horizonte} opciones={[3, 6, 12]} sufijo="m" onChange={setHorizonte} />
        <Button variant="outline" size="sm" className="ml-auto rounded-xl" onClick={() => setVerTabla((v) => !v)}>
          <Table2 className="mr-1.5 h-4 w-4" /> {verTabla ? "Ver gráficos" : "Ver tabla"}
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icono={CircleDollarSign} titulo="MRR aproximado" valor={pesos(t.mrr)} detalle={`${t.pagando} pagando · ${pesos(t.arpu)} por comercio`} />
        <Kpi icono={Users} titulo="Pagando" valor={String(t.pagando)} detalle={`${t.proPct}% en Pro · ${t.debitoPct}% con débito automático`} delta={anterior ? ultimo.pagando - anterior.pagando : undefined} />
        <Kpi icono={Percent} titulo="Conversión de la prueba" valor={`${t.conversionPct}%`} detalle={`de ${t.elegiblesConversion} que terminaron la prueba`} tono={t.conversionPct >= 30 ? "ok" : t.elegiblesConversion >= 5 ? "aviso" : "normal"} />
        <Kpi icono={ArrowDownRight} titulo="Churn mensual" valor={`${t.churnMensualPct}%`} detalle={m.conEventos ? "bajas y suspensiones, últimos 3 meses" : "estimado sin historial"} tono={t.churnMensualPct > 8 ? "aviso" : "ok"} />
        <Kpi icono={Sparkles} titulo="Altas por mes" valor={String(t.altasPromedio3m)} detalle={`promedio 3 meses · ${ultimo.altas} este mes`} delta={t.tendenciaAltas} deltaTexto="/mes de tendencia" />
        <Kpi icono={Timer} titulo="Días hasta el primer pago" valor={t.diasHastaPrimerPago == null ? "—" : String(t.diasHastaPrimerPago)} detalle={t.diasHastaPro == null ? "nadie pasó a Pro todavía" : `${t.diasHastaPro} días hasta Pro`} />
        <Kpi icono={TrendingUp} titulo={`Ingresos en ${ultimaProy?.etiqueta ?? "—"}`} valor={ultimaProy ? pesos(ultimaProy.ingresos.esperado) : "—"} detalle={ultimaProy ? `entre ${pesos(ultimaProy.ingresos.conservador)} y ${pesos(ultimaProy.ingresos.optimista)}` : ""} />
        <Kpi icono={Building2} titulo="Comercios" valor={String(m.funnel.registrados)} detalle={`${m.porEstado.activo} activos · ${m.porEstado.prueba} en prueba · ${m.porEstado.suspendido + m.porEstado.baja} perdidos`} />
      </div>

      {verTabla ? (
        <TablaMeses m={m} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Grafico titulo="Altas por mes" detalle="Comercios nuevos: registrados solos vs cargados a mano. Lo punteado es la proyección.">
              <ComposedChart data={serie} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={32} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine x={ultimo.etiqueta} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
                <Bar dataKey="altasAuto" name="Se registraron solos" stackId="a" fill={VIZ[0]} />
                <Bar dataKey="altasManual" name="Cargados a mano" stackId="a" fill={VIZ[2]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="altasProy" name="Proyección" fill={VIZ[0]} fillOpacity={0.3} stroke={VIZ[0]} strokeDasharray="4 3" radius={[4, 4, 0, 0]} />
              </ComposedChart>
            </Grafico>

            <Grafico titulo="Comercios pagando" detalle={`Activos con plan pago al cierre de cada mes y proyección con conversión ${t.conversionPct}% y churn ${t.churnMensualPct}%.`}>
              <ComposedChart data={serieLinea}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={32} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine x={ultimo.etiqueta} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="pagando" name="Pagando" stroke={VIZ[0]} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                <Line type="monotone" dataKey="pagandoOpt" name="Optimista" stroke={VIZ[1]} strokeWidth={2} strokeDasharray="5 4" dot={false} />
                <Line type="monotone" dataKey="pagandoEsp" name="Esperado" stroke={VIZ[0]} strokeWidth={2} strokeDasharray="5 4" dot={false} />
                <Line type="monotone" dataKey="pagandoCons" name="Conservador" stroke={VIZ[2]} strokeWidth={2} strokeDasharray="5 4" dot={false} />
              </ComposedChart>
            </Grafico>

            <Grafico titulo="Ingresos cobrados por mes" detalle="Pagos aprobados (Mercado Pago y manuales) según la fecha en que se acreditaron. Lo punteado es la proyección esperada.">
              <ComposedChart data={serie} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={44} tickFormatter={compacto} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => pesos(v)} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine x={ultimo.etiqueta} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
                <Bar dataKey="ingresos" name="Cobrado" fill={VIZ[1]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="ingresosProy" name="Proyección" fill={VIZ[1]} fillOpacity={0.3} stroke={VIZ[1]} strokeDasharray="4 3" radius={[4, 4, 0, 0]} />
              </ComposedChart>
            </Grafico>

            <Grafico titulo="Ganados y perdidos" detalle={m.conEventos ? "Primeros pagos, pasajes a Pro y comercios dados de baja o suspendidos." : "Primeros pagos y pasajes a Pro (inferidos del primer pago en Pro). Las bajas por mes necesitan la migración 56."}>
              <ComposedChart data={movimientos} barCategoryGap="20%" barGap={2}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={32} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="primerosPagos" name="Primer pago" fill={VIZ[1]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="pasaronAPro" name="Pasaron a Pro" fill={VIZ[0]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="perdidos" name="Baja o suspendido" fill={PERDIDOS} radius={[4, 4, 0, 0]} />
              </ComposedChart>
            </Grafico>

            <Grafico titulo="Débito automático" detalle="Suscripciones de Mercado Pago activadas y canceladas cada mes.">
              <ComposedChart data={m.meses} barCategoryGap="25%" barGap={2}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={32} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="debitosActivados" name="Activados" fill={VIZ[2]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="debitosCancelados" name="Cancelados" fill={VIZ[3]} radius={[4, 4, 0, 0]} />
              </ComposedChart>
            </Grafico>

            <Embudo m={m} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Cohortes m={m} />
            <Distribucion m={m} />
          </div>
        </>
      )}
    </div>
  );
}

function Segmento({ etiqueta, valor, opciones, sufijo, onChange }: { etiqueta: string; valor: number; opciones: number[]; sufijo: string; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">{etiqueta}</span>
      <div className="inline-flex rounded-full border border-border/70 bg-card/60 p-0.5">
        {opciones.map((o) => (
          <button
            key={o} type="button" onClick={() => onChange(o)} aria-pressed={valor === o}
            className={cn("rounded-full px-2.5 py-1 font-medium transition-colors", valor === o ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}
          >
            {o}{sufijo}
          </button>
        ))}
      </div>
    </div>
  );
}

function Kpi({ icono: Icono, titulo, valor, detalle, delta, deltaTexto, tono = "normal" }: {
  icono: typeof Users; titulo: string; valor: string; detalle: string; delta?: number; deltaTexto?: string; tono?: "normal" | "ok" | "aviso";
}) {
  const Flecha = delta == null ? null : delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  return (
    <div className="card-premium rounded-2xl p-4 sm:p-5">
      <div className="eyebrow flex items-center gap-1.5">
        <Icono className={cn("h-4 w-4", tono === "aviso" ? "text-warning" : "text-primary")} />
        <span className="truncate">{titulo}</span>
      </div>
      <p className={cn("cifra-hero mt-2 text-2xl sm:text-3xl", tono === "aviso" ? "text-warning" : tono === "ok" ? "text-success" : "text-foreground")}>{valor}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
        {Flecha && delta != null && (
          <span className={cn("inline-flex items-center gap-0.5 font-medium", delta > 0 ? "text-success" : delta < 0 ? "text-destructive" : "")}>
            <Flecha className="h-3 w-3" />{delta > 0 ? "+" : ""}{delta}{deltaTexto ?? " vs mes anterior"}
          </span>
        )}
        <span className="truncate">{detalle}</span>
      </p>
    </div>
  );
}

function Grafico({ titulo, detalle, children }: { titulo: string; detalle: string; children: React.ReactElement }) {
  return (
    <section className="card-premium rounded-2xl p-4 sm:p-5">
      <p className="font-semibold">{titulo}</p>
      <p className="mb-3 text-xs text-muted-foreground">{detalle}</p>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </section>
  );
}

function Embudo({ m }: { m: Metricas }) {
  const f = m.funnel;
  const pasos = [
    { nombre: "Se registraron", valor: f.registrados },
    { nombre: "Terminaron la prueba", valor: f.terminaronPrueba },
    { nombre: "Pagaron o quedaron activos", valor: f.pagaron },
    { nombre: "Están en Pro", valor: f.pro },
    { nombre: "Con débito automático", valor: f.conDebito },
  ];
  const max = Math.max(1, f.registrados);
  return (
    <section className="card-premium rounded-2xl p-4 sm:p-5">
      <p className="font-semibold">Embudo</p>
      <p className="mb-3 text-xs text-muted-foreground">De todos los que se registraron, cuántos llegan a cada paso.</p>
      <ol className="space-y-2.5">
        {pasos.map((p, i) => {
          const previo = i === 0 ? p.valor : pasos[i - 1].valor;
          const pctPrevio = previo > 0 ? Math.round((p.valor / previo) * 100) : 0;
          return (
            <li key={p.nombre}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span>{p.nombre}</span>
                <span className="cifra text-muted-foreground"><b className="text-foreground">{p.valor}</b>{i > 0 && ` · ${pctPrevio}% del paso anterior`}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${(p.valor / max) * 100}%`, background: i === 0 ? "var(--viz-3)" : i >= 3 ? "var(--viz-1)" : "var(--viz-2)" }} />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Cohortes({ m }: { m: Metricas }) {
  const filas = m.cohortes.filter((c) => c.total > 0);
  return (
    <section className="card-premium overflow-hidden rounded-2xl p-4 sm:p-5">
      <p className="font-semibold">Qué pasó con cada camada</p>
      <p className="mb-3 text-xs text-muted-foreground">Los comercios que se registraron cada mes y en qué estado están hoy.</p>
      {filas.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Sin altas en el período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="[&>th]:px-2 [&>th]:pb-2 [&>th]:text-right [&>th:first-child]:text-left">
                <th>Mes de alta</th><th>Total</th><th>Activos</th><th>En prueba</th><th>Perdidos</th><th>Pagaron</th><th>Retención</th>
              </tr>
            </thead>
            <tbody className="cifra">
              {filas.map((c) => {
                const perdidos = c.suspendido + c.baja;
                const retencion = Math.round(((c.total - perdidos) / c.total) * 100);
                return (
                  <tr key={c.periodo} className="border-t border-border/60 [&>td]:px-2 [&>td]:py-1.5 [&>td]:text-right [&>td:first-child]:text-left">
                    <td className="font-medium">{c.etiqueta}</td>
                    <td>{c.total}</td>
                    <td className="text-success">{c.activo}</td>
                    <td className="text-warning">{c.prueba}</td>
                    <td className={cn(perdidos > 0 && "text-destructive")}>{perdidos}</td>
                    <td>{c.pagaron}</td>
                    <td>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted"><span className="block h-full" style={{ width: `${retencion}%`, background: "var(--viz-1)" }} /></span>
                        {retencion}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Distribucion({ m }: { m: Metricas }) {
  const total = Math.max(1, m.funnel.registrados);
  const rubros = m.porRubro.slice(0, 6);
  const Barra = ({ nombre, valor, color }: { nombre: string; valor: number; color: string }) => (
    <li>
      <div className="mb-0.5 flex justify-between text-xs"><span className="truncate">{nombre}</span><span className="cifra text-muted-foreground">{valor} · {Math.round((valor / total) * 100)}%</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${(valor / total) * 100}%`, background: color }} /></div>
    </li>
  );
  return (
    <section className="card-premium space-y-4 rounded-2xl p-4 sm:p-5">
      <div>
        <p className="font-semibold">Por plan</p>
        <ul className="mt-2 space-y-2">
          <Barra nombre="Pro" valor={m.porPlan.pro} color="var(--viz-1)" />
          <Barra nombre="Básico" valor={m.porPlan.basico} color="var(--viz-2)" />
          <Barra nombre="Free" valor={m.porPlan.free} color="var(--muted-foreground)" />
        </ul>
      </div>
      <div>
        <p className="font-semibold">Por rubro</p>
        {rubros.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Sin datos de rubro.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {rubros.map((r) => <Barra key={r.rubro} nombre={nombreRubro(r.rubro) ?? r.rubro} valor={r.total} color="var(--viz-3)" />)}
          </ul>
        )}
      </div>
      <div className="flex items-start gap-2 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        <RefreshCcw className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>El MRR es el precio del plan de cada activo: no suma cajas extra ni descuentos de sucursal. La proyección repite el promedio de altas y aplica la conversión y el churn observados; no es una promesa.</span>
      </div>
    </section>
  );
}

function TablaMeses({ m }: { m: Metricas }) {
  const cols: { k: keyof Metricas["meses"][number]; t: string; pesos?: boolean }[] = [
    { k: "altas", t: "Altas" }, { k: "altasAuto", t: "Solos" }, { k: "primerosPagos", t: "1er pago" }, { k: "pasaronAPro", t: "A Pro" },
    { k: "bajas", t: "Bajas" }, { k: "suspendidos", t: "Susp." }, { k: "debitosActivados", t: "Déb. +" }, { k: "debitosCancelados", t: "Déb. −" },
    { k: "pagos", t: "Pagos" }, { k: "ingresos", t: "Cobrado", pesos: true }, { k: "enUso", t: "En uso" }, { k: "pagando", t: "Pagando" },
  ];
  return (
    <section className="card-premium overflow-hidden rounded-2xl p-4 sm:p-5">
      <p className="mb-3 font-semibold">Mes a mes</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="[&>th]:px-2 [&>th]:pb-2 [&>th]:text-right [&>th:first-child]:text-left">
              <th>Mes</th>{cols.map((c) => <th key={c.k}>{c.t}</th>)}
            </tr>
          </thead>
          <tbody className="cifra">
            {m.meses.map((x) => (
              <tr key={x.periodo} className="border-t border-border/60 [&>td]:px-2 [&>td]:py-1.5 [&>td]:text-right [&>td:first-child]:text-left">
                <td className="font-medium">{x.etiqueta}</td>
                {cols.map((c) => <td key={c.k}>{c.pesos ? pesos(Number(x[c.k])) : String(x[c.k])}</td>)}
              </tr>
            ))}
            {m.proyeccion.map((p) => (
              <tr key={p.periodo} className="border-t border-dashed border-border/60 text-muted-foreground [&>td]:px-2 [&>td]:py-1.5 [&>td]:text-right [&>td:first-child]:text-left">
                <td className="font-medium">{p.etiqueta} <span className="text-[10px]">proy.</span></td>
                <td>{p.altas}</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
                <td>{pesos(p.ingresos.esperado)}</td><td>—</td><td>{p.pagando.esperado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
