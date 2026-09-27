-- 37_sorteos_y_premios_por_compras.sql
-- 1) Premio por cantidad de compras: "a la 5ta compra te llevas un premio".
-- 2) Sorteos: cada compra con cliente suma chances y se sortea entre los participantes.
-- Ejecutar en el SQL Editor de Supabase. No destructivo: solo crea tablas y funciones nuevas.
--
-- Decision de diseño: NO se guardan contadores. Las compras y las chances se calculan
-- al momento a partir de `ventas` (cliente asociado, no anulada). Asi una venta anulada
-- deja de contar sola, y no hace falta tocar process_sale_kiosko ni anular_venta_kiosko.
-- "Hoy" y las fechas se manejan en hora de Argentina.

-- ------------------------------------------------------------
-- 1. Configuracion del premio por compras (una fila por comercio)
--    desde = las compras cuentan a partir de esa fecha (al activar, se pone hoy).
-- ------------------------------------------------------------
create table if not exists fidelidad_compras_config (
  comercio_id  text primary key references comercios(id),
  activo       boolean not null default false,
  compras_meta integer not null default 5 check (compras_meta > 0),
  monto_minimo numeric not null default 0 check (monto_minimo >= 0),
  premio       text not null default 'Premio de fidelidad',
  desde        date not null default ((now() at time zone 'America/Argentina/Buenos_Aires')::date),
  updated_at   timestamptz not null default now()
);
alter table fidelidad_compras_config enable row level security;

-- ------------------------------------------------------------
-- 2. Premios entregados (cada fila gasta `compras_usadas` compras del cliente)
-- ------------------------------------------------------------
create table if not exists premios_compras (
  id             text primary key,
  comercio_id    text not null references comercios(id),
  cliente_id     text not null references clientes(id) on delete cascade,
  premio         text not null,
  compras_usadas integer not null,
  usuario        text,
  fecha          timestamptz not null default now()
);
create index if not exists idx_premioscompras_cliente on premios_compras (comercio_id, cliente_id, fecha desc);
alter table premios_compras enable row level security;

-- ------------------------------------------------------------
-- 3. Sorteos
--    monto_por_chance > 0 : cada $X de una compra = 1 chance (compras menores a $X no suman)
--    monto_por_chance = 0 : cada compra vale 1 chance
-- ------------------------------------------------------------
create table if not exists sorteos (
  id                  text primary key,
  comercio_id         text not null references comercios(id),
  nombre              text not null,
  premio              text not null,
  desde               date not null,
  hasta               date not null,
  monto_por_chance    numeric not null default 0 check (monto_por_chance >= 0),
  estado              text not null default 'abierto' check (estado in ('abierto','sorteado','cancelado')),
  ganador_cliente_id  text references clientes(id) on delete set null,
  ganador_nombre      text,
  chances_total       integer,
  sorteado_at         timestamptz,
  sorteado_por        text,
  created_at          timestamptz not null default now(),
  check (hasta >= desde)
);
create index if not exists idx_sorteos_comercio on sorteos (comercio_id, created_at desc);
alter table sorteos enable row level security;

-- ------------------------------------------------------------
-- 4. Progreso de compras por cliente (para la tarjeta y para canjear)
--    compras_validas   = ventas con cliente, no anuladas, >= monto_minimo, desde la fecha de inicio
--    premios_ganados   = floor(compras_validas / compras_meta)
--    premios_pendientes = ganados - entregados
--    compras_en_ciclo  = lo que lleva hacia el proximo premio
-- ------------------------------------------------------------
create or replace function progreso_compras_kiosko(p_comercio_id text)
returns table (
  cliente_id text, nombre text, telefono text,
  compras_validas integer, premios_entregados integer,
  premios_pendientes integer, compras_en_ciclo integer, compras_meta integer
)
language sql
stable
as $$
  with cfg as (
    select * from fidelidad_compras_config where comercio_id = p_comercio_id and activo
  ),
  compras as (
    select v.cliente_id, count(*)::integer as n
    from ventas v, cfg
    where v.comercio_id = p_comercio_id
      and v.cliente_id is not null
      and v.estado is distinct from 'anulada'
      and v.total >= cfg.monto_minimo
      and (v.created_at at time zone 'America/Argentina/Buenos_Aires')::date >= cfg.desde
    group by v.cliente_id
  ),
  entregados as (
    select pc.cliente_id, coalesce(sum(pc.compras_usadas), 0)::integer as usadas
    from premios_compras pc, cfg
    where pc.comercio_id = p_comercio_id
      and (pc.fecha at time zone 'America/Argentina/Buenos_Aires')::date >= cfg.desde
    group by pc.cliente_id
  )
  select c.id, c.nombre, c.telefono,
         coalesce(k.n, 0),
         coalesce(e.usadas, 0) / cfg.compras_meta,
         greatest(coalesce(k.n, 0) / cfg.compras_meta - coalesce(e.usadas, 0) / cfg.compras_meta, 0),
         (coalesce(k.n, 0) - coalesce(e.usadas, 0)) % cfg.compras_meta,
         cfg.compras_meta
  from clientes c
  cross join cfg
  left join compras k on k.cliente_id = c.id
  left join entregados e on e.cliente_id = c.id
  where c.comercio_id = p_comercio_id and c.activo
    and (k.n is not null or e.usadas is not null)
  order by 6 desc, 7 desc, c.nombre;
$$;

-- ------------------------------------------------------------
-- 5. Entregar un premio por compras (gasta `compras_meta` compras del cliente)
-- ------------------------------------------------------------
create or replace function canjear_premio_compras_kiosko(
  p_cliente_id  text,
  p_comercio_id text,
  p_usuario     text default null
) returns jsonb
language plpgsql
as $$
declare
  v_cfg        fidelidad_compras_config%rowtype;
  v_pendientes integer;
begin
  select * into v_cfg from fidelidad_compras_config where comercio_id = p_comercio_id and activo;
  if not found then
    raise exception 'El premio por compras no esta activado';
  end if;

  -- Bloquea al cliente para que dos cajeros no entreguen el mismo premio a la vez
  perform 1 from clientes where id = p_cliente_id and comercio_id = p_comercio_id and activo for update;
  if not found then
    raise exception 'El cliente % no existe en este comercio', p_cliente_id;
  end if;

  select p.premios_pendientes into v_pendientes
    from progreso_compras_kiosko(p_comercio_id) p where p.cliente_id = p_cliente_id;

  if coalesce(v_pendientes, 0) < 1 then
    raise exception 'El cliente todavia no tiene un premio para retirar';
  end if;

  insert into premios_compras (id, comercio_id, cliente_id, premio, compras_usadas, usuario)
  values (gen_random_uuid()::text, p_comercio_id, p_cliente_id, v_cfg.premio, v_cfg.compras_meta, p_usuario);

  return jsonb_build_object('cliente_id', p_cliente_id, 'premio', v_cfg.premio, 'pendientes', v_pendientes - 1);
end;
$$;

-- ------------------------------------------------------------
-- 6. Participantes de un sorteo con sus chances
-- ------------------------------------------------------------
create or replace function sorteo_participantes_kiosko(p_sorteo_id text, p_comercio_id text)
returns table (cliente_id text, nombre text, telefono text, compras integer, chances integer)
language sql
stable
as $$
  select c.id, c.nombre, c.telefono, count(*)::integer,
         sum(case when s.monto_por_chance > 0 then floor(v.total / s.monto_por_chance) else 1 end)::integer
  from sorteos s
  join ventas v on v.comercio_id = s.comercio_id
  join clientes c on c.id = v.cliente_id
  where s.id = p_sorteo_id and s.comercio_id = p_comercio_id
    and v.cliente_id is not null
    and v.estado is distinct from 'anulada'
    and (v.created_at at time zone 'America/Argentina/Buenos_Aires')::date between s.desde and s.hasta
    and (s.monto_por_chance = 0 or v.total >= s.monto_por_chance)
  group by c.id, c.nombre, c.telefono
  having sum(case when s.monto_por_chance > 0 then floor(v.total / s.monto_por_chance) else 1 end) > 0
  order by 5 desc, c.nombre;
$$;

-- ------------------------------------------------------------
-- 7. Sortear: elige al ganador al azar, con probabilidad proporcional a las chances.
--    Se hace aca (en el servidor) para que nadie pueda repetirlo hasta que "salga" otro.
-- ------------------------------------------------------------
create or replace function sortear_kiosko(
  p_sorteo_id   text,
  p_comercio_id text,
  p_usuario     text default null
) returns jsonb
language plpgsql
as $$
declare
  v_sorteo   sorteos%rowtype;
  v_total    integer;
  v_pick     integer;
  v_acum     integer := 0;
  r          record;
begin
  select * into v_sorteo from sorteos where id = p_sorteo_id and comercio_id = p_comercio_id for update;
  if not found then
    raise exception 'El sorteo no existe en este comercio';
  end if;
  if v_sorteo.estado <> 'abierto' then
    raise exception 'Este sorteo ya esta %', v_sorteo.estado;
  end if;

  select coalesce(sum(chances), 0) into v_total from sorteo_participantes_kiosko(p_sorteo_id, p_comercio_id);
  if v_total < 1 then
    raise exception 'Nadie participa todavia: hace falta al menos una compra con cliente en las fechas del sorteo';
  end if;

  v_pick := floor(random() * v_total)::integer; -- 0 .. v_total-1

  for r in select * from sorteo_participantes_kiosko(p_sorteo_id, p_comercio_id)
  loop
    v_acum := v_acum + r.chances;
    if v_pick < v_acum then
      update sorteos
        set estado = 'sorteado', ganador_cliente_id = r.cliente_id, ganador_nombre = r.nombre,
            chances_total = v_total, sorteado_at = now(), sorteado_por = p_usuario
        where id = p_sorteo_id;
      return jsonb_build_object(
        'ganador_cliente_id', r.cliente_id, 'ganador_nombre', r.nombre,
        'telefono', r.telefono, 'chances_total', v_total
      );
    end if;
  end loop;

  raise exception 'No se pudo elegir un ganador';
end;
$$;
