-- 61_tarjeta_aparte.sql — debito y credito se informan aparte de la transferencia.
--
-- Antes el arqueo y los reportes sumaban tarjeta dentro de "transferencia", y el
-- dueño no podia conciliar con el cierre del posnet.
--
-- ventas.tarjeta_amount: parte de la venta cobrada con tarjeta. Solo hace falta
--   para el pago mixto (efectivo + debito, transferencia + credito...): en una
--   venta con debito/credito/tarjeta todo el total es tarjeta.
-- caja.total_tarjeta: total con tarjeta guardado al cerrar la caja (las cajas
--   cerradas antes de esta migracion lo tienen dentro de total_transferencia).
--
-- No destructiva y re-ejecutable.

alter table ventas add column if not exists tarjeta_amount numeric not null default 0;
alter table caja   add column if not exists total_tarjeta  numeric not null default 0;

notify pgrst, 'reload schema';
