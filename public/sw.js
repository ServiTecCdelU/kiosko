// public/sw.js — service worker minimo, servido tal cual (sin build step ni next.config.mjs).
// Objetivo: que la app (shell + assets ya visitados) siga cargando sin internet.
// Las ventas offline NO pasan por acá: se manejan en IndexedDB desde la app (lib/offline).
const CACHE_NAME = "kiosko-shell-v1";

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

  // Navegacion (cambio de pantalla): red primero, cache como respaldo si no hay conexion.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          caches.open(CACHE_NAME).then((c) => c.put(request, res.clone()));
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/pos"))),
    );
    return;
  }

  // Assets estaticos (_next/static, imagenes, fuentes): cache primero, se completa en segundo plano.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) caches.open(CACHE_NAME).then((c) => c.put(request, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
