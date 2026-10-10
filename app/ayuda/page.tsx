"use client";

// app/ayuda/page.tsx — tutorial del sistema, pantalla por pantalla, para el
// dueño y los cajeros. Cada tema se abre y cierra; los pasos son los que se
// hacen de verdad en el sistema. Visible para todos los roles (lib/nav.ts).
import { useState } from "react";
import Link from "next/link";
import {
  BarChart3, CircleDollarSign, CircleHelp, ClipboardCheck, FileText, Megaphone, Package, Printer, Receipt,
  ShoppingCart, Truck, UserCog, Users, Wallet, ChevronDown, MessageCircle,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { AuthGuard } from "@/components/auth/auth-guard";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { CONTACT } from "@/lib/marketing/contact";

interface Tema {
  id: string;
  titulo: string;
  icono: typeof ShoppingCart;
  /** Quien lo ve: sin lista = todos. */
  roles?: ("admin" | "encargado" | "cajero")[];
  resumen: string;
  pasos: string[];
  href?: string;
}

const TEMAS: Tema[] = [
  {
    id: "arranque", titulo: "Primer día: dejar todo listo", icono: ClipboardCheck, roles: ["admin"],
    resumen: "Lo mínimo para empezar a vender hoy mismo.",
    pasos: [
      "Cargá tus productos en Stock: importá tu lista de precios desde Excel (Importar productos) o cargalos a mano con Nuevo producto. Si trabajás con la distribuidora, Sincronización los trae solos.",
      "En Caja → Puestos… creá una caja por cada puesto de cobro. En Caja → PCs… registrá la computadora de cada caja: así los cajeros entran con su PIN de 6 números.",
      "En Empleados cargá a cada cajero o encargado con su PIN.",
      "En el Punto de Venta tocá Impresora y elegí cómo imprime esa PC: térmica por USB, agente local, Zebra o el navegador.",
      "Si cobrás con Mercado Pago (QR o lector Point), conectá tu cuenta en Facturación → Cobros con Mercado Pago.",
    ],
    href: "/stock",
  },
  {
    id: "vender", titulo: "Vender en el Punto de Venta", icono: ShoppingCart,
    resumen: "Escanear, cobrar e imprimir el ticket.",
    pasos: [
      "Abrí tu caja en Caja con el fondo inicial (el cambio con el que arrancás).",
      "En el Punto de Venta escaneá el código de barras o buscá por nombre (F3). Los productos rápidos aparecen en la grilla sin buscar.",
      "Los productos por peso piden la cantidad en kilos; si tenés balanza con etiqueta, el código ya trae el peso.",
      "Para cobrar (F2) elegí efectivo, transferencia, débito, crédito, mixto o fiado. En efectivo podés poner con cuánto paga y sale el vuelto.",
      "Suspender guarda el carrito para seguir después (por ejemplo, el cliente fue a buscar algo). En espera lo recupera.",
      "Si se corta internet, seguís vendiendo igual: las ventas se guardan en la PC y se suben solas cuando vuelve.",
    ],
    href: "/pos",
  },
  {
    id: "caja", titulo: "Caja: apertura, movimientos y cierre", icono: Wallet,
    resumen: "Que el arqueo cierre todos los días.",
    pasos: [
      "Abrí la caja con el fondo inicial. Cada cajero abre la suya.",
      "Toda plata que sale sin ser una venta se anota: Retiro (se lleva el dueño), Gasto (luz, reparto, con su categoría) o Aporte (entra cambio).",
      "Al cerrar, contá el efectivo y cargalo: el sistema compara con lo que debería haber y muestra la diferencia.",
      "Una venta cobrada mal se anula desde Caja o Ventas: devuelve el stock y, si era fiado, descuenta la deuda. Si ya cerraste la caja, usá Devolución en Ventas.",
      "Abrir cajón manda el pulso al cajón de dinero (con impresora térmica por USB o agente).",
    ],
    href: "/caja",
  },
  {
    id: "fiado", titulo: "Clientes y fiado", icono: Users, roles: ["admin", "encargado"],
    resumen: "Cuenta corriente, límite de crédito y puntos.",
    pasos: [
      "Creá el cliente con su nombre, documento y, si querés, un límite de crédito y su condición frente al IVA (para facturarle).",
      "En el Punto de Venta, al cobrar con Fiado elegís el cliente: la venta queda en su cuenta.",
      "Cuando paga, registrá el pago desde Clientes: baja el saldo y queda en el historial.",
      "Deudores muestra a quién reclamar; los puntos se suman con cada compra y se canjean desde la ficha del cliente.",
    ],
    href: "/clientes",
  },
  {
    id: "stock", titulo: "Stock, vencimientos y recuento", icono: Package, roles: ["admin"],
    resumen: "Que el stock del sistema sea el de la góndola.",
    pasos: [
      "Editar producto tiene precio, costo (el margen se calcula solo), IVA, unidades por bulto, stock mínimo y si se vende por kilo.",
      "Vencimientos: cargá la fecha al recibir la compra (crea un lote) o a mano. El inicio avisa qué vence esta semana y los lotes se descuentan solos al vender.",
      "Mermas: en Ajustar stock elegí Merma con el motivo (rotura, vencido, consumo propio). Van a Reportes como pérdidas.",
      "Recuento: en Stock → Recuento abrís un conteo de todo o de un rubro, contás con el lector y al cerrar el sistema ajusta las diferencias.",
      "Pedí más te sugiere qué reponer según lo que se vende; Vencen esta semana sugiere ofertas para no tirar mercadería.",
    ],
    href: "/stock",
  },
  {
    id: "compras", titulo: "Compras y proveedores", icono: Truck, roles: ["admin"],
    resumen: "Mercadería que entra y cuánto le debés a cada proveedor.",
    pasos: [
      "Cargá tus proveedores en la pestaña Proveedores.",
      "Recepción: con el remito en la mano, elegí el proveedor, agregá los productos con cantidad (o bultos) y costo. El stock sube y el costo queda actualizado.",
      "Si la compra queda impaga, marcala en cuenta corriente y poné hasta cuándo hay que pagarla: el inicio te lo recuerda.",
      "Cuenta corriente: ves la deuda por proveedor y registrás pagos. Si pagás en efectivo de la caja, queda como gasto y el arqueo cierra solo.",
    ],
    href: "/compras",
  },
  {
    id: "promos", titulo: "Promociones y carteles", icono: Megaphone, roles: ["admin", "encargado"],
    resumen: "Ofertas, combos y cartelería lista para imprimir.",
    pasos: [
      "Desde Stock, en cada producto activás una oferta: descuento en pesos, porcentaje o combo (3x2, 2 por $X), con fecha de inicio y fin.",
      "Promociones muestra todas las ofertas vigentes, cómo vienen vendiendo y qué conviene renovar.",
      "Imprimí carteles A4/A5/A6, etiquetas de góndola o una imagen para WhatsApp e Instagram. La pantalla TV muestra las ofertas en un monitor del local.",
      "Premio por compras y sorteos fidelizan a los clientes registrados.",
    ],
    href: "/promociones",
  },
  {
    id: "facturacion", titulo: "Facturación electrónica y Mercado Pago", icono: FileText, roles: ["admin"],
    resumen: "Factura A, B o C con CAE de ARCA, y cobros con QR o Point.",
    pasos: [
      "Facturación tiene un tutorial de 7 pasos: datos fiscales, certificado en ARCA, punto de venta y prueba. Empezá en modo prueba (homologación) y cuando ande, pasá a real.",
      "Elegí si cada venta se factura sola (automático) o con el botón Facturar del Punto de Venta y de Ventas (manual).",
      "Si sos responsable inscripto, el sistema emite A a inscriptos con CUIT y B al resto, con el IVA de cada producto discriminado.",
      "Contingencia (CAEA): si ARCA se cae, la factura sale igual y se informa después. Activalo en la misma pantalla.",
      "Cobros con Mercado Pago: pegá el Access Token de tu cuenta una sola vez. El QR y el lector Point cobran directo a tu cuenta.",
    ],
    href: "/facturacion",
  },
  {
    id: "impresora", titulo: "Impresora y cajón", icono: Printer,
    resumen: "Ticket por térmica, con corte y cajón.",
    pasos: [
      "En el Punto de Venta tocá Impresora. Es una configuración por computadora: cada caja tiene la suya.",
      "USB directo (Chrome o Edge): Conectar impresora USB y elegirla. No se instala nada.",
      "Si Windows no deja usar el USB, instalá el agente local (carpeta herramientas/agente-impresora) y elegí la impresora desde la lista. Sirve también para impresoras de red.",
      "Elegí 80 o 58 mm, activá Abrir el cajón al cobrar en efectivo y probá con Imprimir ticket de prueba.",
      "La factura electrónica sale por la misma térmica, con el QR de ARCA.",
    ],
    href: "/pos",
  },
  {
    id: "empleados", titulo: "Empleados y permisos", icono: UserCog, roles: ["admin"],
    resumen: "Quién entra, con qué PIN y qué puede ver.",
    pasos: [
      "El dueño entra con Google. Los cajeros y encargados entran con un PIN de 6 números, solo en las PCs que registraste.",
      "El cajero ve Punto de Venta y Caja. El encargado además ve Ventas y Promociones. El resto es del dueño.",
      "Si un cajero se va, desactivalo: su PIN deja de funcionar al instante y su historial queda.",
      "5 PIN equivocados bloquean esa PC 15 minutos.",
    ],
    href: "/usuarios",
  },
  {
    id: "reportes", titulo: "Reportes y copia de tus datos", icono: BarChart3, roles: ["admin"],
    resumen: "Qué se vendió, cuánto ganaste y cuándo se vende más.",
    pasos: [
      "Reportes muestra ventas por día y por hora, margen bruto, gastos por categoría, pérdidas y ganancia neta. Se exporta a Excel y PDF.",
      "Más vendidos, rentabilidad por rubro y mayores aumentos de precio ayudan a decidir qué subir y qué promocionar.",
      "En Sincronización y reportes descargás un Excel con todos tus datos, una hoja por tema. Tus datos son tuyos.",
    ],
    href: "/reportes",
  },
  {
    id: "suscripcion", titulo: "Cuenta y suscripción", icono: CircleDollarSign, roles: ["admin"],
    resumen: "Plan, cajas y pago mensual.",
    pasos: [
      "Básico incluye 1 caja. Pro incluye facturación electrónica y varias cajas (la primera incluida, el resto con un adicional por mes).",
      "Pagás mes a mes desde Suscripción con Mercado Pago, o por transferencia avisándonos. Cada pago cubre un mes.",
      "Si un mes no se paga, hay 10 días de gracia y después el sistema pasa a modo consulta: ves y exportás todo, pero no se puede vender hasta regularizar. Tus datos no se tocan.",
    ],
    href: "/suscripcion",
  },
  {
    id: "ventas", titulo: "Ventas, anulaciones y devoluciones", icono: Receipt, roles: ["admin", "encargado"],
    resumen: "El historial de cada ticket.",
    pasos: [
      "Ventas lista cada ticket con su forma de pago, el cajero y la factura si la tiene.",
      "Anular deshace la venta completa (devuelve stock y fiado). Devolución es parcial: elegís qué productos vuelven.",
      "Si la venta estaba facturada, la nota de crédito a ARCA sale sola.",
    ],
    href: "/ventas",
  },
];

export default function AyudaPage() {
  return (
    <AuthGuard>
      <Contenido />
    </AuthGuard>
  );
}

function Contenido() {
  const { rol } = useAuth();
  const [abierto, setAbierto] = useState<string | null>(null);
  const temas = TEMAS.filter((t) => !t.roles || !rol || t.roles.includes(rol));

  return (
    <AppShell title="Ayuda">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="card-premium flex items-center gap-3 rounded-2xl p-5">
          <span className="grad-brand flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white"><CircleHelp className="h-6 w-6" /></span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Tutorial del sistema</h2>
            <p className="text-sm text-muted-foreground">Cada tema explica qué hacer y dónde. Tocá uno para abrirlo.</p>
          </div>
        </div>

        <div className="space-y-2">
          {temas.map((t) => {
            const Icono = t.icono;
            const esta = abierto === t.id;
            return (
              <section key={t.id} className="card-premium overflow-hidden rounded-2xl">
                <button
                  type="button"
                  onClick={() => setAbierto(esta ? null : t.id)}
                  aria-expanded={esta}
                  className="flex w-full items-center gap-3 p-4 text-left"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icono className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{t.titulo}</span>
                    <span className="block text-xs text-muted-foreground">{t.resumen}</span>
                  </span>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", esta && "rotate-180")} />
                </button>
                {esta && (
                  <div className="border-t px-4 pb-4 pt-3">
                    <ol className="list-decimal space-y-2 pl-5 text-sm">
                      {t.pasos.map((p, i) => <li key={i}>{p}</li>)}
                    </ol>
                    {t.href && (
                      <Link href={t.href} className="mt-3 inline-block text-sm font-medium text-primary hover:underline">Ir a la pantalla →</Link>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          ¿Algo no está acá?{" "}
          <a href={CONTACT.whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            <MessageCircle className="h-3.5 w-3.5" /> Escribinos por WhatsApp
          </a>
        </p>
      </div>
    </AppShell>
  );
}
