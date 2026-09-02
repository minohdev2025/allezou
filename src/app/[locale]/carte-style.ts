/**
 * Le rendu d'une carte Allezou — centralisé pour qu'aucune page ne dérive.
 *
 * La convention visuelle tient en deux règles, observées partout sur le site
 * (agenda, sortie, lieux, réglages, maintenant, profil) :
 *
 *  - Le fond est `bg-surface` (blanc pur), donc les cartes se détachent
 *    légèrement du fond de page crème (`bg-fond`) sans contraste violent.
 *  - Le cadre est un `box-shadow` INTERNE de 2px dans la couleur *douce*
 *    de l'accent (`var(--color-${accent}-doux)`). Pas de couleur saturée,
 *    pas de `border` externe, pas d'ombre externe : tout ce qui pétait
 *    ailleurs est écarté d'ici.
 *
 * Sans accent, on retombe sur `var(--color-trait)` (gris-beige) qui sert
 * aux cartes neutres — l'équivalent agenda de la carte « Filtrer ».
 *
 * Cette fonction ne renvoie pas de JSX, seulement les styles à appliquer
 * à un élément Tailwind : `<div className={stylesCarte({ accent }).className} style={stylesCarte({ accent }).style}>`.
 * Elle est volontairement minimale : pas de classes utilitaires surprises,
 * pas de variants, pas d'options — la convention est une, et c'est celle-ci.
 */

import type { Teinte } from "./ui";

export function stylesCarte({ accent }: { accent?: Teinte } = {}): {
  className: string;
  style: React.CSSProperties;
} {
  return {
    className: "rounded-[var(--radius-carte)] bg-[color:var(--color-surface)]",
    style: {
      boxShadow: accent
        ? `inset 0 0 0 2px var(--color-${accent}-doux)`
        : `inset 0 0 0 2px var(--color-trait)`,
    },
  };
}

/* Pour les composants qui ne veulent pas dépendre de ui.tsx. */
export type { Teinte };
