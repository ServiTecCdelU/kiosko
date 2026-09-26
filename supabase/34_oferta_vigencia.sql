-- 34_oferta_vigencia.sql
-- Vigencia opcional de la oferta de catalogo (08_ofertas.sql / 13_combos.sql).
-- Fechas inclusive, en hora de Argentina. NULL = sin limite por ese lado.
-- La oferta se aplica solo si oferta_activa y hoy esta dentro de [desde, hasta].
-- Columnas propias del kiosko: la sync nunca las toca.

alter table productos add column if not exists oferta_desde date;
alter table productos add column if not exists oferta_hasta date;
