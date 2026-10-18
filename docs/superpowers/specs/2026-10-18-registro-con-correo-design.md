# Registro y login con código por correo (sin Google)

Fecha: 2026-10-18 · Estado: implementado y en producción (SMTP de Resend configurado y probado el 2026-10-18)

## Problema
El alta self-service (`/registro`) y el login del dueño eran solo con Google. Quien no tiene
cuenta de Google (o no se acuerda de la contraseña) quedaba afuera; el parche era un link a WhatsApp.

## Decisión
Código de un solo uso por correo con **Supabase Auth** (`signInWithOtp` + `verifyOtp`, tipo `email`).
No hay contraseñas que guardar ni recuperar, y se reutiliza todo el flujo de Google:

1. El navegador pide el código (`signInWithOtp({ email, shouldCreateUser: true })`).
2. La persona escribe el código que le llegó; el navegador lo canjea (`verifyOtp`) por una sesión
   de Supabase Auth con el correo **verificado**.
3. El `access_token` va a `POST /api/auth/google-verify` (la misma ruta del login con Google), que lo
   vuelve a verificar contra Supabase Auth y decide igual que siempre: superadmin, panel del comercio
   (`usuarios.email` admin) o alta nueva (cookie `kiosko_registro` → formulario del paso 2).

Un correo = un comercio, como con Google: un dueño que se registró con Google puede entrar también
con un código a ese mismo correo, y viceversa (es la misma identidad: el correo verificado).

No hay tablas ni rutas nuevas. Código: `lib/auth-correo.ts` (navegador), `lib/correo.ts` (reglas
puras y mensajes de error, testeados) y `components/auth/entrar-con-correo.tsx` (los dos pasos),
usado en `/registro` y en `/login`.

## Envío de los correos
El SMTP por defecto de Supabase solo manda a miembros del equipo y 2 por hora: no sirve para
clientes. Se configura **Resend** como SMTP propio del proyecto (Auth → SMTP):

- Host `smtp.resend.com`, puerto 465, usuario `resend`, contraseña = API key de Resend.
- Remitente `acceso@servitec.net.ar` ("ServiTec"), con el dominio verificado en Resend (DNS).
- Plantillas "Magic link" y "Confirm signup" en español con `{{ .Token }}` (el código, no un link).
- Código de 6 dígitos, vence en 10 minutos; límite de envíos acorde (Resend gratis: 100/día).

## Seguridad
- El correo nunca sale de un campo del formulario hacia el servidor: lo afirma Supabase Auth al
  verificar el código, igual que Google.
- Supabase limita los pedidos de código por correo (1 por minuto) y los intentos de verificación.
- `google-verify` sigue buscando el correo con `patronCorreoExacto()`.
