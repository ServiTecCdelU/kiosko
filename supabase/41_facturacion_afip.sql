-- 41_facturacion_afip.sql
-- Facturacion electronica AFIP/ARCA: Factura C y Nota de credito C (monotributo).
-- Spec: docs/superpowers/specs/2026-10-03-facturacion-afip-design.md
--
-- Cada comercio factura con SU certificado. El sistema genera la clave privada
-- y el pedido de certificado (CSR); la clave se guarda CIFRADA en la app
-- (AES-256-GCM, lib/server/cifrado.ts, clave AFIP_CERT_KEY del entorno).
--
-- No destructivo. Re-ejecutable. Solo el servidor (service role) toca estas
-- tablas: RLS activado sin politicas, como 37_*.sql.

-- ------------------------------------------------------------
-- 1. Configuracion fiscal de cada comercio
-- ------------------------------------------------------------
create table if not exists afip_config (
  comercio_id        text primary key references comercios(id) on delete cascade,
  cuit               text not null check (cuit ~ '^[0-9]{11}$'),
  razon_social       text not null,
  domicilio          text not null,
  inicio_actividades date not null,
  ingresos_brutos    text,
  -- Punto de venta "Factura electronica - Web Services" dado de alta en AFIP
  punto_venta        integer check (punto_venta between 1 and 99999),
  ambiente           text not null default 'homologacion'
                       check (ambiente in ('homologacion', 'produccion')),
  -- 'automatico': toda venta se factura sola; 'manual': boton Facturar
  modo               text not null default 'manual' check (modo in ('manual', 'automatico')),
  clave_cifrada      text,          -- clave privada RSA (PEM), cifrada
  csr_pem            text,          -- pedido de certificado (publico)
  cert_pem           text,          -- certificado que devuelve AFIP (publico)
  cert_vence         timestamptz,
  activo             boolean not null default false,
  updated_at         timestamptz not null default now()
);
alter table afip_config enable row level security;

-- ------------------------------------------------------------
-- 2. Ticket de acceso de WSAA (vale ~12 h). Se guarda porque AFIP rechaza
--    pedir uno nuevo mientras el anterior sigue vigente, y cada instancia del
--    servidor lo necesita. token y sign van cifrados.
-- ------------------------------------------------------------
create table if not exists afip_tokens (
  comercio_id   text not null references comercios(id) on delete cascade,
  ambiente      text not null,
  servicio      text not null,
  token_cifrado text not null,
  sign_cifrado  text not null,
  expira        timestamptz not null,
  primary key (comercio_id, ambiente, servicio)
);
alter table afip_tokens enable row level security;

-- ------------------------------------------------------------
-- 3. Comprobantes emitidos. 11 = Factura C, 13 = Nota de credito C.
--    Nunca se borran: la venta puede desaparecer (demo) y la factura queda.
-- ------------------------------------------------------------
create table if not exists facturas (
  id                  text primary key,
  comercio_id         text not null references comercios(id) on delete cascade,
  venta_id            text references ventas(id) on delete set null,
  devolucion_id       text references devoluciones(id) on delete set null,
  factura_asociada_id text references facturas(id),
  ambiente            text not null check (ambiente in ('homologacion', 'produccion')),
  cbte_tipo           integer not null check (cbte_tipo in (11, 13)),
  punto_venta         integer not null,
  numero              bigint,         -- se fija al pedir el CAE (ultimo autorizado + 1)
  fecha               date not null,
  total               numeric(14, 2) not null check (total > 0),
  doc_tipo            integer not null default 99,  -- 99 consumidor final, 96 DNI, 80 CUIT
  doc_nro             text not null default '0',
  receptor_nombre     text,
  cae                 text,
  cae_vto             date,
  estado              text not null default 'pendiente'
                        check (estado in ('pendiente', 'autorizada', 'rechazada', 'error')),
  error               text,
  intentos            integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table facturas enable row level security;

-- Un numero de comprobante no se repite.
create unique index if not exists idx_facturas_numero
  on facturas (comercio_id, ambiente, cbte_tipo, punto_venta, numero) where numero is not null;
-- Una sola factura viva por venta (una rechazada se puede volver a pedir).
create unique index if not exists idx_facturas_una_por_venta
  on facturas (venta_id) where cbte_tipo = 11 and estado <> 'rechazada';
-- Una sola nota de credito viva por devolucion, y una por anulacion total.
create unique index if not exists idx_facturas_nc_devolucion
  on facturas (devolucion_id) where cbte_tipo = 13 and devolucion_id is not null and estado <> 'rechazada';
create unique index if not exists idx_facturas_nc_anulacion
  on facturas (factura_asociada_id) where cbte_tipo = 13 and devolucion_id is null and estado <> 'rechazada';
create index if not exists idx_facturas_comercio on facturas (comercio_id, created_at desc);
create index if not exists idx_facturas_venta on facturas (venta_id);

-- ------------------------------------------------------------
-- 4. Lock de numeracion. AFIP exige numeros correlativos: dos facturas del
--    mismo comercio/punto de venta/tipo no pueden pedirse a la vez. El lock
--    vence solo (por si el servidor se corta a mitad de camino).
-- ------------------------------------------------------------
create table if not exists afip_locks (
  clave text primary key,
  hasta timestamptz not null
);
alter table afip_locks enable row level security;

create or replace function tomar_lock_afip(p_clave text, p_segundos integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  insert into afip_locks (clave, hasta)
  values (p_clave, now() + make_interval(secs => p_segundos))
  on conflict (clave) do update
    set hasta = excluded.hasta
    where afip_locks.hasta < now()
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

create or replace function soltar_lock_afip(p_clave text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from afip_locks where clave = p_clave;
$$;

revoke all on function tomar_lock_afip(text, integer) from public, anon, authenticated;
revoke all on function soltar_lock_afip(text) from public, anon, authenticated;
revoke all on table afip_config, afip_tokens, facturas, afip_locks from anon, authenticated;
