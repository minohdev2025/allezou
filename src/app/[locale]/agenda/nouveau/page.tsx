import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

import { myChildren } from "@/lib/children";
import { searchPlaces } from "@/lib/places";
import { defaultAudience } from "@/lib/publications";
import { requireAccount } from "@/lib/session";
import { readerCircles } from "@/lib/visibility";
import { proposerActivite } from "../../actions";
import { Alerte, Bouton, Carte, Champ, PUCE_COCHEE, Titre, teinte } from "../../ui";

const champ =
  "w-full rounded-2xl bg-[color:var(--color-surface)] px-4 py-3.5 text-base ring-2 ring-[color:var(--color-trait)] outline-none focus:ring-[color:var(--color-vert)]";

/**
 * Proposer une activité à l'agenda.
 *
 * Un seul geste crée l'entrée du calendrier *et* y inscrit son auteur : quelqu'un qui
 * signale une activité y va, sinon il ne la signalerait pas. L'activité elle-même est
 * publique ; c'est l'inscription qui choisit ses cercles.
 */
export default async function NouvelleActivite({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const t = await getTranslations("AgendaNouveau");
  const account = await requireAccount();
  const { erreur } = await searchParams;

  const MESSAGES: Record<string, string> = {
    titre_invalide: t("erreurs.titre_invalide"),
    dates_invalides: t("erreurs.dates_invalides"),
    aucun_destinataire: t("erreurs.aucun_destinataire"),
    cercle_interdit: t("erreurs.cercle_interdit"),
  };

  const [lieux, cercles, enfants, defauts] = await Promise.all([
    searchPlaces("", 50),
    readerCircles(account.id),
    myChildren(account.id),
    defaultAudience(account.id),
  ]);

  const cochesParDefaut = new Set(defauts.map((c) => c.id));

  return (
    <main className="apparait">
      <Titre emoji="📅" sous={t("sousTitre")}>
        {t("titre")}
      </Titre>

      {erreur ? (
        <Alerte ton="erreur">{MESSAGES[erreur] ?? t("erreurGenerique")}</Alerte>
      ) : null}

      {cercles.length === 0 ? (
        <Carte>
          <p className="text-[color:var(--color-doux)]">{t("rejoindreCercle")}</p>
        </Carte>
      ) : (
        <Carte accent="bleu">
          <form action={proposerActivite} className="space-y-5">
            <Champ
              label={t("labelQuoi")}
              name="titre"
              required
              maxLength={120}
              placeholder={t("placeholderTitre")}
            />

            <div className="flex gap-2">
              <label className="flex-1">
                <span className="mb-1 block font-bold">{t("debut")}</span>
                <input type="datetime-local" name="debut" required className={champ} />
              </label>
              <label className="flex-1">
                <span className="mb-1 block font-bold">{t("fin")}</span>
                <input type="datetime-local" name="fin" className={champ} />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block font-bold">{t("ou")}</span>
              <span className="mb-2 block text-sm text-[color:var(--color-doux)]">
                {t("aideLieu")}
              </span>
              <select name="lieu" className={champ} defaultValue="">
                <option value="">{t("choisirLieu")}</option>
                {lieux.map((lieu) => (
                  <option key={lieu.id} value={lieu.id}>
                    {lieu.name}
                    {lieu.commune ? ` · ${lieu.commune}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <input
              name="lieuLibre"
              maxLength={120}
              placeholder={t("placeholderLieuLibre")}
              className={champ}
            />

            <fieldset>
              <legend className="mb-2 font-bold">{t("visiblePar")}</legend>
              <div className="flex flex-wrap gap-2">
                {cercles.map((cercle) => (
                  <label key={cercle.id}>
                    <input
                      type="checkbox"
                      name="cercle"
                      value={cercle.id}
                      defaultChecked={cochesParDefaut.has(cercle.id)}
                      className="peer sr-only"
                    />
                    <span
                      className={`inline-flex cursor-pointer items-center rounded-[var(--radius-pilule)] px-4 py-2 font-bold text-[color:var(--color-doux)] shadow-[inset_0_0_0_2px_var(--color-trait)] peer-checked:text-[color:var(--color-fond)] peer-checked:shadow-none ${PUCE_COCHEE[teinte(cercle.id)]}`}
                    >
                      {cercle.name}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {enfants.length > 0 ? (
              <fieldset>
                <legend className="mb-2 font-bold">{t("vousYAllezAvec")}</legend>
                <div className="flex flex-wrap gap-2">
                  {enfants.map((enfant) => (
                    <label key={enfant.id}>
                      <input
                        type="checkbox"
                        name="enfant"
                        value={enfant.id}
                        defaultChecked
                        className="peer sr-only"
                      />
                      <span className="inline-flex cursor-pointer items-center rounded-[var(--radius-pilule)] px-4 py-2 font-bold text-[color:var(--color-doux)] shadow-[inset_0_0_0_2px_var(--color-trait)] peer-checked:bg-[color:var(--color-violet)] peer-checked:text-[color:var(--color-fond)] peer-checked:shadow-none">
                        {enfant.firstName}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <Bouton type="submit">{t("proposerEtSInscrire")}</Bouton>
          </form>
        </Carte>
      )}

      <p className="mt-6 text-center">
        <Link href="/agenda" className="text-[color:var(--color-doux)] underline underline-offset-4">
          {t("retourAgenda")}
        </Link>
      </p>
    </main>
  );
}
