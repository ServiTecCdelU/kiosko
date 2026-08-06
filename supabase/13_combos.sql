-- 13_combos.sql
-- Combos / 2x1 / precio por cantidad, sobre la misma columna oferta_* de 08_ofertas.sql.
--   oferta_tipo = 'combo' -> cada N unidades (oferta_cantidad) cuestan oferta_valor en total;
--                            el resto de unidades sueltas se cobra al precio de lista.
--   Ej: "3x$1000"  -> oferta_cantidad = 3, oferta_valor = 1000
--   Ej: "2x1" a $500 c/u -> oferta_cantidad = 2, oferta_valor = 500 (paga 1, lleva 2)

alter table productos add column if not exists oferta_cantidad integer;

alter table productos drop constraint if exists productos_oferta_tipo_check;
alter table productos add constraint productos_oferta_tipo_check
  check (oferta_tipo in ('monto','porcentaje','combo'));
