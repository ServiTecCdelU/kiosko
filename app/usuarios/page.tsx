"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { KeyRound, Laptop, MonitorX, UserCog, UserPlus } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  getUsuarios, crearUsuario, actualizarUsuario,
} from "@/services/usuarios-service";
import { UsuarioDialog, type UsuarioDialogInput } from "@/components/usuarios/usuario-dialog";
import { listarPcs, type PcRegistrada } from "@/services/dispositivo-service";
import { LARGO_PIN } from "@/lib/pin";
import type { Usuario } from "@/lib/types";

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Usuario | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  // PCs donde los empleados pueden entrar con PIN (null = cargando o sin datos).
  const [pcs, setPcs] = useState<PcRegistrada[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsuarios(await getUsuarios());
    } catch {
      toast.error("No se pudo cargar la lista de usuarios");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    listarPcs().then(setPcs).catch(() => setPcs(null));
  }, [load]);

  const openNuevo = () => {
    setSelected(null);
    setDialogOpen(true);
  };

  const openEditar = (u: Usuario) => {
    setSelected(u);
    setDialogOpen(true);
  };

  const handleSave = async (input: UsuarioDialogInput) => {
    try {
      if (selected) {
        await actualizarUsuario(selected.id, {
          nombre: input.nombre, rol: input.rol, activo: input.activo,
          email: input.email, telefono: input.telefono, pin: input.pin,
        });
        toast.success("Empleado actualizado");
      } else {
        await crearUsuario({
          nombre: input.nombre, rol: input.rol,
          email: input.email, telefono: input.telefono, pin: input.pin,
        });
        toast.success("Empleado creado", {
          description: input.rol === "admin"
            ? "Entra con su cuenta de Google."
            : `Entra en una PC registrada: "Soy empleado" y su PIN de ${LARGO_PIN} números.`,
        });
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar el empleado");
      throw e;
    }
  };

  return (
    <AppShell title="Empleados">
      <div className="mb-4 flex items-center justify-end">
        <Button className="rounded-2xl" onClick={openNuevo}>
          <UserPlus className="mr-2 h-4 w-4" /> Nuevo empleado
        </Button>
      </div>

      <ComoEntra pcs={pcs} />

      <div className="card-premium rounded-2xl">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : usuarios.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Sin usuarios</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="hidden sm:table-cell">Contacto</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.nombre}</TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                    {u.email || u.telefono || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn(
                      u.rol === "admin" && "border-primary text-primary",
                      u.rol === "encargado" && "border-cyan-600 text-cyan-700 dark:text-cyan-400",
                    )}>
                      {u.rol === "admin" ? "Administrador" : u.rol === "encargado" ? "Encargado" : "Cajero"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn(!u.activo && "border-destructive text-destructive")}>
                      {u.activo ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" className="rounded-xl" onClick={() => openEditar(u)}>
                      <UserCog className="mr-1 h-3.5 w-3.5" /> Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <UsuarioDialog usuario={selected} open={dialogOpen} onOpenChange={setDialogOpen} onSave={handleSave} />
    </AppShell>
  );
}

/** Guia para el dueño: como entra un cajero/encargado a su cuenta. */
function ComoEntra({ pcs }: { pcs: PcRegistrada[] | null }) {
  const sinPcs = pcs !== null && pcs.length === 0;
  return (
    <div className="card-premium mb-4 rounded-2xl p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <KeyRound className="h-4 w-4 text-primary" /> ¿Cómo entra un cajero o encargado?
      </p>
      <ol className="space-y-2 text-sm text-muted-foreground">
        <li>
          <b className="text-foreground">1. Creá el empleado</b> acá con un PIN de {LARGO_PIN} números y pasáselo en
          persona. Cada empleado tiene su propio PIN: las ventas y la caja quedan a su nombre.
        </li>
        <li>
          <b className="text-foreground">2. Registrá la PC de la caja (una sola vez).</b> En esa computadora entrá vos
          con Google y andá a <b className="text-foreground">Caja → PCs… → Registrar esta PC</b>. El PIN solo funciona
          en PCs registradas: así nadie puede entrar desde otro lugar.
        </li>
        <li>
          <b className="text-foreground">3. Cerrá tu sesión.</b> En esa PC el empleado toca{" "}
          <b className="text-foreground">Soy empleado</b>, pone su PIN y entra directo al Punto de Venta de esa caja.
        </li>
      </ol>
      {pcs !== null && (
        <div className={cn(
          "mt-3 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs",
          sinPcs ? "border-warning/40 bg-warning/10" : "bg-muted/40",
        )}>
          {sinPcs ? <MonitorX className="h-4 w-4 text-warning" /> : <Laptop className="h-4 w-4 text-primary" />}
          <span className="flex-1">
            {sinPcs
              ? "Todavía no registraste ninguna PC: los empleados no van a poder entrar."
              : `PCs registradas: ${pcs.map((p) => `${p.nombre} (${p.puestoNombre})`).join(", ")}`}
          </span>
          <Link href="/caja" className="font-medium text-primary hover:underline">Ir a Caja</Link>
        </div>
      )}
    </div>
  );
}
