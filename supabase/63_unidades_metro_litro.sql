-- 63_unidades_metro_litro.sql — se puede vender por metro y por litro.
--
-- Ferreteria (cable, manguera, cadena) y pintureria/limpieza suelta (litro).
-- Se venden como el kg: con hasta 3 decimales y precio por unidad (lib/unidades.ts).
-- Ninguna RPC mira la unidad: el stock ya es numeric con decimales.
--
-- No destructiva y re-ejecutable (solo amplia los valores permitidos).

alter table productos drop constraint if exists productos_unidad_check;
alter table productos add constraint productos_unidad_check check (unidad in ('un','kg','m','l'));
