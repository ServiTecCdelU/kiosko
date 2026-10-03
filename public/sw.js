// public/sw.js — service worker minimo, servido tal cual (sin build step ni next.config.mjs).
// Objetivo: que la app (shell + assets ya visitados) siga cargando sin internet.
// Las ventas offline NO pasan por aca: se manejan en IndexedDB desde la app (lib/offline).
//
// En produccion la app vive bajo un basePath (/comercio): todas las rutas se
// arman a partir del scope con el que se registro el SW (BASE), nunca con "/".
const CACHE_NAME = "kiosko-shell-v5";
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, ""); // "" o "/comercio"

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

function guardar(request, res) {
  if (res && res.ok) {
    const copia = res.clone();
    caches.open(CACHE_NAME).then((c) => c.put(request, copia));
  }
  return res;
}

/** Red primero; sin red, lo ultimo guardado (o el respaldo indicado). */
function redPrimero(request, respaldo) {
  return fetch(request)
    .then((res) => guardar(request, res))
    .catch(() =>
      caches.match(request).then((cached) => cached || (respaldo ? caches.match(respaldo) : undefined)).then(
        // Nunca resolver respondWith() con undefined: el navegador rompe la pagina.
        (r) => r || new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }),
      ),
    );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // En desarrollo los archivos cambian con el mismo nombre: cachearlos muestra codigo viejo.
  if (self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1") return;
  if (request.method !== "GET") return; // ventas/ajustes van directo a la red o a la cola offline
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // no cachear Supabase ni terceros
  // La API siempre va a la red: cachearla serviria datos viejos (ventas, caja, stock).
  if (url.pathname.startsWith(`${BASE}/api/`)) return;

  // Navegacion (cambio de pantalla): red primero; sin conexion, la ultima copia
  // de esa pantalla o, si nunca se abrio, el punto de venta.
  if (request.mode === "navigate") {
    event.respondWith(redPrimero(request, `${BASE}/pos`));
    return;
  }

  // Navegacion interna de Next (RSC): red primero. Cache primero aca dejaria
  // pantallas de un deploy viejo apuntando a archivos que ya no existen.
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) {
    event.respondWith(redPrimero(request));
    return;
  }

  // Assets estaticos (_next/static, imagenes, fuentes): cache primero, se completa en segundo plano.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        fetch(request).then((res) => guardar(request, res)).catch(() => {});
        return cached;
      }
      return fetch(request).then((res) => guardar(request, res));
    }),
  );
});
