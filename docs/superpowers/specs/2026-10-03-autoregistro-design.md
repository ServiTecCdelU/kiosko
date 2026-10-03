# Onboarding self-service (autoregistro) — diseño

- **Fecha**: 2026-10-03 · Ítem 5.1 del plan maestro.
- **Decisiones del dueño del producto**: alta **abierta e inmediata** (sin aprobación);
  **una cuenta de Google = un comercio**; prueba de 14 días (`TRIAL_DAYS`) con el
  vencimiento ya implementado (aviso, 3 días de gracia, modo consulta);
  **checklist de primeros pasos** en el panel del comercio nuevo.

## Flujo

1. **Entrada**: la landing suma el CTA "Probar gratis {TRIAL_DAYS} días" → `/registro`.
   El login suma "¿Todavía no tenés cuenta? Creá tu comercio".
2. **`/registro`, paso 1**: "Continuar con Google". Es el mismo OAuth del login
   (vuelve a `/auth/callback` → `/api/auth/google-verify`).
3. **`google-verify` con un correo sin comercio**: hoy responde `no_autorizado`. Pasa
   a emitir una cookie firmada **`kiosko_registro`** (correo verificado por Google +
   nombre de Google, 30 minutos) y redirige a `/registro`. Esto vale aunque la persona
   haya entrado por "Ingresar": si su correo no tiene comercio, la lleva a crearlo, y
   el formulario aclara que si es empleado de un comercio existente le pida acceso al dueño.
4. **`/registro`, paso 2** (con la cookie): formulario con nombre del comercio, nombre
   del dueño (precargado desde Google), WhatsApp y rubro. Muestra la dirección del panel
   que va a quedar (`/<slug>`).
5. **`POST /api/registro`** (ruta pública en `proxy.ts`: todavía no hay sesión; la
   protege la cookie de registro):
   - Valida con zod y limita **3 altas por IP por hora**.
   - Arma el slug desde el nombre (sin tildes, kebab-case). Si choca con una ruta de
     la app (`RUTAS_RESERVADAS`), le suma un sufijo.
   - Llama a la RPC **`registrar_comercio_autoservicio`** (migración 40), que es atómica:
     comercio en `prueba` + admin con ese correo + puesto "Caja 1", o nada. Usa un lock
     por correo (sin duplicados por doble envío) y resuelve el slug repetido con `-2`, `-3`…
   - Si sale bien, emite la cookie de sesión de admin, borra la de registro y manda a
     `/auth/completando` → panel `/<slug>`.
   - Si el correo ya tiene comercio, responde 409 "Esa cuenta ya tiene un comercio: entrá
     desde Ingresar".
6. **Panel del comercio nuevo**: tarjeta "Primeros pasos" con 4 ítems que se tildan solos:
   - productos > 0
   - ventas > 0
   - empleados no-admin > 0
   - Mercado Pago conectado

   Se muestra solo en comercios de autoregistro (`config.origen`) con pasos pendientes,
   y se puede ocultar.
7. **Superadmin**: badge "nuevo" (autoregistro de los últimos 7 días); el diálogo muestra
   rubro y WhatsApp. Crear un comercio desde el superadmin ahora también crea "Caja 1".

## Datos

Sin columnas nuevas. Origen, rubro y teléfono van en `comercios.config`
(`{origen: "autoregistro", rubro, telefono}`).

## Seguridad

- El correo sale **solo** de Google, verificado server-side (`auth.getUser`). La cookie
  de registro va firmada con el mismo HMAC que la sesión y dura 30 minutos.
- La RPC se revoca de `public/anon/authenticated`: la llama solo el servidor.
- Abuso: una cuenta de Google por comercio + límite por IP. El trial no se puede renovar
  creando otro comercio con la misma cuenta.

## Bug corregido de paso

Los comercios creados por el superadmin después de la migración 26 nacieron sin puesto
de caja, así que no podían abrir la caja. La migración 40 los completa y el alta del
superadmin ya crea el puesto.
