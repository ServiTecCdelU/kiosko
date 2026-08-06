-- 11_favoritos_vencimiento.sql
-- Grilla de productos rapidos (favoritos) + control de vencimientos.

alter table productos add column if not exists favorito boolean not null default false;
alter table productos add column if not exists fecha_vencimiento date;

create index if not exists idx_productos_favorito on productos (comercio_id, favorito) where favorito = true;
create index if not exists idx_productos_vencimiento on productos (comercio_id, fecha_vencimiento) where fecha_vencimiento is not null;
