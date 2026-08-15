import Link from "next/link";

import {
  FENETRES,
  LIBELLES_FENETRE,
  TRANCHES_AGE,
  communesDisponibles,
  upcomingCalendar,
  type CalendarEntry,
  type Fenetre,
} from "@/lib/calendar";
import {
  ACCES,
  LIBELLES_ACCES,
  LIBELLES_TARIF,
  TARIFS,
  type Acces,
  type Tarif,
} from "@/lib/ingest/tarif";
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
  jourCourt,
  libelleJour,
  teinte,
} from "../ui";

type Params = {
  quand?: string;
  age?: string;
  commune?: string;
  cercle?: string;
  tarif?: string;
  acces?: string;
};

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
  // Plusieurs âges, séparés par des virgules dans l'adresse : une famille en a plusieurs, et
  // l'écran doit rester partageable et utilisable sans JavaScript.
  const ages = (params.age ?? "")
    .split(",")
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v >= 0 && v <= 18);
  const avecMonCercle = params.cercle === "1";
  const tarif = (TARIFS as readonly string[]).includes(params.tarif ?? "")
    ? (params.tarif as Tarif)
    : undefined;
  const acces = (ACCES as readonly string[]).includes(params.acces ?? "")
    ? (params.acces as Acces)
    : undefined;

  const [entrees, communes] = await Promise.all([
    upcomingCalendar(account.id, {
      quand,
      ages,
      commune: params.commune,
      avecMonCercle,
      tarif,
      acces,
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
        <details
          open={
            ages.length > 0 ||
            Boolean(params.commune) ||
            avecMonCercle ||
            Boolean(tarif) ||
            Boolean(acces)
          }
        >
          <summary className="cursor-pointer py-1 text-sm font-bold text-[color:var(--color-doux)]">
            Âge, commune, prix, qui y va
          </summary>

          <div className="mt-2 space-y-2">
        <Rangee>
          {/*
            Les tranches s'ajoutent au lieu de se remplacer : un parent de trois enfants
            cherche ce qui convient à l'un des trois, pas trois fois de suite.
          */}
          <Puce href={lien(params, { age: undefined })} actif={ages.length === 0}>
            Tous les âges
          </Puce>
          {TRANCHES_AGE.map((t) => {
            const choisi = ages.includes(t.valeur);
            const apres = choisi
              ? ages.filter((a) => a !== t.valeur)
              : [...ages, t.valeur].sort((a, b) => a - b);

            return (
              <Puce
                key={t.valeur}
                href={lien(params, { age: apres.length > 0 ? apres.join(",") : undefined })}
                actif={choisi}
              >
                {t.libelle}
              </Puce>
            );
          })}
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

            {/*
              Le prix et l'inscription se filtrent séparément : « gratuit » ne dit rien de
              l'inscription, et une activité gratuite sur inscription se rate aussi bien
              qu'une payante. « Non défini » est une puce comme les autres, parce que c'est
              l'état d'une bonne moitié des activités communales et qu'un parent doit pouvoir
              aller y voir plutôt que de les croire gratuites.
            */}
            <Rangee>
              <Puce href={lien(params, { tarif: undefined })} actif={!tarif}>
                Tous les prix
              </Puce>
              {TARIFS.map((t) => (
                <Puce key={t} href={lien(params, { tarif: t })} actif={tarif === t}>
                  {LIBELLES_TARIF[t]}
                </Puce>
              ))}
            </Rangee>

            <Rangee>
              <Puce href={lien(params, { acces: undefined })} actif={!acces}>
                Avec ou sans inscription
              </Puce>
              {ACCES.map((a) => (
                <Puce key={a} href={lien(params, { acces: a })} actif={acces === a}>
                  {LIBELLES_ACCES[a]}
                </Puce>
              ))}
            </Rangee>

            <Rangee>
              <Puce
                href={lien(params, { cercle: avecMonCercle ? undefined : "1" })}
                actif={avecMonCercle}
              >
                👥 Où va quelqu&apos;un de mes cercles
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
          {avecMonCercle || ages.length > 0 || params.commune || tarif || acces ? (
            <p>
              Essayez d&apos;élargir les filtres, ou{" "}
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
        journees.map(([cle, activites]) => {
          /*
            « En ce moment » réunit les expositions et les étés d'animations. Ils durent des
            semaines, donc ils s'accumulent : dix d'entre eux repoussaient la première
            activité réellement datée hors de l'écran, un soir où aucun n'était ouvert.

            Au-delà de trois, le reste se replie — derrière un bouton qui dit combien il en
            cache, jamais en silence. Le tri par date de fin met devant ceux qui se terminent
            bientôt : ce sont les seuls pour lesquels il y a quelque chose à décider.
          */
          const enTete = cle === EN_COURS ? activites.slice(0, 3) : activites;
          const replies = cle === EN_COURS ? activites.slice(3) : [];

          return (
            <section key={cle} className="mb-6">
              <h2 className="titre sticky top-0 z-10 -mx-5 bg-[color:var(--color-fond)] px-5 py-2 text-lg font-bold">
                {cle === EN_COURS ? "En ce moment" : libelleJour(activites[0].startsAt)}
                <span className="ml-3 font-normal text-[color:var(--color-doux)]">
                  {activites.length} activité{activites.length > 1 ? "s" : ""}
                </span>
              </h2>

              <ul className="space-y-2">
                {enTete.map((entree) => (
                  <LigneActivite key={entree.id} entree={entree} lecteurId={account.id} />
                ))}
              </ul>

              {replies.length > 0 ? (
                <details className="mt-2">
                  <summary className="cursor-pointer py-2 text-sm font-bold text-[color:var(--color-doux)]">
                    Et {replies.length} autre{replies.length > 1 ? "s" : ""} qui{" "}
                    {replies.length > 1 ? "durent" : "dure"} encore
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {replies.map((entree) => (
                      <LigneActivite key={entree.id} entree={entree} lecteurId={account.id} />
                    ))}
                  </ul>
                </details>
              ) : null}
            </section>
          );
        })
      )}

      <Navigation actif="agenda" />
    </main>
  );
}

/** Une ligne de l'agenda — la même dans la liste du jour et dans le repli « en ce moment ». */
function LigneActivite({
  entree,
  lecteurId,
}: {
  entree: CalendarEntry;
  lecteurId: string;
}) {
  const couleur = teinte(entree.id);

  /*
    Soi-même en dernier, et sous le nom « vous ».

    Lire son propre nom d'affichage parmi les inscrits donne l'impression que l'écran vous
    compte comme quelqu'un d'autre — et fait passer le filtre « où va quelqu'un de mes
    cercles » pour cassé, alors qu'il ne retient bien que les activités où une autre famille
    est inscrite.
  */
  const autres = entree.attendees.filter((a) => a.accountId !== lecteurId);
  const jySuis = autres.length < entree.attendees.length;
  const inscrits = [
    ...autres,
    ...entree.attendees.filter((a) => a.accountId === lecteurId),
  ];
  const noms = autres.map((a) => a.displayName).join(", ");
  const texteInscrits = jySuis
    ? autres.length > 0
      ? `${noms} et vous y allez`
      : "Vous y allez"
    : `${noms} ${autres.length === 1 ? "y va" : "y vont"}`;

  return (
    <li>
      <Link
        href={`/agenda/${entree.id}`}
        className="flex gap-3 rounded-2xl bg-[color:var(--color-surface)] px-4 py-3"
        style={{ boxShadow: `inset 0 0 0 2px var(--color-${couleur}-doux)` }}
      >
        {/*
          Pour une activité déjà commencée, l'heure de début ne dit rien : elle est passée.
          C'est la date de fin qui informe — il reste trois jours, ou tout l'été — et c'est
          elle aussi qui distingue deux entrées que la source publie sous le même titre.
        */}
        <span
          className="w-16 shrink-0 pt-0.5 text-sm font-bold leading-tight"
          style={{ color: `var(--color-${couleur})` }}
        >
          {entree.enCours ? (
            entree.endsAt ? (
              <>
                <span className="block text-[0.7rem] opacity-75">jusqu&apos;au</span>
                {jourCourt(entree.endsAt).nombre} {jourCourt(entree.endsAt).mois}
              </>
            ) : (
              "en cours"
            )
          ) : entree.allDay ? (
            // Une exposition ou un marché n'ouvre pas à minuit : afficher 00:00 était faux.
            "toute la journée"
          ) : (
            heureCourte(entree.startsAt)
          )}
        </span>

        <span className="min-w-0 flex-1">
          {/*
            Deux lignes au plus : certains titres de source font cent caractères et
            occupaient à eux seuls le quart de l'écran. Le titre entier est sur sa page.
          */}
          {/*
            `line-clamp-2` pose lui-même `display: -webkit-box` : lui ajouter `block`, comme
            aux autres lignes de ce bloc, écrase cette valeur et la coupure ne se fait plus.
          */}
          <span className="titre line-clamp-2 font-bold leading-tight">{entree.title}</span>

          {entree.place ? (
            <span className="mt-0.5 block truncate text-sm text-[color:var(--color-doux)]">
              📍 {entree.place}
            </span>
          ) : null}

          {/*
            « Non défini » ne porte pas d'étiquette : la moitié des activités communales
            n'annoncent pas leur prix, et une pastille grise sur une ligne sur deux dirait
            surtout que l'agenda ne sait rien. C'est aux filtres de servir à ça.
          */}
          {entree.ageLabel || entree.commune || entree.retiree ||
          entree.tarif !== "inconnu" || entree.acces === "inscription" ? (
            <span className="mt-1.5 flex flex-wrap gap-1.5">
              {/* En tête des étiquettes : c'est ce qui change tout pour qui comptait y aller. */}
              {entree.retiree ? (
                <Pastille couleur="corail">Plus annoncée</Pastille>
              ) : null}
              {entree.tarif !== "inconnu" ? (
                <Pastille couleur={entree.tarif === "gratuit" ? "vert" : "violet"}>
                  {LIBELLES_TARIF[entree.tarif]}
                </Pastille>
              ) : null}
              {entree.acces === "inscription" ? (
                <Pastille couleur="corail">Sur inscription</Pastille>
              ) : null}
              {/* Le rythme dit ce qu'une période ne dit pas : un cours de mars à juin
                  n'a pas lieu tous les jours. */}
              {entree.recurrence ? (
                <Pastille couleur="rose">{entree.recurrence}</Pastille>
              ) : null}
              {entree.ageLabel ? <Pastille couleur="ambre">{entree.ageLabel}</Pastille> : null}
              {entree.commune ? <Pastille couleur="bleu">{entree.commune}</Pastille> : null}
            </span>
          ) : null}

          {inscrits.length > 0 ? (
            <span className="mt-1.5 flex items-center gap-2">
              <span className="flex -space-x-1.5">
                {inscrits.slice(0, 3).map((a) => (
                  <Jeton
                    key={a.publicationId}
                    nom={a.displayName}
                    id={a.accountId}
                    taille={22}
                  />
                ))}
              </span>
              <span className="min-w-0 truncate text-sm font-bold text-[color:var(--color-vert)]">
                {texteInscrits}
              </span>
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}
