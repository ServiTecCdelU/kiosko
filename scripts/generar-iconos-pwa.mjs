// scripts/generar-iconos-pwa.mjs — genera los iconos de la PWA a partir de un
// SVG de marca (teal, identidad "Mostrador" del plan de producto). Se corre
// una sola vez a mano: `node scripts/generar-iconos-pwa.mjs`. No es parte del
// build ni de next.config.mjs; los PNG resultantes se commitean en public/icons.
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

// Bolsa de compras simplificada, trazo blanco sobre fondo teal — legible a 48px.
function svgIcono({ size, padding }) {
  const s = size;
  const p = padding;
  const inner = s - p * 2;
  return `
<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="${s}" y2="${s}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0f766e"/>
      <stop offset="1" stop-color="#0d9488"/>
    </linearGradient>
  </defs>
  <rect width="${s}" height="${s}" fill="url(#bg)"/>
  <g transform="translate(${p},${p})" stroke="#ffffff" stroke-width="${inner * 0.055}" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M ${inner * 0.18} ${inner * 0.32} L ${inner * 0.82} ${inner * 0.32} L ${inner * 0.76} ${inner * 0.86} L ${inner * 0.24} ${inner * 0.86} Z" fill="#ffffff" fill-opacity="0.12"/>
    <path d="M ${inner * 0.18} ${inner * 0.32} L ${inner * 0.82} ${inner * 0.32} L ${inner * 0.76} ${inner * 0.86} L ${inner * 0.24} ${inner * 0.86} Z"/>
    <path d="M ${inner * 0.34} ${inner * 0.36} V ${inner * 0.24} C ${inner * 0.34} ${inner * 0.12}, ${inner * 0.66} ${inner * 0.12}, ${inner * 0.66} ${inner * 0.24} V ${inner * 0.36}"/>
    <line x1="${inner * 0.32}" y1="${inner * 0.55}" x2="${inner * 0.68}" y2="${inner * 0.55}"/>
  </g>
</svg>`.trim();
}

const targets = [
  { file: "icon-192.png", size: 192, padding: 192 * 0.14, purpose: "any" },
  { file: "icon-512.png", size: 512, padding: 512 * 0.14, purpose: "any" },
  // Maskable: mas margen, el SO recorta con su propia mascara (circulo/squircle).
  { file: "icon-maskable-192.png", size: 192, padding: 192 * 0.22, purpose: "maskable" },
  { file: "icon-maskable-512.png", size: 512, padding: 512 * 0.22, purpose: "maskable" },
];

for (const t of targets) {
  const svg = svgIcono({ size: t.size, padding: t.padding });
  await sharp(Buffer.from(svg)).png().toFile(join(outDir, t.file));
  console.log(`✓ ${t.file}`);
}

// Favicon simple (mismo arte, 32px) para app/icon.png si Next lo pide.
await sharp(Buffer.from(svgIcono({ size: 32, padding: 32 * 0.14 })))
  .png()
  .toFile(join(outDir, "favicon-32.png"));
console.log("✓ favicon-32.png");

writeFileSync(join(outDir, "README.md"),
  "Iconos generados por scripts/generar-iconos-pwa.mjs. No editar a mano; regenerar corriendo el script.\n");

console.log("Listo.");
