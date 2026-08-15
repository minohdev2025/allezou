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

/**
 * Ce que voit quelqu'un qui n'a pas encore ouvert l'application : l'onglet de son navigateur,
 * et l'aperçu quand le lien circule par message.
 *
 * `metadataBase` n'est pas une formalité : sans elle, l'adresse de l'image d'aperçu reste
 * relative, et WhatsApp ne sait pas la résoudre. L'image elle-même vient de
 * `opengraph-image.tsx`, que Next rattache tout seul.
 */
const ADRESSE = process.env.APP_URL ?? "http://localhost:3000";
const PROMESSE =
  "Savoir qui est dehors, parmi les gens qu'on connaît déjà. " +
  "Sorties partagées et agenda des familles genevoises.";

export const metadata: Metadata = {
  metadataBase: new URL(ADRESSE),
  // Le gabarit évite de répéter le nom du site dans chaque page, et de l'oublier dans une.
  title: { default: "Allezou", template: "%s · Allezou" },
  description: PROMESSE,
  applicationName: "Allezou",
  openGraph: {
    type: "website",
    locale: "fr_CH",
    siteName: "Allezou",
    title: "Allezou",
    description: PROMESSE,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Allezou",
    description: PROMESSE,
  },
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
