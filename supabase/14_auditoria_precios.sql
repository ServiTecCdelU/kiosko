-- 14_auditoria_precios.sql
-- Auditoria de cambios de precio manual (quien y cuando), para proteger al dueño
-- frente a errores o abuso de un empleado. No fiscal, no reemplaza stock_movimientos.

create table if not exists producto_auditoria (
  id             text primary key,
  comercio_id    text not null references comercios(id) on delete cascade,
  producto_id    text not null,
  campo          text not null,
  valor_anterior text,
  valor_nuevo    text,
  usuario_nombre text,
  fecha          timestamptz not null default now()
);

create index if not exists idx_productoaud_producto on producto_auditoria (producto_id, fecha desc);
create index if not exists idx_productoaud_comercio on producto_auditoria (comercio_id, fecha desc);

alter table producto_auditoria disable row level security;
