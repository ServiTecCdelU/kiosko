import React from "react";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { Toaster } from "sonner";
import "@/app/globals.css";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { GoogleTag } from "@/components/analytics/google-tag";
import { IMAGEN_OG, OG_BASE, conBase, siteOrigin } from "@/lib/site";
import { DESCRIPCION_SEO, MARCA, NOMBRE_APP, PALABRAS_CLAVE, TITULO_SEO } from "@/lib/marketing/seo";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
});

// Titulo y descripcion pensados para la busqueda (lib/marketing/seo.ts). Las
// pantallas internas ponen el suyo; el panel de cada comercio, el nombre del comercio.
const DESCRIPCION_OG = "Vos no te adaptás a nuestro sistema, nuestro sistema se adapta a vos. Punto de venta, caja, stock, fiado y factura electrónica para tu comercio.";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: TITULO_SEO,
  description: DESCRIPCION_SEO,
  keywords: PALABRAS_CLAVE,
  applicationName: NOMBRE_APP,
  authors: [{ name: MARCA }],
  creator: MARCA,
  manifest: conBase("/manifest.json"),
  icons: {
    icon: [{ url: conBase("/icons/favicon-32.png"), sizes: "32x32", type: "image/png" }],
    apple: [{ url: conBase("/icons/icon-192.png"), sizes: "192x192", type: "image/png" }],
  },
  alternates: { canonical: conBase("/") || "/" },
  // Search Console: verificacion por etiqueta (si se verifica el dominio por DNS no hace falta).
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : undefined,
  openGraph: {
    ...OG_BASE,
    url: conBase("/") || "/",
    title: `${NOMBRE_APP} - ${MARCA}`,
    description: DESCRIPCION_OG,
  },
  twitter: {
    card: "summary_large_image",
    title: `${NOMBRE_APP} - ${MARCA}`,
    description: DESCRIPCION_OG,
    images: [IMAGEN_OG.url],
  },
};

export const viewport: Viewport = {
  themeColor: "#0d9488",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable}`}
    >
      <body className={`font-sans antialiased`} suppressHydrationWarning>
        {children}
        <Toaster richColors position="top-center" />
        <ServiceWorkerRegister />
        <GoogleTag />
      </body>
    </html>
  );
}
