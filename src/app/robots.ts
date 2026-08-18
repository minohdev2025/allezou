import type { MetadataRoute } from "next";

import { routing } from "@/i18n/routing";

/**
 * Ce qu'un moteur a le droit d'explorer.
 *
 * Deux pages seulement sont publiques : l'accueil et la page données. Tout le reste renvoie
 * au formulaire de connexion, et rien n'y fuit pour autant. Mais laisser un robot parcourir
 * `/sortie/<identifiant>` et `/rejoindre/<jeton>` n'a aucun intérêt et laisse ces adresses
 * dans des journaux qui ne sont pas les nôtres.
 *
 * On écrit la liste plutôt qu'un `Allow: /$` : l'ancrage de fin de ligne est une extension
 * que tous les robots ne comprennent pas, et un robot qui l'ignore cesserait d'explorer
 * jusqu'à l'accueil.
 *
 * Pas de plan de site : deux pages n'en font pas un.
 */
const PRIVEES = [
  "/connexion",
  "/bienvenue",
  "/maintenant",
  "/sortir",
  "/sortie",
  "/agenda",
  "/cercles",
  "/rejoindre",
  "/lieux",
  "/reglages",
  "/compte",
  "/relecture",
];

export default function robots(): MetadataRoute.Robots {
  // Chaque page privée existe aussi sous son préfixe de langue (/en/connexion…) : une règle
  // par langue, écrite depuis la même liste — deux listes finiraient par diverger.
  const prefixes = routing.locales.filter((l) => l !== routing.defaultLocale);
  return {
    rules: {
      userAgent: "*",
      allow: [
        "/",
        "/donnees",
        "/questions",
        ...prefixes.flatMap((l) => [`/${l}`, `/${l}/donnees`, `/${l}/questions`]),
      ],
      disallow: PRIVEES.flatMap((chemin) => [
        chemin,
        ...prefixes.map((l) => `/${l}${chemin}`),
      ]),
    },
  };
}
