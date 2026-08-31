import { getTranslations } from "next-intl/server";

import { requireAccount } from "@/lib/session";
import { enregistrerAbonnement, oublierAbonnement } from "../../actions";
import { ActiverNotifications } from "../../notifications-client";
import { Carte, Navigation } from "../../ui";
import { EnteteReglages } from "../_entete";

/**
 * Activation ou arrêt des notifications push du navigateur (VAPID). Une fois
 * activé, l'utilisateur reçoit les alertes des cercles et de l'agenda.
 * Si les clés VAPID manquent côté serveur, on affiche un message sobre plutôt
 * que de planter — utile pour les déploiements partiels.
 */
export default async function ReglagesNotifications() {
  const t = await getTranslations("Reglages");
  await requireAccount();
  const clePublique = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

  return (
    <main className="apparait">
      <EnteteReglages titre={t("notificationsTitre")} sous={t("notificationsSous")} />

      <Carte accent="vert" className="mb-5">
        {clePublique ? (
          <ActiverNotifications
            clePublique={clePublique}
            enregistrer={enregistrerAbonnement}
            oublier={oublierAbonnement}
          />
        ) : (
          <p className="text-[color:var(--color-doux)]">{t("clesManquantes")}</p>
        )}
      </Carte>
      <div className="mt-8 flex-1" aria-hidden />
      <Navigation actif="reglages" />

    </main>
  );
}
