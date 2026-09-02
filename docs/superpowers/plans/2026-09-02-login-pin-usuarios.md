# Login por PIN + Pantalla de Usuarios — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activar el login por PIN ya construido y agregar una pantalla de administración
de usuarios para que el admin pueda crear/editar cajeros sin tocar SQL.

**Architecture:** Dos funciones nuevas en Postgres (`crear_usuario_pin`,
`actualizar_usuario`) hashean el PIN dentro de la base, igual que ya hace `verificar_pin`.
Una ruta de lectura sigue el patrón "consultas" (`POST` con `accion`) y una ruta de
escritura (`/api/usuarios`) sigue el patrón de `/api/productos` (service role,
`supabaseAdmin`). Una pantalla nueva (`/usuarios`, admin-only) reutiliza los mismos
componentes de UI (`Dialog`, `Table`, `Badge`, `Switch`) que ya usa `/stock`. Al final se
crea el primer admin real por SQL y se prende `AUTH_DISABLED = false`.

**Tech Stack:** Next.js App Router, Supabase (Postgres + pgcrypto), TypeScript, shadcn/ui.

---

## Nota de corrección sobre el spec

El spec (`docs/superpowers/specs/2026-09-02-login-pin-usuarios-design.md`) decía que había
que agregar `comercio_id` a la tabla `usuarios`. Se verificó el código y **esa columna ya
existe** (la agregó `supabase/06_multitenant.sql:132`, con `not null`, FK a `comercios` e
índice). No hace falta ningún `ALTER TABLE`. Este plan no incluye esa migración.

---

### Task 1: Migración SQL — funciones de alta y edición de usuario

**Files:**
- Create: `supabase/25_usuarios_crud.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- 25_usuarios_crud.sql
-- Funciones para dar de alta y editar usuarios (cajeros/admin) desde la
-- aplicacion, sin que el PIN en texto plano salga nunca de Postgres.
-- Mismo criterio que verificar_pin (20_pin_hash.sql): pgcrypto adentro de la
-- base, hash bcrypt, nunca se expone pin_hash.

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
  v_id text := 'usuario_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
begin
  if p_rol not in ('admin', 'cajero') then
    raise exception 'Rol invalido';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'El PIN debe tener 4 digitos';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre es obligatorio';
  end if;

  insert into usuarios (id, comercio_id, nombre, pin_hash, rol, activo)
  values (v_id, p_comercio_id, trim(p_nombre), crypt(p_pin, gen_salt('bf')), p_rol, true);

  return query select v_id, trim(p_nombre), p_rol;
end;
$$;

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
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre es obligatorio';
  end if;
  if not exists (select 1 from usuarios where id = p_id) then
    raise exception 'Usuario % no encontrado', p_id;
  end if;

  update usuarios
    set nombre = trim(p_nombre),
        rol = p_rol,
        activo = p_activo,
        pin_hash = case when p_pin is not null then crypt(p_pin, gen_salt('bf')) else pin_hash end
    where id = p_id;
end;
$$;
```

- [ ] **Step 2: Avisar al usuario para que la corra en Supabase**

Este paso requiere acceso a la consola de Supabase del proyecto (SQL Editor). El agente
no tiene una conexión directa a esa base — **hay que pedirle al usuario que pegue y
corra el contenido de `supabase/25_usuarios_crud.sql` antes de seguir con el Task 4**
(la ruta API que llama a `crear_usuario_pin` fallaría si la función no existe todavía).

- [ ] **Step 3: Commit**

```bash
git add supabase/25_usuarios_crud.sql
git commit -m "feat: agregar RPC de alta y edicion de usuarios con PIN"
```

---

### Task 2: Navegación — agregar "Usuarios" al menú admin

**Files:**
- Modify: `lib/nav.ts`

- [ ] **Step 1: Agregar el ítem de navegación**

En `lib/nav.ts`, cambiar el import de íconos y agregar la entrada:

```ts
// lib/nav.ts — items de navegacion del kiosko
import type { LucideIcon } from "lucide-react";
import { Home, ShoppingCart, Wallet, Users, Package, BarChart3, RefreshCw, Receipt, UserCog } from "lucide-react";
import type { UserRol } from "@/lib/types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Inicio", href: "/", icon: Home, adminOnly: true },
  { label: "Punto de Venta", href: "/pos", icon: ShoppingCart },
  { label: "Caja", href: "/caja", icon: Wallet, adminOnly: true },
  { label: "Ventas", href: "/ventas", icon: Receipt, adminOnly: true },
  { label: "Clientes", href: "/clientes", icon: Users, adminOnly: true },
  { label: "Stock", href: "/stock", icon: Package, adminOnly: true },
  { label: "Usuarios", href: "/usuarios", icon: UserCog, adminOnly: true },
  { label: "Reportes", href: "/reportes", icon: BarChart3, adminOnly: true },
  { label: "Sincronizacion", href: "/sincronizacion", icon: RefreshCw, adminOnly: true },
];

/** El rol "cajero" (vendedor) solo tiene acceso a Punto de Venta. */
export function visibleNavItems(rol: UserRol | null): NavItem[] {
  // Sin sesion (rol null) se muestran todos los items.
  if (!rol || rol === "admin") return NAV_ITEMS;
  return NAV_ITEMS.filter((i) => !i.adminOnly);
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/nav.ts
git commit -m "feat: agregar Usuarios al menu de administracion"
```

---

### Task 3: Ruta de lectura — listar usuarios

**Files:**
- Create: `app/api/consultas/usuarios/route.ts`

- [ ] **Step 1: Escribir la ruta**

```ts
// app/api/consultas/usuarios/route.ts — lectura de usuarios.
// Conjunto cerrado de acciones: el cliente no elige tablas ni filtros.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const comercioId = String(body?.comercioId ?? "comercio_1");
  const accion = String(body?.accion ?? "");

  switch (accion) {
    case "listar": {
      const { data, error } = await supabaseAdmin
        .from("usuarios")
        .select("id, comercio_id, nombre, rol, activo, created_at")
        .eq("comercio_id", comercioId)
        .order("created_at", { ascending: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ usuarios: data ?? [] });
    }
    default:
      return NextResponse.json({ error: "Accion desconocida" }, { status: 400 });
  }
}
```

Nota: el `select` nunca pide `pin_hash`, así que ese campo no sale de la base hacia el
navegador aunque alguien lea el JSON de la respuesta.

- [ ] **Step 2: Verificar que compila**

Run: `npm run build`
Expected: build sin errores (los warnings de `themeColor` preexistentes no cuentan).

- [ ] **Step 3: Commit**

```bash
git add app/api/consultas/usuarios/route.ts
git commit -m "feat: agregar consulta para listar usuarios"
```

---

### Task 4: Ruta de escritura — crear y editar usuarios

**Files:**
- Create: `app/api/usuarios/route.ts`

- [ ] **Step 1: Escribir la ruta**

```ts
// app/api/usuarios/route.ts — alta y edicion de usuarios (server-only, service role).
// El PIN se hashea DENTRO de Postgres (crear_usuario_pin / actualizar_usuario, ver
// supabase/25_usuarios_crud.sql): nunca se guarda ni se loguea en texto plano en Node.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PIN_REGEX = /^[0-9]{4}$/;
const ROLES = ["admin", "cajero"];

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const comercioId = String(body?.comercioId ?? "comercio_1");
  const input = body?.input;
  if (!input || typeof input !== "object") {
    return NextResponse.json({ error: "Faltan los datos del usuario" }, { status: 400 });
  }

  const nombre = String(input.nombre ?? "").trim();
  const pin = String(input.pin ?? "");
  const rol = String(input.rol ?? "");

  if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  if (!PIN_REGEX.test(pin)) {
    return NextResponse.json({ error: "El PIN debe tener 4 digitos" }, { status: 400 });
  }
  if (!ROLES.includes(rol)) return NextResponse.json({ error: "Rol invalido" }, { status: 400 });

  const { data, error } = await supabaseAdmin.rpc("crear_usuario_pin", {
    p_comercio_id: comercioId,
    p_nombre: nombre,
    p_pin: pin,
    p_rol: rol,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const usuario = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ ok: true, id: usuario?.id });
}

export async function PATCH(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const usuarioId = String(body?.usuarioId ?? "");
  const input = body?.input;
  if (!usuarioId) return NextResponse.json({ error: "Falta el usuario" }, { status: 400 });
  if (!input || typeof input !== "object") {
    return NextResponse.json({ error: "Faltan los datos del usuario" }, { status: 400 });
  }

  const nombre = String(input.nombre ?? "").trim();
  const rol = String(input.rol ?? "");
  const activo = !!input.activo;
  const pin = input.pin ? String(input.pin) : null;

  if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  if (!ROLES.includes(rol)) return NextResponse.json({ error: "Rol invalido" }, { status: 400 });
  if (pin !== null && !PIN_REGEX.test(pin)) {
    return NextResponse.json({ error: "El PIN debe tener 4 digitos" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.rpc("actualizar_usuario", {
    p_id: usuarioId,
    p_nombre: nombre,
    p_rol: rol,
    p_activo: activo,
    p_pin: pin,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run build`
Expected: build sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/api/usuarios/route.ts
git commit -m "feat: agregar rutas de alta y edicion de usuarios"
```

---

### Task 5: Servicio de cliente

**Files:**
- Create: `services/usuarios-service.ts`

- [ ] **Step 1: Escribir el servicio**

```ts
// services/usuarios-service.ts — administracion de usuarios (client, service role via API)
import { consultar } from "@/services/api-client";
import { getComercioId } from "@/hooks/use-auth";
import type { Usuario, UserRol } from "@/lib/types";

function mapUsuario(d: Record<string, any>): Usuario {
  return {
    id: d.id,
    nombre: d.nombre,
    rol: d.rol,
    comercioId: d.comercio_id,
    activo: d.activo,
    createdAt: new Date(d.created_at),
  };
}

export async function getUsuarios(): Promise<Usuario[]> {
  const { usuarios } = await consultar<{ usuarios: Record<string, any>[] }>(
    "/api/consultas/usuarios", "listar",
  );
  return usuarios.map(mapUsuario);
}

export interface CrearUsuarioInput {
  nombre: string;
  pin: string;
  rol: UserRol;
}

export async function crearUsuario(input: CrearUsuarioInput): Promise<void> {
  const res = await fetch("/api/usuarios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, comercioId: getComercioId() }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "No se pudo crear el usuario");
  }
}

export interface ActualizarUsuarioInput {
  nombre: string;
  rol: UserRol;
  activo: boolean;
  pin?: string;
}

export async function actualizarUsuario(id: string, input: ActualizarUsuarioInput): Promise<void> {
  const res = await fetch("/api/usuarios", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuarioId: id, input, comercioId: getComercioId() }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? "No se pudo actualizar el usuario");
  }
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run build`
Expected: build sin errores.

- [ ] **Step 3: Commit**

```bash
git add services/usuarios-service.ts
git commit -m "feat: agregar servicio de usuarios"
```

---

### Task 6: Diálogo de alta/edición de usuario

**Files:**
- Create: `components/usuarios/usuario-dialog.tsx`

- [ ] **Step 1: Escribir el componente**

```tsx
"use client";

import { useEffect, useState } from "react";
import { UserCog } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Usuario, UserRol } from "@/lib/types";

export interface UsuarioDialogInput {
  nombre: string;
  rol: UserRol;
  activo: boolean;
  /** undefined = no cambiar el PIN (solo aplica en edicion) */
  pin?: string;
}

interface UsuarioDialogProps {
  usuario: Usuario | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: UsuarioDialogInput) => Promise<void>;
}

const PIN_REGEX = /^[0-9]{4}$/;

export function UsuarioDialog({ usuario, open, onOpenChange, onSave }: UsuarioDialogProps) {
  const esEdicion = !!usuario;
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState<UserRol>("cajero");
  const [activo, setActivo] = useState(true);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNombre(usuario?.nombre ?? "");
    setRol(usuario?.rol ?? "cajero");
    setActivo(usuario?.activo ?? true);
    setPin("");
    setPinConfirm("");
  }, [open, usuario]);

  const nombreInvalido = !nombre.trim();
  const pinTocado = pin.length > 0 || pinConfirm.length > 0;
  const pinInvalido = esEdicion
    ? pinTocado && (!PIN_REGEX.test(pin) || pin !== pinConfirm)
    : !PIN_REGEX.test(pin) || pin !== pinConfirm;
  const puedeGuardar = !nombreInvalido && !pinInvalido;

  const handleGuardar = async () => {
    if (!puedeGuardar) return;
    setSaving(true);
    try {
      await onSave({
        nombre: nombre.trim(),
        rol,
        activo,
        pin: pinTocado || !esEdicion ? pin : undefined,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-4 w-4 text-primary" /> {esEdicion ? "Editar usuario" : "Nuevo usuario"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-1 block text-xs">Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="rounded-xl" autoFocus />
            {nombreInvalido && <p className="mt-1 text-xs text-destructive">El nombre es obligatorio</p>}
          </div>

          <div>
            <Label className="mb-1 block text-xs">Rol</Label>
            <select
              value={rol}
              onChange={(e) => setRol(e.target.value as UserRol)}
              className="border-input h-9 w-full rounded-xl border bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            >
              <option value="cajero">Cajero (solo Punto de Venta)</option>
              <option value="admin">Administrador (acceso total)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="mb-1 block text-xs">
                {esEdicion ? "Nuevo PIN (opcional)" : "PIN (4 dígitos)"}
              </Label>
              <Input
                value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric" maxLength={4} className="rounded-xl"
                placeholder={esEdicion ? "Dejar en blanco" : "0000"}
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Confirmar PIN</Label>
              <Input
                value={pinConfirm} onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric" maxLength={4} className="rounded-xl"
              />
            </div>
          </div>
          {pinInvalido && pinTocado && (
            <p className="text-xs text-destructive">El PIN debe tener 4 dígitos y coincidir en ambos campos</p>
          )}

          {esEdicion && (
            <label className="flex items-center justify-between rounded-xl border px-3 py-2.5">
              <span className="text-sm font-medium">Activo</span>
              <Switch checked={activo} onCheckedChange={setActivo} />
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="rounded-xl" disabled={saving || !puedeGuardar} onClick={handleGuardar}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run build`
Expected: build sin errores (el componente no se usa todavía en ninguna página, así que
esto solo verifica que TypeScript no encuentre errores de tipos).

- [ ] **Step 3: Commit**

```bash
git add components/usuarios/usuario-dialog.tsx
git commit -m "feat: agregar dialogo de alta y edicion de usuario"
```

---

### Task 7: Página de usuarios

**Files:**
- Create: `app/usuarios/page.tsx`

- [ ] **Step 1: Escribir la página**

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { UserCog, UserPlus } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  getUsuarios, crearUsuario, actualizarUsuario,
} from "@/services/usuarios-service";
import { UsuarioDialog, type UsuarioDialogInput } from "@/components/usuarios/usuario-dialog";
import type { Usuario } from "@/lib/types";

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Usuario | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsuarios(await getUsuarios());
    } catch {
      toast.error("No se pudo cargar la lista de usuarios");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNuevo = () => {
    setSelected(null);
    setDialogOpen(true);
  };

  const openEditar = (u: Usuario) => {
    setSelected(u);
    setDialogOpen(true);
  };

  const handleSave = async (input: UsuarioDialogInput) => {
    try {
      if (selected) {
        await actualizarUsuario(selected.id, {
          nombre: input.nombre, rol: input.rol, activo: input.activo, pin: input.pin,
        });
        toast.success("Usuario actualizado");
      } else {
        await crearUsuario({ nombre: input.nombre, rol: input.rol, pin: input.pin ?? "" });
        toast.success("Usuario creado");
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar el usuario");
      throw e;
    }
  };

  return (
    <AppShell title="Usuarios">
      <div className="mb-4 flex items-center justify-end">
        <Button className="rounded-2xl" onClick={openNuevo}>
          <UserPlus className="mr-2 h-4 w-4" /> Nuevo usuario
        </Button>
      </div>

      <div className="rounded-2xl border bg-card">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : usuarios.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Sin usuarios</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.nombre}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn(u.rol === "admin" && "border-primary text-primary")}>
                      {u.rol === "admin" ? "Administrador" : "Cajero"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn(!u.activo && "border-destructive text-destructive")}>
                      {u.activo ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" className="rounded-xl" onClick={() => openEditar(u)}>
                      <UserCog className="mr-1 h-3.5 w-3.5" /> Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <UsuarioDialog usuario={selected} open={dialogOpen} onOpenChange={setDialogOpen} onSave={handleSave} />
    </AppShell>
  );
}
```

Nota: `handleSave` relanza el error (`throw e`) después de mostrar el toast. Esto es
necesario porque `UsuarioDialog.handleGuardar` (Task 6) hace `await onSave(...)` y solo
llama `onOpenChange(false)` si esa promesa resuelve — si el guardado falla, el diálogo debe
quedar abierto para que el usuario pueda corregir el dato y reintentar.

- [ ] **Step 2: Verificar que compila**

Run: `npm run build`
Expected: build sin errores. La ruta `/usuarios` debe aparecer listada en el output como
página estática (`○`).

- [ ] **Step 3: Commit**

```bash
git add app/usuarios/page.tsx
git commit -m "feat: agregar pantalla de administracion de usuarios"
```

---

### Task 8: Crear el primer admin real y activar el login

**Files:**
- Modify: `hooks/use-auth.ts:13`

- [ ] **Step 1: Pedirle al usuario el PIN que quiere para su propio acceso**

Preguntar directamente: "¿Qué PIN de 4 dígitos querés usar para tu usuario admin?"

- [ ] **Step 2: Darle el SQL exacto para crear ese usuario**

Con el PIN que responda (ejemplo: `1234`), darle esto para correr en el SQL Editor de
Supabase — **tiene que ejecutarse después del Task 1 (la función `crear_usuario_pin` ya
tiene que existir) y antes del Step 3 de este task**:

```sql
select crear_usuario_pin('comercio_1', 'Administrador', '1234', 'admin');
```

Confirmar con el usuario que lo corrió y que no dio error antes de seguir.

- [ ] **Step 3: Activar el login**

En `hooks/use-auth.ts`, cambiar:

```ts
export const AUTH_DISABLED = true;
```

por:

```ts
export const AUTH_DISABLED = false;
```

- [ ] **Step 4: Verificar que compila**

Run: `npm run build`
Expected: build sin errores.

- [ ] **Step 5: Commit**

```bash
git add hooks/use-auth.ts
git commit -m "feat: activar login por PIN"
```

---

### Task 9: Verificación manual end-to-end

No hay tests automáticos para este flujo — es CRUD + autenticación, y el proyecto
(`CLAUDE.md`) solo cubre con `npm test` la lógica pura de precios/arqueo/crédito. Se
verifica a mano, siguiendo estos pasos con `npm run dev` levantado:

- [ ] **Paso 1:** Abrir `/login`, ingresar el PIN de admin creado en el Task 8. Debe
  redirigir a `/` y el menú lateral debe mostrar todos los ítems, incluyendo "Usuarios".

- [ ] **Paso 2:** Ir a `/usuarios`, click en "Nuevo usuario". Crear un cajero: nombre
  "Cajero 1", rol "Cajero", PIN `5678` (confirmado en ambos campos). Verificar que
  aparece en la tabla con badge "Cajero" y "Activo".

- [ ] **Paso 3:** Cerrar sesión (o abrir una ventana de incógnito) y loguearse con PIN
  `5678`. Debe redirigir a `/pos`. El menú lateral debe mostrar **solo** "Punto de Venta".

- [ ] **Paso 4:** Con la sesión de cajero, intentar navegar directamente a `/stock` o
  `/usuarios` escribiendo la URL. `AuthGuard` debe redirigir de vuelta a `/pos`.

- [ ] **Paso 5:** Volver a loguearse como admin, ir a `/usuarios`, click "Editar" sobre
  "Cajero 1", tildar "Activo" en off, guardar. Loguearse con PIN `5678` de nuevo: debe
  fallar con "PIN incorrecto" (porque `verificar_pin` filtra `activo = true`).

- [ ] **Paso 6:** Confirmar que un PIN de 3 dígitos o con letras es rechazado tanto en el
  diálogo (botón "Guardar" deshabilitado) como si se fuerza vía `curl` a la API
  (`POST /api/usuarios` con `pin: "12a"` debe devolver 400).

---

## Resumen de archivos

- Nuevo: `supabase/25_usuarios_crud.sql`
- Nuevo: `app/api/consultas/usuarios/route.ts`
- Nuevo: `app/api/usuarios/route.ts`
- Nuevo: `services/usuarios-service.ts`
- Nuevo: `components/usuarios/usuario-dialog.tsx`
- Nuevo: `app/usuarios/page.tsx`
- Modificado: `lib/nav.ts`
- Modificado: `hooks/use-auth.ts`
