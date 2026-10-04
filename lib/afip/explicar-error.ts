// lib/afip/explicar-error.ts — errores de ARCA explicados en criollo, con el
// paso del tutorial (components/facturacion/tutorial) donde se arregla.
// Puro, testeado. Los textos de ARCA cambian: si uno no matchea, se muestra crudo.

export type PasoTutorial = "ambiente" | "datos" | "pedido" | "certificado" | "autorizar" | "punto-venta" | "probar";

export interface ExplicacionError {
  titulo: string;
  queHacer: string;
  /** Paso al que hay que volver (null = esperar / reintentar). */
  paso: PasoTutorial | null;
}

const REGLAS: { patron: RegExp; explicacion: ExplicacionError }[] = [
  {
    patron: /notAuthorized|no autorizado|Administrador de Relaciones|Computador no autorizado/i,
    explicacion: {
      titulo: "Falta autorizar la facturación electrónica",
      queHacer: "En ARCA tenés que darle permiso a tu certificado para el servicio “Facturación Electrónica”. Es el paso “Autorizar”.",
      paso: "autorizar",
    },
  },
  {
    patron: /vencid|expired|notYetValid/i,
    explicacion: {
      titulo: "El certificado está vencido",
      queHacer: "Generá un pedido nuevo y sacá un certificado nuevo en ARCA (pasos “Pedido” y “Certificado”).",
      paso: "pedido",
    },
  },
  {
    patron: /\b601\b|CUIT representada|otra CUIT/i,
    explicacion: {
      titulo: "El certificado es de otra CUIT",
      queHacer: "Revisá que la CUIT de tus datos fiscales sea la misma con la que entraste a ARCA y sacá el certificado de nuevo.",
      paso: "datos",
    },
  },
  {
    patron: /Certificado bloqueado|untrusted|no emitido por|AC de confianza|rechaz[oó] el certificado/i,
    explicacion: {
      titulo: "ARCA no reconoce el certificado",
      queHacer: "Casi siempre es porque el certificado es del otro ambiente: para Pruebas se saca en “WSASS” y para Facturas reales en “Administración de Certificados Digitales”. Sacalo en el lugar correcto y subilo de nuevo.",
      paso: "certificado",
    },
  },
  {
    patron: /\b11002\b|punto de venta no se encuentra habilitado|punto de venta.*no.*habilitado/i,
    explicacion: {
      titulo: "El punto de venta no está habilitado",
      queHacer: "En ARCA, el punto de venta tiene que estar dado de alta como “Factura Electrónica - Monotributo - Web Services”. Revisá el número o dalo de alta.",
      paso: "punto-venta",
    },
  },
  {
    patron: /Falta el certificado|Completá la configuración/i,
    explicacion: {
      titulo: "Falta completar un paso",
      queHacer: "Todavía no subiste el certificado o no cargaste el punto de venta.",
      paso: "certificado",
    },
  },
  {
    patron: /no está respondiendo|No se pudo conectar|servidores con problemas|timeout|ya entregó un acceso/i,
    explicacion: {
      titulo: "ARCA no está respondiendo",
      queHacer: "No es un problema tuyo: ARCA está lento o caído. Esperá unos minutos y probá de nuevo.",
      paso: null,
    },
  },
];

export function explicarErrorAfip(mensaje: string): ExplicacionError {
  return (
    REGLAS.find((r) => r.patron.test(mensaje))?.explicacion ?? {
      titulo: "ARCA respondió con un error",
      queHacer: mensaje,
      paso: null,
    }
  );
}
