import type { Metadata, Viewport } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import localFont from "next/font/local";
import { notFound } from "next/navigation";

import { routing, type Locale } from "@/i18n/routing";

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
  src: "../../fonts/fredoka-latin.woff2",
  weight: "500 700",
  variable: "--font-titre",
});

const texte = localFont({
  src: "../../fonts/nunito-latin.woff2",
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

/** Le code OpenGraph de chaque langue — la variante régionale attendue par les aperçus. */
const OG_LOCALES: Record<Locale, string> = {
  fr: "fr_CH",
  en: "en_GB",
  es: "es_ES",
  pt: "pt_PT",
  sq: "sq_AL",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const sure = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  const t = await getTranslations({ locale: sure, namespace: "Metadata" });
  const promesse = t("promesse");

  return {
    metadataBase: new URL(ADRESSE),
    // Le gabarit évite de répéter le nom du site dans chaque page, et de l'oublier dans une.
    title: { default: "Allezou", template: "%s · Allezou" },
    description: promesse,
    applicationName: "Allezou",
    openGraph: {
      type: "website",
      locale: OG_LOCALES[sure],
      siteName: "Allezou",
      title: "Allezou",
      description: promesse,
      url: "/",
    },
    twitter: {
      card: "summary_large_image",
      title: "Allezou",
      description: promesse,
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fffcf5",
};

/** Les cinq langues se construisent d'avance ; une autre valeur est une page inexistante. */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  // Fige la langue de ce rendu pour que les pages statiques le restent.
  setRequestLocale(locale);

  /*
    Seuls ces namespaces voyagent vers le navigateur : ce sont ceux des composants
    "use client". Sans cette liste, le provider embarquerait les 500 chaînes du
    catalogue dans le HTML de chaque page, pour que quelques composants en lisent
    trente. Un composant client qui consulte un namespace absent d'ici le dira
    en clair dans la console de développement (MISSING_MESSAGE).
  */
  const messages = await getMessages();
  const messagesClient = Object.fromEntries(
    ["CleAcces", "NotificationsClient", "ChoixLieu", "Position", "Carte", "Partage", "Etiquettes"]
      .filter((ns) => ns in messages)
      .map((ns) => [ns, messages[ns as keyof typeof messages]]),
  );

  return (
    <html lang={locale} className={`${titre.variable} ${texte.variable}`}>
      <body className="min-h-dvh">
        {/* pb-2 : le menu collant réserve sa place lui-même, sans marge qui le décollerait. */}
        <div className="mx-auto w-full max-w-lg px-5 pb-2 pt-8">
          <NextIntlClientProvider messages={messagesClient}>{children}</NextIntlClientProvider>
        </div>
      </body>
    </html>
  );
}
