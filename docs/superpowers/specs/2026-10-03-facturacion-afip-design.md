# Facturación electrónica AFIP/ARCA — diseño

- **Fecha**: 2026-10-03 · Ítem 5.4 del plan maestro.
- **Decisiones del dueño del producto**:
  - Cada comercio factura con **su propio certificado**.
  - Integración **directa** con los web services de AFIP. Se suma una sola dependencia, `node-forge`, para firmar el CMS de WSAA y generar el CSR. No hay intermediarios.
  - Comprobantes: **Factura C (11)** y **Nota de crédito C (13)**, para monotributo.
  - **El comercio elige** entre facturación automática (toda venta) o manual (botón Facturar).

## Normativa a respetar (verificada 2026-10)

- **RG 5616 / WSFEv1 v4.8**: `CondicionIVAReceptorId` es obligatorio desde el **1/12/2026**
  (si falta, error 10246). Valores: 5 consumidor final, 6 monotributo, 1 responsable
  inscripto, 4 exento. Se manda desde ya.
- **RG 5700/2025**: hay que identificar al consumidor final (DNI/CUIT/CUIL) solo cuando el
  total es **≥ $10.000.000**. Por debajo va doc tipo 99 y nro 0. El umbral es una constante
  en `lib/afip/`.
- **Factura C**: `ImpTotal = ImpNeto`, IVA 0, sin array de IVA, `MonId PES`, `MonCotiz 1`,
  Concepto 1 (productos).
- **Nota de crédito C**: lleva `CbtesAsoc` con la factura original (tipo 11, punto de venta,
  número, CUIT, fecha).
- **Comprobante impreso**: datos del emisor, CAE y vencimiento, y el **QR de AFIP**
  (`https://www.afip.gob.ar/fe/qr/?p=<base64 del JSON v1>`).

## Alta del comercio (pantalla `/facturacion`, solo admin)

1. **Datos fiscales**: CUIT, razón social, domicilio comercial, inicio de actividades e IIBB.
2. **Pedido de certificado**: el sistema genera la clave RSA 2048 (cifrada con
   `AFIP_CERT_KEY`) y el CSR (`CN=<alias>, O=<razón social>, serialNumber=CUIT <cuit>`).
   El dueño descarga el `.csr` y lo sube en AFIP/ARCA:
   - para producción, en "Administración de Certificados Digitales";
   - para homologación, en "WSASS".

   La pantalla explica paso a paso con su clave fiscal.
3. **Certificado**: el dueño sube el `.crt` que le da AFIP. Se valida que corresponda a la
   clave guardada y a la CUIT, y se guarda su vencimiento. Después asocia el certificado
   al servicio "wsfe" en el "Administrador de Relaciones" (la pantalla lo explica).
4. **Punto de venta y ambiente**: el número de un punto de venta "Factura electrónica - Web
   Services", y el ambiente (homologación o producción).
5. **Probar conexión**: estado de AFIP (`FEDummy`) + acceso (WSAA) + último comprobante
   autorizado. Recién con la prueba OK se puede **activar**.
6. **Modo**: manual o automático.

Solo existe una configuración por comercio. Para pasar de homologación a producción se sube
el certificado de producción.

## Emisión

- **Manual**: botón "Facturar" en el ticket del POS (factura y se imprime) y en Ventas.
- **Automático**: al registrar la venta (también la de Mercado Pago confirmada por el webhook)
  la factura se pide en `after()`, sin demorar el cobro. Queda visible en Ventas.
- **Anulación y devolución** de una venta facturada: se emite sola la Nota de crédito C (total
  o parcial). Si AFIP falla, la anulación o devolución igual se hace y la NC queda pendiente
  para reintentar.
- **Si AFIP no responde, la venta se cobra igual**: la factura queda `pendiente`/`error` con
  botón "Reintentar".

### Numeración y consistencia

- Lock por `(comercio, ambiente, tipo, punto de venta)` con la RPC `tomar_lock_afip`. Vence
  solo a los 60 s, por si el servidor se corta en el medio.
- Se toma el lock, se pide `FECompUltimoAutorizado`, se usa el siguiente número (guardado en
  la fila antes de pedir el CAE), se pide `FECAESolicitar` y se suelta el lock.
- **Recuperación**: si una factura quedó con número asignado y sin respuesta (corte de red),
  antes de reintentar se consulta `FECompConsultar` con ese número. Si AFIP la autorizó, se
  toma el CAE de ahí. Así nunca se factura dos veces la misma venta.
- **Ticket de acceso WSAA**: se guarda cifrado en `afip_tokens` y se reusa hasta 10 minutos
  antes de vencer, porque AFIP rechaza pedir otro mientras el anterior sigue vigente.

## Datos (migración 41)

- `afip_config`
- `afip_tokens`
- `facturas`, con índices únicos: número no repetido, una factura viva por venta y una NC
  viva por devolución o anulación
- `afip_locks` y las RPC del lock

## Seguridad

- La clave privada, `token` y `sign` se guardan cifrados con AES-256-GCM. La clave de
  cifrado vive solo en el entorno.
- La clave privada y el certificado nunca vuelven al navegador; solo se descarga el CSR,
  que es público.
- Todo `/api/afip/*` es solo admin, salvo facturar una venta, que también puede hacer el
  cajero en modo manual.
- La demo no puede configurar facturación.

## Fuera de alcance (v1)

- Factura A/B (responsable inscripto, IVA por alícuota).
- CAEA (contingencia).
- Impresión ZPL de la factura: va por el navegador.
- Facturar ventas viejas en lote.
- Restringir por plan (el plan maestro la ubica en "Pro").
