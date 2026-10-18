# Perfil por rubro — diseño (2026-10-18)

## Problema

En el alta (`/registro`) se elige el rubro (panadería, verdulería, ferretería...), se
guarda en `comercios.config.rubro` y no cambia nada: todos arrancan con el catálogo
vacío y "Producto nuevo" sugiriendo "Unidad". En la prueba por rubro, la panadería
cargó el pan "por unidad" y con control de stock (y no lo podía vender), y el kiosco
no sabía cómo cobrar una recarga.

## Qué hace

1. **Productos típicos del rubro** (`lib/rubros-perfil.ts`, puro y testeado): una lista
   corta por rubro con la configuración correcta —unidad (kg, m, un), si lleva control
   de stock, si es de precio libre— y un rubro/subrubro sugerido. Ejemplos:
   - Panadería: pan francés por kg sin control de stock, facturas por unidad...
   - Kiosco: recarga SUBE y de celular a precio libre.
   - Ferretería: cable y manguera por metro.
2. **Diálogo "Productos típicos"** en Stock (y desde Primeros pasos): el dueño tilda los
   que quiere, les pone precio y se crean de una vez, marcados como productos rápidos
   del POS. Los de precio libre no piden precio. Los que ya existen (mismo nombre) no se
   ofrecen. No se crea nada sin precio: un producto en $0 se vendería gratis.
3. **"Producto nuevo"** arranca con la unidad típica del rubro y ofrece los rubros
   habituales en el campo "Rubro / Subrubro".

## Datos

Sin SQL. El rubro viaja en la sesión del navegador (`datosDeComercio`, como el plan) solo
para sugerir; los productos se crean con `POST /api/productos` como cualquier alta (el
servidor valida todo como siempre).

## Fuera de alcance

- Cambiar el rubro después del alta (hoy solo lo ve el superadmin).
- Precios sugeridos: cambian todo el tiempo y por zona; los pone el dueño.
