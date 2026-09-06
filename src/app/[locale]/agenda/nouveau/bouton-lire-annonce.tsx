"use client";

import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";

import { Bouton } from "../../ui";

/**
 * Bouton « Lire l'annonce » avec son état d'attente.
 *
 * La lecture part côté serveur (fetch de la page, appel du modèle) et peut prendre
 * plusieurs secondes : pendant ce temps le bouton dit ce qui se passe et se désactive,
 * pour qu'un second envoi ne lance pas une deuxième analyse du même formulaire.
 */
export function BoutonLireAnnonce() {
  const { pending } = useFormStatus();
  const t = useTranslations("AgendaNouveau");

  return (
    <Bouton
      type="submit"
      variante="second"
      disabled={pending}
      aria-busy={pending}
      className="disabled:opacity-60"
    >
      <span aria-live="polite">
        {pending ? t("annonceAnalyse") : t("annonceLire")}
      </span>
    </Bouton>
  );
}
