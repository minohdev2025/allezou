import type { MetadataRoute } from "next";

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
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/donnees"],
      disallow: [
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
      ],
    },
  };
}
