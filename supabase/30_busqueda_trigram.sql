-- 30_busqueda_trigram.sql
-- Indices trigram para que la busqueda de productos (POS, /stock, lector de
-- codigo) siga siendo rapida cuando el catalogo crece a miles de productos.
--
-- Diagnostico: la busqueda usa ILIKE '%texto%' (comodin AL INICIO) contra
-- name/codigo/codigo_barras (app/api/consultas/productos/route.ts, acciones
-- "buscar" y "pagina"). Los indices btree existentes (idx_productos_name,
-- idx_productos_codigo, idx_productos_codigo_barras, 01_schema.sql) NUNCA
-- pueden usarse con un comodin al inicio -> recorrido secuencial completo en
-- cada tecla que escribe el cajero. Con un kiosko chico no se nota; con el
-- catalogo grande de un supermercado, se pone perceptiblemente lento.
--
-- Solucion: extension pg_trgm + indices GIN trigram. Postgres empieza a usar
-- estos indices automaticamente para ILIKE '%...%' -- CERO cambios de codigo,
-- las mismas queries que ya existen quedan mas rapidas solas.
--
-- No destructivo: no borra los indices btree existentes (siguen sirviendo
-- para busqueda exacta, ej. el lector de barras via .eq('codigo_barras', x)
-- en la accion "porCodigo"). Solo agrega indices nuevos.
--
-- Nota operativa: en un catalogo de varios miles de productos, crear el indice
-- puede tardar unos segundos y bloquea escrituras en `productos` mientras
-- corre (no usa CONCURRENTLY porque el SQL Editor de Supabase ejecuta cada
-- sentencia en su propia transaccion implicita, y CONCURRENTLY no puede correr
-- dentro de una transaccion). Conviene correrlo fuera del horario de mostrador.

create extension if not exists pg_trgm;

create index if not exists idx_productos_name_trgm
  on productos using gin (name gin_trgm_ops);

create index if not exists idx_productos_codigo_trgm
  on productos using gin (codigo gin_trgm_ops);

create index if not exists idx_productos_codigo_barras_trgm
  on productos using gin (codigo_barras gin_trgm_ops);

-- ------------------------------------------------------------
-- Como verificar que se esta usando (opcional, correr aparte):
--
--   explain analyze
--   select * from productos
--   where comercio_id = 'comercio_1' and disabled = false
--     and (name ilike '%gaseosa%' or codigo ilike '%gaseosa%' or codigo_barras ilike '%gaseosa%')
--   limit 24;
--
-- El plan deberia mostrar "Bitmap Index Scan on idx_productos_name_trgm" (o
-- similar) en vez de "Seq Scan on productos".
