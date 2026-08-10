import Link from "next/link";

import { prefsParCercle } from "@/lib/notifications";
import { requireAccount } from "@/lib/session";
import {
  enregistrerAbonnement,
  mettreEnPause,
  oublierAbonnement,
  reglerCercle,
} from "../actions";
import { ActiverNotifications } from "../notifications-client";
import { Bouton, Carte, Navigation, Pastille, Titre, Vide, heureCourte, teinte } from "../ui";

export default async function Reglages() {
  const account = await requireAccount();
  const cercles = await prefsParCercle(account.id);
  const clePublique = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

  return (
    <main className="apparait">
      <Titre emoji="🔔" sous="Chaque notification doit avoir une raison claire. Sinon coupez-la.">
        Notifications
      </Titre>

      <Carte className="mb-7" accent="vert">
        {clePublique ? (
          <ActiverNotifications
            clePublique={clePublique}
            enregistrer={enregistrerAbonnement}
            oublier={oublierAbonnement}
          />
        ) : (
          <p className="text-[color:var(--color-doux)]">
            Les clés de notification ne sont pas configurées sur ce serveur.
          </p>
        )}
      </Carte>

      {cercles.length === 0 ? (
        <Vide emoji="🫂" titre="Aucun cercle">
          Les réglages apparaîtront ici dès que vous ferez partie d&apos;un cercle.
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
                        en pause jusqu&apos;à {heureCourte(cercle.pausedUntil!)}
                      </Pastille>
                    ) : null}
                  </div>

                  <form action={reglerCercle} className="mb-4">
                    <input type="hidden" name="cercle" value={cercle.circleId} />
                    <div className="mb-3 space-y-2">
                      <Interrupteur
                        nom="presences"
                        libelle="Les sorties en cours"
                        actif={cercle.onPresence}
                      />
                      <Interrupteur
                        nom="inscriptions"
                        libelle="Les inscriptions aux activités"
                        actif={cercle.onAttendance}
                      />
                    </div>
                    <Bouton variante="second" className="!py-2.5 !text-base">
                      Enregistrer
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
                        Reprendre
                      </button>
                    ) : (
                      <>
                        <button
                          name="heures"
                          value="4"
                          className="flex-1 rounded-[var(--radius-pilule)] px-3 py-2 text-sm font-bold text-[color:var(--color-doux)] shadow-[inset_0_0_0_2px_var(--color-trait)]"
                        >
                          Pause 4 h
                        </button>
                        <button
                          name="heures"
                          value="24"
                          className="flex-1 rounded-[var(--radius-pilule)] px-3 py-2 text-sm font-bold text-[color:var(--color-doux)] shadow-[inset_0_0_0_2px_var(--color-trait)]"
                        >
                          Pause 24 h
                        </button>
                      </>
                    )}
                  </form>

                  <p className="mt-3 text-sm text-[color:var(--color-doux)]">
                    Pour ne plus être prévenu d&apos;une personne en particulier, ouvrez{" "}
                    <Link
                      href={`/cercles/${cercle.circleId}`}
                      className="font-bold underline underline-offset-4"
                    >
                      la liste des membres
                    </Link>
                    .
                  </p>
                </Carte>
              </li>
            );
          })}
        </ul>
      )}

      <Navigation actif="cercles" />
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
