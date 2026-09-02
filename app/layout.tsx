import React from "react";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { Toaster } from "sonner";
import "@/app/globals.css";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
});

// NEXT_PUBLIC_APP_URL puede venir sin protocolo (ej: "kiosko-three.vercel.app").
function resolverAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (!raw) return "http://localhost:3000";
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

export const metadata: Metadata = {
  metadataBase: new URL(resolverAppUrl()),
  title: "MultiComercioPanel - ServiTec",
  description: "Tu programa no impone las reglas: Vos no te adaptás a nuestro sistema, nuestro sistema se adapta a vos. La solución de gestión ideal para cualquier rubro.",
  manifest: "/manifest.json",
  openGraph: {
    title: "MultiComercioPanel - ServiTec",
    description: "Vos no te adaptás a nuestro sistema, nuestro sistema se adapta a vos. Gestión integral para cualquier rubro.",
    images: [
      {
        url: "/metadato.jpg",
        width: 1200,
        height: 630,
        alt: "MultiComercioPanel - Se adapta a cualquier rubro",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MultiComercioPanel - ServiTec",
    description: "Vos no te adaptás a nuestro sistema, nuestro sistema se adapta a vos. Se adapta a cualquier rubro.",
    images: ["/metadato.jpg"],
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