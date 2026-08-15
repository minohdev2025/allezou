"use client";

import { useEffect } from "react";

/**
 * Fait suivre les cercles aux enfants cochés.
 *
 * Un parent de trois enfants dans trois classes corrigeait deux listes à chaque sortie :
 * décocher les deux enfants restés à la maison, puis décocher leurs deux classes. La seconde
 * correction découle de la première, et rien ne la faisait.
 *
 * Amélioration progressive, et rien de plus : sans JavaScript, les deux listes restent
 * indépendantes et l'écran se comporte exactement comme avant. Le formulaire part de toute
 * façon avec ce qui est coché, et c'est le serveur qui tranche.
 *
 * Deux précautions valent d'être dites. On ne touche qu'aux cercles qu'un de mes enfants
 * concerne : un cercle de voisinage n'appartient à aucun d'eux et ne doit pas bouger quand
 * je décoche l'aînée. Et on n'aligne rien au chargement, seulement quand quelqu'un change un
 * enfant : au premier rendu, ce qui est coché vient des réglages de la personne, et l'écraser
 * reviendrait à défaire un choix qu'elle a déjà fait.
 */
export function LiaisonEnfantsCercles({
  parEnfant,
}: {
  parEnfant: Record<string, string[]>;
}) {
  useEffect(() => {
    const formulaire = document.querySelector<HTMLFormElement>("form[data-sortie]");
    if (!formulaire) return;

    const enfants = [
      ...formulaire.querySelectorAll<HTMLInputElement>('input[name="enfant"]'),
    ];
    const cercles = [
      ...formulaire.querySelectorAll<HTMLInputElement>('input[name="cercle"]'),
    ];

    const rattaches = new Set(Object.values(parEnfant).flat());
    if (rattaches.size === 0) return;

    const suivre = () => {
      const attendus = new Set(
        enfants.filter((e) => e.checked).flatMap((e) => parEnfant[e.value] ?? []),
      );

      for (const cercle of cercles) {
        if (rattaches.has(cercle.value)) cercle.checked = attendus.has(cercle.value);
      }
    };

    for (const enfant of enfants) enfant.addEventListener("change", suivre);
    return () => {
      for (const enfant of enfants) enfant.removeEventListener("change", suivre);
    };
  }, [parEnfant]);

  return null;
}
