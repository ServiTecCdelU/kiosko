-- 73_pedidos_tienda.sql — pedidos de la tienda online (plan Tienda, etapa 2).
-- Spec: docs/superpowers/specs/2026-10-18-plan-tienda-design.md
--
-- El cliente arma el pedido en /tienda/<slug> y queda guardado aca; el comercio lo ve
-- en Pedidos, lo prepara y lo pasa a venta en la caja (ahi se pesa y se cobra al
-- precio de ese momento). No reserva stock. No destructiva y re-ejecutable.

create table if not exists pedidos (
  id                text primary key,
  comercio_id       text not null references comercios(id),
  numero            bigint not null,
  cliente_nombre    text not null,
  cliente_telefono  text not null,
  entrega           text not null check (entrega in ('retiro', 'envio')),
  direccion         text,
  pago              text not null check (pago in ('efectivo', 'transferencia', 'mercadopago')),
  nota              text,
  -- [{productId, name, quantity, unidad, price, subtotal}] con el precio de cuando se pidio
  items             jsonb not null,
  total             numeric not null check (total >= 0),
  estado            text not null default 'nuevo'
                    check (estado in ('nuevo', 'preparando', 'listo', 'entregado', 'cancelado')),
  venta_id          text references ventas(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (comercio_id, numero)
);

create index if not exists idx_pedidos_comercio_estado on pedidos (comercio_id, estado, created_at desc);
create index if not exists idx_pedidos_comercio_telefono on pedidos (comercio_id, cliente_telefono, created_at desc);

-- El navegador no consulta la base directo (RLS cerrado, como el resto).
alter table pedidos enable row level security;
revoke all on table pedidos from anon, authenticated;

-- Numero por comercio (1, 2, 3...) y alta en una sola transaccion. Los precios ya vienen
-- calculados por el servidor (app/api/publico/tienda/pedido/route.ts).
create or replace function crear_pedido_tienda(
  p_comercio_id      text,
  p_id               text,
  p_cliente_nombre   text,
  p_cliente_telefono text,
  p_entrega          text,
  p_direccion        text,
  p_pago             text,
  p_nota             text,
  p_items            jsonb,
  p_total            numeric
) returns jsonb
language plpgsql
as $$
declare
  v_numero bigint;
begin
  if p_comercio_id is null then
    raise exception 'Falta el comercio (p_comercio_id)';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene productos';
  end if;

  insert into comercio_contadores (comercio_id, nombre, valor)
  values (p_comercio_id, 'pedido', 1)
  on conflict (comercio_id, nombre) do update set valor = comercio_contadores.valor + 1
  returning valor into v_numero;

  insert into pedidos
    (id, comercio_id, numero, cliente_nombre, cliente_telefono, entrega, direccion, pago, nota, items, total)
  values
    (p_id, p_comercio_id, v_numero, trim(p_cliente_nombre), trim(p_cliente_telefono), p_entrega,
     nullif(trim(p_direccion), ''), p_pago, nullif(trim(p_nota), ''), p_items, p_total);

  return jsonb_build_object('id', p_id, 'numero', v_numero);
end;
$$;

notify pgrst, 'reload schema';
