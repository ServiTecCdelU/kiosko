import {
  ArrowRight,
  CalendarClock,
  ChartColumn,
  Package,
  RefreshCw,
  ShoppingCart,
  Store,
  TrendingUp,
  TriangleAlert,
  Truck,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react'

const KPIS = [
  { icon: TrendingUp, label: 'Ventas de hoy', value: '$ 284.650', note: '112 ventas', tone: 'text-emerald-500' },
  { icon: Wallet, label: 'Cajas abiertas', value: '2', note: 'Caja 1 · Caja 2', tone: 'text-slate-900', dot: true },
  { icon: TriangleAlert, label: 'Stock bajo', value: '6', note: 'reponer esta semana', tone: 'text-amber-500' },
  { icon: CalendarClock, label: 'Vencen esta semana', value: '3', note: 'lácteos y fiambres', tone: 'text-rose-500' },
]

const MODULES = [
  { icon: Wallet, title: 'Caja', text: 'Apertura, cierre y arqueo' },
  { icon: ShoppingCart, title: 'Ventas', text: 'Tickets y devoluciones' },
  { icon: Users, title: 'Clientes', text: 'Fiado y cuenta corriente' },
  { icon: Package, title: 'Stock', text: 'Inventario y alertas' },
  { icon: Truck, title: 'Compras', text: 'Proveedores y reposición' },
  { icon: UserCog, title: 'Usuarios', text: 'Cajeros y permisos' },
  { icon: ChartColumn, title: 'Reportes', text: 'Márgenes y más vendidos' },
  { icon: RefreshCw, title: 'Sincronización', text: 'Catálogo del proveedor' },
]

export function PosMock() {
  return (
    <div
      role="img"
      aria-label="Vista del panel del punto de venta con ventas del día, cajas abiertas, stock bajo y vencimientos"
      className="overflow-hidden rounded-2xl border border-white/10 bg-[#0a1427] shadow-[0_40px_120px_-30px_rgba(30,110,255,0.55)]"
    >
      <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#081122] px-4 py-3" aria-hidden="true">
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="ml-3 rounded-md bg-white/[0.05] px-3 py-1 font-mono text-[11px] text-muted-foreground">
          servitec.net/comercio/donluis
        </span>
      </div>

      <div
        aria-hidden="true"
        className="bg-gradient-to-br from-[#eef4fc] via-[#f3f7fd] to-[#e6f1fb] p-4 text-left text-slate-800 sm:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-md">
              <Store className="size-5" />
            </span>
            <div>
              <div className="font-mono text-base font-semibold text-slate-900">Supermercado Don Luis</div>
              <div className="text-xs text-slate-500">Buenas tardes, Luis</div>
            </div>
          </div>
          <div className="hidden rounded-xl border border-slate-200 bg-white px-4 py-2 text-right shadow-sm sm:block">
            <div className="font-mono text-lg font-semibold leading-tight text-slate-900">05:08 p. m.</div>
            <div className="text-[10px] text-slate-500">Viernes, 25 de septiembre</div>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {KPIS.map((kpi) => (
            <div key={kpi.label} className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
              <div className="mb-2 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                <kpi.icon className="size-3 text-sky-600" />
                {kpi.label}
              </div>
              <div className={`flex items-center gap-1.5 text-xl font-bold sm:text-2xl ${kpi.tone}`}>
                {kpi.dot ? <span className="size-2 rounded-full bg-emerald-500" /> : null}
                {kpi.value}
              </div>
              <div className="mt-1 text-[10px] text-slate-500">{kpi.note}</div>
            </div>
          ))}
        </div>

        <div className="relative mb-4 flex items-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-r from-sky-500 via-blue-600 to-blue-800 p-4 text-white shadow-[0_18px_40px_-16px_rgba(29,99,237,0.7)] sm:p-6">
          <div className="absolute -right-10 -top-10 size-40 rounded-full bg-cyan-300/25 blur-3xl" />
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/15 sm:size-14">
            <ShoppingCart className="size-6 sm:size-7" />
          </span>
          <div className="relative flex-1">
            <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/75">Vender ahora</div>
            <div className="text-2xl font-bold leading-tight sm:text-3xl">Punto de Venta</div>
            <div className="text-xs text-white/80">Escaneá, cobrá y listo</div>
          </div>
          <ArrowRight className="relative size-6 text-white/85" />
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {MODULES.map((m) => (
            <div key={m.title} className="flex items-start gap-2.5 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                <m.icon className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900">{m.title}</div>
                <div className="truncate text-[10px] text-slate-500">{m.text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
