-- 44_proveedores_cuenta_corriente.sql
-- Cuenta corriente de proveedores (cuanto le debo a cada uno, pagos parciales)
-- y categoria de los gastos de caja.
-- Spec: docs/superpowers/specs/2026-10-10-proveedores-cuenta-corriente-design.md
-- No destructivo y re-ejecutable. Correr el archivo completo en el SQL Editor.

-- ------------------------------------------------------------
-- 1. Compras: cuanto se pago de cada una y fecha pactada de pago
-- ------------------------------------------------------------
alter table compras add column if not exists pagado numeric not null default 0;
alter table compras add column if not exists vence  date;

-- Las compras que ya estaban marcadas como pagadas quedan saldadas.
update compras set pagado = total where pagada and pagado = 0 and total > 0;

create index if not exists idx_compras_con_saldo
  on compras (comercio_id, proveedor_id) where estado = 'recibida' and pagado < total;

-- ------------------------------------------------------------
-- 2. Gastos de caja con categoria (para el reporte de gastos)
-- ------------------------------------------------------------
alter table caja_movimientos add column if not exists categoria text;
alter table caja_movimientos drop constraint if exists caja_movimientos_categoria_check;
alter table caja_movimientos add constraint caja_movimientos_categoria_check
  check (categoria is null or categoria in ('mercaderia','servicios','alquiler','sueldos','impuestos','otros'));

-- La firma cambia (parametro nuevo): hay que borrar la vieja, si no quedan dos
-- funciones con el mismo nombre y la llamada por nombre de parametros es ambigua.
drop function if exists registrar_movimiento_caja(text, text, text, numeric, text, text, text);

create or replace function registrar_movimiento_caja(
  p_caja_id        text,
  p_comercio_id    text,
  p_tipo           text,
  p_monto          numeric,
  p_concepto       text default '',
  p_usuario_id     text default null,
  p_usuario_nombre text default null,
  p_categoria      text default null
) returns jsonb
language plpgsql
as $$
declare
  v_id text;
begin
  if p_comercio_id is null then
    raise exception 'Falta el comercio (p_comercio_id)';
  end if;
  if p_tipo not in ('retiro','aporte','gasto') then
    raise exception 'Tipo de movimiento invalido: %', p_tipo;
  end if;
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto debe ser mayor a cero';
  end if;
  if p_categoria is not null
     and p_categoria not in ('mercaderia','servicios','alquiler','sueldos','impuestos','otros') then
    raise exception 'Categoria de gasto invalida: %', p_categoria;
  end if;

  if not exists (
    select 1 from caja
    where id = p_caja_id and estado = 'abierta' and comercio_id = p_comercio_id
  ) then
    raise exception 'La caja % no esta abierta', p_caja_id;
  end if;

  v_id := gen_random_uuid()::text;

  insert into caja_movimientos
    (id, comercio_id, caja_id, tipo, monto, concepto, categoria, usuario_id, usuario_nombre, fecha)
  values
    (v_id, p_comercio_id, p_caja_id, p_tipo, p_monto, coalesce(p_concepto, ''),
     case when p_tipo = 'gasto' then p_categoria else null end,
     p_usuario_id, p_usuario_nombre, now());

  return jsonb_build_object('id', v_id, 'tipo', p_tipo, 'monto', p_monto);
end;
$$;

-- ------------------------------------------------------------
-- 3. Pagos a proveedores
--    Un pago puede ir a una compra puntual o "a cuenta": en ese caso se
--    aplica a las compras con saldo mas viejas primero. Lo aplicado queda en
--    `aplicado` para poder deshacerlo.
-- ------------------------------------------------------------
create table if not exists proveedor_pagos (
  id             text primary key,
  comercio_id    text not null references comercios(id),
  proveedor_id   text not null references proveedores(id),
  monto          numeric not null check (monto > 0),
  metodo         text not null check (metodo in ('efectivo','transferencia','otro')),
  aplicado       jsonb not null default '[]'::jsonb,   -- [{compraId, monto}]
  caja_id        text references caja(id),
  caja_mov_id    text,                                  -- gasto de caja generado (efectivo)
  nota           text,
  usuario_id     text,
  usuario_nombre text,
  anulado_at     timestamptz,
  anulado_por    text,
  fecha          timestamptz not null default now()
);
create index if not exists idx_proveedor_pagos_proveedor on proveedor_pagos (comercio_id, proveedor_id, fecha desc);

create or replace function registrar_pago_proveedor(
  p_comercio_id    text,
  p_proveedor_id   text,
  p_monto          numeric,
  p_metodo         text,
  p_compra_id      text default null,
  p_caja_id        text default null,
  p_nota           text default null,
  p_usuario_id     text default null,
  p_usuario_nombre text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago_id     text;
  v_prov_nombre text;
  v_saldo_total numeric;
  v_compra      record;
  v_saldo       numeric;
  v_parte       numeric;
  v_restante    numeric := p_monto;
  v_aplicado    jsonb := '[]'::jsonb;
  v_caja_mov_id text;
begin
  if p_comercio_id is null then
    raise exception 'Falta el comercio (p_comercio_id)';
  end if;
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto debe ser mayor a cero';
  end if;
  if p_metodo not in ('efectivo','transferencia','otro') then
    raise exception 'Forma de pago invalida: %', p_metodo;
  end if;

  select nombre into v_prov_nombre
  from proveedores where id = p_proveedor_id and comercio_id = p_comercio_id;
  if not found then
    raise exception 'Proveedor inexistente';
  end if;

  select coalesce(sum(total - pagado), 0) into v_saldo_total
  from compras
  where comercio_id = p_comercio_id and proveedor_id = p_proveedor_id
    and estado = 'recibida' and pagado < total;
  if p_monto > v_saldo_total + 0.009 then
    raise exception 'El pago ($%) supera lo que se le debe al proveedor ($%)',
      round(p_monto, 2), round(v_saldo_total, 2);
  end if;

  if p_compra_id is not null then
    select * into v_compra from compras
    where id = p_compra_id and comercio_id = p_comercio_id
      and proveedor_id = p_proveedor_id and estado = 'recibida'
    for update;
    if not found then
      raise exception 'Compra inexistente o anulada';
    end if;
    v_saldo := v_compra.total - v_compra.pagado;
    if p_monto > v_saldo + 0.009 then
      raise exception 'El pago ($%) supera el saldo de la compra ($%)',
        round(p_monto, 2), round(v_saldo, 2);
    end if;
    update compras
      set pagado = pagado + p_monto,
          pagada = (pagado + p_monto >= total - 0.009)
      where id = p_compra_id;
    v_aplicado := jsonb_build_array(jsonb_build_object('compraId', p_compra_id, 'monto', p_monto));
    v_restante := 0;
  else
    for v_compra in
      select * from compras
      where comercio_id = p_comercio_id and proveedor_id = p_proveedor_id
        and estado = 'recibida' and pagado < total
      order by created_at asc
      for update
    loop
      exit when v_restante <= 0.009;
      v_parte := least(v_restante, v_compra.total - v_compra.pagado);
      update compras
        set pagado = pagado + v_parte,
            pagada = (pagado + v_parte >= total - 0.009)
        where id = v_compra.id;
      v_aplicado := v_aplicado || jsonb_build_object('compraId', v_compra.id, 'monto', v_parte);
      v_restante := v_restante - v_parte;
    end loop;
  end if;

  -- Efectivo que sale del cajon: queda como gasto de la caja abierta, asi el arqueo cierra.
  if p_metodo = 'efectivo' and p_caja_id is not null then
    if not exists (
      select 1 from caja where id = p_caja_id and comercio_id = p_comercio_id and estado = 'abierta'
    ) then
      raise exception 'La caja no esta abierta';
    end if;
    v_caja_mov_id := gen_random_uuid()::text;
    insert into caja_movimientos
      (id, comercio_id, caja_id, tipo, monto, concepto, categoria, usuario_id, usuario_nombre, fecha)
    values
      (v_caja_mov_id, p_comercio_id, p_caja_id, 'gasto', p_monto,
       'Pago a proveedor: ' || v_prov_nombre, 'mercaderia', p_usuario_id, p_usuario_nombre, now());
  end if;

  v_pago_id := 'pago_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
  insert into proveedor_pagos
    (id, comercio_id, proveedor_id, monto, metodo, aplicado, caja_id, caja_mov_id, nota,
     usuario_id, usuario_nombre)
  values
    (v_pago_id, p_comercio_id, p_proveedor_id, p_monto, p_metodo, v_aplicado,
     case when p_metodo = 'efectivo' then p_caja_id end, v_caja_mov_id, nullif(trim(p_nota), ''),
     p_usuario_id, p_usuario_nombre);

  return jsonb_build_object('pagoId', v_pago_id, 'aplicado', v_aplicado, 'cajaMovId', v_caja_mov_id);
end;
$$;

-- Deshace un pago: vuelve el saldo a las compras y, si el gasto salio de una
-- caja todavia abierta, lo borra. Si la caja ya se cerro, el gasto se conserva
-- (el arqueo ya quedo hecho) y se avisa.
create or replace function anular_pago_proveedor(
  p_pago_id     text,
  p_comercio_id text,
  p_usuario_id  text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago          record;
  v_ap            jsonb;
  v_mov_conservado boolean := false;
begin
  select * into v_pago from proveedor_pagos
  where id = p_pago_id and comercio_id = p_comercio_id
  for update;
  if not found then
    raise exception 'Pago inexistente';
  end if;
  if v_pago.anulado_at is not null then
    raise exception 'El pago ya esta anulado';
  end if;

  for v_ap in select * from jsonb_array_elements(v_pago.aplicado) loop
    update compras
      set pagado = greatest(0, pagado - (v_ap->>'monto')::numeric)
      where id = v_ap->>'compraId' and comercio_id = p_comercio_id;
    update compras
      set pagada = (pagado >= total - 0.009)
      where id = v_ap->>'compraId' and comercio_id = p_comercio_id;
  end loop;

  if v_pago.caja_mov_id is not null then
    if exists (
      select 1 from caja_movimientos m join caja c on c.id = m.caja_id
      where m.id = v_pago.caja_mov_id and m.comercio_id = p_comercio_id and c.estado = 'abierta'
    ) then
      delete from caja_movimientos where id = v_pago.caja_mov_id and comercio_id = p_comercio_id;
    else
      v_mov_conservado := true;
    end if;
  end if;

  update proveedor_pagos
    set anulado_at = now(), anulado_por = p_usuario_id
    where id = p_pago_id;

  return jsonb_build_object('ok', true, 'gastoConservado', v_mov_conservado);
end;
$$;

-- ------------------------------------------------------------
-- 4. Anular una compra con pagos aplicados dejaria plata "pagada" en el aire:
--    primero se anulan sus pagos. Misma firma: se reemplaza el cuerpo.
-- ------------------------------------------------------------
create or replace function anular_compra_kiosko(
  p_compra_id   text,
  p_comercio_id text,
  p_usuario_id  text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_compra record;
  v_item   record;
  v_stock  numeric;
begin
  select * into v_compra from compras
  where id = p_compra_id and comercio_id = p_comercio_id
  for update;
  if not found then
    raise exception 'Compra inexistente';
  end if;
  if v_compra.estado = 'anulada' then
    raise exception 'La compra ya esta anulada';
  end if;
  if coalesce(v_compra.pagado, 0) > 0.009 then
    raise exception 'La compra tiene pagos registrados ($%). Anula primero esos pagos en Cuenta corriente.',
      round(v_compra.pagado, 2);
  end if;

  for v_item in
    select * from compra_items where compra_id = p_compra_id
  loop
    select stock into v_stock from productos
    where id = v_item.producto_id and comercio_id = p_comercio_id
    for update;
    if found then
      update productos
        set stock = stock - v_item.cantidad, updated_at = now()
        where id = v_item.producto_id and comercio_id = p_comercio_id;
      insert into stock_movimientos
        (id, comercio_id, producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
         referencia, usuario, fecha)
      values
        (gen_random_uuid()::text, p_comercio_id, v_item.producto_id, 'ajuste', -v_item.cantidad,
         v_stock, v_stock - v_item.cantidad,
         'anulacion ' || p_compra_id, p_usuario_id, now());
    end if;
  end loop;

  update compras
    set estado = 'anulada', anulada_at = now(), anulada_por = p_usuario_id
    where id = p_compra_id;
end;
$$;
