-- 52_planes_cajas.sql
-- Precio por plan mas cajas extra (decidido 2026-10-10): cada plan incluye una
-- caja; en Pro cada caja adicional activa suma precio_caja_extra por mes; en
-- Basico no se pueden sumar cajas (tope = cajas_incluidas).
-- Precios iniciales: Basico $20.000, Pro $40.000 + $10.000 por caja extra.
-- Spec: docs/superpowers/specs/2026-10-10-billing-suscripcion-design.md
-- No destructivo y re-ejecutable (los precios solo se cargan si estan en 0).

alter table saas_planes add column if not exists cajas_incluidas   integer not null default 1 check (cajas_incluidas >= 1);
alter table saas_planes add column if not exists precio_caja_extra numeric not null default 0 check (precio_caja_extra >= 0);
-- null = sin tope de cajas (solo tiene sentido con precio_caja_extra > 0)
alter table saas_planes add column if not exists max_cajas         integer check (max_cajas is null or max_cajas >= 1);

update saas_planes set precio_mensual = 20000, cajas_incluidas = 1, max_cajas = 1,
  descripcion = 'Punto de venta, stock, caja, clientes y reportes. 1 caja.'
  where plan = 'basico' and precio_mensual = 0;
update saas_planes set precio_mensual = 40000, cajas_incluidas = 1, precio_caja_extra = 10000, max_cajas = null,
  descripcion = 'Todo lo del Básico más facturación electrónica, contingencia CAEA y multi-caja. 1 caja incluida, $10.000 por caja extra.'
  where plan = 'pro' and precio_mensual = 0;

-- En cada pago queda cuantas cajas se cobraron.
alter table saas_pagos add column if not exists cajas integer;
