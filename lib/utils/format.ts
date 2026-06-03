// lib/utils/format.ts
// Utilidades de formato centralizadas — evitar duplicación entre componentes

import { toDate } from "@/services/supabase-helpers";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 0,
});

const currencyFormatterDecimals = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export const formatCurrency = (amount: number): string => {
  const safe = typeof amount === "number" && !isNaN(amount) ? amount : 0;
  return currencyFormatter.format(safe);
};

export const formatCurrencyDecimals = (amount: number): string => {
  const safe = typeof amount === "number" && !isNaN(amount) ? amount : 0;
  return currencyFormatterDecimals.format(safe);
};

export const formatDate = (date: unknown): string => {
  if (!date) return "-";
  try {
    const d = toDate(date);
    if (isNaN(d.getTime()) || d.getTime() === 0) return "-";
    return dateFormatter.format(d);
  } catch {
    return "-";
  }
};

export const formatDateTime = (date: unknown): string => {
  if (!date) return "-";
  try {
    const d = toDate(date);
    if (isNaN(d.getTime()) || d.getTime() === 0) return "-";
    return dateTimeFormatter.format(d);
  } catch {
    return "-";
  }
};

export const formatTime = (date: unknown): string => {
  if (!date) return "--:--";
  try {
    const d = toDate(date);
    if (isNaN(d.getTime()) || d.getTime() === 0) return "--:--";
    return timeFormatter.format(d);
  } catch {
    return "--:--";
  }
};

export const formatPrice = (price: number): string => formatCurrency(price);

const dateShortFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const compactNumberFormatter = new Intl.NumberFormat("es-AR", {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 1,
});

/** Formato corto: dd/mm HH:mm (sin año) */
export const formatDateShort = (date: unknown): string => {
  if (!date) return "-";
  try {
    const d = toDate(date);
    if (isNaN(d.getTime()) || d.getTime() === 0) return "-";
    return dateShortFormatter.format(d);
  } catch {
    return "-";
  }
};

/** Formato compacto para numeros grandes: 1.5M, 200K, etc. */
export const formatCompactNumber = (value: number): string => {
  const safe = typeof value === "number" && !isNaN(value) ? value : 0;
  return compactNumberFormatter.format(safe);
};
