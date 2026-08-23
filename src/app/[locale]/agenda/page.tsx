import { Link, getPathname } from "@/i18n/navigation";
import { type Locale } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";

import {
  FENETRES,
  TRANCHES_AGE,
  agesDemandes,
  communesDisponibles,
  upcomingCalendar,
  valeursDemandees,
  type CalendarEntry,
  type Fenetre,
} from "@/lib/calendar";
import { ACCES, TARIFS, type Acces, type Tarif } from "@/lib/ingest/tarif";
import { type PointCarte } from "@/lib/carte";
import { requireAccount } from "@/lib/session";
import { localeSure } from "@/lib/traduire";
import { CarteDesLieux } from "../carte-client";
import { FormulaireFiltres } from "./filtres-client";
import {
  Bouton,
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

/**
 * Ce que l'adresse porte. Les listes arrivent en clé répétée — « commune=Lancy&commune=Onex »,
 * ce qu'un formulaire à cases envoie — ou en une valeur à virgules, ce que les adresses
 * d'avant écrivaient et que des parents ont pu se partager. `valeursDemandees` lit les deux.
 */
type Params = {
  quand?: string;
  age?: string | string[];
  commune?: string | string[];
  cercle?: string;
  tarif?: string | string[];
  acces?: string | string[];
  /** Le bloc était ouvert quand on a appliqué : le rouvrir, même si plus rien n'est coché. */
  panneau?: string;
};

/**
 * Une puce qui se coche : une case native, invisible, et l'étiquette qui la porte.
 *
 * Une case plutôt qu'un lien, depuis que plusieurs communes se choisissent ensemble. Le
 * lien appliquait le choix aussitôt : trois communes coûtaient trois chargements, et la
 * page remontait en haut à chacun. Cocher ne coûte rien — le navigateur s'en charge, sans
 * réseau — et c'est le bouton du bas qui applique tout d'un coup.
 *
 * `sr-only` et non `hidden` : une case posée en `display: none` sort de l'ordre de
 * tabulation et disparaît des lecteurs d'écran. Elle reste donc là, invisible mais
 * atteignable, et c'est `peer-checked` qui teint l'étiquette. La couleur passe par des
 * classes et non par `style` pour cette seule raison : un style en ligne ne sait rien de
 * l'état de la case voisine.
 *
 * Une puce libre prend le fond de la page, pas celui de la surface : depuis que le bloc
 * de filtres est une carte blanche, une puce blanche s'y serait fondue et n'aurait plus
 * tenu que par son cercle. Crème sur blanc en clair, sombre sur surface en sombre : dans
 * les deux cas elle redevient un objet posé sur la carte.
 */
function Puce({
  nom,
  valeur,
  coche,
  type = "checkbox",
  children,
}: {
  nom: string;
  valeur: string;
  coche: boolean;
  type?: "checkbox" | "radio";
  children: React.ReactNode;
}) {
  return (
    <label className="shrink-0 cursor-pointer">
      <input
        type={type}
        name={nom}
        value={valeur}
        defaultChecked={coche}
        className="peer sr-only"
      />
      <span className="block rounded-[var(--radius-pilule)] bg-[color:var(--color-fond)] px-4 py-2 text-sm font-bold text-[color:var(--color-doux)] shadow-[inset_0_0_0_2px_var(--color-trait)] peer-checked:bg-[color:var(--color-vert)] peer-checked:text-[color:var(--color-fond)] peer-checked:shadow-none peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[color:var(--color-vert)]">
        {children}
      </span>
    </label>
  );
}

/**
 * Une catégorie de filtre : son nom, puis ses puces.
 *
 * Les puces passent à la ligne au lieu de défiler horizontalement. Un défilement latéral
 * sans barre visible cache des filtres sans que rien ne l'indique : on ne cherche pas un
 * geste dont on ignore l'existence. Deux lignes de puces coûtent quelques pixels ; un
 * filtre invisible coûte le filtre.
 *
 * Mais ce même retour à la ligne rendait les catégories illisibles : à l'ouverture, tout
 * formait une nappe où « 11 ans et + » et « Partout » se ressemblaient autant que
 * « Genève » et « Onex », et une catégorie qui débordait sur deux lignes se lisait comme
 * deux catégories. D'où le nom au-dessus et le filet qui la précède : le nom dit ce que la
 * rangée règle, le filet dit où elle s'arrête. L'espacement seul n'y suffisait pas — il
 * aurait fallu qu'il dépasse celui de deux lignes d'une même catégorie, et le bloc
 * ouvert aurait doublé de hauteur.
 */
function Rangee({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="py-3">
      <p className="mb-1.5 text-xs font-bold text-[color:var(--color-doux)]">{titre}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
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
  /*
    Chaque liste se lit dans l'adresse, et rien de ce qui n'y est pas ne restreint quoi que
    ce soit. Le découpage vit dans calendar.ts, où il est testé : celui qui était ici
    filtrait l'agenda en permanence pour un enfant de zéro an.

    Les valeurs sont recoupées avec celles qu'on connaît. Une adresse est une chose qu'on
    reçoit, pas une chose qu'on croit : « tarif=vole » ne doit rien filtrer, pas produire
    une requête sur une valeur qui n'existe pas dans l'énumération.
  */
  const ages = agesDemandes(params.age);
  const communesChoisies = valeursDemandees(params.commune);
  const tarifs = valeursDemandees(params.tarif).filter((v): v is Tarif =>
    (TARIFS as readonly string[]).includes(v),
  );
  const acces = valeursDemandees(params.acces).filter((v): v is Acces =>
    (ACCES as readonly string[]).includes(v),
  );
  const avecMonCercle = params.cercle === "1";

  /*
    La signature des filtres appliqués, qui sert de `key` aux cases.

    Les cases sont natives et non contrôlées : `defaultChecked` pose leur état au montage et
    n'y revient jamais. Sans cette clé, « Tout effacer » rouvrait bien l'agenda entier mais
    laissait Lancy et Onex cochés à l'écran — le panneau disait le contraire de la liste, et
    le geste suivant ramenait le filtre qu'on venait d'effacer.

    Elle ne change qu'au moment où les filtres sont appliqués. Cocher sans appliquer ne la
    touche pas : ce qu'on est en train de régler ne se fait pas défaire sous les doigts.
  */
  const signatureFiltres = [
    quand,
    ages.join(","),
    communesChoisies.join(","),
    tarifs.join(","),
    acces.join(","),
    avecMonCercle,
  ].join("|");

  /** Vrai dès que l'agenda affiché est plus étroit que l'agenda entier. */
  const filtreActif =
    quand !== FENETRE_PAR_DEFAUT ||
    ages.length > 0 ||
    communesChoisies.length > 0 ||
    avecMonCercle ||
    tarifs.length > 0 ||
    acces.length > 0;

  const [entrees, communes] = await Promise.all([
    upcomingCalendar(account.id, {
      quand,
      ages,
      communes: communesChoisies,
      avecMonCercle,
      tarifs,
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

      <FormulaireFiltres
        action={`${getPathname({ href: "/agenda", locale })}#filtres`}
        chemin="/agenda"
        className="mb-6"
      >
        {/*
          Tous les filtres sont repliés, « quand » compris, et posés sous la carte.

          Ils occupaient le haut de l'écran alors qu'on vient ici pour lire des activités :
          la première ligne d'agenda commençait sous la ligne de flottaison. Un filtre sert
          une fois sur dix visites, une activité se lit à chaque fois.

          Repliés, ils tenaient déjà peu de place ; sous la carte, ils touchent en plus ce
          qu'ils commandent. La carte et la liste montrent la même sélection : le réglage
          se lit maintenant entre les deux, au lieu d'être annoncé avant qu'on ait vu de
          quoi il s'agissait.

          Repliés derrière un bouton, pas derrière un geste à deviner. Il énumérait ce qu'on
          peut filtrer, en gris sur le fond crème : ça se lisait comme une légende, pas comme
          quelque chose à toucher. Il dit maintenant ce qu'il fait, sur la pastille blanche
          cerclée des réglages de « Sortir ». Ce qu'il y a dedans se voit en l'ouvrant.

          Et le bloc s'ouvre de lui-même dès qu'un filtre est actif : on ne cache jamais à
          quelqu'un ce qui restreint ce qu'il regarde. Il se rouvre aussi quand on vient
          d'appliquer depuis le bloc ouvert, même si l'on vient de tout décocher — sinon il
          se refermait au milieu d'un réglage, sous les doigts de qui le réglait.
        */}
        {/*
          Le bloc entier est une carte, et « Filtrer » en est l'en-tête.

          Ouvert, il n'avait pas de contenant : les rangées et le bouton reposaient sur le
          fond de page, comme la liste d'activités juste en dessous. Rien ne disait où la
          section commençait ni où elle finissait, et « Voir les activités » flottait entre
          les deux au lieu d'appartenir aux filtres qu'il applique.

          Fermé, la carte n'est plus que son en-tête : à 44 px de haut, un rayon de 1,5 rem
          se lit comme la pastille qu'elle remplace. On ne perd donc rien de ce qui rendait
          le bouton visible sur le fond crème.
        */}
        <details
          open={filtreActif || params.panneau === "1"}
          className="rounded-[var(--radius-carte)] bg-[color:var(--color-surface)] shadow-[inset_0_0_0_2px_var(--color-trait)]"
        >
          <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-[color:var(--color-encre)]">
            {t("filtrer")}
          </summary>

          <input type="hidden" name="panneau" value="1" />

          {/*
            Le filet de l'en-tête est porté par ce conteneur, qui n'existe que lorsque la
            carte est ouverte : pas de variante `group-open` à tenir, et le trait court d'un
            bord à l'autre parce que la bordure se pose en dehors du `px-4`.
          */}
          <div className="border-t border-[color:var(--color-trait)] px-4">
            {/*
              Ne rien cocher ne restreint rien : c'est la règle de toutes les listes d'ici,
              et elle remplace les puces « Partout », « Tous les prix », « Tous les âges »
              qui occupaient la première place de chaque rangée. Une case décochée dit déjà
              ce que ces puces disaient, et « Tout effacer » dit le reste d'un seul geste.
            */}
            <div key={signatureFiltres} className="divide-y divide-[color:var(--color-trait)]">
              {/*
                « Qui y va » est la question que le site promet en premier : une activité
                intéresse avant tout parce que quelqu'un de mes cercles s'y est inscrit, et
                c'est cette ligne qui mérite le haut du bloc. Les autres — quand, âge, commune,
                prix, inscription — resserrent un résultat, mais c'est elle qui le rend
                personnel.
              */}
              <Rangee titre={t("categorieQuiYVa")}>
                <Puce nom="cercle" valeur="1" coche={avecMonCercle}>
                  {t("monCercle")}
                </Puce>
              </Rangee>

              <Rangee titre={t("categorieQuand")}>
                {/*
                  La seule rangée à choix unique, et à boutons radio pour le dire. « Quand »
                  est une fenêtre de temps, pas une étiquette : cocher aujourd'hui et la
                  quinzaine ensemble revient à prendre la quinzaine, et l'écran promettrait un
                  choix qui n'en est pas un.
                */}
                {FENETRES.map((f) => (
                  <Puce key={f} type="radio" nom="quand" valeur={f} coche={quand === f}>
                    {tE(`fenetre.${f}`)}
                  </Puce>
                ))}
              </Rangee>

              <Rangee titre={t("categorieAge")}>
                {/*
                  Les tranches s'ajoutent au lieu de se remplacer : un parent de trois enfants
                  cherche ce qui convient à l'un des trois, pas trois fois de suite.
                */}
                {TRANCHES_AGE.map((tranche) => (
                  <Puce
                    key={tranche}
                    nom="age"
                    valeur={String(tranche)}
                    coche={ages.includes(tranche)}
                  >
                    {tE(`age.${tranche}`)}
                  </Puce>
                ))}
              </Rangee>

              {communes.length > 1 ? (
                <Rangee titre={t("categorieCommune")}>
                  {communes.map((c) => (
                    <Puce key={c} nom="commune" valeur={c} coche={communesChoisies.includes(c)}>
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
              <Rangee titre={t("categoriePrix")}>
                {TARIFS.map((choix) => (
                  <Puce key={choix} nom="tarif" valeur={choix} coche={tarifs.includes(choix)}>
                    {tE(`tarif.${choix}`)}
                  </Puce>
                ))}
              </Rangee>

              <Rangee titre={t("categorieInscription")}>
                {ACCES.map((a) => (
                  <Puce key={a} nom="acces" valeur={a} coche={acces.includes(a)}>
                    {tE(`acces.${a}`)}
                  </Puce>
                ))}
              </Rangee>
            </div>

            <div className="pb-4">
              <Bouton type="submit">{t("appliquerFiltres")}</Bouton>
              {filtreActif ? (
                <p className="mt-2 text-center">
                  {/*
                    « panneau=1 » et pas seulement « /agenda » : on efface pour repartir, pas
                    pour refermer. Sans lui, le bloc se repliait au moment où l'on venait de
                    se donner de la place pour choisir autre chose.
                  */}
                  <Link
                    href="/agenda?panneau=1#filtres"
                    className="text-sm font-bold text-[color:var(--color-doux)] underline underline-offset-4"
                  >
                    {t("toutEffacer")}
                  </Link>
                </p>
              ) : null}
            </div>
          </div>
        </details>
      </FormulaireFiltres>

      {entrees.length === 0 ? (
        <Vide emoji="🗓️" titre={t("rienNeCorrespond")}>
          {filtreActif ? (
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
