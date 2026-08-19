import { Link } from "@/i18n/navigation";
import { type Locale } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";

import {
  FENETRES,
  TRANCHES_AGE,
  agesDemandes,
  communesDisponibles,
  upcomingCalendar,
  type CalendarEntry,
  type Fenetre,
} from "@/lib/calendar";
import { ACCES, TARIFS, type Acces, type Tarif } from "@/lib/ingest/tarif";
import { type PointCarte } from "@/lib/carte";
import { requireAccount } from "@/lib/session";
import { localeSure } from "@/lib/traduire";
import { CarteDesLieux } from "../carte-client";
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
  const t = await getTranslations("Agenda");
  const tE = await getTranslations("Etiquettes");
  const locale = localeSure(await getLocale());
  const account = await requireAccount();
  const params = await searchParams;

  /** La fenêtre qu'on voit sans rien demander : assez large pour qu'il y ait à lire. */
  const FENETRE_PAR_DEFAUT: Fenetre = "quinzaine";

  const quand = (FENETRES as readonly string[]).includes(params.quand ?? "")
    ? (params.quand as Fenetre)
    : FENETRE_PAR_DEFAUT;
  // Plusieurs âges, séparés par des virgules dans l'adresse : une famille en a plusieurs, et
  // l'écran doit rester partageable et utilisable sans JavaScript. Le découpage vit dans
  // calendar.ts, où il est testé : celui qui était ici filtrait l'agenda en permanence.
  const ages = agesDemandes(params.age);
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
      <Titre emoji="📅" sous={t("sousTitre")}>
        {t("titre")}
      </Titre>

      <div className="mb-6 space-y-2">
        {/*
          Tous les filtres sont repliés, « quand » compris.

          Ils occupaient le haut de l'écran alors qu'on vient ici pour lire des activités :
          la première ligne d'agenda commençait sous la ligne de flottaison. Un filtre sert
          une fois sur dix visites, une activité se lit à chaque fois.

          Repliés derrière un bouton, pas derrière un geste à deviner. Il énumérait ce qu'on
          peut filtrer, en gris sur le fond crème : ça se lisait comme une légende, pas comme
          quelque chose à toucher. Il dit maintenant ce qu'il fait, sur la pastille blanche
          cerclée des réglages de « Sortir ». Ce qu'il y a dedans se voit en l'ouvrant.

          Et le bloc s'ouvre de lui-même dès qu'un filtre est actif : on ne cache jamais à
          quelqu'un ce qui restreint ce qu'il regarde.
        */}
        <details
          open={
            quand !== FENETRE_PAR_DEFAUT ||
            ages.length > 0 ||
            Boolean(params.commune) ||
            avecMonCercle ||
            Boolean(tarif) ||
            Boolean(acces)
          }
        >
          <summary className="cursor-pointer rounded-[var(--radius-pilule)] bg-[color:var(--color-surface)] px-4 py-3 text-sm font-bold text-[color:var(--color-encre)] shadow-[inset_0_0_0_2px_var(--color-trait)]">
            {t("filtrer")}
          </summary>

          <div className="mt-2 space-y-2">
        <Rangee>
          {FENETRES.map((f) => (
            <Puce key={f} href={lien(params, { quand: f })} actif={quand === f}>
              {tE(`fenetre.${f}`)}
            </Puce>
          ))}
        </Rangee>

        <Rangee>
          {/*
            Les tranches s'ajoutent au lieu de se remplacer : un parent de trois enfants
            cherche ce qui convient à l'un des trois, pas trois fois de suite.
          */}
          <Puce href={lien(params, { age: undefined })} actif={ages.length === 0}>
            {t("tousLesAges")}
          </Puce>
          {TRANCHES_AGE.map((tranche) => {
            const choisi = ages.includes(tranche);
            const apres = choisi
              ? ages.filter((a) => a !== tranche)
              : [...ages, tranche].sort((a, b) => a - b);

            return (
              <Puce
                key={tranche}
                href={lien(params, { age: apres.length > 0 ? apres.join(",") : undefined })}
                actif={choisi}
              >
                {tE(`age.${tranche}`)}
              </Puce>
            );
          })}
        </Rangee>

        {communes.length > 1 ? (
          <Rangee>
            <Puce href={lien(params, { commune: undefined })} actif={!params.commune}>
              {t("partout")}
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
                {t("tousLesPrix")}
              </Puce>
              {TARIFS.map((choix) => (
                <Puce key={choix} href={lien(params, { tarif: choix })} actif={tarif === choix}>
                  {tE(`tarif.${choix}`)}
                </Puce>
              ))}
            </Rangee>

            <Rangee>
              <Puce href={lien(params, { acces: undefined })} actif={!acces}>
                {t("avecOuSansInscription")}
              </Puce>
              {ACCES.map((a) => (
                <Puce key={a} href={lien(params, { acces: a })} actif={acces === a}>
                  {tE(`acces.${a}`)}
                </Puce>
              ))}
            </Rangee>

            <Rangee>
              <Puce
                href={lien(params, { cercle: avecMonCercle ? undefined : "1" })}
                actif={avecMonCercle}
              >
                {t("monCercle")}
              </Puce>
            </Rangee>
          </div>
        </details>
      </div>

      <div className="mb-6">
        <LienBouton href="/agenda/nouveau">{t("proposerActivite")}</LienBouton>
      </div>

      {/*
        La même liste, posée sur la carte — celle des activités que les filtres retiennent,
        pas une autre. « Quelque part près de chez moi mercredi » est une question de carte,
        pas de liste, et c'est la carte des filtres actifs qui y répond.
      */}
      {entrees.length > 0 ? (
        <CarteDesLieux
          points={entrees.flatMap((entree): PointCarte[] =>
            entree.lat != null && entree.lon != null
              ? [
                  {
                    id: entree.id,
                    nom: entree.title,
                    sousTitre: [
                      entree.enCours ? t("enCeMomentCarte") : libelleJour(entree.startsAt, locale),
                      entree.place ?? entree.commune,
                    ]
                      .filter(Boolean)
                      .join(" · "),
                    lat: entree.lat,
                    lon: entree.lon,
                    href: `/agenda/${entree.id}`,
                  },
                ]
              : [],
          )}
          sansPosition={entrees.filter((e) => e.lat == null || e.lon == null).length}
          cleApi={process.env.GOOGLE_MAPS_API_KEY ?? null}
          mapId={process.env.GOOGLE_MAPS_MAP_ID ?? null}
        />
      ) : null}

      {entrees.length === 0 ? (
        <Vide emoji="🗓️" titre={t("rienNeCorrespond")}>
          {avecMonCercle || ages.length > 0 || params.commune || tarif || acces ? (
            <p>
              {t.rich("elargirFiltres", {
                lien: (chunks) => (
                  <Link href="/agenda" className="font-bold underline underline-offset-4">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          ) : (
            <p>{t("activitesApparaitront")}</p>
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
                {cle === EN_COURS ? t("enCeMoment") : libelleJour(activites[0].startsAt, locale)}
                <span className="ml-3 font-normal text-[color:var(--color-doux)]">
                  {t("nActivites", { n: activites.length })}
                </span>
              </h2>

              <ul className="space-y-2">
                {enTete.map((entree) => (
                  <LigneActivite
                    key={entree.id}
                    entree={entree}
                    lecteurId={account.id}
                    locale={locale}
                  />
                ))}
              </ul>

              {replies.length > 0 ? (
                <details className="mt-2">
                  <summary className="cursor-pointer py-2 text-sm font-bold text-[color:var(--color-doux)]">
                    {t("etAutresEncore", { n: replies.length })}
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {replies.map((entree) => (
                      <LigneActivite
                        key={entree.id}
                        entree={entree}
                        lecteurId={account.id}
                        locale={locale}
                      />
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
  locale,
}: {
  entree: CalendarEntry;
  lecteurId: string;
  locale: Locale;
}) {
  // `useTranslations` marche aussi dans un composant serveur, et celui-ci n'a rien d'async.
  const t = useTranslations("Agenda");
  const tE = useTranslations("Etiquettes");
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
      ? t("avecVousYAllez", { noms })
      : t("vousYAllez")
    : t("yVont", { noms, n: autres.length });

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
                <span className="block text-[0.7rem] opacity-75">{t("jusquAu")}</span>
                {jourCourt(entree.endsAt, locale).nombre} {jourCourt(entree.endsAt, locale).mois}
              </>
            ) : (
              t("enCours")
            )
          ) : entree.allDay ? (
            // Une exposition ou un marché n'ouvre pas à minuit : afficher 00:00 était faux.
            t("touteLaJournee")
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
                <Pastille couleur="corail">{t("plusAnnoncee")}</Pastille>
              ) : null}
              {entree.tarif !== "inconnu" ? (
                <Pastille couleur={entree.tarif === "gratuit" ? "vert" : "violet"}>
                  {tE(`tarif.${entree.tarif}`)}
                </Pastille>
              ) : null}
              {entree.acces === "inscription" ? (
                <Pastille couleur="corail">{t("surInscription")}</Pastille>
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
