import type { Metadata } from "next";
import {
  Geist, Geist_Mono,
  Noto_Sans_Devanagari, Noto_Serif_Devanagari,
  Noto_Serif,
  Hind, Mukta,
  Lora,
  Yatra_One,
} from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/layout/Providers";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoDevanagari = Noto_Sans_Devanagari({
  variable: "--font-noto-devanagari",
  subsets: ["devanagari"],
  weight: ["400", "500", "600", "700"],
});

const notoSerifDevanagari = Noto_Serif_Devanagari({
  variable: "--font-noto-serif-devanagari",
  subsets: ["devanagari"],
  weight: ["400", "600"],
});

const hind = Hind({
  variable: "--font-hind",
  subsets: ["devanagari", "latin"],
  weight: ["400", "500", "600"],
});

const mukta = Mukta({
  variable: "--font-mukta",
  subsets: ["devanagari", "latin"],
  weight: ["400", "600"],
});

const notoSerif = Noto_Serif({
  variable: "--font-noto-serif",
  subsets: ["latin"],
  weight: ["400", "600"],
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  weight: ["400", "600"],
});

// Display font used ONLY for the "Manojalam" logo / branding text.
const yatraOne = Yatra_One({
  variable: "--font-yatra-one",
  subsets: ["latin", "devanagari"],
  weight: "400",
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_TAGLINE,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={[
      geistSans.variable, geistMono.variable,
      notoDevanagari.variable, notoSerifDevanagari.variable,
      hind.variable, mukta.variable,
      notoSerif.variable, lora.variable,
      yatraOne.variable,
      "h-full",
    ].join(" ")}>
      <body className="min-h-full font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
