"use client";

import { useEffect } from "react";
import { apiUrl } from "@/lib/utils/api-url";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    // En produccion la app vive bajo /comercio: el SW esta en /comercio/sw.js y
    // su alcance tiene que ser /comercio/ (registrar "/sw.js" daba 404 y la app
    // nunca funcionaba sin internet).
    const base = apiUrl("/");
    // Despues de load: que el registro del SW no compita con la carga de la pagina.
    const registrar = () => {
      navigator.serviceWorker.register(apiUrl("/sw.js"), { scope: base }).catch(() => {
        // navegador sin soporte o registro bloqueado: la app sigue funcionando online igual
      });
    };
    if (document.readyState === "complete") registrar();
    else window.addEventListener("load", registrar, { once: true });
    return () => window.removeEventListener("load", registrar);
  }, []);

  return null;
}
