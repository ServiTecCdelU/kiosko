-- 68_produccion.sql — productos que se elaboran en el local (produccion del dia).
-- Diseño: docs/superpowers/specs/2026-10-18-produccion-del-dia-design.md
--
-- La produccion se registra como entrada de stock (referencia 'produccion') y el
-- sobrante que se tira como merma: no hace falta tabla nueva, solo saber que
-- productos van en la pantalla Produccion.
--
-- No destructiva y re-ejecutable.

alter table productos add column if not exists elaboracion_propia boolean not null default false;

notify pgrst, 'reload schema';
