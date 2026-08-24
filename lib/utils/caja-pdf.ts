// lib/utils/caja-pdf.ts — genera el PDF de cierre de caja (jsPDF + autotable).
// Layout inspirado en el cierre de caja de VipVet (mismo estilo entre apps).
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import { metodoLabel, metodoRgb, metodoLabelConCuotas } from "@/lib/utils/metodo-pago";
import type { Caja, CajaMovimiento, Sale, PaymentMethod } from "@/lib/types";

export interface CajaPdfInput {
  caja: Caja;
  movimientos: CajaMovimiento[];
  ventas: Sale[];
  nombreComercio?: string;
}

const BRAND: [number, number, number] = [4, 120, 87];
const GRIS: [number, number, number] = [107, 114, 128];
const NEGRO: [number, number, number] = [17, 24, 39];
const AMBAR: [number, number, number] = [217, 119, 6];
const ROJO: [number, number, number] = [220, 38, 38];

function fechaArchivo(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function descargarCajaPdf({ caja, movimientos, ventas, nombreComercio = "Demo" }: CajaPdfInput): void {
  const vigentes = ventas.filter((v) => v.estado !== "anulada");
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 14;
  let y = 18;

  // ── Encabezado ────────────────────────────────────────────
  doc.setFillColor(...BRAND);
  doc.roundedRect(marginX, y - 8, 12, 12, 2.5, 2.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(nombreComercio.charAt(0).toUpperCase(), marginX + 6, y - 0.5, { align: "center" });

  doc.setTextColor(...BRAND);
  doc.setFontSize(17);
  doc.text("Cierre de caja", marginX + 17, y - 2);
  doc.setTextColor(...GRIS);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(nombreComercio, marginX + 17, y + 3.5);

  const estadoLabel = caja.estado === "cerrada" ? "CERRADA" : "ABIERTA";
  const estadoColor: [number, number, number] = caja.estado === "cerrada" ? BRAND : AMBAR;
  const badgeW = 26;
  doc.setFillColor(...estadoColor);
  doc.roundedRect(pageW - marginX - badgeW, y - 8, badgeW, 6.5, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text(estadoLabel, pageW - marginX - badgeW / 2, y - 3.8, { align: "center" });

  doc.setTextColor(...NEGRO);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(formatDateTime(caja.openedAt), pageW - marginX, y + 3.5, { align: "right" });

  y += 10;
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.6);
  doc.line(marginX, y, pageW - marginX, y);
  y += 9;

  // ── Datos de apertura/cierre ──────────────────────────────
  const colW = (pageW - marginX * 2) / 2;
  const campo = (label: string, valor: string, col: 0 | 1) => {
    const x = marginX + col * colW;
    doc.setTextColor(...GRIS);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(label.toUpperCase(), x, y);
    doc.setTextColor(...NEGRO);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(valor, x, y + 5.5);
  };

  campo("Abierta por", caja.abiertaPorNombre || "—", 0);
  if (caja.cerradaPor) campo("Cerrada por", caja.cerradaPor, 1);
  y += 13;
  campo("Apertura", formatDateTime(caja.openedAt), 0);
  if (caja.closedAt) campo("Cierre", formatDateTime(caja.closedAt), 1);
  y += 13;
  campo("Monto inicial", formatCurrency(caja.montoApertura), 0);
  y += 15;

  // ── Venta total ───────────────────────────────────────────
  doc.setTextColor(...GRIS);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("VENTA TOTAL", marginX, y);
  doc.setTextColor(...BRAND);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(formatCurrency(caja.totalVentas), marginX, y + 8);
  doc.setTextColor(...GRIS);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`${caja.cantidadVentas} venta${caja.cantidadVentas === 1 ? "" : "s"}`, marginX + doc.getTextWidth(formatCurrency(caja.totalVentas)) + 4, y + 8);
  y += 16;

  // ── Desglose por metodo de pago ───────────────────────────
  const porMetodo = new Map<PaymentMethod, { total: number; cantidad: number }>();
  for (const v of vigentes) {
    const prev = porMetodo.get(v.paymentMethod) ?? { total: 0, cantidad: 0 };
    prev.total += v.total;
    prev.cantidad += 1;
    porMetodo.set(v.paymentMethod, prev);
  }
  const metodos = Array.from(porMetodo.entries());
  const boxGap = 4;
  const boxW = (pageW - marginX * 2 - boxGap * (Math.min(metodos.length, 4) - 1)) / Math.min(metodos.length || 1, 4);
  metodos.forEach(([metodo, info], i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = marginX + col * (boxW + boxGap);
    const boxY = y + row * 22;
    const [r, g, b] = metodoRgb(metodo);
    const mezcla = (c: number) => Math.round(c + (255 - c) * 0.85);
    doc.setFillColor(mezcla(r), mezcla(g), mezcla(b));
    doc.setDrawColor(r, g, b);
    doc.roundedRect(x, boxY, boxW, 18, 2.5, 2.5, "FD");
    doc.setTextColor(...GRIS);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.text(metodoLabel(metodo).toUpperCase(), x + 3, boxY + 6);
    doc.setTextColor(...NEGRO);
    doc.setFontSize(10.5);
    doc.setFont("helvetica", "bold");
    doc.text(formatCurrency(info.total), x + 3, boxY + 12.5);
    doc.setTextColor(...GRIS);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.text(`${info.cantidad} venta${info.cantidad === 1 ? "" : "s"}`, x + 3, boxY + 16.5);
  });
  y += Math.ceil(metodos.length / 4) * 22 + 6;

  // ── Efectivo esperado ─────────────────────────────────────
  const esperado = caja.montoApertura + caja.totalEfectivo + caja.totalAportes - caja.totalRetiros - caja.totalGastos;
  doc.setFillColor(...BRAND);
  doc.roundedRect(marginX, y, pageW - marginX * 2, 14, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("EFECTIVO ESPERADO EN CAJA", marginX + 4, y + 6);
  doc.setFontSize(13);
  doc.text(formatCurrency(esperado), pageW - marginX - 4, y + 9.5, { align: "right" });
  y += 20;

  // ── Resultado del cierre ──────────────────────────────────
  if (caja.estado === "cerrada" && caja.montoCierre != null) {
    const dif = caja.diferencia ?? 0;
    doc.setTextColor(...NEGRO);
    doc.setFontSize(10.5);
    doc.setFont("helvetica", "bold");
    doc.text("Resultado del cierre", marginX, y);
    y += 6;
    const filas: [string, string, [number, number, number]?][] = [
      ["Esperado en caja", formatCurrency(esperado)],
      ["Contado en caja", formatCurrency(caja.montoCierre)],
      [
        "Diferencia",
        `${formatCurrency(dif)} ${dif === 0 ? "(cuadra)" : dif > 0 ? "(sobra)" : "(falta)"}`,
        dif === 0 ? BRAND : dif > 0 ? AMBAR : ROJO,
      ],
    ];
    for (const [label, valor, color] of filas) {
      doc.setTextColor(...GRIS);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(label, marginX, y);
      doc.setTextColor(...(color ?? NEGRO));
      doc.setFont("helvetica", "bold");
      doc.text(valor, pageW - marginX, y, { align: "right" });
      y += 6;
    }
    y += 4;
  }

  if (caja.notas) {
    doc.setTextColor(...GRIS);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "italic");
    doc.text(`Notas: ${caja.notas}`, marginX, y);
    y += 8;
  }

  // ── Movimientos de caja ───────────────────────────────────
  if (movimientos.length > 0) {
    doc.setTextColor(...NEGRO);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text("Movimientos de caja", marginX, y);
    autoTable(doc, {
      startY: y + 3,
      margin: { left: marginX, right: marginX },
      head: [["Hora", "Tipo", "Concepto", "Monto"]],
      body: movimientos.map((m) => [formatDateTime(m.fecha), m.tipo, m.concepto || "—", formatCurrency(m.monto)]),
      theme: "striped",
      styles: { fontSize: 8.5, cellPadding: 2.2 },
      headStyles: { fillColor: BRAND, textColor: 255 },
      alternateRowStyles: { fillColor: [243, 244, 246] },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // ── Detalle de ventas ──────────────────────────────────────
  if (vigentes.length > 0) {
    doc.setTextColor(...NEGRO);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text(`Detalle de ventas (${vigentes.length})`, marginX, y);
    autoTable(doc, {
      startY: y + 3,
      margin: { left: marginX, right: marginX },
      head: [["N°", "Hora", "Pagó", "Pago", "Monto"]],
      body: vigentes.map((v) => [
        v.saleNumber ?? v.id,
        formatDateTime(v.createdAt),
        v.pagadorNombre ?? "—",
        metodoLabelConCuotas(v),
        formatCurrency(v.total),
      ]),
      theme: "striped",
      styles: { fontSize: 8.5, cellPadding: 2.2 },
      headStyles: { fillColor: BRAND, textColor: 255 },
      alternateRowStyles: { fillColor: [243, 244, 246] },
      columnStyles: { 4: { halign: "right" } },
    });
  }

  // ── Pie de pagina ─────────────────────────────────────────
  const totalPaginas = doc.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    doc.setTextColor(...GRIS);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text(`Página ${p} de ${totalPaginas}`, pageW - marginX, doc.internal.pageSize.getHeight() - 8, { align: "right" });
    doc.text(nombreComercio, marginX, doc.internal.pageSize.getHeight() - 8);
  }

  doc.save(`Caja-${fechaArchivo(caja.openedAt)}.pdf`);
}
