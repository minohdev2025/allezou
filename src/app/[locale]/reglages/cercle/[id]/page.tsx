import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

import { prefsParCercle } from "@/lib/notifications";
import { requireAccount } from "@/lib/session";
import { enregistrerAbonnement, mettreEnPause, oublierAbonnement, reglerCercle } from "../../../actions";
import { Bouton, Carte, heureCourte, Navigation, Pastille, teinte, Titre } from "../../../ui";

/**
 * Réglages propres à un cercle : préviens-moi quand quelqu'un sort ou quand
 * quelqu'un dit qu'il vient, et pause de quelques heures ou d'une journée
 * quand on veut disparaître temporairement.
 *
 * Le sous-titre de l'en-tête rappelle le nom du cercle : sans ça, l'utilisateur
 * qui a cinq cercles « Copains de Mila » hésite sur lequel il configure. La
 * couleur de la carte reproduit celle de l'écran d'accueil pour que le
 * parcours reste lisible.
 */
export default async function ReglagCercle({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("Reglages");
  const { id } = await params;
  const account = await requireAccount();
  const cercles = await prefsParCercle(account.id);
  const cercle = cercles.find((c) => c.circleId === id);

  if (!cercle) {
    return (
      <main className="apparait">
        <Link href="/reglages/cercles" className="mb-3 inline-flex items-center gap-1 text-sm text-[color:var(--color-doux)]">
          <span aria-hidden>‹</span>
          {t("filRetour")}
        </Link>
        <p className="text-[color:var(--color-doux)]">{t("cercleInconnu")}</p>
      <div className="mt-8 flex-1" aria-hidden />
      <Navigation actif="reglages" />

      </main>
    );
  }

  const enPause = cercle.pausedUntil && cercle.pausedUntil > new Date();

  return (
    <main className="apparait">
      <Link
        href="/reglages/cercles"
        className="mb-3 inline-flex items-center gap-1 text-sm text-[color:var(--color-doux)] underline-offset-4 active:opacity-70"
      >
        <span aria-hidden>‹</span>
        {t("filRetour")}
      </Link>
      <Titre>{cercle.circleName}</Titre>

      <Carte accent={teinte(cercle.circleId)} className="mb-4">
        {enPause ? (
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="font-bold">{t("cercleEnPause")}</span>
            <Pastille couleur="ambre">
              {t("enPauseJusqua", { heure: heureCourte(cercle.pausedUntil!) })}
            </Pastille>
          </div>
        ) : null}

        <form action={reglerCercle} className="mb-4">
          <input type="hidden" name="cercle" value={cercle.circleId} />
          <div className="mb-3 space-y-2">
            <Interrupteur
              nom="presences"
              libelle={t("presencesLibelle")}
              actif={cercle.onPresence}
            />
            <Interrupteur
              nom="inscriptions"
              libelle={t("inscriptionsLibelle")}
              actif={cercle.onAttendance}
            />
          </div>
          <Bouton variante="second" className="!py-2.5 !text-base">
            {t("enregistrer")}
          </Bouton>
        </form>

        <form action={mettreEnPause} className="flex gap-2">
          <input type="hidden" name="cercle" value={cercle.circleId} />
          {enPause ? (
            <button
              name="heures"
              value="0"
              className="flex-1 rounded-[var(--radius-pilule)] px-3 py-2 text-sm font-bold"
              style={{ background: "var(--color-vert-doux)", color: "var(--color-vert)" }}
            >
              {t("reprendre")}
            </button>
          ) : (
            <>
              <button
                name="heures"
                value="4"
                className="flex-1 rounded-[var(--radius-pilule)] px-3 py-2 text-sm font-bold text-[color:var(--color-doux)] shadow-[inset_0_0_0_2px_var(--color-trait)]"
              >
                {t("pause4h")}
              </button>
              <button
                name="heures"
                value="24"
                className="flex-1 rounded-[var(--radius-pilule)] px-3 py-2 text-sm font-bold text-[color:var(--color-doux)] shadow-[inset_0_0_0_2px_var(--color-trait)]"
              >
                {t("pause24h")}
              </button>
            </>
          )}
        </form>

        <p className="mt-3 text-sm text-[color:var(--color-doux)]">
          {t.rich("membresTexte", {
            lien: (chunks) => (
              <Link
                href={`/cercles/${cercle.circleId}`}
                className="font-bold underline underline-offset-4"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      </Carte>

      <div className="mt-8 flex-1" aria-hidden />
      <Navigation actif="reglages" />
    </main>
  );
}

/** Une case à cocher qui a l'air d'un interrupteur, sans JavaScript. */
function Interrupteur({
  nom,
  libelle,
  actif,
}: {
  nom: string;
  libelle: string;
  actif: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="font-semibold">{libelle}</span>
      <input type="checkbox" name={nom} value="1" defaultChecked={actif} className="peer sr-only" />
      {/*
        Le bouton doit se déplacer alors qu'il est *dans* le frère du champ coché : une
        variante `peer-checked:` seule ne l'atteindrait pas, elle ne vise que les frères.
      */}
      <span className="relative h-7 w-12 shrink-0 rounded-full bg-[color:var(--color-trait)] transition-colors peer-checked:bg-[color:var(--color-vert)] peer-checked:[&>span]:translate-x-5">
        <span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-[color:var(--color-surface)] transition-transform" />
      </span>
    </label>
  );
}
