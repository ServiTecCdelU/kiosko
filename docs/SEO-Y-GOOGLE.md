# SEO y Google (Analytics, Search Console y Ads)

Guía para posicionar la landing de MultiComercioPanel y medir las visitas y los
registros. Lo del código ya está hecho; lo que sigue son pasos en las cuentas de
Google. **Ningún paso de esta guía cobra plata**: la campaña de Ads se deja creada
y en pausa hasta que decidas activarla.

## 0. Dónde vive la landing

- La app se sirve en **`https://www.servitec.net.ar/comercio/`** (`BASE_PATH=/comercio`).
  La landing es `/comercio/`, el registro `/comercio/registro`.
- La raíz `www.servitec.net.ar` es el sitio de ServiTec (otro deploy). Ojo: en la
  charla se mencionó **servitec.com.ar**; el código apunta a **.net.ar**. Si el
  dominio real es otro, cambiar `NEXT_PUBLIC_SITE_URL` en Vercel y listo (los
  metadatos y el sitemap lo toman de ahí).
- Páginas que Google indexa: `/comercio/`, `/comercio/registro`, `/comercio/terms`,
  `/comercio/privacy`. Todo lo demás (POS, caja, login, panel de cada comercio) sale
  con `X-Robots-Tag: noindex` (`proxy.ts` + `lib/marketing/seo.ts`).
- Sitemap: **`https://www.servitec.net.ar/comercio/sitemap.xml`** (`app/sitemap.ts`).

## 1. Qué hace el código (ya hecho)

| Qué | Dónde |
|---|---|
| Título y descripción con las palabras que buscan los comercios ("sistema para kiosco", "programa para despensa", "punto de venta", "factura electrónica ARCA") | `lib/marketing/seo.ts`, `app/layout.tsx` |
| Datos estructurados JSON-LD: Organization, SoftwareApplication (con planes) y FAQPage | `lib/marketing/seo.ts`, `app/page.tsx` |
| Preguntas frecuentes actualizadas (factura electrónica, precios, balanza) | `lib/marketing/faq.ts` |
| Sitemap | `app/sitemap.ts` |
| `noindex` en pantallas privadas | `proxy.ts` |
| Etiqueta de Google (GA4 `G-4PECQ9ZPFY` + Ads `AW-18494398369`), solo en producción | `components/analytics/google-tag.tsx` |
| Eventos GA4 (todos con `producto: "comercio"`): `sign_up` (alta OK en `/registro`) y `whatsapp_click` (con `ubicacion`: hero, footer, cierre, demo-version-paga, ayuda, suscripcion, asistente-afip, banner-acceso) | `lib/analytics.ts`, `components/analytics/whatsapp-link.tsx` |
| Conversiones de Ads directas (`value: 1`, `ARS`): "Registro completado - Comercio" al completar el alta y "Clic WhatsApp - Comercio" en los links de la landing y la demo. Los links de adentro de la app (comercios ya registrados) solo mandan el evento de GA4, no la conversión | `lib/analytics.ts` |
| Términos y política de privacidad (Ads exige privacidad en la página de destino) | `app/terms`, `app/privacy` |
| Verificación de Search Console por etiqueta (opcional) | `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` |

No hace falta cargar nada en Vercel: los IDs están en el código (`lib/analytics.ts`) y la
etiqueta se carga sola en producción. Para cambiar un ID o una etiqueta de conversión, se
edita ese archivo. La única variable opcional es `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`
(solo si verificás Search Console por etiqueta HTML; después hay que redeploy).

En local (`npm run dev`) no se manda nada a Google. Para probar los eventos hay que hacerlo
en producción: con la extensión "Google Analytics Debugger" o en Analytics → Administrar →
DebugView se ven `whatsapp_click` y `sign_up` al instante.

## 2. Google Analytics 4

1. Entrar a <https://analytics.google.com> con la cuenta de Google de ServiTec
   (la misma que ya usa Ads para la distribuidora, así quedan vinculadas).
2. La propiedad ya existe: ID de medición **`G-4PECQ9ZPFY`** (está en `lib/analytics.ts`).
   En **Flujo de datos → Web** dejar activada la **medición mejorada** (toma las vistas
   de página al navegar solas).
3. Verificar: abrir la landing en producción y en Analytics → **Informes → Tiempo real**
   tiene que aparecer la visita. En **Administrar → Eventos** van a aparecer
   `whatsapp_click` y `sign_up` a medida que ocurran, con el parámetro `producto`
   = `comercio` (sirve para separarlos de la distribuidora si comparten propiedad).
4. **Marcar `sign_up` como evento clave** (Administrar → Eventos → "Marcar como
   evento clave"). Opcional: crear la dimensión personalizada `ubicacion` (alcance
   evento) para ver desde qué botón se hace click en WhatsApp.

## 3. Search Console

1. Entrar a <https://search.google.com/search-console>.
2. **Agregar propiedad → Dominio**: `servitec.net.ar`. Verificar con el registro
   **TXT en el DNS** (donde esté alojado el dominio). Esto cubre todas las rutas,
   incluida `/comercio`, y también el sitio de ServiTec y la distribuidora si está
   en el mismo dominio.
   - Alternativa sin tocar DNS: propiedad de tipo **Prefijo de URL**
     `https://www.servitec.net.ar/comercio/`, método "Etiqueta HTML": copiar el
     `content="…"` en `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` y redeploy.
3. **Sitemaps → Agregar**: `https://www.servitec.net.ar/comercio/sitemap.xml`.
4. En el **`robots.txt` del sitio raíz** (el deploy de servitec.net.ar, no esta app)
   agregar la línea `Sitemap: https://www.servitec.net.ar/comercio/sitemap.xml`.
   No bloquear `/comercio`. (Un `robots.txt` en `/comercio/robots.txt` no vale:
   Google solo lee el de la raíz.)
5. **Inspección de URL** con `https://www.servitec.net.ar/comercio/` → "Solicitar
   indexación". Repetir con `/comercio/registro`.
6. En una o dos semanas: **Rendimiento** muestra por qué búsquedas aparece la
   landing. **Mejoras** tiene que listar "Preguntas frecuentes" (FAQPage) sin errores.
   Se puede probar antes en <https://search.google.com/test/rich-results>.

## 4. Google Ads (sin pagar todavía)

Como ya hay una cuenta de Ads con la campaña de la distribuidora, se usa la misma
cuenta. **Todo queda en pausa**: no se gasta nada hasta que se active a mano.

### 4.1 Conversiones (ya cargadas en el código)

Las dos acciones de conversión existen en Ads y el código las dispara directo con la
etiqueta de Google (no hace falta importarlas desde GA4):

| Acción en Ads | Cuándo se dispara | Etiqueta |
|---|---|---|
| Registro completado - Comercio | Cuando `/registro` creó el comercio (respuesta OK, antes de redirigir) | `AW-18494398369/RMreCPezpZgdEKG_6PJE` |
| Clic WhatsApp - Comercio | Click en "Hablar por WhatsApp" de la landing (hero, pie, cierre) y en "Consultar por WhatsApp" de la demo | `AW-18494398369/9SEkCPqzpZgdEKG_6PJE` |

Ambas con valor 1 ARS, recuento "Una". Dejar **Registro completado** como acción
**principal** y **Clic WhatsApp** como **secundaria** (para que Ads optimice por
registros y no por consultas). Vincular igualmente Analytics (Herramientas → Cuentas
vinculadas → GA4) para ver las visitas de la campaña dentro de Analytics.

### 4.2 Campaña de búsqueda (crear en pausa)

- **Nueva campaña → Objetivo: Clientes potenciales → Tipo: Búsqueda**.
- Conversión: "Registro completado - Comercio". Redes: **solo Búsqueda de Google** (desactivar
  Display y partners de búsqueda, gastan sin convertir).
- Ubicación: Argentina (o las provincias donde hagan soporte). Idioma: español.
- Presupuesto: **$3.000 por día** para arrancar (Ads puede gastar hasta el doble
  un día, pero promedia el mes). Puja: "Maximizar clics" con límite de CPC $300 las
  primeras dos semanas; cuando haya 15 o 20 conversiones, pasar a "Maximizar
  conversiones".
- **Estado: Pausada** al terminar el asistente (botón de estado de la campaña).
  Así queda todo listo sin gastar.
- URL final de los anuncios: `https://www.servitec.net.ar/comercio/`.
  Para el grupo "factura electrónica" también sirve `/comercio/registro`.

### 4.3 Grupos de anuncios y palabras clave

Usar concordancia **de frase** (entre comillas) y, al principio, evitar la amplia.

| Grupo | Palabras clave |
|---|---|
| Kiosco | "sistema para kiosco", "programa para kiosco", "software para kiosco", "sistema de ventas para kiosco", "control de stock kiosco" |
| Despensa / almacén | "sistema para despensa", "programa para almacén", "sistema para almacén de barrio", "programa para despensa" |
| Supermercado chico | "sistema para supermercado", "programa para supermercado chico", "sistema para minimercado", "software para autoservicio" |
| Punto de venta | "programa punto de venta", "sistema punto de venta", "software punto de venta gratis", "sistema de facturación y stock" |
| Factura electrónica | "sistema de facturación electrónica arca", "programa para facturar afip", "facturación electrónica para comercio" |
| Fiado | "sistema para fiado", "programa cuenta corriente clientes", "control de fiado kiosco" |

**Palabras clave negativas** (a nivel campaña): `gratis para siempre`, `crack`,
`descargar`, `curso`, `empleo`, `trabajo`, `pdf`, `excel plantilla`, `sueldo`,
`wikipedia`, `que es`.

### 4.4 Anuncios (responsivos de búsqueda)

Un anuncio por grupo, con estos textos; Ads combina títulos y descripciones.

Títulos (máx. 30 caracteres):
- Sistema para Kioscos
- Programa para tu Despensa
- Punto de Venta 100% Web
- Probá Gratis 14 Días
- Sin Instalación, Sin Tarjeta
- Caja, Stock y Fiado
- Factura Electrónica ARCA
- Cobrá con QR Mercado Pago
- Funciona Sin Internet
- Desde $30.000 por Mes
- Soporte por WhatsApp
- Hecho en Argentina

Descripciones (máx. 90 caracteres):
- Vendé con lector de códigos, cerrá la caja con arqueo y controlá el stock y los vencimientos.
- Fiado con cuenta corriente, promociones y reportes. Para kioscos, despensas y supermercados.
- Factura A, B y C de ARCA directo desde la venta. 14 días gratis, sin tarjeta ni instalación.
- Funciona en PC, tablet y celular. Si se corta internet, seguís cobrando. Soporte por WhatsApp.

Extensiones (activos): enlaces de sitio a `/comercio/#modulos` (Módulos),
`/comercio/#faq` (Preguntas frecuentes), `/comercio/registro` (Probar gratis);
texto destacado "14 días gratis", "Sin instalación", "Factura electrónica";
llamada con el WhatsApp de ServiTec; precio: Básico $30.000 / Pro $60.000 por mes.

### 4.5 Antes de activar

- Revisar que en Ads → Conversiones las dos acciones figuren con estado
  "Registrando conversiones" (hacer click en WhatsApp desde la landing en producción,
  y un registro de prueba con una cuenta de Google nueva que después se borra desde el
  superadmin). Las conversiones tardan hasta unas horas en aparecer en Ads.
- Pasar la campaña a **Habilitada**. Primera semana: mirar **Términos de búsqueda**
  todos los días y agregar negativas a lo que no tenga sentido.

## 5. SEO fuera del código (para cuando haya tiempo)

- **Perfil de empresa de Google** (Google Business) para ServiTec con el link a
  `/comercio/`: ayuda mucho en búsquedas locales de Entre Ríos.
- Que el sitio raíz de ServiTec y el de la distribuidora linkeen a
  `https://www.servitec.net.ar/comercio/` con texto "sistema para kioscos y despensas".
- Una página o nota por rubro ("sistema para panadería", "sistema para verdulería")
  cuando haya casos reales: hoy la landing cubre los rubros en una sola sección.
- Pedir a los primeros comercios una reseña en el Perfil de empresa.
