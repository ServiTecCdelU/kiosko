-- 17_mercadopago_point.sql
-- Cobro con lector fisico Mercado Pago Point: reutiliza pagos_mp_pendientes
-- (el webhook de pago aprobado es el mismo que para el QR), solo se agregan
-- las columnas para poder cancelar el cobro en el lector si el cajero aborta.

alter table pagos_mp_pendientes add column if not exists device_id text;
alter table pagos_mp_pendientes add column if not exists intent_id text;
