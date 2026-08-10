import type { MetadataRoute } from "next";

/**
 * Manifeste de l'application installable.
 *
 * `start_url` ouvre directement « qui est dehors » plutôt que la page d'accueil : quelqu'un
 * qui touche l'icône veut voir l'écran principal, pas naviguer. Le raccourci « Nous sortons »
 * mène en une touche à la déclaration — depuis l'écran d'accueil, le geste du samedi matin
 * devient un seul appui.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Totir",
    short_name: "Totir",
    description: "Savoir qui est dehors, parmi les gens qu'on connaît déjà.",
    lang: "fr",
    start_url: "/maintenant",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fffcf5",
    theme_color: "#17784f",
    // `/icon` est rendue par src/app/icon.tsx : une seule source, pas de PNG dans le dépôt.
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Nous sortons",
        short_name: "Sortir",
        description: "Déclarer une sortie en cours",
        url: "/sortir",
      },
    ],
  };
}
