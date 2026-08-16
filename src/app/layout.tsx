import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import "./globals.css";

/**
 * Les polices vivent dans le dépôt (src/fonts/, provenance dans son README) et sont servies
 * depuis notre serveur. Le téléphone d'un parent n'appelle jamais Google : aucune donnée ne
 * part chez un tiers. Et le build non plus : quand elles se téléchargeaient au build, une
 * rotation de version chez Google Fonts a suffi à faire tomber un déploiement sur des 404.
 * Un fichier commité ne tombe pas.
 *
 * Chaque fichier est le woff2 variable (sous-ensemble latin, qui couvre tout le français)
 * que Google servait — mêmes glyphes, mêmes graisses, rendu identique.
 */
const titre = localFont({
  src: "../fonts/fredoka-latin.woff2",
  weight: "500 700",
  variable: "--font-titre",
});

const texte = localFont({
  src: "../fonts/nunito-latin.woff2",
  weight: "400 700",
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
  "Pour que nos enfants se retrouvent dehors. " +
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
        {/* pb-2 : le menu collant réserve sa place lui-même, sans marge qui le décollerait. */}
        <div className="mx-auto w-full max-w-lg px-5 pb-2 pt-8">{children}</div>
      </body>
    </html>
  );
}
