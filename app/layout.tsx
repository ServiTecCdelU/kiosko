import React from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { Toaster } from "sonner";
import "@/app/globals.css";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  title: "Kiosko Despensa - Punto de Venta",
  description: "Sistema de punto de venta para kiosko y despensa",
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
      </body>
    </html>
  );
}
