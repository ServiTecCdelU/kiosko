-- 48_factura_a_b.sql
-- Factura A y B (emisor responsable inscripto) ademas de la Factura C (monotributo).
-- Spec: docs/superpowers/specs/2026-10-10-factura-a-b-design.md
-- No destructivo y re-ejecutable. Correr ANTES de deployar el codigo que lo usa.

-- ------------------------------------------------------------
-- 1. Condicion del emisor frente al IVA
-- ------------------------------------------------------------
alter table afip_config add column if not exists condicion_iva text not null default 'monotributo';
alter table afip_config drop constraint if exists afip_config_condicion_iva_check;
alter table afip_config add constraint afip_config_condicion_iva_check
  check (condicion_iva in ('monotributo', 'responsable_inscripto'));

-- ------------------------------------------------------------
-- 2. Condicion del cliente frente al IVA (para elegir A o B al facturarle)
-- ------------------------------------------------------------
alter table clientes add column if not exists condicion_iva text;
alter table clientes drop constraint if exists clientes_condicion_iva_check;
alter table clientes add constraint clientes_condicion_iva_check
  check (condicion_iva is null or condicion_iva in ('consumidor_final', 'responsable_inscripto', 'monotributo', 'exento'));

-- ------------------------------------------------------------
-- 3. Comprobantes: tipos A/B y desglose de IVA
--    1 Factura A · 3 Nota de credito A · 6 Factura B · 8 Nota de credito B ·
--    11 Factura C · 13 Nota de credito C
-- ------------------------------------------------------------
alter table facturas drop constraint if exists facturas_cbte_tipo_check;
alter table facturas add constraint facturas_cbte_tipo_check check (cbte_tipo in (1, 3, 6, 8, 11, 13));

alter table facturas add column if not exists neto               numeric(14, 2);   -- gravado sin IVA
alter table facturas add column if not exists iva                numeric(14, 2);   -- total de IVA
alter table facturas add column if not exists exento             numeric(14, 2);   -- operaciones exentas
alter table facturas add column if not exists alicuotas          jsonb;            -- [{id, alicuota, base, importe}]
alter table facturas add column if not exists receptor_condicion integer not null default 5;  -- CondicionIVAReceptorId

-- Los indices de unicidad distinguian solo C: ahora cubren A, B y C.
drop index if exists idx_facturas_una_por_venta;
create unique index if not exists idx_facturas_una_por_venta
  on facturas (venta_id) where cbte_tipo in (1, 6, 11) and estado <> 'rechazada';
drop index if exists idx_facturas_nc_devolucion;
create unique index if not exists idx_facturas_nc_devolucion
  on facturas (devolucion_id) where cbte_tipo in (3, 8, 13) and devolucion_id is not null and estado <> 'rechazada';
drop index if exists idx_facturas_nc_anulacion;
create unique index if not exists idx_facturas_nc_anulacion
  on facturas (factura_asociada_id) where cbte_tipo in (3, 8, 13) and devolucion_id is null and estado <> 'rechazada';
