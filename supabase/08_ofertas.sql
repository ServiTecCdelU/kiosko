-- ============================================================
-- Kiosko Despensa — Ofertas por producto (descuento de catálogo)
-- Ejecutar en el SQL Editor del proyecto Supabase del KIOSKO.
--
-- Marca un producto como "en oferta": el precio efectivo se calcula
-- como un descuento sobre `price` (monto fijo en $ o porcentaje).
-- Son columnas PROPIAS del kiosko: la sync NUNCA las toca (igual
-- que stock / stock_minimo / precio_base).
--   oferta_tipo = 'monto'      -> precio_final = price - oferta_valor
--   oferta_tipo = 'porcentaje' -> precio_final = price * (1 - oferta_valor/100)
-- ============================================================

alter table productos add column if not exists oferta_activa boolean not null default false;
alter table productos add column if not exists oferta_tipo   text
  check (oferta_tipo in ('monto','porcentaje'));
alter table productos add column if not exists oferta_valor  numeric not null default 0;
