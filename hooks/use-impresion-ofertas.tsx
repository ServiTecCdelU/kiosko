"use client";
// hooks/use-impresion-ofertas.tsx — imprime carteles y folletos de oferta.
// Devuelve las funciones y el bloque `impresion`, que hay que renderizar una vez en la pantalla.
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { CartelOfertaPrint } from "@/components/stock/cartel-oferta";
import { FolletoOfertasPrint } from "@/components/stock/folleto-ofertas";
import { FORMATOS_CARTEL, type OpcionesCartel } from "@/components/stock/cartel-preferencias";
import { conCartel, imprimirA4, opcionesCartel } from "@/components/stock/impresion-ofertas";
import type { Product } from "@/lib/types";

interface Impresion {
  productos: Product[];
  opciones?: OpcionesCartel;
}

const VACIA: Impresion = { productos: [] };

export function useImpresionOfertas() {
  const [carteles, setCarteles] = useState<Impresion>(VACIA);
  const [folleto, setFolleto] = useState<Impresion>(VACIA);

  // Deja en pantalla solo lo que se va a imprimir
  const limpiar = useCallback(() => {
    setCarteles(VACIA);
    setFolleto(VACIA);
  }, []);

  const imprimirCarteles = useCallback((productos: Product[], o?: Partial<OpcionesCartel>) => {
    const conOferta = productos.filter(conCartel);
    if (conOferta.length === 0) {
      toast.info("Ninguno de los productos seleccionados tiene oferta");
      return;
    }
    limpiar();
    const opciones = opcionesCartel(o);
    setCarteles({ productos: conOferta, opciones });
    const pagina = FORMATOS_CARTEL.find((f) => f.value === opciones.formato)?.page ?? "A4";
    imprimirA4("0", () => setCarteles(VACIA), pagina);
  }, [limpiar]);

  const imprimirFolleto = useCallback((productos: Product[], o?: Partial<OpcionesCartel>) => {
    if (productos.length === 0) return;
    limpiar();
    setFolleto({ productos, opciones: opcionesCartel(o) });
    imprimirA4("10mm", () => setFolleto(VACIA));
  }, [limpiar]);

  const impresion = (
    <>
      <CartelOfertaPrint
        productos={carteles.productos}
        comercio={carteles.opciones?.comercio}
        formato={carteles.opciones?.formato}
        tema={carteles.opciones?.tema}
      />
      <FolletoOfertasPrint productos={folleto.productos} comercio={folleto.opciones?.comercio} tema={folleto.opciones?.tema} />
    </>
  );

  return { imprimirCarteles, imprimirFolleto, limpiar, impresion };
}
