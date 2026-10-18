-- 75_fotos_productos.sql — fotos de los productos (tienda online, stock).
-- Bucket publico "productos" de Supabase Storage: lectura publica (la tienda las
-- muestra), escritura solo desde el servidor con la service key (app/api/productos/foto).
-- Ruta de cada foto: <comercio_id>/<producto_id>/<aleatorio>.<ext>. productos.image_url
-- guarda la URL publica. Solo imagenes, hasta 2 MB. No destructiva y re-ejecutable.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('productos', 'productos', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
