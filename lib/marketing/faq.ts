// lib/marketing/faq.ts — preguntas frecuentes de la landing. Viven aca (y no en
// el componente) porque tambien se publican como datos estructurados FAQPage
// (lib/marketing/seo.ts) para que Google las muestre en el resultado.
import { TRIAL_DAYS } from "./contact.ts";

export interface PreguntaFrecuente {
  q: string;
  a: string;
}

export const FAQS: PreguntaFrecuente[] = [
  { q: "¿Necesito instalar algo?", a: "No. Es 100% web: funciona desde cualquier computadora, tablet o celular con navegador. Si se corta internet, el punto de venta sigue cobrando y sincroniza cuando vuelve." },
  { q: "¿Funciona con lector de código de barras?", a: "Sí. Cualquier lector USB o Bluetooth funciona: conectás y escaneás directo en el punto de venta. También lee las etiquetas con peso de las balanzas (EAN-13)." },
  { q: "¿Puedo tener varias cajas abiertas?", a: "Sí. Cada caja tiene su apertura, cierre y arqueo, con el detalle de qué cajero la operó, y un consolidado del día con todas las cajas." },
  { q: "¿Sirve si vendo por kilo?", a: "Sí. Podés vender por unidad o por peso, y escanear las etiquetas que imprime la balanza." },
  { q: "¿Emite factura electrónica?", a: "Sí. Factura electrónica de ARCA (ex AFIP): Factura C para monotributistas y Factura A y B para responsables inscriptos, con notas de crédito y QR, directo desde el punto de venta. También cobrás con QR de Mercado Pago." },
  { q: "¿Cuánto cuesta?", a: `Probás gratis ${TRIAL_DAYS} días, sin tarjeta. Después, el plan Básico cuesta $20.000 por mes con una caja, y el plan Pro $40.000 por mes con cajas extra a $10.000 cada una. Se paga mes a mes con Mercado Pago y podés dejar de usarlo cuando quieras.` },
  { q: "¿Mis datos están seguros?", a: "Cada comercio tiene sus datos aislados, con copias de seguridad diarias. Podés descargar toda tu información en Excel cuando quieras: los datos son tuyos." },
];
