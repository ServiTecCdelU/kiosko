-- 23_cobros_mp_resueltos.sql
-- Permitir marcar como resuelto un cobro de Mercado Pago que quedo en error.
--
-- Contexto: cuando MP confirma un pago pero la venta no se puede registrar
-- (sin stock, caja cerrada), el cobro queda en estado 'error'. Es plata que
-- entro sin venta y hay que resolverla a mano: devolver el pago desde MP o
-- cargar la venta. Hasta ahora no habia forma de marcar que ya se resolvio,
-- asi que la alerta quedaba prendida para siempre.
--
-- No se reusa 'cancelado' a proposito: cancelado significa que el pago NO
-- entro. Acá la plata entró; lo que se resolvió es el desvío.

alter table pagos_mp_pendientes drop constraint if exists pagos_mp_pendientes_estado_check;
alter table pagos_mp_pendientes add constraint pagos_mp_pendientes_estado_check
  check (estado in ('pendiente','aprobado','rechazado','cancelado','error','resuelto'));

alter table pagos_mp_pendientes add column if not exists resuelto_nota text;

-- Para listar rapido los que necesitan atencion.
create index if not exists idx_mp_pendientes_estado
  on pagos_mp_pendientes (comercio_id, estado, created_at desc);
