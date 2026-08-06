-- 10_import_lote_revisar.sql
-- Soporte para importación de lista de precios: lote (unidades por paquete) y flag de revisión.

ALTER TABLE productos ADD COLUMN IF NOT EXISTS lote integer;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS revisar boolean NOT NULL DEFAULT false;
