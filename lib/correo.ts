// lib/correo.ts — buscar un correo sin distinguir mayusculas, pero EXACTO.
//
// .ilike() de PostgREST interpreta _ y % como comodines: sin escapar, una
// cuenta de Google "j_hn@empresa.com" coincidiria con el admin
// "john@empresa.com" y entraria a su comercio.

export function patronCorreoExacto(email: string): string {
  return email.replace(/[\\%_]/g, (c) => `\\${c}`);
}
