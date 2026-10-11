-- 58_facturas_afip_compras.sql — cargar una compra leyendo el QR de la factura
-- electronica del proveedor (lib/afip/qr-comprobante.ts).
--   1. proveedores.cuit: para reconocer al proveedor por el CUIT que trae el QR.
--   2. compras.comprobante_afip: datos de la factura (tipo, numero, fecha, CAE,
--      importe) y una clave unica para no cargar la misma factura dos veces.
-- Re-ejecutable y no destructivo.

alter table proveedores add column if not exists cuit text;
create unique index if not exists idx_proveedores_cuit
  on proveedores (comercio_id, cuit) where cuit is not null;

alter table compras add column if not exists comprobante_afip jsonb;
-- {clave, cuit, tipo, nombreTipo, numero, fecha, importe, cae, moneda}
create unique index if not exists idx_compras_comprobante_afip
  on compras (comercio_id, (comprobante_afip ->> 'clave'))
  where comprobante_afip is not null and estado = 'recibida';
