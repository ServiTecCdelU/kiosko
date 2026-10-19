-- 76_busqueda_productos.sql
-- Busqueda de productos por varias palabras y sin importar tildes ni mayusculas.
--
-- Antes se buscaba la frase entera: "filtro gol" no encontraba
-- "Filtro de aceite Fram PH5949 VW Gol 1.6" y "bujia" no encontraba "Bujía".
-- Ahora el servidor exige que CADA palabra aparezca en esta columna
-- (lib/busqueda.ts arma las palabras con la misma normalizacion).
--
-- No destructivo y re-ejecutable.

create extension if not exists pg_trgm;

alter table productos
  add column if not exists busqueda text
  generated always as (
    translate(
      lower(
        coalesce(name, '') || ' ' || coalesce(codigo, '') || ' ' ||
        coalesce(codigo_barras, '') || ' ' || coalesce(description, '')
      ),
      'áàäâãéèëêíìïîóòöôõúùüûñç',
      'aaaaaeeeeiiiiooooouuuunc'
    )
  ) stored;

-- ilike '%palabra%' usa este indice (trigramas).
create index if not exists productos_busqueda_trgm
  on productos using gin (busqueda gin_trgm_ops);

notify pgrst, 'reload schema';
