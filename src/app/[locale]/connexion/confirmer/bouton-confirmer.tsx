"use client";

/**
 * Le bouton "Se connecter" de la page de confirmation.
 *
 * Pourquoi ce composant ? La parade contre les scanners qui pré-cliquent le lien
 * du courriel : on consomme le lien seulement sur un clic explicite de
 * l'utilisateur, pas sur l'ouverture du mail. Pour ne pas récompenser un scanner
 * extrêmement rapide (qui cliquerait aussi sur le bouton "Se connecter" de la
 * page de confirmation), on désactive le bouton pendant trois secondes et on
 * affiche un texte qui change — un humain qui lit patiente, un robot qui ne
 * comprend pas le texte appuie quand même.
 *
 * Trois secondes, c'est la fenêtre typique d'un scanner qui pré-clique les
 * liens : suffisant pour qu'il soit passé, assez court pour qu'un humain
 * impatient ne se sente pas brimé.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export function BoutonConfirmer() {
  const t = useTranslations("Confirmation");
  // `null` = en cours de vérification, `false` = prêt à cliquer.
  const [pret, setPret] = useState<boolean>(false);

  useEffect(() => {
    const minuterie = setTimeout(() => setPret(true), 3000);
    return () => clearTimeout(minuterie);
  }, []);

  return (
    <button
      type="submit"
      disabled={!pret}
      className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-pilule)] bg-[color:var(--color-vert)] px-5 py-3.5 text-center text-[1.05rem] font-bold text-[color:var(--color-fond)] shadow-[0_3px_0_0_var(--color-socle-vert)] transition-transform disabled:cursor-wait disabled:opacity-60 enabled:active:translate-y-[2px] enabled:active:shadow-none"
    >
      {pret ? t("boutonConnecter") : t("verifieEnCours")}
    </button>
  );
}
