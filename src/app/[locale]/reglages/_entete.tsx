import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

import { Bouton, Navigation, Titre } from "../ui";

/**
 * En-tête réutilisé par toutes les sous-pages de réglages : un fil
 * (« ‹ Réglages ») qui ramène à la page d'accueil, et le titre.
 * Centraliser ici évite que chaque sous-page réinvente la flèche retour.
 *
 * Le `<Navigation>` n'est PAS rendu ici volontairement : on le veut
 * `sticky bottom-0`, ce qui exige qu'il soit le dernier enfant du flux
 * principal. Chaque sous-page doit le placer après son propre contenu.
 */
export async function EnteteReglages({ titre, sous }: { titre: string; sous?: string }) {
  const t = await getTranslations("Reglages");
  return (
    <>
      <Link href="/reglages" className="mb-3 inline-flex items-center gap-1 text-sm text-[color:var(--color-doux)] underline-offset-4 active:opacity-70">
        <span aria-hidden>‹</span>
        {t("filRetour")}
      </Link>
      <Titre sous={sous}>{titre}</Titre>
    </>
  );
}

/**
 * Bouton de soumission standard pour les sous-pages : pleine largeur,
 * variante « second » (anneau de couleur d'accent), réutilisé partout pour
 * garder la même action visible quel que soit l'écran.
 */
export function BoutonEnregistrer({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <Bouton variante="second" className={`!py-2.5 !text-base ${className}`}>
      {children}
    </Bouton>
  );
}
