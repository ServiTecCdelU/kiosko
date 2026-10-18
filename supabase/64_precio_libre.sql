-- 64_precio_libre.sql — productos que se cobran a precio libre.
--
-- Recargas (SUBE, celular), fotocopias especiales, "varios": no tienen un precio
-- fijo. Con precio_libre el POS pide el importe al venderlos y el servidor acepta
-- ese importe (lib/server/procesar-venta.ts) en vez del precio de lista. Para el
-- resto de los productos el precio sigue saliendo solo de la base.
--
-- No destructiva y re-ejecutable.

alter table productos add column if not exists precio_libre boolean not null default false;

notify pgrst, 'reload schema';
