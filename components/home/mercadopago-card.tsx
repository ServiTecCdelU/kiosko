"use client";

// components/home/mercadopago-card.tsx — el admin conecta la cuenta de Mercado
// Pago del comercio: los cobros con QR y con lector Point entran a ESA cuenta.
// El token se pega una vez, se valida y se guarda cifrado; despues solo se ven
// sus ultimos 4 caracteres.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, CreditCard, Loader2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { conectarMP, desconectarMP, getConexionMP, type ConexionMP } from "@/services/mercadopago-service";
import { AvisoVersionPaga, useEsDemo } from "@/components/home/aviso-version-paga";

export function MercadoPagoCard() {
  // En la demo no se piden credenciales reales: se muestra la version paga.
  if (useEsDemo()) {
    return (
      <AvisoVersionPaga
        id="mercado-pago"
        icono={CreditCard}
        titulo="Cobros con Mercado Pago"
        descripcion="Cobrá con QR y con lector Point, y la plata entra directo a tu cuenta."
      />
    );
  }
  return <ConexionMercadoPago />;
}

function ConexionMercadoPago() {
  const [conexion, setConexion] = useState<ConexionMP | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setConexion(await getConexionMP());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo consultar Mercado Pago");
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <section id="mercado-pago" className="card-premium scroll-mt-6 rounded-2xl p-5" aria-labelledby="mp-titulo">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <CreditCard className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="mp-titulo" className="font-semibold text-foreground">Cobros con Mercado Pago</h3>
            {conexion?.conectado && <EstadoBadge sandbox={conexion.sandbox} />}
          </div>

          {error ? (
            <p className="mt-1 text-sm text-destructive">{error}</p>
          ) : !conexion ? (
            <Skeleton className="mt-2 h-10 w-full rounded-xl" />
          ) : conexion.conectado && !editando ? (
            <Conectado conexion={conexion} onCambiar={() => setEditando(true)} onDesconectado={cargar} />
          ) : (
            <FormularioToken
              cambiando={conexion.conectado}
              onCancelar={conexion.conectado ? () => setEditando(false) : undefined}
              onConectado={(c) => {
                setConexion(c);
                setEditando(false);
              }}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function EstadoBadge({ sandbox }: { sandbox: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        sandbox
          ? "border-amber-500 text-amber-700 dark:text-amber-400"
          : "border-emerald-600 text-emerald-700 dark:text-emerald-400",
      )}
    >
      {sandbox ? "Cuenta de prueba" : "Conectado"}
    </Badge>
  );
}

function Conectado({
  conexion, onCambiar, onDesconectado,
}: { conexion: ConexionMP; onCambiar: () => void; onDesconectado: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const [desconectando, setDesconectando] = useState(false);

  const desconectar = async () => {
    setDesconectando(true);
    try {
      await desconectarMP();
      toast.success("Mercado Pago desconectado");
      onDesconectado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo desconectar");
    } finally {
      setDesconectando(false);
      setConfirmando(false);
    }
  };

  return (
    <div className="mt-1 space-y-3">
      <p className="text-sm text-muted-foreground">
        Los cobros con QR y con lector Point entran a tu cuenta
        {conexion.cuentaId ? <> (N° {conexion.cuentaId})</> : null}. Token terminado en{" "}
        <span className="font-mono font-semibold text-foreground">···{conexion.tokenFinal}</span>
        {conexion.conectadoAt ? <>, conectado el {new Date(conexion.conectadoAt).toLocaleDateString("es-AR")}</> : null}.
      </p>
      {conexion.sandbox && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Es un token de prueba: los pagos no mueven plata real.
        </p>
      )}

      {conexion.webhookUrl && <WebhookUrl url={conexion.webhookUrl} />}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="rounded-xl" onClick={onCambiar}>
          Cambiar token
        </Button>
        {confirmando ? (
          <>
            <Button size="sm" variant="destructive" className="rounded-xl" onClick={desconectar} disabled={desconectando}>
              {desconectando && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Sí, desconectar
            </Button>
            <Button size="sm" variant="ghost" className="rounded-xl" onClick={() => setConfirmando(false)} disabled={desconectando}>
              No
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" className="rounded-xl text-muted-foreground" onClick={() => setConfirmando(true)}>
            <Unplug className="mr-1 h-3.5 w-3.5" /> Desconectar
          </Button>
        )}
      </div>
      {confirmando && (
        <p className="text-xs text-muted-foreground">El POS no va a poder cobrar con Mercado Pago hasta que lo vuelvas a conectar.</p>
      )}
    </div>
  );
}

function WebhookUrl({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("No se pudo copiar: seleccioná la URL a mano");
    }
  };

  return (
    <div className="rounded-xl bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">
        ¿Usás lector Point? Pegá esta URL en tu cuenta de Mercado Pago → Tus integraciones → Webhooks (evento “Pagos”):
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate text-xs">{url}</code>
        <Button size="sm" variant="ghost" className="h-7 shrink-0 rounded-lg px-2" onClick={copiar} aria-label="Copiar URL del webhook">
          {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function FormularioToken({
  cambiando, onCancelar, onConectado,
}: { cambiando: boolean; onCancelar?: () => void; onConectado: (c: ConexionMP) => void }) {
  const [token, setToken] = useState("");
  const [guardando, setGuardando] = useState(false);

  const conectar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const c = await conectarMP(token);
      setToken("");
      toast.success(c.sandbox ? "Conectado con token de prueba" : "Mercado Pago conectado");
      onConectado(c);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo conectar");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={conectar} className="mt-1 space-y-3">
      <p className="text-sm text-muted-foreground">
        {cambiando
          ? "Pegá el nuevo Access Token. El anterior se reemplaza."
          : "Conectá tu cuenta para cobrar con QR y con lector Point. La plata entra directo a tu cuenta."}{" "}
        Lo encontrás en Mercado Pago Developers → Tus integraciones → tu aplicación → Credenciales de producción → <b>Access Token</b>.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="APP_USR-..."
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="rounded-xl font-mono"
          aria-label="Access Token de Mercado Pago"
        />
        <div className="flex gap-2">
          <Button type="submit" className="rounded-xl" disabled={guardando || !token.trim()}>
            {guardando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Conectar
          </Button>
          {onCancelar && (
            <Button type="button" variant="ghost" className="rounded-xl" onClick={onCancelar} disabled={guardando}>
              Cancelar
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Se guarda cifrado. Después solo se muestran los últimos 4 caracteres.</p>
    </form>
  );
}
