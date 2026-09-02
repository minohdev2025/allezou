import { getTranslations } from "next-intl/server";

import { Alerte, Bouton, Carte, Champ, Navigation } from "../../ui";
import { EnteteReglages } from "../_entete";
import { supprimerCompte } from "../../actions";

/**
 * Supprimer votre compte — irréversible. La page est volontairement seule
 * derrière sa propre adresse : la trouver par erreur est peu probable, et
 * la confirmation est explicite pour décourager les clics impulsifs.
 *
 * L'utilisateur doit taper SUPPRIMER en majuscules pour activer le bouton
 * — une convention simple mais qui marche : celui qui veut vraiment le faire
 * ne se laisse pas arrêter par la friction.
 */
export default async function ReglagesSupprimer({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const t = await getTranslations("Compte");
  const { erreur } = await searchParams;

  return (
    <main className="apparait">
      <EnteteReglages titre={t("supprimerTitre")} />

      {erreur ? (
        <Alerte ton="erreur">
          {erreur === "confirmation"
            ? t("erreurs.confirmation", { mot: "SUPPRIMER" })
            : t.has(`erreurs.${erreur}`)
              ? t(`erreurs.${erreur}`)
              : t("erreurGenerique")}
        </Alerte>
      ) : null}

      <Carte>
        <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
          {t("supprimerTexte")}
        </p>

        <form action={supprimerCompte} className="space-y-3">
          <Champ
            label={t("confirmerLabel", { mot: "SUPPRIMER" })}
            name="confirmation"
            autoComplete="off"
            placeholder="SUPPRIMER"
          />
          <Bouton variante="second">{t("supprimerBouton")}</Bouton>
        </form>
      </Carte>
      <div className="mt-8 flex-1" aria-hidden />
      <Navigation actif="reglages" />

    </main>
  );
}
