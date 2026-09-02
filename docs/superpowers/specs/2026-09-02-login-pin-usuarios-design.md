# Activar login por PIN + pantalla de usuarios

## Contexto

El sistema ya tiene armado un mecanismo completo de login por PIN (`app/login/page.tsx`,
`services/auth-service.ts`, RPC `verificar_pin` en `supabase/20_pin_hash.sql`), un
`AuthGuard` que redirige a `/login` sin sesión y bloquea rutas `adminOnly` para el rol
`cajero`, y un filtro de menú por rol (`lib/nav.ts`). Todo está apagado: `AUTH_DISABLED =
true` en `hooks/use-auth.ts` hace que cualquiera entre como un usuario admin demo
hardcodeado, sin PIN.

Falta:
1. Prender el mecanismo (`AUTH_DISABLED = false`).
2. Una forma de dar de alta usuarios (cajeros/admins) con PIN — hoy solo se puede por SQL
   directo a la tabla `usuarios`.

Objetivo: cada cajero entra con su propio PIN y solo ve "Punto de Venta"; el admin gestiona
usuarios desde una pantalla nueva.

## Alcance

Incluye: pantalla de administración de usuarios, RPCs de alta/edición de PIN, activar
`AUTH_DISABLED`.

No incluye: soporte para múltiples cajas abiertas en simultáneo (queda como proyecto
aparte, ya identificado en una conversación anterior).

## Esquema de base de datos

La tabla `usuarios` ya existe (`supabase/01_schema.sql`):

```sql
create table if not exists usuarios (
  id         text primary key,
  nombre     text not null,
  pin_hash   text,
  rol        text not null default 'cajero' check (rol in ('admin','cajero')),
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);
```

No requiere `ALTER TABLE`. Falta agregar `comercio_id` para consistencia multi-tenant —
**se informa antes de escribir código**, según la regla del proyecto:

```sql
alter table usuarios add column if not exists comercio_id text not null default 'comercio_1';
create index if not exists idx_usuarios_comercio on usuarios (comercio_id);
```

Razón: todas las demás tablas (`productos`, `ventas`, `caja`) ya están scopeadas por
`comercio_id`; `usuarios` quedó afuera en su momento. Sin esto, la pantalla nueva listaría
usuarios de todos los comercios (hoy solo hay uno, así que no rompe nada funcionalmente,
pero cierra el hueco antes de que importe).

### Nuevas funciones RPC (mismo patrón que `verificar_pin`)

```sql
-- Alta de usuario con PIN ya hasheado dentro de Postgres.
create or replace function crear_usuario_pin(
  p_comercio_id text,
  p_nombre      text,
  p_pin         text,
  p_rol         text
) returns table (id text, nombre text, rol text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id text := 'usuario_' || substr(md5(random()::text), 1, 12);
begin
  if p_rol not in ('admin', 'cajero') then
    raise exception 'Rol invalido';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'El PIN debe tener 4 digitos';
  end if;

  insert into usuarios (id, comercio_id, nombre, pin_hash, rol, activo)
  values (v_id, p_comercio_id, p_nombre, crypt(p_pin, gen_salt('bf')), p_rol, true);

  return query select v_id, p_nombre, p_rol;
end;
$$;

-- Editar nombre/rol/activo, y opcionalmente resetear el PIN.
create or replace function actualizar_usuario(
  p_id       text,
  p_nombre   text,
  p_rol      text,
  p_activo   boolean,
  p_pin      text default null  -- null = no cambiar el PIN
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_rol not in ('admin', 'cajero') then
    raise exception 'Rol invalido';
  end if;
  if p_pin is not null and p_pin !~ '^[0-9]{4}$' then
    raise exception 'El PIN debe tener 4 digitos';
  end if;

  update usuarios
    set nombre = p_nombre,
        rol = p_rol,
        activo = p_activo,
        pin_hash = case when p_pin is not null then crypt(p_pin, gen_salt('bf')) else pin_hash end
    where id = p_id;
end;
$$;
```

`verificar_pin` no cambia — sigue devolviendo `comercio_id`, que ahora será un valor real
en vez de siempre `'comercio_1'` por default.

No hay `DELETE`: los usuarios se desactivan (`activo = false`), nunca se borran, porque
`ventas.user_id`, `caja.abierta_por` y `caja_movimientos.usuario_id` los referencian para
el historial.

## Backend (Next.js API routes)

Nuevo archivo `app/api/usuarios/route.ts`, mismo patrón que `app/api/productos/route.ts`
(usa `supabaseAdmin`, valida en el servidor, nunca expone el PIN):

- `GET` — lista usuarios del comercio (nombre, rol, activo; nunca el hash).
- `POST` — llama a `crear_usuario_pin`. Valida nombre no vacío y PIN de 4 dígitos antes de
  llamar a la RPC (la RPC también valida, defensa en profundidad).
- `PATCH` — llama a `actualizar_usuario`. El PIN es opcional (solo se manda si el admin
  decide resetearlo).

## Frontend

### `services/usuarios-service.ts` (nuevo)

Funciones `getUsuarios()`, `crearUsuario(input)`, `actualizarUsuario(id, input)`, siguiendo
el mismo estilo que `products-service.ts` (fetch a las rutas de arriba, mapeo de filas).

### `app/usuarios/page.tsx` (nuevo)

- Listado en tabla (`Table` de shadcn, mismo look que `/stock`): nombre, rol (badge),
  estado, botón editar.
- Botón "Nuevo usuario" abre un diálogo con: nombre, rol (select admin/cajero), PIN (input
  numérico de 4 dígitos, con confirmación repetida para evitar error de tipeo).
- Diálogo de edición: mismo formulario, PIN opcional ("dejar en blanco para no cambiarlo"),
  switch de activo/inactivo.
- Reutiliza componentes `Dialog`, `Input`, `Switch`, `Badge` ya existentes en el proyecto.

### `lib/nav.ts`

Agregar:
```ts
{ label: "Usuarios", href: "/usuarios", icon: UserCog, adminOnly: true },
```

### `hooks/use-auth.ts`

Cambiar `AUTH_DISABLED = true` a `AUTH_DISABLED = false`. Sin más cambios: el resto del
mecanismo (`AuthGuard`, `visibleNavItems`, `login()`) ya está implementado y no se toca.

## Migración del usuario admin actual

Problema de huevo-y-gallina: para crear usuarios desde la pantalla nueva hace falta estar
logueado como admin, pero al activar `AUTH_DISABLED` no hay ningún usuario real en la
base todavía.

Solución: se informa el SQL exacto para que el usuario lo corra una vez, antes de activar
`AUTH_DISABLED`, creando el primer admin real:

```sql
select crear_usuario_pin('comercio_1', 'Administrador', '<PIN A ELEGIR>', 'admin');
```

(Se define el PIN real junto con el usuario antes de aplicar el cambio, no se hardcodea
en el spec.)

## Fuera de alcance / riesgos conocidos

- Múltiples cajas simultáneas: no se toca en este cambio. Con el login activo, dos cajeros
  logueados con PINs distintos van a seguir compartiendo la misma caja abierta del
  comercio (comportamiento actual, documentado en la conversación previa).
- No hay recuperación de PIN olvidado vía UI — el admin resetea el PIN de un cajero desde
  la pantalla de edición.
- No se agrega rate-limiting al intento de PIN (4 dígitos = 10000 combinaciones). Fuera de
  alcance de este cambio; se podría abordar más adelante si se ve necesario.

## Testing

- `npm test` no cubre este flujo (no hay lógica pura de negocio nueva; es CRUD + auth).
- Verificación manual: crear un usuario cajero, loguearse con su PIN, confirmar que solo
  ve "Punto de Venta" en el menú y que `/stock`, `/caja`, etc. redirigen a `/pos`.
- Verificar que un PIN de 3 dígitos o con letras es rechazado tanto en el frontend como en
  la RPC.
