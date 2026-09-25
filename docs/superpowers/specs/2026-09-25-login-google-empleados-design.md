# Login: admin por Google, cajero/encargado por PIN + pestaña "Empleados"

- **Fecha**: 2026-09-25
- **Reemplaza**: el login 100% por PIN (`supabase/20_pin_hash.sql`, `supabase/25_usuarios_crud.sql`)
- **Estado**: diseño — requiere SQL (sección 3) + configuración externa (sección 2) ANTES de escribir código.

---

## 1. Decisiones (confirmadas con el usuario)

| Decisión | Motivo |
|---|---|
| **Admin entra con su cuenta de Google real** (OAuth) | Pedido explícito. Cada admin/dueño usa su propio Google, sin PIN. |
| **Cajero y encargado entran por PIN**, definido por el admin | El mostrador necesita un login rápido de 4 dígitos; nadie va a loguearse con Google en cada cambio de turno. El PIN lo define el admin al dar de alta al empleado (como ya funciona hoy). |
| Cada cajero **cierra sesión de Google** al terminar su turno (para el caso de que también use Google en algún rol) | No aplica en la práctica hoy (cajero no usa Google), pero es la política si en el futuro un encargado también entra por Google. |
| Pestaña **"Empleados"** (reemplaza a "Usuarios"): número, correo, nombre, rol | El número es **solo dato de contacto**, nunca sirve para loguearse. El correo es obligatorio únicamente para rol `admin` (es lo que valida el login de Google); opcional para cajero/encargado. |
| **Se usa Supabase Auth** (proveedor Google), no una librería nueva | `@supabase/supabase-js` ya está instalado; Supabase Auth trae OAuth con Google de fábrica. Cero dependencias nuevas. |
| La sesión de la app sigue siendo **la cookie firmada propia** (`lib/server/sesion.ts`, Fase 2) | Las ~20 rutas API que ya resuelven `comercioIdDeSesion(req)` no cambian. Google solo autentica; el puente server-side transforma ese login en la misma cookie de siempre. |

## 2. Configuración externa (la hace el usuario, no el código)

### 2.1 Google Cloud Console
1. Entrar a [console.cloud.google.com](https://console.cloud.google.com) → crear o elegir un proyecto.
2. **APIs y servicios → Pantalla de consentimiento OAuth** → tipo "Externo" (o "Interno" si es Google Workspace propio) → completar nombre de la app, email de soporte.
3. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth** → tipo "Aplicación web".
4. **URI de redirección autorizados**: agregar
   `https://uyxreqdvapblycnkvmyk.supabase.co/auth/v1/callback`
   (es la URL de callback fija de Supabase Auth para este proyecto — no la de Vercel).
5. Copiar el **Client ID** y **Client Secret** que genera.

### 2.2 Supabase Dashboard
1. **Authentication → Providers → Google** → activar.
2. Pegar el Client ID y Client Secret del paso anterior → Guardar.
3. **Authentication → URL Configuration** → agregar en "Redirect URLs":
   `https://<tu-dominio-de-vercel>/auth/callback`
   (y `http://localhost:3000/auth/callback` para probar en local).

### 2.3 Confirmar la anon key
El login con Google corre en el navegador y necesita `NEXT_PUBLIC_SUPABASE_ANON_KEY` **completa y correcta** (hoy no se usa en ningún lado del código; con esto pasa a ser imprescindible). Antes de implementar, confirmar el valor completo desde Supabase → Project Settings → API → Project API keys → `anon` `public`, y actualizar `.env.local` + Vercel si hace falta.

## 3. Cambios de esquema (SQL exacto — ejecutar ANTES de codear)

Archivo nuevo: `supabase/32_login_google_empleados.sql`. No destructivo.

```sql
-- 32_login_google_empleados.sql
-- Admin por Google (Supabase Auth), cajero/encargado por PIN definido por el
-- admin. Pestaña "Empleados": numero (contacto), correo (login de admin),
-- nombre, rol.
-- Spec: docs/superpowers/specs/2026-09-25-login-google-empleados-design.md

-- ------------------------------------------------------------
-- 1. BUG existente: el check de rol nunca incluyo 'encargado' (solo lo
--    validaban las funciones, no la tabla). En una base nueva esto rechaza
--    la creacion de encargados. Se corrige aca.
-- ------------------------------------------------------------
alter table usuarios drop constraint if exists usuarios_rol_check;
alter table usuarios add constraint usuarios_rol_check
  check (rol in ('admin','encargado','cajero'));

-- ------------------------------------------------------------
-- 2. Columnas nuevas: correo (login de admin via Google) y telefono (contacto)
-- ------------------------------------------------------------
alter table usuarios add column if not exists email    text;
alter table usuarios add column if not exists telefono text;

-- Un mismo correo no puede repetirse dos veces en el mismo comercio.
-- (case-insensitive: minusculas antes de comparar)
create unique index if not exists idx_usuarios_email
  on usuarios (comercio_id, lower(email))
  where email is not null;

-- pin_hash pasa a ser opcional a nivel de negocio (admin no lo necesita),
-- pero la columna ya era nullable desde 20_pin_hash.sql -- sin cambio de tipo.

-- ------------------------------------------------------------
-- 3. crear_empleado_kiosko / actualizar_empleado_kiosko
--    Reemplazan a crear_usuario_pin / actualizar_usuario (25_usuarios_crud.sql):
--    - rol 'admin'            -> exige email, el pin es opcional (no se usa para entrar)
--    - rol 'cajero'/'encargado' -> exige pin de 4 digitos, el email es opcional
-- ------------------------------------------------------------
create or replace function crear_empleado_kiosko(
  p_comercio_id text,
  p_nombre      text,
  p_rol         text,
  p_email       text default null,
  p_telefono    text default null,
  p_pin         text default null
) returns table (id text, nombre text, rol text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id text := 'usuario_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
begin
  if p_rol not in ('admin', 'encargado', 'cajero') then
    raise exception 'Rol invalido';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre es obligatorio';
  end if;

  if p_rol = 'admin' then
    if coalesce(trim(p_email), '') = '' then
      raise exception 'El administrador necesita un correo de Google';
    end if;
  else
    if p_pin !~ '^[0-9]{4}$' then
      raise exception 'El PIN debe tener 4 digitos';
    end if;
  end if;

  insert into usuarios (id, comercio_id, nombre, email, telefono, pin_hash, rol, activo)
  values (
    v_id, p_comercio_id, trim(p_nombre),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_telefono, '')), ''),
    case when p_pin is not null then crypt(p_pin, gen_salt('bf')) else null end,
    p_rol, true
  );

  return query select v_id, trim(p_nombre), p_rol;
end;
$$;

create or replace function actualizar_empleado_kiosko(
  p_id       text,
  p_nombre   text,
  p_rol      text,
  p_activo   boolean,
  p_email    text default null,   -- null = no cambiar
  p_telefono text default null,   -- null = no cambiar
  p_pin      text default null    -- null = no cambiar
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email_final text;
begin
  if p_rol not in ('admin', 'encargado', 'cajero') then
    raise exception 'Rol invalido';
  end if;
  if p_pin is not null and p_pin !~ '^[0-9]{4}$' then
    raise exception 'El PIN debe tener 4 digitos';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre es obligatorio';
  end if;
  if not exists (select 1 from usuarios where id = p_id) then
    raise exception 'Usuario % no encontrado', p_id;
  end if;

  select coalesce(nullif(trim(p_email), ''), email) into v_email_final
    from usuarios where id = p_id;

  if p_rol = 'admin' and coalesce(v_email_final, '') = '' then
    raise exception 'El administrador necesita un correo de Google';
  end if;

  update usuarios
    set nombre   = trim(p_nombre),
        rol      = p_rol,
        activo   = p_activo,
        email    = case when p_email is not null then nullif(trim(p_email), '') else email end,
        telefono = case when p_telefono is not null then nullif(trim(p_telefono), '') else telefono end,
        pin_hash = case when p_pin is not null then crypt(p_pin, gen_salt('bf')) else pin_hash end
    where id = p_id;
end;
$$;

-- ------------------------------------------------------------
-- Nota: crear_usuario_pin / actualizar_usuario (25_usuarios_crud.sql) quedan
-- sin uso una vez migrado el codigo, pero no se borran aca (no rompe nada
-- dejarlas). Se pueden eliminar mas adelante con un DROP FUNCTION aparte.
-- ------------------------------------------------------------
```

**No se toca** `verificar_pin` (`20_pin_hash.sql`): cajero/encargado lo siguen usando tal cual. El login de admin NO pasa por esa función — se valida por email contra `usuarios` (ver sección 4.2).

## 4. Cambios de aplicación

### 4.1 Cliente Supabase de navegador (nuevo)

`lib/supabase-browser.ts` — único uso: iniciar el OAuth y leer el token de vuelta. Usa `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (por eso la sección 2.3 es un prerrequisito).

### 4.2 Flujo de login de Google

1. `/login`: botón **"Entrar con Google"** (visible siempre) además del teclado de PIN (para cajero/encargado). Al tocarlo: `supabaseBrowser.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${origin}/auth/callback` } })`.
2. `app/auth/callback/route.ts` (nueva, server): Supabase Auth vuelve acá con el código de OAuth. Se intercambia por sesión (`exchangeCodeForSession`), se lee el **email verificado por Google** desde el usuario de Supabase Auth (nunca desde algo que mande el cliente).
3. Se busca en `usuarios` (`supabaseAdmin`, ya sin RLS): `email = <ese email>` (case-insensitive) y `rol = 'admin'` y `activo = true`.
   - **Encontrado** → se emite la cookie firmada de siempre (`crearCookieSesion`, igual que hace hoy `/api/auth/login`) y redirige a `/`.
   - **No encontrado** → redirige a `/login?error=no_autorizado` con mensaje "Esa cuenta de Google no está dada de alta como administrador. Pedile al admin que te agregue en Empleados." No se crea sesión.
4. El PIN de cajero/encargado sigue exactamente como hoy (`/api/auth/login`, `verificar_pin`), sin cambios.

### 4.3 Pestaña "Empleados" (reemplaza "Usuarios")

- `lib/nav.ts`: renombrar label "Usuarios" → "Empleados" (mismo href `/usuarios`, o renombrar la ruta a `/empleados` — cambio cosmético, a decidir; por defecto mantengo el href para no romper bookmarks).
- `components/usuarios/usuario-dialog.tsx`: agregar campos **Correo** y **Número (teléfono)**. El campo **Correo** se vuelve obligatorio y el de **PIN** se oculta/deshabilita cuando el rol elegido es `admin`; al revés (PIN obligatorio, correo opcional) para cajero/encargado.
- `services/usuarios-service.ts` + `app/api/usuarios/route.ts`: pasan a llamar `crear_empleado_kiosko` / `actualizar_empleado_kiosko` con los campos nuevos.
- `lib/types.ts` (`Usuario`): agregar `email?: string`, `telefono?: string`.

### 4.4 Primer admin

Con la base nueva, en vez de `insert ... values ('usuario_admin_1', ..., '1234', 'admin', ...)` (PIN en claro, ya no aplica a admin), el primer admin se crea con `crear_empleado_kiosko(p_comercio_id, p_nombre, 'admin', p_email := 'tu-correo@gmail.com')`. Se informa en el mensaje de cierre del SQL de la sección 3 — el usuario lo corre a mano una vez tenga el correo decidido.

## 5. Casos borde

| Caso | Comportamiento |
|---|---|
| Un Google account intenta entrar sin estar en `usuarios` como admin | Rechazado, mensaje claro, sin sesión. |
| Admin desactivado (`activo=false`) intenta entrar por Google | Rechazado igual que hoy rechaza un PIN de usuario inactivo. |
| Dos admins con el mismo comercio, cada uno con su Google | Funciona: cada uno tiene su fila en `usuarios` con su propio email. |
| Cajero/encargado sin `email` cargado | Sin problema, el campo es opcional para esos roles. |
| Alguien cambia el email de un admin en "Empleados" | La próxima vez que ese Google intente entrar con el email viejo, ya no matchea — hay que avisar esto en la UI (mensaje de confirmación al editar el correo de un admin). |

## 6. Fuera de alcance (a propósito)

- Login de cajero/encargado por Google (piden explícitamente que sea por PIN).
- Recuperación de contraseña / 2FA — Google ya lo resuelve para el admin.
- Múltiples admins por Google Workspace con dominio restringido (`hd` param) — se puede agregar después si hace falta.

## 7. Orden de implementación

1. **Usuario hace**: configuración de Google Cloud + Supabase Auth (sección 2) y confirma la anon key completa.
2. **Usuario ejecuta** `supabase/32_login_google_empleados.sql` (prod y base de prueba).
3. `lib/supabase-browser.ts` + `app/auth/callback/route.ts`.
4. `/login`: botón de Google + mensaje de error `?error=no_autorizado`.
5. `lib/types.ts`, `services/usuarios-service.ts`, `app/api/usuarios/route.ts`, `usuario-dialog.tsx`, `app/usuarios/page.tsx` (renombrar a Empleados).
6. Primer admin real por Google (a mano, según sección 4.4).
7. Build + commit único.
