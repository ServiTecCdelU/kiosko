// lib/afip/xml.ts — lo minimo de XML para hablar con los web services de AFIP.
// Las respuestas son chicas y de estructura fija: alcanza con buscar etiquetas,
// sin sumar una libreria de XML. Ignora prefijos de namespace (soap:, ns1:...).

const ENTIDADES: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&amp;": "&" };

export function escaparXml(texto: string | number): string {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function desescaparXml(texto: string): string {
  return texto
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&(lt|gt|quot|apos|amp);/g, (e) => ENTIDADES[e]);
}

function patron(etiqueta: string, global: boolean): RegExp {
  return new RegExp(`<(?:[\\w.-]+:)?${etiqueta}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${etiqueta}>`, global ? "g" : "");
}

/** Contenido (desescapado) de la primera <etiqueta>, o null. */
export function extraer(xml: string, etiqueta: string): string | null {
  const m = patron(etiqueta, false).exec(xml);
  return m ? desescaparXml(m[1].trim()) : null;
}

/** Contenido CRUDO de cada <etiqueta> (para seguir buscando adentro). */
export function bloques(xml: string, etiqueta: string): string[] {
  return [...xml.matchAll(patron(etiqueta, true))].map((m) => m[1]);
}
