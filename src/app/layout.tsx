import type { Metadata } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Siya Bill — Restaurant POS & Billing Software for Indian Restaurants",
  description:
    "Siya Bill is a powerful offline Restaurant POS & billing desktop software. GST billing, UPI QR, thermal printer, Khata (Udhar) credit tracking, Kitchen Display, inventory, WhatsApp broadcasts & GST/P&L reports. One-time pricing, works offline.",
  keywords: [
    "restaurant billing software",
    "POS software India",
    "GST billing",
    "restaurant POS",
    "Khata Udhar",
    "kitchen display system",
    "thermal printer billing",
    "UPI QR billing",
    "dhaba billing software",
    "cafe POS",
  ],
  authors: [{ name: "Siya Bill" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Siya Bill — Restaurant POS & Billing Software",
    description:
      "The all-in-one offline billing & POS software for Indian restaurants, dhabas, cafés & cloud kitchens. GST billing, UPI QR, Khata, KDS, inventory & more.",
    siteName: "Siya Bill",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Siya Bill — Restaurant POS & Billing Software",
    description:
      "The all-in-one offline billing & POS software for Indian restaurants, dhabas, cafés & cloud kitchens.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${jakarta.variable} font-sans antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
