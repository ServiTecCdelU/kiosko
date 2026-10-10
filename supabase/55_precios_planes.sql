-- 55_precios_planes.sql
-- Precios decididos el 2026-10-10: Basico $30.000 y Pro $60.000 por mes (la caja
-- extra del Pro sigue a $10.000). Solo pisa el precio si todavia tiene el valor
-- anterior (20.000 / 40.000): si el superadmin ya lo cambio a mano, se respeta.
-- Re-ejecutable.

update saas_planes
   set precio_mensual = 30000, updated_at = now()
 where plan = 'basico' and precio_mensual = 20000;

update saas_planes
   set precio_mensual = 60000, updated_at = now()
 where plan = 'pro' and precio_mensual = 40000;
