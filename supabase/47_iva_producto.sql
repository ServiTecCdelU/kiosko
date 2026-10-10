-- 47_iva_producto.sql
-- Alicuota de IVA por producto. Hoy es un dato del catalogo (se edita en
-- "Editar producto" y "Producto nuevo"); lo va a usar la Factura A/B para
-- discriminar el impuesto. Default 21 (la alicuota general).
-- No destructivo y re-ejecutable.

alter table productos add column if not exists iva numeric not null default 21;
alter table productos drop constraint if exists productos_iva_check;
alter table productos add constraint productos_iva_check
  check (iva in (0, 2.5, 5, 10.5, 21, 27));
