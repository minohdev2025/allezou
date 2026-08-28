import { getTranslations } from "next-intl/server";

import { requireAccount } from "@/lib/session";
import { Bouton, Carte, Titre } from "../../ui";
import { ActiverNotifications } from "../../notifications-client";
import { terminerOptionsBienvenu, enregistrerAbonnement, oublierAbonnement } from "../../actions";
import { CarteRepliable } from "./carte-repliable";

/**
 * L'étape d'après les enfants : activer ce qui rendra le retour plus simple.
 *
 * Aucune des deux options n'est obligatoire. L'user peut fermer chaque carte
 * avec « Plus tard » sans rien casser — il arrive sur la même page et le
 * bouton final « Continuer sur Allezou » mène aux cercles. Ce qui n'a pas
 * été activé ici pourra l'être plus tard depuis /reglages.
 *
 * La carte notifications contient un composant client (`ActiverNotifications`)
 * qui gère son propre état (chargement, refus, déjà activé, iPhone non
 * installé). Les deux cartes sont repliables localement — un user qui dit
 * « Plus tard » sur les notifications ne se voit pas relancer la question.
 */

export default async function OptionsBienvenue() {
  await requireAccount();
  const t = await getTranslations("BienvenueOptions");
  const clePublique = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

  return (
    <main className="apparait">
      <Titre sous={t("sousTitre")}>{t("titre")}</Titre>

      <CarteRepliable titre={t("notificationsTitre")}>
        <Carte accent="rose" className="mb-0">
          <p className="mb-1 text-lg font-bold">{t("notificationsTitre")}</p>
          <p className="mb-4 leading-relaxed text-[color:var(--color-doux)]">
            {t("notificationsTexte")}
          </p>
          {clePublique ? (
            <ActiverNotifications
              clePublique={clePublique}
              enregistrer={enregistrerAbonnement}
              oublier={oublierAbonnement}
            />
          ) : null}
        </Carte>
      </CarteRepliable>

      <CarteRepliable titre={t("installationTitre")}>
        <Carte accent="vert" className="mb-0">
          <p className="mb-1 text-lg font-bold">{t("installationTitre")}</p>
          <p className="mb-4 leading-relaxed text-[color:var(--color-doux)]">
            {t("installationTexte")}
          </p>
          <ul className="space-y-3 text-sm leading-snug">
            <li>
              <p className="font-bold">{t("installationTitre")}</p>
              <p className="text-[color:var(--color-doux)]">
                {t("installationSansProposition")}
              </p>
            </li>
            <li>
              <p className="font-bold">iPhone</p>
              <p className="text-[color:var(--color-doux)]">{t("installationIphone")}</p>
            </li>
          </ul>
        </Carte>
      </CarteRepliable>

      <form action={terminerOptionsBienvenu} className="mt-6">
        <Bouton type="submit">{t("continuer")}</Bouton>
      </form>
    </main>
  );
}
