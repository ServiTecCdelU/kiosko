// lib/server/fecha-argentina.ts — fecha de "hoy" en huso horario argentino,
// para que el corte de dia del aviso de pago no dependa del huso del server.
export interface FechaArgentina {
  anio: number;
  mes: number; // 1-12
  dia: number;
}

export function hoyArgentina(): FechaArgentina {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const partes = fmt.formatToParts(new Date());
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  return { anio: valor("year"), mes: valor("month"), dia: valor("day") };
}

/** "YYYY-MM" de una fecha, en huso argentino (para comparar "mismo mes"). */
export function anioMesArgentina(fecha: string | Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit",
  });
  return fmt.format(new Date(fecha));
}
