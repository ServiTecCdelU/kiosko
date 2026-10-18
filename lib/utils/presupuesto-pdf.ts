// lib/utils/presupuesto-pdf.ts — presupuesto en PDF para entregar o mandar al cliente
// (jsPDF + autotable, mismo estilo que ventas-pdf.ts).
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { cantidadTexto } from "@/lib/cantidad";
import type { Presupuesto } from "@/services/presupuestos-service";

const BRAND: [number, number, number] = [4, 120, 87];
const GRIS: [number, number, number] = [107, 114, 128];
const NEGRO: [number, number, number] = [17, 24, 39];

/** "2026-11-02" -> "02/11/2026" sin pasar por Date (no se corre de dia por la zona). */
function fechaIso(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export function descargarPresupuestoPdf(p: Presupuesto, nombreComercio: string): void {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 14;
  let y = 18;

  doc.setTextColor(...BRAND);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(nombreComercio || "Presupuesto", marginX, y);
  doc.setTextColor(...NEGRO);
  doc.setFontSize(12);
  doc.text(`Presupuesto N° ${String(p.numero).padStart(5, "0")}`, pageW - marginX, y, { align: "right" });
  doc.setTextColor(...GRIS);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(`Fecha: ${formatDate(p.createdAt)}`, pageW - marginX, y + 5.5, { align: "right" });
  doc.text(`Válido hasta: ${fechaIso(p.vence)}`, pageW - marginX, y + 10.5, { align: "right" });

  y += 15;
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.6);
  doc.line(marginX, y, pageW - marginX, y);
  y += 7;

  if (p.clienteNombre) {
    doc.setTextColor(...GRIS);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("CLIENTE", marginX, y);
    doc.setTextColor(...NEGRO);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(p.clienteNombre, marginX, y + 5.5);
    y += 12;
  }

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [["Producto", "Cantidad", "Precio", "Subtotal"]],
    body: p.items.map((it) => [
      it.name,
      cantidadTexto(it.quantity, it.unidad),
      formatCurrency(it.price),
      formatCurrency(it.subtotal),
    ]),
    theme: "striped",
    styles: { fontSize: 9, cellPadding: 2.4 },
    headStyles: { fillColor: BRAND, textColor: 255 },
    alternateRowStyles: { fillColor: [243, 244, 246] },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
    // columnStyles no alcanza al encabezado: los titulos numericos tambien a la derecha.
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index > 0) data.cell.styles.halign = "right";
    },
  });

  // autoTable deja la posicion final en lastAutoTable.
  y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 10;
  doc.setTextColor(...GRIS);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL", pageW - marginX, y, { align: "right" });
  doc.setTextColor(...BRAND);
  doc.setFontSize(18);
  doc.text(formatCurrency(p.total), pageW - marginX, y + 8, { align: "right" });
  y += 16;

  doc.setTextColor(...GRIS);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const leyenda = [
    `Precios válidos hasta el ${fechaIso(p.vence)} inclusive. Presupuesto no válido como factura.`,
    ...(p.notas ? [`Notas: ${p.notas}`] : []),
  ];
  for (const linea of leyenda) {
    const partes = doc.splitTextToSize(linea, pageW - marginX * 2) as string[];
    doc.text(partes, marginX, y);
    y += partes.length * 4.5 + 1;
  }

  const totalPaginas = doc.getNumberOfPages();
  for (let n = 1; n <= totalPaginas; n++) {
    doc.setPage(n);
    doc.setTextColor(...GRIS);
    doc.setFontSize(7.5);
    doc.text(`Página ${n} de ${totalPaginas}`, pageW - marginX, pageH - 8, { align: "right" });
    doc.text(nombreComercio, marginX, pageH - 8);
  }

  doc.save(`Presupuesto-${String(p.numero).padStart(5, "0")}.pdf`);
}
