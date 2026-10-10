// app/terms/page.tsx — terminos y condiciones publicos (los linkea el pie de la landing).
import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/legal-page";
import { CONTACT, LEGAL, TRIAL_DAYS } from "@/lib/marketing/contact";
import { NOMBRE_APP } from "@/lib/marketing/seo";
import { conBase } from "@/lib/site";

export const metadata: Metadata = {
  title: `Términos y condiciones · ${NOMBRE_APP}`,
  description: `Condiciones de uso de ${NOMBRE_APP}: prueba gratis, suscripción mensual, tus datos y responsabilidades.`,
  alternates: { canonical: conBase("/terms") },
};

export default function TermsPage() {
  return (
    <LegalPage titulo="Términos y condiciones" actualizado="10 de octubre de 2026">
      <p>
        Al crear una cuenta en {NOMBRE_APP} (en adelante, "el sistema"), desarrollado por {LEGAL.developerName}, aceptás estas condiciones.
        Si no estás de acuerdo con alguna, no uses el sistema.
      </p>

      <h2>El servicio</h2>
      <p>
        El sistema es una aplicación web de gestión y punto de venta para comercios: ventas, caja, stock, clientes, proveedores, promociones,
        reportes, cobros con Mercado Pago y factura electrónica. Se usa desde el navegador y no requiere instalación. Podemos agregar, cambiar o
        retirar funciones para mejorar el servicio.
      </p>

      <h2>Prueba gratis y suscripción</h2>
      <ul>
        <li>Al registrarte tenés {TRIAL_DAYS} días de prueba gratis, sin tarjeta. Al terminar, si no pagás, el sistema pasa a modo consulta: podés ver y descargar tus datos, pero no vender.</li>
        <li>La suscripción es mensual y se paga por adelantado, con Mercado Pago o por débito automático. Cada pago cubre el mes en curso.</li>
        <li>El precio depende del plan y de la cantidad de cajas. Los precios vigentes se muestran en el sistema y pueden actualizarse; los cambios se avisan antes de que apliquen.</li>
        <li>Podés dejar de pagar cuando quieras. No hay permanencia mínima ni costo de baja. Los meses ya pagados no se reintegran.</li>
      </ul>

      <h2>Tu cuenta</h2>
      <ul>
        <li>Sos responsable de la cuenta de Google con la que ingresás y de los PIN de tus empleados.</li>
        <li>Cada comercio es independiente: sus datos no se comparten con otros comercios.</li>
        <li>No se permite usar el sistema para actividades ilícitas ni intentar acceder a datos de otros comercios.</li>
      </ul>

      <h2>Tus datos</h2>
      <p>
        Los datos que cargás son tuyos. Podés descargarlos completos en Excel cuando quieras y pedir que se eliminen al dar de baja tu comercio.
        El tratamiento de datos personales se detalla en la <a href={conBase("/privacy")}>política de privacidad</a>.
      </p>

      <h2>Facturación y cobros</h2>
      <p>
        La factura electrónica se emite con tu propio certificado de ARCA y a tu nombre; los cobros con Mercado Pago se acreditan en tu propia
        cuenta. Sos responsable de la información fiscal que cargás y de cumplir tus obligaciones impositivas. El sistema es una herramienta;
        no reemplaza a tu contador.
      </p>

      <h2>Disponibilidad y responsabilidad</h2>
      <p>
        Trabajamos para que el sistema esté disponible todo el tiempo y hacemos copias de seguridad diarias, pero no podemos garantizar que
        nunca haya interrupciones (mantenimiento, fallas de proveedores de internet o de nube, caídas de ARCA o Mercado Pago). El punto de venta
        sigue funcionando sin internet y sincroniza cuando vuelve. {LEGAL.developerName} no responde por lucro cesante ni daños indirectos
        derivados del uso o la indisponibilidad del sistema.
      </p>

      <h2>Cambios y contacto</h2>
      <p>
        Podemos actualizar estas condiciones; la versión vigente es la publicada acá con su fecha. Para consultas, escribinos a{" "}
        <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> o por WhatsApp al {CONTACT.whatsappNumber}. Jurisdicción: {LEGAL.jurisdiction}.
      </p>
    </LegalPage>
  );
}
