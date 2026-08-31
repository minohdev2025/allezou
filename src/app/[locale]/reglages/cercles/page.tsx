import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

import { prefsParCercle } from "@/lib/notifications";
import { requireAccount } from "@/lib/session";
import { Carte, Navigation, Titre, Vide, teinte } from "../../ui";

/**
 * Liste des cercles, un par ligne. Chaque ligne renvoie à sa fiche de
 * réglages individuelle. Au lieu de tout dérouler sur une seule page, on laisse
 * l'utilisateur entrer dans un cercle, le configurer, revenir, et passer au
 * suivant — comme une fiche de contact qui ouvre chaque ami dans sa page.
 *
 * Le vide (aucun cercle) garde son appel à rejoindre : sans cercle, l'agenda
 * et les notifications n'ont aucune source humaine.
 */
export default async function ReglagesCerclesIndex() {
  const t = await getTranslations("Reglages");
  const account = await requireAccount();
  const cercles = await prefsParCercle(account.id);

  return (
    <main className="apparait">
      <Link href="/reglages" className="mb-3 inline-flex items-center gap-1 text-sm text-[color:var(--color-doux)] underline-offset-4 active:opacity-70">
        <span aria-hidden>‹</span>
        {t("filRetour")}
      </Link>
      <Titre sous={t("cerclesIndexSous")}>{t("cerclesTitre")}</Titre>

      {cercles.length === 0 ? (
        <Vide emoji="👥" titre={t("videTitre")}>
          {t("videTexte")}
        </Vide>
      ) : (
        <ul className="space-y-3">
          {cercles.map((cercle) => (
            <li key={cercle.circleId}>
              <Link
                href={`/reglages/cercle/${cercle.circleId}`}
                className="block active:translate-y-[1px]"
              >
                <Carte accent={teinte(cercle.circleId)}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold leading-tight">{cercle.circleName}</span>
                    <span aria-hidden className="shrink-0 text-xl leading-none">
                      ›
                    </span>
                  </div>
                </Carte>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Navigation actif="reglages" />
    </main>
  );
}
