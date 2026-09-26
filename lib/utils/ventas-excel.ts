// lib/utils/ventas-excel.ts — exporta un listado de ventas a Excel (xlsx-js-style).
import * as XLSX from "xlsx-js-style";
import { formatDateTime } from "@/lib/utils/format";
import { metodoLabelConCuotas } from "@/lib/utils/metodo-pago";
import type { Sale } from "@/lib/types";

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: "FFFFFF" } },
  fill: { fgColor: { rgb: "047857" } },
  alignment: { horizontal: "center" },
};

const ANULADA_STYLE = { font: { color: { rgb: "9CA3AF" }, strike: true } };

function fechaArchivo(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function descargarVentasExcel(ventas: Sale[]): void {
  const headers = ["N°", "Fecha", "Pagó", "Cajero", "Método de pago", "Estado", "Total"];
  const rows = ventas.map((v) => [
    v.saleNumber ?? v.id,
    formatDateTime(v.createdAt),
    v.pagadorNombre ?? "—",
    v.userName ?? "—",
    metodoLabelConCuotas(v),
    v.estado === "anulada" ? "Anulada" : "Vigente",
    v.total,
  ]);

  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!cols"] = [
    { wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 10 }, { wch: 14 },
  ];

  for (let c = 0; c < headers.length; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c });
    if (sheet[ref]) sheet[ref].s = HEADER_STYLE;
  }

  ventas.forEach((v, i) => {
    const r = i + 1;
    const totalRef = XLSX.utils.encode_cell({ r, c: 6 });
    if (sheet[totalRef]) sheet[totalRef].z = "$#,##0.00";
    if (v.estado === "anulada") {
      for (let c = 0; c < headers.length; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (sheet[ref]) sheet[ref].s = ANULADA_STYLE;
      }
    }
  });

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Ventas");
  XLSX.writeFile(book, `Ventas-${fechaArchivo(new Date())}.xlsx`);
}
