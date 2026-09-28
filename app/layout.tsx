import React from "react";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { Toaster } from "sonner";
import "@/app/globals.css";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { IMAGEN_OG, OG_BASE, conBase, siteOrigin } from "@/lib/site";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
});

const TITULO = "MultiComercioPanel - ServiTec";
const DESCRIPCION_OG = "Vos no te adaptás a nuestro sistema, nuestro sistema se adapta a vos. Gestión integral para cualquier rubro.";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: TITULO,
  description: "Tu programa no impone las reglas: Vos no te adaptás a nuestro sistema, nuestro sistema se adapta a vos. La solución de gestión ideal para cualquier rubro.",
  applicationName: "MultiComercioPanel",
  manifest: conBase("/manifest.json"),
  icons: {
    icon: [{ url: conBase("/icons/favicon-32.png"), sizes: "32x32", type: "image/png" }],
    apple: [{ url: conBase("/icons/icon-192.png"), sizes: "192x192", type: "image/png" }],
  },
  alternates: { canonical: conBase("/") || "/" },
  openGraph: {
    ...OG_BASE,
    url: conBase("/") || "/",
    title: TITULO,
    description: DESCRIPCION_OG,
  },
  twitter: {
    card: "summary_large_image",
    title: TITULO,
    description: "Vos no te adaptás a nuestro sistema, nuestro sistema se adapta a vos. Se adapta a cualquier rubro.",
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
      </body>
    </html>
  );
}