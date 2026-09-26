// lib/utils/ventas-pdf.ts — exporta un listado de ventas a PDF (jsPDF + autotable).
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import { metodoLabelConCuotas } from "@/lib/utils/metodo-pago";
import type { Sale } from "@/lib/types";

const BRAND: [number, number, number] = [4, 120, 87];
const GRIS: [number, number, number] = [107, 114, 128];
const NEGRO: [number, number, number] = [17, 24, 39];

function fechaArchivo(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function descargarVentasPdf(ventas: Sale[], nombreComercio = "Demo"): void {
  const vigentes = ventas.filter((v) => v.estado !== "anulada");
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 14;
  let y = 18;

  doc.setTextColor(...BRAND);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("Listado de ventas", marginX, y);
  doc.setTextColor(...GRIS);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(nombreComercio, marginX, y + 5);
  doc.text(new Date().toLocaleString("es-AR"), pageW - marginX, y, { align: "right" });

  y += 11;
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.6);
  doc.line(marginX, y, pageW - marginX, y);
  y += 8;

  const total = vigentes.reduce((s, v) => s + v.total, 0);
  doc.setTextColor(...GRIS);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL", marginX, y);
  doc.setTextColor(...BRAND);
  doc.setFontSize(16);
  doc.text(formatCurrency(total), marginX, y + 7);
  doc.setTextColor(...GRIS);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`${vigentes.length} venta${vigentes.length === 1 ? "" : "s"}`, marginX + doc.getTextWidth(formatCurrency(total)) + 5, y + 7);
  y += 14;

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [["N°", "Fecha", "Pagó", "Cajero", "Pago", "Monto"]],
    body: ventas.map((v) => [
      v.saleNumber ?? v.id,
      formatDateTime(v.createdAt),
      v.pagadorNombre ?? "—",
      v.userName ?? "—",
      metodoLabelConCuotas(v),
      `${v.estado === "anulada" ? "(anulada) " : ""}${formatCurrency(v.total)}`,
    ]),
    theme: "striped",
    styles: { fontSize: 8.5, cellPadding: 2.2 },
    headStyles: { fillColor: BRAND, textColor: 255 },
    alternateRowStyles: { fillColor: [243, 244, 246] },
    columnStyles: { 5: { halign: "right" } },
    didParseCell: (data) => {
      if (data.section === "body") {
        const venta = ventas[data.row.index];
        if (venta?.estado === "anulada") data.cell.styles.textColor = [156, 163, 175];
      }
    },
  });

  const totalPaginas = doc.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    doc.setTextColor(...GRIS);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text(`Página ${p} de ${totalPaginas}`, pageW - marginX, doc.internal.pageSize.getHeight() - 8, { align: "right" });
    doc.text(nombreComercio, marginX, doc.internal.pageSize.getHeight() - 8);
  }

  doc.save(`Ventas-${fechaArchivo(new Date())}.pdf`);
}
