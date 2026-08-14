import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";

import "./globals.css";

/**
 * Les polices sont téléchargées au moment du build et servies depuis notre serveur.
 * Le téléphone d'un parent n'appelle jamais Google : aucune donnée ne part chez un tiers.
 */
const titre = Fredoka({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-titre",
});

const texte = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-texte",
});

export const metadata: Metadata = {
  title: "Allezou",
  description: "Savoir qui est dehors, parmi les gens qu'on connaît déjà.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fffcf5",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${titre.variable} ${texte.variable}`}>
      <body className="min-h-dvh">
        <div className="mx-auto w-full max-w-lg px-5 pb-28 pt-8">{children}</div>
      </body>
    </html>
  );
}
