"use client";

// /promociones — todo lo que mueve las ventas en un solo lugar: ofertas, recomendaciones
// de qué ofertar, premio por compras y sorteos.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { CentroOfertas } from "@/components/stock/centro-ofertas";
import { RankingOfertas } from "@/components/stock/ranking-ofertas";
import { Recomendaciones } from "@/components/stock/recomendaciones";
import { OfertaDialog } from "@/components/stock/oferta-dialog";
import { EditarProductoDialog } from "@/components/stock/editar-producto-dialog";
import { PremioComprasCard } from "@/components/clientes/premio-compras-card";
import { SorteosCard } from "@/components/clientes/sorteos-card";
import { useAuth, getCurrentUser } from "@/hooks/use-auth";
import { useImpresionOfertas } from "@/hooks/use-impresion-ofertas";
import { hoyArgentinaISO } from "@/lib/oferta-vigencia";
import {
  getCambiosPrecioRecientes, getReposicionPredictiva, getVencimientosProximos, logCambioPrecio, setOferta, updateProduct,
  type CambioPrecioReciente, type ReposicionItem, type SetOfertaInput, type UpdateProductInput,
} from "@/services/products-service";
import { ajustarStock } from "@/services/stock-service";
import type { Product } from "@/lib/types";

const DIAS_VENCIMIENTO = 7;
const DIAS_REPOSICION = 14;
const DIAS_CAMBIO_PRECIO = 7;

export default function PromocionesPage() {
  const router = useRouter();
  const { rol } = useAuth();
  const puedeGestionar = rol === "admin" || rol === "encargado";
  const { imprimirCarteles, imprimirFolleto, impresion } = useImpresionOfertas();

  // Se incrementa al guardar/quitar una oferta para que las listas recarguen
  const [version, setVersion] = useState(0);
  const [vencimientos, setVencimientos] = useState<Product[]>([]);
  const [reposicion, setReposicion] = useState<ReposicionItem[]>([]);
  const [cambiosPrecio, setCambiosPrecio] = useState<CambioPrecioReciente[]>([]);
  const [ofertaProduct, setOfertaProduct] = useState<Product | null>(null);
  const [ofertaOpen, setOfertaOpen] = useState(false);
  const [plantillaInicial, setPlantillaInicial] = useState<string | undefined>();
  const [editando, setEditando] = useState<Product | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // Son datos de apoyo: si una consulta falla, esa recomendacion simplemente no aparece
  const cargar = useCallback(async () => {
    const [ven, rep, cam] = await Promise.allSettled([
      getVencimientosProximos(DIAS_VENCIMIENTO), getReposicionPredictiva(DIAS_REPOSICION), getCambiosPrecioRecientes(DIAS_CAMBIO_PRECIO),
    ]);
    setVencimientos(ven.status === "fulfilled" ? ven.value : []);
    setReposicion(rep.status === "fulfilled" ? rep.value : []);
    setCambiosPrecio(cam.status === "fulfilled" ? cam.value : []);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const openOferta = (p: Product, plantilla?: string) => {
    setPlantillaInicial(plantilla);
    setOfertaProduct(p);
    setOfertaOpen(true);
  };

  const handleOferta = async (oferta: SetOfertaInput) => {
    if (!ofertaProduct) return;
    try {
      await setOferta(ofertaProduct.id, oferta);
      toast.success(oferta.activa ? "Oferta aplicada" : "Oferta quitada");
      setVersion((v) => v + 1);
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar la oferta");
      throw e;
    }
  };

  // Arranca hoy y se apaga sola el dia que vence el producto (si ya vencio, al menos corre hoy).
  const aplicarOfertaVencimiento = async (p: Product, descuento: number) => {
    try {
      const hoy = hoyArgentinaISO();
      const vence = p.fechaVencimiento?.toISOString().slice(0, 10);
      await setOferta(p.id, {
        activa: true, tipo: "porcentaje", valor: descuento,
        desde: hoy, hasta: vence && vence > hoy ? vence : hoy,
      });
      setVersion((v) => v + 1);
      toast.success(`Oferta del ${descuento}% aplicada a ${p.name}`);
      await cargar();
    } catch {
      toast.error("No se pudo aplicar la oferta");
    }
  };

  const guardarProducto = async (input: UpdateProductInput) => {
    if (!editando) return;
    try {
      await updateProduct(editando.id, input);
      if (input.price !== editando.price) {
        await logCambioPrecio(editando.id, "price", editando.price, input.price, getCurrentUser()?.nombre);
      }
      toast.success("Producto actualizado");
      setVersion((v) => v + 1);
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar el producto");
    }
  };

  const ajustar = async (tipo: "entrada" | "ajuste" | "rotura", cantidad: number) => {
    if (!editando) return;
    try {
      const res = await ajustarStock({ productoId: editando.id, tipo, cantidad, usuario: getCurrentUser()?.nombre });
      toast.success(`Stock actualizado: ${res.stockNuevo}`);
      setEditando((p) => (p ? { ...p, stock: res.stockNuevo } : p));
      setVersion((v) => v + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al ajustar");
    }
  };

  return (
    <AppShell title="Promociones">
      <Recomendaciones
        vencimientos={vencimientos}
        reposicion={reposicion}
        cambiosPrecio={cambiosPrecio}
        version={version}
        onCrear={openOferta}
        onAplicarVencimiento={aplicarOfertaVencimiento}
        onEditarOferta={(p) => openOferta(p)}
        onEditarProducto={(p) => { setEditando(p); setEditOpen(true); }}
        onVerCambiosPrecio={() => router.push("/stock#cambios-precio")}
      />

      <CentroOfertas
        version={version}
        onEditar={(p) => openOferta(p)}
        onImprimirCarteles={imprimirCarteles}
        onImprimirFolleto={imprimirFolleto}
        onCambio={() => { setVersion((v) => v + 1); cargar(); }}
      />

      <RankingOfertas version={version} />

      <PremioComprasCard puedeConfigurar={puedeGestionar} />
      <SorteosCard puedeGestionar={puedeGestionar} />

      <OfertaDialog
        product={ofertaProduct}
        open={ofertaOpen}
        onOpenChange={setOfertaOpen}
        onSubmit={handleOferta}
        onImprimirCartel={(p, opciones) => imprimirCarteles([p], opciones)}
        plantillaInicial={plantillaInicial}
      />
      <EditarProductoDialog
        product={editando}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSave={guardarProducto}
        onAjustarStock={ajustar}
      />
      {impresion}
    </AppShell>
  );
}
