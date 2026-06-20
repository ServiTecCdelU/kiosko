"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { searchClientes } from "@/services/clientes-service";
import type { Cliente } from "@/lib/types";

interface ClienteSelectorProps {
  cliente: Cliente | null;
  onSelect: (cliente: Cliente | null) => void;
}

export function ClienteSelector({ cliente, onSelect }: ClienteSelectorProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Cliente[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (cliente) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        setResults(await searchClientes(q));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, cliente]);

  if (cliente) {
    return (
      <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{cliente.nombre}</p>
          <p className="text-xs text-muted-foreground">
            Saldo:{" "}
            <span className={cn("font-semibold", cliente.saldo > 0 ? "text-warning" : "text-foreground")}>
              {formatCurrency(cliente.saldo)}
            </span>
          </p>
        </div>
        <button
          onClick={() => {
            onSelect(null);
            setQuery("");
          }}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Cambiar cliente"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="mb-3 space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar cliente por nombre o teléfono..."
          className="rounded-xl pl-9"
        />
      </div>
      {query.trim().length >= 2 && (
        <div className="max-h-40 overflow-y-auto rounded-xl border">
          {searching ? (
            <p className="py-3 text-center text-xs text-muted-foreground">Buscando...</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-center text-xs text-muted-foreground">
              Sin clientes. Cargalos en la pantalla Clientes.
            </p>
          ) : (
            <ul>
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => onSelect(c)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="truncate">{c.nombre}</span>
                    <span
                      className={cn(
                        "shrink-0 text-xs",
                        c.saldo > 0 ? "font-semibold text-warning" : "text-muted-foreground",
                      )}
                    >
                      {formatCurrency(c.saldo)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
