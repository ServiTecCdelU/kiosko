"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { UserCog, UserPlus } from "lucide-react";
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
import type { Usuario } from "@/lib/types";

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Usuario | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

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
          nombre: input.nombre, rol: input.rol, activo: input.activo, pin: input.pin,
        });
        toast.success("Usuario actualizado");
      } else {
        await crearUsuario({ nombre: input.nombre, rol: input.rol, pin: input.pin ?? "" });
        toast.success("Usuario creado");
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar el usuario");
      throw e;
    }
  };

  return (
    <AppShell title="Usuarios">
      <div className="mb-4 flex items-center justify-end">
        <Button className="rounded-2xl" onClick={openNuevo}>
          <UserPlus className="mr-2 h-4 w-4" /> Nuevo usuario
        </Button>
      </div>

      <div className="rounded-2xl border bg-card">
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
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.nombre}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn(u.rol === "admin" && "border-primary text-primary")}>
                      {u.rol === "admin" ? "Administrador" : "Cajero"}
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
