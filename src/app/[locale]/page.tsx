import { getLocale, getTranslations } from "next-intl/server";

import { currentAccount } from "@/lib/session";
import { EcranSortir } from "./sortir/ecran-sortir";
import { SchemaJsonLd } from "./ui";

/**
 * L'accueil public, c'est « Nous sortons ».
 *
 * Il y a eu ici une page de présentation, longue, close par une case « ne plus
 * afficher ». Depuis que /comment et /a-propos racontent le produit, elle faisait
 * double emploi, et la case était une porte de plus entre un parent et l'écran. Ce qui
 * distingue Allezou d'un agenda, c'est qu'on y annonce une sortie : c'est donc cet écran
 * qu'on montre en premier, tel qu'il est, lieux et carte compris. Confirmer sans compte
 * mène à la connexion, qui ramène ici (décision du 7 septembre 2026).
 *
 * Qui est connecté voit le même écran avec ses cercles, ses enfants et ses favoris.
 */
export async function generateMetadata() {
  const [t, locale] = await Promise.all([getTranslations("Metadata"), getLocale()]);
  const prefixe = locale === "fr" ? "" : `/${locale}`;
  return {
    description: t("promesse"),
    alternates: { canonical: `https://allezou.ch${prefixe}` },
  };
}

export default async function Accueil() {
  const account = await currentAccount();

  // Schema.org : deux briques sur la home.
  // - Organization : qui est derrière Allezou (Knowledge panel Google,
  //   AI Overview brand card, E-E-A-T).
  // - WebSite : le site lui-même, avec un SearchAction potentiel (la
  //   sitelinks searchbox Google lit cette brique). On ne déclare pas
  //   d'action de recherche spécifique tant qu'Allezou n'a pas de
  //   moteur de recherche interne.
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Allezou",
    alternateName: "Allezou.ch",
    url: "https://allezou.ch/",
    logo: "https://allezou.ch/icon",
    description:
      "Pour que nos enfants se retrouvent dehors. Sorties partagées et agenda des familles genevoises.",
    foundingDate: "2026",
    foundingLocation: { "@type": "Place", name: "Genève, Suisse" },
    areaServed: { "@type": "AdministrativeArea", name: "Canton de Genève" },
    email: "contact@allezou.ch",
    sameAs: [],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "contact@allezou.ch",
      availableLanguage: ["French", "English", "Spanish", "Portuguese", "Albanian"],
    },
  };

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Allezou",
    url: "https://allezou.ch/",
    inLanguage: ["fr-CH", "en", "es", "pt", "sq"],
    publisher: { "@type": "Organization", name: "Allezou" },
  };

  return (
    <>
      <SchemaJsonLd donnees={organization} />
      <SchemaJsonLd donnees={website} />
      <EcranSortir account={account} />
    </>
  );
}
