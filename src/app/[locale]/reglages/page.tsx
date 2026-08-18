import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

import {
  MOTS_CLES_MAX,
  alerteInscriptionActive,
  mesMotsCles,
  prefsParCercle,
} from "@/lib/notifications";
import { requireAccount } from "@/lib/session";
import {
  ajouterMotCleAgenda,
  basculerAlerteInscription,
  enregistrerAbonnement,
  mettreEnPause,
  oublierAbonnement,
  reglerCercle,
  retirerMotCleAgenda,
} from "../actions";
import { ActiverNotifications } from "../notifications-client";
import {
  Alerte,
  Bouton,
  Carte,
  Champ,
  Navigation,
  Pastille,
  Titre,
  Vide,
  heureCourte,
  teinte,
} from "../ui";

export default async function Reglages({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const t = await getTranslations("Reglages");
  const account = await requireAccount();
  const [cercles, motsCles, surInscription, { erreur }] = await Promise.all([
    prefsParCercle(account.id),
    mesMotsCles(account.id),
    alerteInscriptionActive(account.id),
    searchParams,
  ]);
  const clePublique = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

  return (
    <main className="apparait">
      <Titre emoji="🔔" sous={t("sousTitre")}>
        {t("titre")}
      </Titre>

      <Carte className="mb-7" accent="vert">
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

      {erreur ? (
        <Alerte ton="erreur">
          {t.has(`erreurs.${erreur}`) ? t(`erreurs.${erreur}`) : t("erreurGenerique")}
        </Alerte>
      ) : null}

      {/*
        L'agenda avant les cercles : ces deux réglages ne dépendent d'aucun cercle, et sont
        les seuls que quelqu'un puisse activer le jour de son arrivée.
      */}
      <section className="mb-7">
        <h2 className="titre mb-3 text-lg font-bold">{t("agendaTitre")}</h2>

        <Carte className="mb-4" accent="violet">
          <p className="mb-1 font-bold">{t("motsTitre")}</p>
          <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
            {t("motsTexte")}
          </p>

          {motsCles.length > 0 ? (
            <ul className="mb-4 flex flex-wrap gap-2">
              {motsCles.map((mot) => (
                <li key={mot.word}>
                  <form action={retirerMotCleAgenda}>
                    <input type="hidden" name="mot" value={mot.word} />
                    <button
                      className="flex items-center gap-1.5 rounded-[var(--radius-pilule)] px-3 py-1.5 text-sm font-bold"
                      style={{
                        background: "var(--color-violet-doux)",
                        color: "var(--color-violet)",
                      }}
                    >
                      {mot.label}
                      <span aria-hidden>✕</span>
                      <span className="sr-only">{t("retirerMot")}</span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}

          {motsCles.length < MOTS_CLES_MAX ? (
            <form action={ajouterMotCleAgenda} className="space-y-3">
              <Champ
                label={t("ajouterMotLabel")}
                name="mot"
                maxLength={40}
                required
                placeholder={t("ajouterMotPlaceholder")}
              />
              <Bouton variante="second" className="!py-2.5 !text-base">
                {t("ajouter")}
              </Bouton>
            </form>
          ) : (
            <p className="text-sm text-[color:var(--color-doux)]">{t("motsMax")}</p>
          )}
        </Carte>

        <Carte accent="corail">
          <form action={basculerAlerteInscription}>
            <input type="hidden" name="actif" value={surInscription ? "0" : "1"} />
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="font-bold">{t("inscriptionTitre")}</span>
              <Pastille couleur={surInscription ? "vert" : "ambre"}>
                {surInscription ? t("etatActif") : t("etatCoupe")}
              </Pastille>
            </div>
            <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
              {t("inscriptionTexte")}
            </p>
            <Bouton variante="second" className="!py-2.5 !text-base">
              {surInscription ? t("arreterPrevenir") : t("prevenir")}
            </Bouton>
          </form>
        </Carte>
      </section>

      <h2 className="titre mb-3 text-lg font-bold">{t("cerclesTitre")}</h2>

      {cercles.length === 0 ? (
        <Vide emoji="👥" titre={t("videTitre")}>
          {t("videTexte")}
        </Vide>
      ) : (
        <ul className="space-y-4">
          {cercles.map((cercle) => {
            const couleur = teinte(cercle.circleId);
            const enPause = cercle.pausedUntil && cercle.pausedUntil > new Date();

            return (
              <li key={cercle.circleId}>
                <Carte accent={couleur}>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="titre text-lg font-bold">{cercle.circleName}</h2>
                    {enPause ? (
                      <Pastille couleur="ambre">
                        {t("enPauseJusqua", { heure: heureCourte(cercle.pausedUntil!) })}
                      </Pastille>
                    ) : null}
                  </div>

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
              </li>
            );
          })}
        </ul>
      )}

      <Navigation actif="vous" />
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
