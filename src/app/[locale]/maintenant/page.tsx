import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { LOCALE_BCP47, type Locale } from "@/i18n/routing";
import { upcomingCalendar } from "@/lib/calendar";
import { EMOJIS_CATEGORIE, estCategorieLieu } from "@/lib/categories-lieu";
import { myChildren } from "@/lib/children";
import { currentlyOut, upcomingOutings } from "@/lib/publications";
import { requireAccount } from "@/lib/session";
import { listeFr } from "@/lib/texte";
import { readerCircles, type VisiblePublication } from "@/lib/visibility";
import { rejoindreSortie, retirerSortie } from "../actions";
import { DemandeNotifications } from "./demande-notifications";
import {
  Carte,
  IconeFleche,
  LienBouton,
  Navigation,
  Pastille,
  Vide,
  heureCourte,
  jourCourt,
  teinte,
} from "../ui";

/*
 * Écran « Plein jour » (DA V3, validée le 5 septembre 2026).
 *
 * Un parent dehors, une main occupée, trois secondes : il doit voir COMBIEN de
 * familles sont dehors, et le bouton pour sortir. D'où la hiérarchie :
 *
 *  1. la date, petite, en capitales — on situe le jour sans le lire ;
 *  2. le compteur géant en vert — le vert est la couleur du « dehors », jamais
 *     d'autre chose ;
 *  3. les cartes, avec l'anneau « reste Xh » qui rend le temps visible sans JS
 *     (le pourcentage est calculé au rendu serveur) ;
 *  4. la barre d'action unique « NOUS SORTONS » en vermillon, épinglée au-dessus
 *     des onglets — le vermillon est l'unique couleur-signal : il ne porte que le
 *     geste, jamais un état.
 *
 * Le thème `.plein-jour` (papier #f6f4ee, trait accordé) est porté par le <main> :
 * il ne s'applique qu'à cet écran tant que la DA n'est pas généralisée.
 */
export default async function Maintenant() {
  const account = await requireAccount();
  const t = await getTranslations("Maintenant");
  const locale = (await getLocale()) as Locale;
  const [sorties, aVenir, cercles, enfants] = await Promise.all([
    currentlyOut(account.id),
    upcomingOutings(account.id),
    readerCircles(account.id),
    myChildren(account.id),
  ]);

  /*
    L'agenda du canton, dès que l'écran n'a rien d'autre à montrer.

    Cet écran est le premier qu'on voit, et l'agenda a plus de cent activités qui ne
    dépendent de personne : c'est la seule chose qui vaille quelque chose le premier jour,
    quand tout le reste attend que d'autres familles arrivent.

    La condition n'est pas « pas de cercle » mais « rien à voir » — dont le premier jour
    n'est qu'un cas particulier. L'appel à sortir reste épinglé en bas, et les sorties des
    autres passent avant : on n'a rien caché de ce qu'il faut faire, on a ajouté ce qu'il
    y a à voir en attendant.
  */
  const rienAVoir = cercles.length === 0 || (sorties.length === 0 && aVenir.length === 0);
  const enAttendant = rienAVoir ? await upcomingCalendar(account.id, { limit: 3 }) : [];

  /* « Samedi 5 septembre » — en capitales à l'affichage, première lettre majuscule ici
     pour les lecteurs d'écran qui restituent la casse. */
  const dateBrute = new Intl.DateTimeFormat(LOCALE_BCP47[locale], {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Zurich",
  }).format(new Date());
  const dateEnTete =
    dateBrute.charAt(0).toLocaleUpperCase(LOCALE_BCP47[locale]) + dateBrute.slice(1);

  /*
    La barre d'action unique. « Annoncer une sortie » : le geste se dit au lecteur, pas
    à la première personne — la maquette tranchait « Nous sortons » mais le titre
    d'écran qui le justifiait a disparu, remplacé par le compteur, et l'utilisateur a
    préféré l'infinitif explicite (2026-09-06). Le titre de /sortir reste « Nous
    sortons » : sur l'écran lui-même, la première personne redevient juste.
    Sans cercle, pas de barre : l'écran propose d'abord d'en rejoindre un.
  */
  const barreSortir =
    cercles.length > 0 ? (
      <Link
        href="/sortir"
        data-bouton
        className="flex h-16 w-full items-center justify-center gap-2 rounded-[18px] bg-[color:var(--color-signal)] px-5 text-[1.05rem] font-black uppercase tracking-wide text-[color:var(--color-signal-encre)] transition-transform active:translate-y-[2px]"
      >
        {t("annoncerSortie")}
        <IconeFleche />
      </Link>
    ) : null;

  return (
    <main className="plein-jour apparait">
      <header className="mb-5">
        <p className="text-[0.8rem] font-bold uppercase tracking-[0.18em] text-[color:var(--color-doux)]">
          {dateEnTete}
        </p>
        {/*
          Le compteur est le titre de l'écran : « 3 familles dehors » est exactement ce
          que la page dit, et un lecteur d'écran y arrive par la navigation de titres
          comme sur tout autre écran. Le nombre garde son style de compteur.
        */}
        <h1 className="mt-1.5 flex items-baseline gap-3">
          <span className="text-[3.5rem] font-black leading-none tracking-[-0.04em] text-[color:var(--color-vert)]">
            {sorties.length}
          </span>
          <span className="text-base font-extrabold uppercase leading-tight tracking-[0.02em]">
            {t("famillesDehors", { n: sorties.length })}
          </span>
        </h1>
        {cercles.length > 0 ? (
          <p className="mt-1 pl-[4.4rem] text-xs font-semibold tracking-[0.04em] text-[color:var(--color-doux)]">
            {t("parmiVosCercles", { n: cercles.length })}
          </p>
        ) : null}
      </header>

      {/*
        Bannière de demande d'autorisation pour les notifications push. Visible
        uniquement quand l'utilisateur a déjà rejoint un cercle — c'est le
        moment où les notifications deviennent utiles. Le composant client décide
        lui-même s'il s'affiche réellement.
      */}
      {cercles.length > 0 ? <DemandeNotifications /> : null}

      {cercles.length === 0 ? (
        <Vide emoji="🫱" titre={t("titreAucunCercle")}>
          <p className="mb-4">{t("texteAucunCercle")}</p>
          {/*
            « Rejoindre ou créer » et pas « créer » : on arrive presque toujours ici parce
            qu'on a été invité. Envoyer d'emblée vers la création ferait fabriquer un cercle
            vide à quelqu'un qui a déjà le lien du bon dans ses messages.
          */}
          <LienBouton href="/cercles">{t("rejoindreOuCreer")}</LienBouton>
        </Vide>
      ) : (
        <>
          {sorties.length === 0 ? (
            <Vide emoji="🌤️" titre={t("titrePersonneDehors")}>
              {t("textePersonneDehors")}
            </Vide>
          ) : (
            <ul className="space-y-3">
              {sorties.map((sortie) => (
                <li key={sortie.id}>
                  <LigneSortie
                    sortie={sortie}
                    accountId={account.id}
                    mesEnfants={enfants.map((e) => e.id)}
                  />
                </li>
              ))}
            </ul>
          )}

          {aVenir.length > 0 ? (
            <ul className="mt-5 space-y-3">
              {aVenir.map((sortie) => (
                <li key={sortie.id}>
                  <LigneSortie
                    sortie={sortie}
                    accountId={account.id}
                    mesEnfants={enfants.map((e) => e.id)}
                    aVenir
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}

      {enAttendant.length > 0 ? (
        <section className="mt-8">
          <h2 className="titre mb-1 text-lg font-bold">{t("titreCanton")}</h2>
          <p className="mb-3 text-sm leading-snug text-[color:var(--color-doux)]">
            {t("sousTitreCanton")}
          </p>
          <ul className="mb-4 space-y-2">
            {enAttendant.map((activite) => {
              /*
                Une activité déjà commencée portait sa date de début : une exposition
                ouverte du 22 juillet au 15 août affichait « 22 juillet » alors qu'on
                était le 12 août. C'est la date de fin qui informe, puisqu'elle dit
                combien de temps il reste pour y aller.
              */
              const jour = jourCourt(
                activite.enCours && activite.endsAt ? activite.endsAt : activite.startsAt,
                locale,
              );
              return (
                <li key={activite.id}>
                  <Link
                    href={`/agenda/${activite.id}`}
                    className="flex gap-3 rounded-2xl bg-[color:var(--color-surface)] px-4 py-3"
                    style={{
                      boxShadow: `inset 0 0 0 2px var(--color-${teinte(activite.id)}-doux)`,
                    }}
                  >
                    <span
                      className="w-14 shrink-0 text-sm font-bold leading-tight"
                      style={{ color: `var(--color-${teinte(activite.id)})` }}
                    >
                      {activite.enCours && activite.endsAt ? (
                        <span className="block text-[0.7rem] opacity-75">
                          {t("jusquAu")}
                        </span>
                      ) : null}
                      {jour.nombre} {jour.mois}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="titre line-clamp-2 font-bold leading-tight">
                        {activite.title}
                      </span>
                      {activite.commune ? (
                        <span className="mt-0.5 block text-sm text-[color:var(--color-doux)]">
                          {activite.commune}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <LienBouton href="/agenda">{t("voirAgenda")}</LienBouton>
        </section>
      ) : null}

      <Navigation actif="maintenant" action={barreSortir} papier />
    </main>
  );
}

async function LigneSortie({
  sortie,
  accountId,
  mesEnfants,
  aVenir = false,
}: {
  sortie: VisiblePublication;
  accountId: string;
  mesEnfants: string[];
  aVenir?: boolean;
}) {
  const t = await getTranslations("Maintenant");
  const locale = (await getLocale()) as Locale;
  /*
    Le compte des autres familles et « j'y suis » viennent de la requête de visibilité,
    pas d'une requête de participants par carte : l'écran principal se charge le plus
    souvent, et n'affiche ni nom ni enfant des autres — c'est la page de la sortie qui
    les liste.
  */
  const autres = sortie.otherParticipants;
  const jySuis = sortie.readerParticipates;
  const cestMoi = sortie.authorId === accountId;

  /* Bouton fantôme : geste calme (annuler, rentrés) — jamais de vermillon dessus. */
  const fantome =
    "inline-flex shrink-0 items-center gap-1.5 rounded-[12px] bg-[color:var(--color-surface2)] px-3.5 py-2 text-sm font-extrabold shadow-[inset_0_0_0_1px_var(--color-trait)] active:translate-y-[1px]";
  /* Le vermillon ne porte que le geste positif : rejoindre une sortie. */
  const signal =
    "inline-flex shrink-0 items-center gap-1.5 rounded-[12px] bg-[color:var(--color-signal)] px-4 py-2 text-sm font-black uppercase tracking-wide text-[color:var(--color-signal-encre)] active:translate-y-[1px]";

  const enfantsLigne = [
    sortie.authorChildren.length > 0
      ? t("avecEnfants", { liste: listeFr(sortie.authorChildren) })
      : null,
    autres > 0 ? t("autresFamilles", { n: autres }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  /* ---- sortie à venir : ligne compacte, bloc date bleu à gauche ---- */
  if (aVenir) {
    const jour = jourCourt(sortie.startsAt, locale);
    return (
      <Carte className="flex items-center gap-3 !p-3">
        <div className="flex w-16 shrink-0 flex-col items-center rounded-[13px] bg-[color:var(--color-bleu-doux)] px-1 py-2">
          <span className="text-[0.7rem] font-extrabold uppercase tracking-[0.12em] text-[color:var(--color-bleu)]">
            {jour.jour}
          </span>
          <span className="mt-0.5 text-[1.05rem] font-black leading-none text-[color:var(--color-bleu)]">
            {heureCourte(sortie.startsAt)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.97rem] font-extrabold leading-tight">
            <Link
              href={`/sortie/${sortie.id}`}
              className="underline-offset-4 hover:underline"
            >
              {sortie.placeName}
            </Link>
          </p>
          <p className="mt-0.5 truncate text-xs text-[color:var(--color-doux)]">
            {[
              cestMoi ? t("vous") : t("aVenirPar", { nom: sortie.authorName }),
              enfantsLigne,
              sortie.circleName,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {cestMoi ? (
          <form action={retirerSortie}>
            <input type="hidden" name="sortie" value={sortie.id} />
            <button className={fantome}>{t("annuler")}</button>
          </form>
        ) : jySuis ? (
          <Pastille couleur="vert">{t("vousYEtes")}</Pastille>
        ) : (
          /*
            Rejoindre avant le départ reste possible depuis cet écran : la maquette
            n'affichait qu'une pastille « à venir », mais c'est un écran statique —
            l'app, elle, a toujours laissé dire « nous aussi » en avance.
          */
          <form action={rejoindreSortie} className="shrink-0">
            <input type="hidden" name="sortie" value={sortie.id} />
            {mesEnfants.map((id) => (
              <input key={id} type="hidden" name="enfant" value={id} />
            ))}
            <button className={signal}>
              {t("nousAussi")}
              <span aria-hidden>→</span>
            </button>
          </form>
        )}
      </Carte>
    );
  }

  /* ---- sortie en cours : anneau compte à rebours + lieu en grand ---- */

  /*
    L'anneau se remplit du temps RESTANT : il se vide à mesure que la sortie avance,
    et le pouce restant est la quantité verte. Calculé au rendu serveur — aucun JS
    côté client pour ça (le tic-tac en direct viendra plus tard, s'il vient).
  */
  const total = sortie.endsAt.getTime() - sortie.startsAt.getTime();
  // `new Date()` et non `Date.now()` : la règle react-hooks/purity l'accepte, comme
  // partout ailleurs dans les composants serveur de l'app (sortie/[id], reglages).
  const resteMs = Math.max(0, sortie.endsAt.getTime() - new Date().getTime());
  const pourcent = total > 0 ? Math.round((resteMs / total) * 100) : 0;
  const minutes = Math.max(1, Math.round(resteMs / 60_000));
  const duree =
    minutes >= 60
      ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`
      : `${minutes}min`;

  const emoji =
    sortie.placeCategorie && estCategorieLieu(sortie.placeCategorie)
      ? EMOJIS_CATEGORIE[sortie.placeCategorie]
      : "📍";

  return (
    <Carte className="relative overflow-hidden !p-3.5">
      {/* Le liseré vert des sorties en cours : le « dehors » déborde de la carte. */}
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 w-[5px] bg-[color:var(--color-vert)]"
      />
      <div className="flex gap-4">
        <div
          role="img"
          aria-label={`${duree} ${t("restants")}`}
          className="relative h-16 w-16 shrink-0 rounded-full"
          style={{
            background: `conic-gradient(var(--color-vert) 0 ${pourcent}%, var(--color-anneau-vide) ${pourcent}% 100%)`,
          }}
        >
          <div className="absolute inset-[7px] flex flex-col items-center justify-center rounded-full bg-[color:var(--color-surface)]">
            <span className="text-[0.95rem] font-black leading-none tracking-tight">
              {duree}
            </span>
            {/* Neuf lettres dans un cercle de 50 px : petit et serré, sinon ça déborde. */}
            <span className="mt-0.5 max-w-full text-[0.4rem] font-bold uppercase tracking-[0.02em] text-[color:var(--color-doux)]">
              {t("restants")}
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[0.97rem] font-extrabold leading-snug">
            {cestMoi ? (
              <Link
                href={`/sortie/${sortie.id}`}
                className="underline-offset-4 hover:underline"
              >
                {t("vousYEtes")}
              </Link>
            ) : (
              <>
                <Link
                  href={`/sortie/${sortie.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {sortie.authorName}
                </Link>{" "}
                <span className="font-bold text-[color:var(--color-doux)]">
                  {t("yEst")}
                </span>
              </>
            )}
          </p>
          {enfantsLigne ? (
            <p className="mt-0.5 text-xs leading-snug text-[color:var(--color-doux)]">
              {enfantsLigne}
            </p>
          ) : null}
          {sortie.note ? <p className="mt-1 text-sm">{sortie.note}</p> : null}
          <div className="mt-2 flex items-center gap-2">
            <span
              aria-hidden
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-[color:var(--color-surface2)] text-[15px]"
            >
              {emoji}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[1.05rem] font-black leading-tight tracking-tight">
                <Link
                  href={`/sortie/${sortie.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {sortie.placeName}
                </Link>
              </p>
              <p className="truncate text-xs font-semibold text-[color:var(--color-doux)]">
                {/*
                  Toujours « jusqu'à » : cette branche ne reçoit que `currentlyOut`, dont
                  la base a déjà jugé le départ passé. Re-comparer ici avec l'horloge de
                  Node pouvait contredire la base de quelques millisecondes.
                */}
                {[
                  sortie.placeCommune,
                  t("enCoursJusqua", { heure: heureCourte(sortie.endsAt) }),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2.5">
        {sortie.circleName ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-[color:var(--color-vert-doux)] px-3 py-1.5 text-xs font-extrabold text-[color:var(--color-vert)]">
            <span aria-hidden>●</span>
            <span className="truncate">{sortie.circleName}</span>
          </span>
        ) : (
          <span aria-hidden />
        )}
        {/*
          Tant que la minute de silence court (notifiedAt vide), retirer la sortie ne
          réveille personne : « Annuler ». Une fois les alertes parties, le même geste
          redevient « Rentrés » — on ne reprend pas ce qui a sonné. Se retirer d'une
          sortie qu'on a rejointe (sans l'avoir créée) reste possible depuis sa page.
        */}
        {cestMoi ? (
          <form action={retirerSortie} className="shrink-0">
            <input type="hidden" name="sortie" value={sortie.id} />
            <button className={fantome}>
              {!sortie.notifiedAt ? t("annuler") : t("rentres")}
            </button>
          </form>
        ) : jySuis ? (
          <Pastille couleur="vert">{t("vousYEtes")}</Pastille>
        ) : (
          <form action={rejoindreSortie} className="shrink-0">
            <input type="hidden" name="sortie" value={sortie.id} />
            {mesEnfants.map((id) => (
              <input key={id} type="hidden" name="enfant" value={id} />
            ))}
            <button className={signal}>
              {t("nousAussi")}
              <span aria-hidden>→</span>
            </button>
          </form>
        )}
      </div>
      {cestMoi && !sortie.notifiedAt ? (
        <p className="mt-1.5 text-right text-xs leading-tight text-[color:var(--color-doux)]">
          {t("pasEncorePrevenu")}
        </p>
      ) : null}
    </Carte>
  );
}
