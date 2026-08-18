/**
 * Les catégories de lieux, partagées entre l'écran et le serveur.
 *
 * Elles vivent hors de `places.ts` : ce fichier-ci ne touche pas à la base, les
 * composants client peuvent donc l'importer sans embarquer le serveur. La liste est
 * courte à dessein — chaque catégorie doit répondre à une vraie question de parent
 * (« un parc ? une piscine ? un coin pour quand il pleut ? »), et « autre » recueille
 * ce qui déborde plutôt que d'allonger la liste.
 */

export const CATEGORIES_LIEU = [
  "parc",
  "aire_de_jeux",
  "piscine",
  "patinoire",
  "ludotheque",
  "bibliotheque",
  "musee",
  "maison_quartier",
  "autre",
] as const;

export type CategorieLieu = (typeof CATEGORIES_LIEU)[number];

// Les libellés vivent dans messages/*.json (namespace Etiquettes.categorie) : un libellé
// est une chaîne d'écran comme une autre, et il se traduit avec les autres.

/** L'emoji tient lieu d'icône : lisible, léger, et déjà dans toutes les polices. */
export const EMOJIS_CATEGORIE: Record<CategorieLieu, string> = {
  parc: "🌳",
  aire_de_jeux: "🛝",
  piscine: "🏊",
  patinoire: "⛸️",
  ludotheque: "🧸",
  bibliotheque: "📚",
  musee: "🖼️",
  maison_quartier: "🏠",
  autre: "📍",
};

export function estCategorieLieu(valeur: string): valeur is CategorieLieu {
  return (CATEGORIES_LIEU as readonly string[]).includes(valeur);
}
