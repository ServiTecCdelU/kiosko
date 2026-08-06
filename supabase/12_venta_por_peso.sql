-- 12_venta_por_peso.sql
-- Venta por peso (kg) ademas de por unidad. `stock` y `cantidad` en las RPC ya son
-- `numeric`, asi que no hace falta tocar nada mas para soportar decimales.

alter table productos add column if not exists unidad text not null default 'un';
alter table productos drop constraint if exists productos_unidad_check;
alter table productos add constraint productos_unidad_check check (unidad in ('un','kg'));
