import Link from "next/link";

import {
  FENETRES,
  LIBELLES_FENETRE,
  TRANCHES_AGE,
  communesDisponibles,
  upcomingCalendar,
  type Fenetre,
} from "@/lib/calendar";
import { requireAccount } from "@/lib/session";
import {
  Jeton,
  LienBouton,
  Navigation,
  Pastille,
  Titre,
  Vide,
  cleDuJour,
  heureCourte,
  libelleJour,
  teinte,
} from "../ui";

type Params = { quand?: string; age?: string; commune?: string; cercle?: string };

/** Chaque filtre est un lien : l'agenda reste utilisable sans JavaScript, et se partage. */
function lien(actuel: Params, changement: Partial<Params>): string {
  const params = new URLSearchParams();
  for (const [cle, valeur] of Object.entries({ ...actuel, ...changement })) {
    if (valeur) params.set(cle, valeur);
  }
  const requete = params.toString();
  return requete ? `/agenda?${requete}` : "/agenda";
}

function Puce({
  href,
  actif,
  children,
}: {
  href: string;
  actif: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="shrink-0 rounded-[var(--radius-pilule)] px-4 py-2 text-sm font-bold"
      style={
        actif
          ? { background: "var(--color-vert)", color: "var(--color-fond)" }
          : {
              background: "var(--color-surface)",
              color: "var(--color-doux)",
              boxShadow: "inset 0 0 0 2px var(--color-trait)",
            }
      }
    >
      {children}
    </Link>
  );
}

/**
 * Les puces passent à la ligne au lieu de défiler horizontalement.
 *
 * Un défilement latéral sans barre visible cache des filtres sans que rien ne l'indique :
 * on ne cherche pas un geste dont on ignore l'existence. Deux lignes de puces coûtent
 * quelques pixels ; un filtre invisible coûte le filtre.
 */
function Rangee({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

export default async function Agenda({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const account = await requireAccount();
  const params = await searchParams;

  const quand = (FENETRES as readonly string[]).includes(params.quand ?? "")
    ? (params.quand as Fenetre)
    : "quinzaine";
  const age = params.age ? Number(params.age) : undefined;
  const avecMonCercle = params.cercle === "1";

  const [entrees, communes] = await Promise.all([
    upcomingCalendar(account.id, {
      quand,
      age: Number.isFinite(age) ? age : undefined,
      commune: params.commune,
      avecMonCercle,
    }),
    communesDisponibles(),
  ]);

  /*
    Les entrées arrivent déjà triées par date : un parcours suffit à les regrouper, et
    l'ordre des journées se conserve tout seul.

    Les activités déjà commencées mais pas terminées — un été au parc, une exposition de
    trois mois — sont réunies en tête plutôt que classées à leur date de début. Les ranger
    sous « Mercredi 3 juin » alors qu'elles ont lieu aujourd'hui serait faux à la lecture.
  */
  const EN_COURS = "en-cours";

  const journees = [...entrees.reduce((groupes, entree) => {
    const cle = entree.enCours ? EN_COURS : cleDuJour(entree.startsAt);
    groupes.set(cle, [...(groupes.get(cle) ?? []), entree]);
    return groupes;
  }, new Map<string, typeof entrees>())].sort(([a], [b]) =>
    a === EN_COURS ? -1 : b === EN_COURS ? 1 : 0,
  );

  return (
    <main className="apparait">
      <Titre emoji="📅" sous="Les activités du canton, et qui de vos cercles y va.">
        Agenda
      </Titre>

      <div className="mb-6 space-y-2">
        <Rangee>
          {FENETRES.map((f) => (
            <Puce key={f} href={lien(params, { quand: f })} actif={quand === f}>
              {LIBELLES_FENETRE[f]}
            </Puce>
          ))}
        </Rangee>

        {/*
          « Quand » reste visible, le reste se replie : quatre rangées de puces prenaient
          300 px sur un écran de 812, il ne restait presque rien pour les activités.

          Replié, mais derrière un bouton qui le dit — pas derrière un défilement latéral
          qu'on ne devine pas. Et le bloc s'ouvre de lui-même dès qu'un de ces filtres est
          actif : on ne cache jamais un filtre en cours.
        */}
        <details open={age !== undefined || Boolean(params.commune) || avecMonCercle}>
          <summary className="cursor-pointer py-1 text-sm font-bold text-[color:var(--color-doux)]">
            Âge, commune, qui y va
          </summary>

          <div className="mt-2 space-y-2">
        <Rangee>
          <Puce href={lien(params, { age: undefined })} actif={age === undefined}>
            Tous les âges
          </Puce>
          {TRANCHES_AGE.map((t) => (
            <Puce
              key={t.valeur}
              href={lien(params, { age: String(t.valeur) })}
              actif={age === t.valeur}
            >
              {t.libelle}
            </Puce>
          ))}
        </Rangee>

        {communes.length > 1 ? (
          <Rangee>
            <Puce href={lien(params, { commune: undefined })} actif={!params.commune}>
              Partout
            </Puce>
            {communes.map((c) => (
              <Puce
                key={c}
                href={lien(params, { commune: c })}
                actif={params.commune === c}
              >
                {c}
              </Puce>
            ))}
          </Rangee>
        ) : null}

            <Rangee>
              <Puce
                href={lien(params, { cercle: avecMonCercle ? undefined : "1" })}
                actif={avecMonCercle}
              >
                🫂 Où va quelqu&apos;un de mes cercles
              </Puce>
            </Rangee>
          </div>
        </details>
      </div>

      <div className="mb-6">
        <LienBouton href="/agenda/nouveau">📅 Proposer une activité</LienBouton>
      </div>

      {entrees.length === 0 ? (
        <Vide emoji="🗓️" titre="Rien ne correspond">
          {avecMonCercle || age !== undefined || params.commune ? (
            <p>
              Essayez d&apos;élargir les filtres —{" "}
              <Link href="/agenda" className="font-bold underline underline-offset-4">
                tout voir
              </Link>
              .
            </p>
          ) : (
            <p>Les activités genevoises apparaîtront ici.</p>
          )}
        </Vide>
      ) : (
        /*
          Regroupé par jour plutôt qu'en cartes indépendantes. La date sort des lignes pour
          devenir un en-tête : chacune y gagne les 64 px que prenait sa pastille, et l'on
          lit l'agenda comme on le cherche — par jour, pas par carte.
        */
        journees.map(([cle, activites]) => (
          <section key={cle} className="mb-6">
            <h2 className="titre sticky top-0 z-10 -mx-5 bg-[color:var(--color-fond)] px-5 py-2 text-lg font-bold">
              {cle === EN_COURS ? "En ce moment" : libelleJour(activites[0].startsAt)}
              <span className="ml-2 font-normal text-[color:var(--color-doux)]">
                {activites.length} activité{activites.length > 1 ? "s" : ""}
              </span>
            </h2>

            <ul className="space-y-2">
              {activites.map((entree) => {
                const couleur = teinte(entree.id);

                return (
                  <li key={entree.id}>
                    <Link
                      href={`/agenda/${entree.id}`}
                      className="flex gap-3 rounded-2xl bg-[color:var(--color-surface)] px-4 py-3"
                      style={{ boxShadow: `inset 0 0 0 2px var(--color-${couleur}-doux)` }}
                    >
                      <span
                        className="w-14 shrink-0 pt-0.5 text-sm font-bold"
                        style={{ color: `var(--color-${couleur})` }}
                      >
                        {entree.enCours ? "en cours" : heureCourte(entree.startsAt)}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="titre block font-bold leading-tight">
                          {entree.title}
                        </span>

                        {entree.place ? (
                          <span className="mt-0.5 block truncate text-sm text-[color:var(--color-doux)]">
                            📍 {entree.place}
                          </span>
                        ) : null}

                        {entree.ageLabel || entree.commune ? (
                          <span className="mt-1.5 flex flex-wrap gap-1.5">
                            {entree.ageLabel ? (
                              <Pastille couleur="ambre">{entree.ageLabel}</Pastille>
                            ) : null}
                            {entree.commune ? (
                              <Pastille couleur="bleu">{entree.commune}</Pastille>
                            ) : null}
                          </span>
                        ) : null}

                        {entree.attendees.length > 0 ? (
                          <span className="mt-1.5 flex items-center gap-2">
                            <span className="flex -space-x-1.5">
                              {entree.attendees.slice(0, 3).map((a) => (
                                <Jeton
                                  key={a.publicationId}
                                  nom={a.displayName}
                                  id={a.accountId}
                                  taille={22}
                                />
                              ))}
                            </span>
                            <span className="min-w-0 truncate text-sm font-bold text-[color:var(--color-vert)]">
                              {entree.attendees.map((a) => a.displayName).join(", ")}
                              {entree.attendees.length === 1 ? " y va" : " y vont"}
                            </span>
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      <Navigation actif="agenda" />
    </main>
  );
}
