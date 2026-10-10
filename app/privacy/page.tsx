// app/privacy/page.tsx — politica de privacidad publica (la pide Google Ads y
// la linkea el pie de la landing).
import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/legal-page";
import { CONTACT, LEGAL } from "@/lib/marketing/contact";
import { NOMBRE_APP } from "@/lib/marketing/seo";
import { conBase } from "@/lib/site";

export const metadata: Metadata = {
  title: `Política de privacidad · ${NOMBRE_APP}`,
  description: `Qué datos guarda ${NOMBRE_APP}, para qué se usan y cómo pedir que se borren.`,
  alternates: { canonical: conBase("/privacy") },
};

export default function PrivacyPage() {
  return (
    <LegalPage titulo="Política de privacidad" actualizado="10 de octubre de 2026">
      <p>
        {NOMBRE_APP} es un sistema de gestión y punto de venta para comercios, desarrollado por {LEGAL.developerName} ({LEGAL.jurisdiction}).
        Esta política explica qué datos guardamos, para qué y qué derechos tenés sobre ellos.
      </p>

      <h2>Qué datos guardamos</h2>
      <ul>
        <li><b>De la cuenta:</b> nombre, correo de Google con el que ingresás y teléfono de contacto del comercio.</li>
        <li><b>Del comercio:</b> nombre, rubro, productos, ventas, caja, stock, clientes con cuenta corriente, proveedores y, si activás la facturación, los datos fiscales (CUIT, certificado de ARCA).</li>
        <li><b>De los empleados:</b> nombre y PIN de acceso (guardado cifrado, nunca en texto plano).</li>
        <li><b>Técnicos:</b> dirección IP, navegador y páginas visitadas, para seguridad y estadísticas de uso.</li>
      </ul>

      <h2>Para qué los usamos</h2>
      <ul>
        <li>Para que el sistema funcione: vender, controlar stock, cerrar la caja, facturar y cobrar.</li>
        <li>Para contactarte por soporte, avisos del servicio y la suscripción.</li>
        <li>Para medir el uso del sitio y mejorar el producto (estadísticas agregadas, sin datos de tus ventas).</li>
      </ul>
      <p>No vendemos ni cedemos tus datos a terceros con fines comerciales. Los datos de tu comercio son tuyos: podés descargarlos completos en Excel desde el sistema cuando quieras.</p>

      <h2>Servicios de terceros</h2>
      <ul>
        <li><b>Google:</b> ingreso con cuenta de Google y estadísticas del sitio (Google Analytics y Google Ads, mediante cookies).</li>
        <li><b>Mercado Pago:</b> cobros con QR y pago de la suscripción. Tus credenciales de Mercado Pago se guardan cifradas.</li>
        <li><b>ARCA (ex AFIP):</b> emisión de facturas electrónicas con tu certificado, si activás la facturación.</li>
        <li><b>Infraestructura:</b> la aplicación y la base de datos corren en proveedores de nube (Vercel y Supabase) con copias de seguridad diarias.</li>
      </ul>

      <h2>Cookies</h2>
      <p>
        Usamos una cookie de sesión para mantenerte ingresado, una cookie que identifica la computadora registrada de cada caja, y cookies de
        Google Analytics y Google Ads para medir visitas y campañas. Podés bloquear las de medición desde tu navegador sin que el sistema deje de funcionar.
      </p>

      <h2>Seguridad y aislamiento</h2>
      <p>
        Cada comercio ve únicamente sus datos. Las conexiones van cifradas (HTTPS), los PIN y credenciales se guardan cifrados y el acceso a la base
        de datos es exclusivo del servidor.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Podés pedir acceso, corrección o eliminación de tus datos, y dar de baja tu comercio, escribiendo a{" "}
        <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> o por WhatsApp al {CONTACT.whatsappNumber}. Al dar de baja el comercio, los datos
        se eliminan de los sistemas activos; las copias de seguridad se renuevan en el plazo habitual. Conforme a la Ley 25.326 de Protección de
        Datos Personales, la Agencia de Acceso a la Información Pública tiene la atribución de atender denuncias y reclamos.
      </p>

      <h2>Cambios</h2>
      <p>Si esta política cambia, se publica acá con la fecha nueva. Los cambios importantes se avisan dentro del sistema.</p>
    </LegalPage>
  );
}
