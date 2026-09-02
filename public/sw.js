// public/sw.js — service worker minimo, servido tal cual (sin build step ni next.config.mjs).
// Objetivo: que la app (shell + assets ya visitados) siga cargando sin internet.
// Las ventas offline NO pasan por acá: se manejan en IndexedDB desde la app (lib/offline).
const CACHE_NAME = "kiosko-shell-v3";

self.addEventListener("install", (event) => {
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

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // ventas/ajustes van directo a la red o a la cola offline
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // no cachear Supabase ni terceros
  if (url.pathname.startsWith("/api/")) return; // la API siempre va a la red: cachearla sirve datos viejos

  // Navegacion (cambio de pantalla): red primero, cache como respaldo si no hay conexion.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // El clon se saca ANTES de devolver la respuesta: si se hace dentro del
          // then() de caches.open, la pagina ya consumio el body y clone() explota.
          const copia = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copia));
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/pos"))),
    );
    return;
  }

  // Assets estaticos (_next/static, imagenes, fuentes): cache primero, se completa en segundo plano.
  // OJO: nunca resolver respondWith() con `undefined` (si no hay cache y la red
  // falla) — el navegador tira "Failed to convert value to 'Response'" y deja
  // la pagina con chunks a medio cargar, lo que después revienta React con el
  // error #130 (componente inválido) en la navegación siguiente.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        fetch(request)
          .then((res) => {
            if (res.ok) caches.open(CACHE_NAME).then((c) => c.put(request, res.clone()));
          })
          .catch(() => {});
        return cached;
      }
      return fetch(request).then((res) => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copia));
        }
        return res;
      });
    }),
  );
});
