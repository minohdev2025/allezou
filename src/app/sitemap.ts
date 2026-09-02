import type { MetadataRoute } from "next";

import { routing } from "@/i18n/routing";

/**
 * Le plan de site, généré pour que les moteurs et les LLM puissent découvrir
 * chaque URL sans avoir à crawler le site entier.
 *
 * Onze pages publiques existent sur Allezou, en cinq langues : trois par
 * locale (accueil, données, questions). Le reste (compte, agenda, sortie…)
 * renvoie vers `/connexion` ou est strictement personnel, et `robots.txt`
 * les bloque déjà — on ne les liste pas ici.
 *
 * `lastmod` est posé à la date du jour pour signaler aux moteurs que le
 * sitemap est vivant sans mensonge : ce n'est pas la date de modification
 * réelle de chaque page, mais elle évolue à chaque déploiement, et
 * Google accepte cette approximation tant qu'elle est monotonement
 * croissante.
 *
 * Chaque URL porte ses variantes `<xhtml:link rel="alternate" hreflang="…">`
 * : c'est la forme recommandée par Google pour signaler les langues
 * soeurs sans dupliquer le sitemap.
 */

const PAGE_PUBLIQUES = [
  "",
  "/donnees",
  "/questions",
  "/a-propos",
  "/comment",
] as const;

const LOCALES = routing.locales;

export default function sitemap(): MetadataRoute.Sitemap {
  const origine = "https://allezou.ch";
  const aujourdHui = new Date();

  return PAGE_PUBLIQUES.flatMap((chemin) =>
    LOCALES.map((locale) => {
      const sansPrefixe = locale === routing.defaultLocale;
      const url = sansPrefixe ? `${origine}${chemin || "/"}` : `${origine}/${locale}${chemin}`;

      const langues = Object.fromEntries(
        LOCALES.map((l) => {
          const memeLocale = l === routing.defaultLocale;
          const variante = `${memeLocale ? origine : `${origine}/${l}`}${chemin || "/"}`;
          return [l, variante];
        }),
      );
      // x-default pointe vers la version française (langue du marché principal).
      langues["x-default"] = `${origine}${chemin || "/"}`;

      return {
        url,
        lastModified: aujourdHui,
        changeFrequency: "weekly",
        priority: chemin === "" ? 1 : 0.6,
        alternates: { languages: langues },
      };
    }),
  );
}
