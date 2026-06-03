# Estudio de Mercado + Plan de Mejoras — Kiosko Despensa

> Documento de producto y diseño. Fecha: 2026-06-03.
> Objetivo: ubicar el sistema frente a la competencia, definir un roadmap de
> funcionalidades priorizado y fijar una dirección visual impactante.

---

## 1. Estudio de mercado

### 1.1 Competidores locales (Argentina)

El rubro kiosco/maxikiosco/despensa en Argentina está dominado por software de
gestión "todo en uno" con foco en **velocidad de mostrador + facturación AFIP**.

| Sistema | Posicionamiento | Fortalezas que destacan |
|---|---|---|
| **Gestión Comercio** | El más difundido (~1000+ kioscos) | POS, facturación AFIP integrada, stock, reportes, soporte gratis ilimitado, actualización ante cambios normativos |
| **Líder Gestión** | Alta rotación, +2500 PyMEs | Velocidad en mostrador, control de stock, gestión de compras, multi-rubro |
| **SIMPLE Kioscos** (Standard/Plús) | Tradicional, escritorio | Cumplimiento Ley 27743 (2025), facturación, lector de código de barras |
| **Sistar Simple** | Foco en control de caja | Usuarios, apertura/cierre de turnos, arqueo comparando con efectivo real |
| **GDS / Bamboo / Fácil Virtual** | Genéricos de gestión comercial | Compras, proveedores, listas de precios, multi-sucursal |

**Lectura clave:** son potentes en backoffice pero en general **se ven anticuados**
(interfaces de escritorio tipo Windows Forms, grillas densas, poco táctil). Ahí
está nuestra oportunidad de diferenciación: **misma potencia, experiencia moderna,
táctil y rápida**.

### 1.2 Competidores internacionales (referencia de UX/feature)

| Sistema | Qué tomar como referencia |
|---|---|
| **Square** | Onboarding simple, alertas de stock bajo en tiempo real, relación con proveedores, hardware integrado |
| **Loyverse** | **Programa de fidelidad gratis**, app mobile, inventario multi-local, reportes claros |
| **Shopify POS / Odoo POS** | Catálogo unificado online+local, modificadores, descuentos, multi-medio de pago |

### 1.3 Funcionalidades estándar del rubro (checklist competitivo)

Lo que el mercado considera "de base" en 2025/2026:

- ✅ Venta rápida con lector de código de barras *(ya lo tenemos)*
- ✅ Control de stock con alertas de stock bajo *(ya lo tenemos)*
- ✅ Apertura/cierre de caja y arqueo *(ya lo tenemos)*
- ✅ Reportes de ventas y más vendidos *(ya lo tenemos)*
- ⚠️ **Facturación electrónica AFIP/ARCA** *(no lo tenemos — diferencial fuerte del mercado local)*
- ⚠️ **Cuenta corriente / fiado de clientes** *(no lo tenemos — esencial en barrio)*
- ⚠️ **Múltiples medios de pago en una venta** (efectivo + transferencia + QR + tarjeta)
- ⚠️ **Mercado Pago QR / Point integrado** *(estándar de facto en AR)*
- ⚠️ **Recargas virtuales** (SUBE, crédito celular, juegos) — alto tráfico de caja
- ⚠️ **Promociones / combos / descuentos** y precios por cantidad (x mayor)
- ⚠️ **Gestión de proveedores y compras** (reposición, costos, márgenes históricos)
- ⚠️ **Programa de fidelidad** (puntos, cliente frecuente)
- ⚠️ **Balanza** (productos por peso: fiambre, verdura) — relevante en despensa

### 1.4 Tendencias 2025/2026

1. **POS en la nube + táctil** desplazando al software de escritorio.
2. **Pagos QR interoperables** (Mercado Pago, MODO) como medio dominante.
3. **Datos en tiempo real** (stock, caja, ventas) accesibles desde el celular del dueño.
4. **Fidelización integrada** sin costo adicional (lo que Loyverse popularizó).
5. **Reportería accionable** (no solo tablas: alertas, tendencias, sugerencia de reposición).

---

## 2. Diagnóstico del sistema actual

**Stack:** Next.js 16 + React 19 + Tailwind v4 + shadcn (new-york) + Supabase propio.

**Lo que ya está sólido:**
- POS de venta rápida con escaneo, carrito y cobro (núcleo competitivo ✅).
- Caja diaria atómica (RPC `process_sale_kiosko`) con arqueo y diferencia.
- Stock propio con movimientos y RPC `ajustar_stock_kiosko`.
- Reportes con recharts + export Excel.
- Sincronización de catálogo desde la distribuidora (ventaja única: precios siempre al día).
- Auth por PIN (cajero/admin).

**Carencias frente al mercado (gaps):**
1. Sin clientes ni cuenta corriente (fiado).
2. Un solo medio de pago por venta; sin QR/MP ni tarjeta integrados.
3. Sin facturación AFIP/ARCA.
4. Sin proveedores/compras (la reposición es manual).
5. Sin promociones/combos ni precio por cantidad.
6. Sin fidelización.
7. **Visual genérico:** defaults de shadcn, paleta lavada, sin identidad ni motion → no transmite el producto premium que es por debajo.

---

## 3. Plan de funcionalidades (roadmap priorizado)

Notación: **Impacto** (alto/medio) · **Esfuerzo** (S/M/L) · **DB** = requiere cambios en Supabase.

### Tier 0 — Quick wins (alta relación impacto/esfuerzo)

| # | Mejora | Impacto | Esf. | DB |
|---|---|---|---|---|
| 0.1 | **Atajos de teclado** en POS (F2 cobrar, F3 buscar, +/- cantidad, Esc cancelar) | Alto | S | — |
| 0.2 | **Multi-medio de pago en una venta** (efectivo + transferencia, con vuelto) | Alto | M | columnas ya existen (`cash_amount`, `transfer_amount`); falta UI |
| 0.3 | **Dashboard de inicio con datos vivos** (caja abierta, ventas del día, alertas de stock) | Alto | S | — |
| 0.4 | **Búsqueda difusa de productos** por nombre/código en POS (sin depender solo del lector) | Alto | S | — |
| 0.5 | **Identidad visual premium** (este documento, sección 4) | Alto | M | — |

### Tier 1 — Núcleo competitivo (lo que pide el mercado local)

| # | Mejora | Impacto | Esf. | DB |
|---|---|---|---|---|
| 1.1 | **Clientes + cuenta corriente (fiado)**: registrar deuda, abonar, historial | Alto | L | nuevas tablas `clientes`, `cuenta_corriente_mov` |
| 1.2 | **Mercado Pago QR / Point** como medio de pago | Alto | L | columna `payment_ref`; integración API MP |
| 1.3 | **Promociones y precio por cantidad** (2x1, combos, x mayor) | Medio | M | tabla `promociones` |
| 1.4 | **Proveedores y compras** (reposición, costo, margen histórico) | Medio | L | tablas `proveedores`, `compras`, `compra_items` |
| 1.5 | **Sugerencia de reposición** (basada en stock mínimo + rotación) | Medio | M | vista/consulta sobre `stock_movimientos` |

### Tier 2 — Diferenciadores

| # | Mejora | Impacto | Esf. | DB |
|---|---|---|---|---|
| 2.1 | **Facturación electrónica AFIP/ARCA** (factura/ticket fiscal) | Alto | L | integración WSFE; tabla `comprobantes` |
| 2.2 | **Fidelización** (puntos por cliente, beneficios) | Medio | M | campos en `clientes` |
| 2.3 | **Recargas virtuales** (SUBE, celular) vía proveedor (Carga Virtual u otro) | Medio | L | integración externa |
| 2.4 | **Panel del dueño en el celular** (PWA + métricas en vivo) | Medio | M | PWA manifest + vistas |
| 2.5 | **Productos por peso (balanza)** | Bajo | M | flag `por_peso` en `productos` |

> **Regla del proyecto:** toda funcionalidad con DB se informa el SQL exacto
> (`CREATE/ALTER`) **antes** de escribir el código que lo usa.

### Secuencia sugerida
**Sprint 1:** Tier 0 completo (incluye identidad visual).
**Sprint 2:** 1.1 (fiado) + 1.2 (MP QR) — el mayor salto competitivo local.
**Sprint 3:** 1.4 (compras/proveedores) + 1.5 (reposición).
**Sprint 4:** 2.1 (AFIP) según necesidad fiscal del comercio.

---

## 4. Dirección visual impactante

> Aplicando la skill de diseño al contexto POS: el objetivo no es scrollytelling,
> es **glanceability + velocidad táctil + sensación premium**. Cada pantalla se
> lee de un vistazo y responde al toque.

### 4.1 Concepto de marca: **"Mostrador"**
Confianza de barrio + tecnología de punta. Profundo, nítido, enérgico. La plata
(totales) es la protagonista visual; el resto es soporte silencioso.

### 4.2 Paleta
Mantenemos la familia **teal/cyan** (coherencia con la distribuidora) pero la
profundizamos y le sumamos energía:

- **Teal noche** (`oklch(0.20 0.04 220)`) → sidebar y superficies oscuras, con más cuerpo.
- **Teal vibrante** (`oklch(0.62 0.14 220)`) → primario / acción.
- **Lima dinero** (`oklch(0.78 0.18 150)`) → acento de "cobrar/efectivo/éxito". Aparece **con precisión**, no en todos lados.
- **Ámbar alerta** (`oklch(0.80 0.15 75)`) → stock bajo / advertencias.
- **Coral** (`oklch(0.62 0.20 25)`) → destructivo / faltantes.
- Fondos con **mesh gradient** sutil (radiales teal al 4–8%) y grilla tenue para dar atmósfera sin ruido.

### 4.3 Tipografía
- **Display / números:** una sans geométrica con carácter — propuesta **Space Grotesk** (títulos, totales gigantes). Alternativa: Sora.
- **Body / UI:** Geist (ya presente) o DM Sans.
- **Totales y precios:** **tabular mono** (Geist Mono ya está) para que las cifras no "bailen".
- Jerarquía por **contraste de escala**: el total de cobro puede ser 4–6rem.

> Requiere agregar la fuente display vía `next/font/google` (no instala dependencia
> npm). **A confirmar antes de aplicar** según la regla del proyecto.

### 4.4 Profundidad / layering
- Superficies en capas: fondo < card < card elevada, con sombras **ultrasuaves** (no pesadas).
- Top bars con **glassmorphism** (`backdrop-blur`) sobre el mesh.
- Badges de ícono con gradiente para los accesos principales.
- `rounded-2xl` se mantiene como radio estándar (ya es del proyecto).

### 4.5 Motion (sobrio, funcional)
- **Entrada con stagger** de cards (fade + slide) al cargar cada pantalla.
- **Hover lift** en tiles táctiles (`translateY(-4px)` + sombra).
- **Count-up** del total al cobrar.
- **Flash de confirmación** al escanear/agregar un producto en el POS.
- **Pulse** en el pill "Caja abierta".
- Respetar `prefers-reduced-motion`.
- Solo propiedades de compositor (`transform`, `opacity`).

### 4.6 Componentes señal (lo que nos hace inconfundibles)
1. **Money Display**: la cifra de cobro gigante, tabular, con la unidad chica al lado.
2. **Status pills** de caja (abierta/cerrada) con color semántico y pulse.
3. **Command/búsqueda** rápida en POS (cmdk ya está instalado).
4. **Tiles de acción** con badge de gradiente + microinteracción.

---

## 5. Qué se implementa ahora

Como primer paso tangible de la dirección visual, en esta iteración se rediseña el
**dashboard de inicio** (`app/page.tsx`) usando solo lo ya instalado (Tailwind v4,
tailwindcss-animate, lucide-react) — sin librerías nuevas:

- Header de marca con badge en gradiente + reloj/fecha en vivo.
- Fondo con mesh gradient teal + grilla sutil.
- CTA hero "Punto de Venta" a todo el ancho con profundidad y motion.
- Tiles de acceso con glass, badges de ícono y hover lift.
- Entrada con stagger.

**Pendiente de tu OK** (regla del proyecto, no se hace sin consultar):
- Agregar fuente display **Space Grotesk** vía `next/font` (cambia la identidad tipográfica global).
- Roll-out de la paleta enriquecida (tokens en `globals.css`) al resto de pantallas.
- Cualquier funcionalidad del Tier 1+ que toque Supabase (se informará el SQL primero).
