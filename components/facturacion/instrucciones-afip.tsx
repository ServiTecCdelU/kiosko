// components/facturacion/instrucciones-afip.tsx — que hacer en la web de AFIP/ARCA
// en cada paso. Separado del asistente para que el texto se mantenga facil.

const ITEM = "ml-4 list-decimal space-y-1 text-sm text-muted-foreground";

export function InstruccionesCertificado({ ambiente }: { ambiente: "homologacion" | "produccion" }) {
  if (ambiente === "homologacion") {
    return (
      <ol className={ITEM}>
        <li>Entrá a <b>arca.gob.ar</b> con tu CUIT y clave fiscal.</li>
        <li>Abrí el servicio <b>“WSASS - Autogestión Certificados Homologación”</b> (si no lo ves, sumalo desde el Administrador de Relaciones de Clave Fiscal → Adherir servicio).</li>
        <li>Tocá <b>“Nuevo certificado”</b>, poné un nombre (por ejemplo el de tu comercio) y pegá el contenido del archivo <b>.csr</b> que descargaste acá.</li>
        <li>Copiá el certificado que te muestra y pegalo en el paso 3.</li>
        <li>En el mismo servicio, <b>“Crear autorización a servicio”</b>: elegí ese certificado y el servicio <b>wsfe - Facturación Electrónica</b>.</li>
      </ol>
    );
  }
  return (
    <ol className={ITEM}>
      <li>Entrá a <b>arca.gob.ar</b> con tu CUIT y clave fiscal (nivel 3).</li>
      <li>Abrí <b>“Administración de Certificados Digitales”</b> (si no lo ves, sumalo desde el Administrador de Relaciones de Clave Fiscal → Adherir servicio).</li>
      <li>Elegí tu CUIT → <b>“Agregar alias”</b>, poné un nombre y subí el archivo <b>.csr</b> que descargaste acá.</li>
      <li>Descargá el certificado (<b>.crt</b>) y subilo en el paso 3.</li>
      <li>En el <b>Administrador de Relaciones de Clave Fiscal</b> → “Nueva relación” → buscá ARCA → WebServices → <b>Facturación Electrónica</b>, y como representante elegí el alias que creaste.</li>
    </ol>
  );
}

export function InstruccionesPuntoVenta({ ambiente }: { ambiente: "homologacion" | "produccion" }) {
  if (ambiente === "homologacion") {
    return <p className="text-sm text-muted-foreground">En homologación (pruebas) podés usar cualquier número, por ejemplo <b>1</b>.</p>;
  }
  return (
    <p className="text-sm text-muted-foreground">
      En ARCA, servicio <b>“Administración de puntos de venta y domicilios”</b> → Agregar, con el sistema
      <b> “Factura Electrónica - Monotributo - Web Services”</b>. Usá un número nuevo, que no uses en otro sistema de facturación.
    </p>
  );
}
