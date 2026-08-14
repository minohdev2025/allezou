import Link from "next/link";

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

const MESSAGES: Record<string, string> = {
  mot_trop_court: "Un mot de trois lettres au moins : en deçà, il remonterait la moitié de l'agenda.",
  trop_de_mots: "Dix mots suffisent. Retirez-en un pour en ajouter un autre.",
};

export default async function Reglages({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
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

      {erreur ? <Alerte ton="erreur">{MESSAGES[erreur] ?? "Cela n'a pas marché."}</Alerte> : null}

      {/*
        L'agenda avant les cercles : ces deux réglages ne dépendent d'aucun cercle, et sont
        les seuls que quelqu'un puisse activer le jour de son arrivée.
      */}
      <section className="mb-7">
        <h2 className="titre mb-3 text-lg font-bold">L&apos;agenda du canton</h2>

        <Carte className="mb-4" accent="violet">
          <p className="mb-1 font-bold">Les mots que vous surveillez</p>
          <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
            « piscine », « contes », « judo ». Vous êtes prévenu·e quand une activité publiée
            contient l&apos;un d&apos;eux, au moment où elle paraît.
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
                      <span className="sr-only">retirer</span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}

          {motsCles.length < MOTS_CLES_MAX ? (
            <form action={ajouterMotCleAgenda} className="space-y-3">
              <Champ
                label="Ajouter un mot"
                name="mot"
                maxLength={40}
                required
                placeholder="piscine"
              />
              <Bouton variante="second" className="!py-2.5 !text-base">
                Ajouter
              </Bouton>
            </form>
          ) : (
            <p className="text-sm text-[color:var(--color-doux)]">
              Dix mots, c&apos;est le maximum. Retirez-en un pour en ajouter un autre.
            </p>
          )}
        </Carte>

        <Carte accent="corail">
          <form action={basculerAlerteInscription}>
            <input type="hidden" name="actif" value={surInscription ? "0" : "1"} />
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="font-bold">Les activités sur inscription</span>
              <Pastille couleur={surInscription ? "vert" : "ambre"}>
                {surInscription ? "activé" : "coupé"}
              </Pastille>
            </div>
            <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
              Prévenu·e dès qu&apos;une activité sur inscription paraît, sans attendre. Pour
              celles-là, être prévenu·e tard revient à ne pas l&apos;être.
            </p>
            <Bouton variante="second" className="!py-2.5 !text-base">
              {surInscription ? "Ne plus me prévenir" : "Me prévenir"}
            </Bouton>
          </form>
        </Carte>
      </section>

      <h2 className="titre mb-3 text-lg font-bold">Vos cercles</h2>

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
