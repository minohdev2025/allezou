"use client";

/**
 * Une carte qu'on peut fermer localement.
 *
 * Le bouton « Plus tard » ne fait pas de redirection, ne change rien en base : il
 * ferme juste la carte côté client. L'user reste sur la même page et peut
 * activer l'autre carte, ou cliquer « Continuer sur Allezou ». Aucune fuite de
 * ce qu'il n'a pas choisi, aucune fenêtre modale intrusive.
 */

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

export function CarteRepliable({
  titre,
  children,
  defautOuvert = true,
}: {
  titre: string;
  children: ReactNode;
  defautOuvert?: boolean;
}) {
  const t = useTranslations("BienvenueOptions");
  const [ouvert, setOuvert] = useState(defautOuvert);

  if (!ouvert) {
    return (
      <div className="mb-4 rounded-[var(--radius-carte)] border-2 border-[color:var(--color-trait)] bg-[color:var(--color-surface)] px-5 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-bold">{titre}</span>
          <button
            type="button"
            onClick={() => setOuvert(true)}
            className="text-sm text-[color:var(--color-doux)] underline underline-offset-4"
          >
            {t("rouvrir")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      {children}
      <div className="mt-3 flex justify-center">
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="text-sm text-[color:var(--color-doux)] underline underline-offset-4"
        >
          {t("plusTard")}
        </button>
      </div>
    </div>
  );
}
