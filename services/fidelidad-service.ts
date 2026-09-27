// services/fidelidad-service.ts — premio por compras y sorteos (via /api/fidelidad).
import { consultar } from "@/services/api-client";

const RUTA = "/api/fidelidad";

export interface ConfigCompras {
  activo: boolean;
  comprasMeta: number;
  montoMinimo: number;
  premio: string;
  desde?: string;
}

export interface ProgresoCliente {
  clienteId: string;
  nombre: string;
  telefono?: string;
  comprasValidas: number;
  premiosPendientes: number;
  comprasEnCiclo: number;
  comprasMeta: number;
}

export type EstadoSorteo = "abierto" | "sorteado" | "cancelado";

export interface Sorteo {
  id: string;
  nombre: string;
  premio: string;
  desde: string;
  hasta: string;
  montoPorChance: number;
  estado: EstadoSorteo;
  ganadorNombre?: string;
  chancesTotal?: number;
  sorteadoAt?: Date;
}

export interface Participante {
  clienteId: string;
  nombre: string;
  telefono?: string;
  compras: number;
  chances: number;
}

export interface Ganador {
  clienteId: string;
  nombre: string;
  telefono?: string;
  chancesTotal: number;
}

export const CONFIG_INICIAL: ConfigCompras = { activo: false, comprasMeta: 5, montoMinimo: 0, premio: "" };

function mapConfig(d: Record<string, any> | null): ConfigCompras {
  if (!d) return CONFIG_INICIAL;
  return {
    activo: !!d.activo,
    comprasMeta: Number(d.compras_meta) || 5,
    montoMinimo: Number(d.monto_minimo) || 0,
    premio: d.premio ?? "",
    desde: d.desde ?? undefined,
  };
}

function mapSorteo(d: Record<string, any>): Sorteo {
  return {
    id: d.id,
    nombre: d.nombre,
    premio: d.premio,
    desde: d.desde,
    hasta: d.hasta,
    montoPorChance: Number(d.monto_por_chance) || 0,
    estado: d.estado,
    ganadorNombre: d.ganador_nombre ?? undefined,
    chancesTotal: d.chances_total != null ? Number(d.chances_total) : undefined,
    sorteadoAt: d.sorteado_at ? new Date(d.sorteado_at) : undefined,
  };
}

export async function getConfigCompras(): Promise<ConfigCompras> {
  const { config } = await consultar<{ config: Record<string, any> | null }>(RUTA, "config");
  return mapConfig(config);
}

export async function guardarConfigCompras(c: ConfigCompras): Promise<ConfigCompras> {
  const { config } = await consultar<{ config: Record<string, any> }>(RUTA, "guardarConfig", {
    activo: c.activo, comprasMeta: c.comprasMeta, montoMinimo: c.montoMinimo, premio: c.premio,
  });
  return mapConfig(config);
}

export async function getProgresoCompras(): Promise<ProgresoCliente[]> {
  const { clientes } = await consultar<{ clientes: Record<string, any>[] }>(RUTA, "progreso");
  return clientes.map((c) => ({
    clienteId: c.cliente_id,
    nombre: c.nombre,
    telefono: c.telefono ?? undefined,
    comprasValidas: Number(c.compras_validas) || 0,
    premiosPendientes: Number(c.premios_pendientes) || 0,
    comprasEnCiclo: Number(c.compras_en_ciclo) || 0,
    comprasMeta: Number(c.compras_meta) || 5,
  }));
}

export async function canjearPremioCompras(clienteId: string): Promise<void> {
  await consultar(RUTA, "canjearPremio", { clienteId });
}

export async function getSorteos(): Promise<Sorteo[]> {
  const { sorteos } = await consultar<{ sorteos: Record<string, any>[] }>(RUTA, "sorteos");
  return sorteos.map(mapSorteo);
}

export interface NuevoSorteo {
  nombre: string;
  premio: string;
  desde: string;
  hasta: string;
  montoPorChance: number;
}

export async function crearSorteo(s: NuevoSorteo): Promise<Sorteo> {
  const { sorteo } = await consultar<{ sorteo: Record<string, any> }>(RUTA, "crearSorteo", { ...s });
  return mapSorteo(sorteo);
}

export async function getParticipantes(sorteoId: string): Promise<Participante[]> {
  const { participantes } = await consultar<{ participantes: Record<string, any>[] }>(RUTA, "participantes", { sorteoId });
  return participantes.map((p) => ({
    clienteId: p.cliente_id,
    nombre: p.nombre,
    telefono: p.telefono ?? undefined,
    compras: Number(p.compras) || 0,
    chances: Number(p.chances) || 0,
  }));
}

export async function sortear(sorteoId: string): Promise<Ganador> {
  const d = await consultar<Record<string, any>>(RUTA, "sortear", { sorteoId });
  return {
    clienteId: d.ganador_cliente_id,
    nombre: d.ganador_nombre,
    telefono: d.telefono ?? undefined,
    chancesTotal: Number(d.chances_total) || 0,
  };
}

export async function cancelarSorteo(sorteoId: string): Promise<void> {
  await consultar(RUTA, "cancelarSorteo", { sorteoId });
}
