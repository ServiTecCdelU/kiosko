# CLAUDE.md

Guía para Claude Code al trabajar en este repositorio.

**Siempre responder en español.**

NOMBRE: Kiosko Despensa (sistema de punto de venta)

## Relación con la Distribuidora

Este proyecto es un sistema de POS independiente, hermano del proyecto
`Distribuidora J&J` (`../Distribuidora J&J`). Comparte stack y estilo visual
pero tiene **base de datos Supabase propia y separada**.

- **Sincronización**: el kiosko trae el catálogo (nombre, precio, categoría) desde
  la API pública de la distribuidora (`DISTRIBUIDORA_API_URL` + `/api/public/productos`)
  y hace upsert por código. **Nunca pisa el stock local** — el stock del kiosko es propio.
- No comparte ventas, caja ni stock con la distribuidora.

## Commands

```bash
npm run dev       # Servidor de desarrollo
npm run build     # Build de producción (errores TS ignorados — ver next.config.mjs)
npm run lint      # ESLint
npm run start     # Servidor de producción
```

No hay tests en este proyecto.

## Reglas del Proyecto

### Antes de hacer cambios
- Analizar el código existente y mantener la arquitectura actual.
- No romper estilos ni componentes existentes. Revisar estilos antes de tocar visual.
- **Si el cambio requiere columnas o tablas nuevas en Supabase**: informar el SQL exacto
  (`ALTER TABLE` / `CREATE TABLE`) ANTES de escribir el código que las usa. El usuario
  ejecuta el SQL primero y después se implementa el código.

### Después de hacer cambios — commit y push
Un solo commit y push cuando todo funcione o se terminen todos los cambios de un mensaje.
1. `npm run build` y verificar que no haya errores.
2. `git add` de los archivos modificados.
3. Commit con mensaje en español, imperativo.
4. `git push origin main`.

### Commit conventions (Conventional Commits)
- `feat:` nuevas funcionalidades · `fix:` correcciones · `refactor:` mejoras internas
- `style:` cambios visuales · `docs:` documentación · `chore:` tareas varias
- **NUNCA** agregar `Co-Authored-By` ni referencias a Claude/AI en los commits.

### Estilo visual
- Border-radius estándar: `rounded-2xl`
- Paleta principal: teal/cyan (mismas variables CSS que la distribuidora)
- shadcn/ui (new-york), Tailwind v4, lucide-react

### Prohibiciones
- No instalar librerías nuevas sin consultar.
- No crear componentes nuevos si ya existe uno similar — reutilizar.
- No modificar `next.config.mjs`.

## Stack
- Next.js 16 (App Router), React 19, Tailwind CSS v4, shadcn/ui
- Supabase PostgreSQL (proyecto propio) — tablas: `productos`, `ventas`, `caja`,
  `stock_movimientos`, `sync_log`, `usuarios`
- Forms: react-hook-form + zod · Charts: recharts · Toasts: sonner
- Excel: xlsx-js-style (reportes)
- Clientes Supabase: `lib/supabase.ts` (anon, client), `lib/supabase-admin.ts` (service role, server)

## Variables de Entorno
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `DISTRIBUIDORA_API_URL` — URL base de la distribuidora para sincronizar catálogo

## Arquitectura (fases)
0. Scaffold (hecho)
1. BD: schema + RPC `process_sale_kiosko` atómica
2. Sincronización con distribuidora (`services/sync-service.ts`, pantalla `/sincronizacion`)
3. POS venta rápida + código de barras (núcleo)
4. Caja diaria (apertura/cierre/arqueo)
5. Stock propio (entradas, ajustes, alertas)
6. Reportes (diario/mensual, más vendidos, márgenes)
7. Auth (admin/cajero)
