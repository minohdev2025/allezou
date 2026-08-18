import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

import { upcomingCalendar } from "@/lib/calendar";
import { myChildren } from "@/lib/children";
import { currentlyOut, upcomingOutings } from "@/lib/publications";
import { requireAccount } from "@/lib/session";
import { listeFr } from "@/lib/texte";
import { readerCircles, visibleParticipants, type VisiblePublication } from "@/lib/visibility";
import { rejoindreSortie, retirerSortie } from "../actions";
import {
  Carte,
  IconeArbre,
  Jeton,
  LienBouton,
  Navigation,
  Pastille,
  Vide,
  heureCourte,
  jourCourt,
  teinte,
} from "../ui";

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
    L'agenda du canton, pour qui n'a pas encore de cercle.

    Cet écran est le premier qu'on voit, et sans cercle il ne montrait rien. Or l'agenda a
    plus de cent activités qui ne dépendent de personne : c'est la seule chose qui vaille
    quelque chose le premier jour, quand tout le reste attend que d'autres familles arrivent.

    L'appel à créer un cercle reste en tête. On n'a pas caché ce qu'il faut faire, on a
    ajouté ce qu'il y a à voir en attendant.
  */
  const enAttendant = cercles.length === 0 ? await upcomingCalendar(account.id, { limit: 3 }) : [];

  return (
    <main className="apparait">
      <header className="mb-6">
        <p className="text-[color:var(--color-doux)]">
          {t("bonjour", { nom: account.displayName })}
        </p>
        <h1 className="text-[1.75rem] font-bold leading-tight">{t("titre")}</h1>
      </header>

      <div className="mb-7">
        <LienBouton href="/sortir" variante="principal" className="!py-5 !text-xl">
          <IconeArbre className="h-7 w-7" />
          {t("nousSortons")}
        </LienBouton>
      </div>

      {cercles.length === 0 ? (
        <>
          <Vide emoji="🫱" titre={t("titreAucunCercle")}>
            <p className="mb-4">{t("texteAucunCercle")}</p>
            {/*
              « Rejoindre ou créer » et pas « créer » : on arrive presque toujours ici parce
              qu'on a été invité. Envoyer d'emblée vers la création ferait fabriquer un cercle
              vide à quelqu'un qui a déjà le lien du bon dans ses messages.
            */}
            <LienBouton href="/cercles">{t("rejoindreOuCreer")}</LienBouton>
          </Vide>

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
        </>
      ) : (
        <>
          {sorties.length === 0 ? (
            <Vide emoji="🌤️" titre={t("titrePersonneDehors")}>
              {t("textePersonneDehors")}
            </Vide>
          ) : (
            <ul className="space-y-4">
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
            <section className="mt-8">
              <h2 className="titre mb-3 text-lg font-bold">{t("titreAVenir")}</h2>
              <ul className="space-y-4">
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
            </section>
          ) : null}
        </>
      )}

      <Navigation actif="maintenant" />
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
  const participants = await visibleParticipants(accountId, sortie.id);
  const autres = participants.filter((p) => !p.isAuthor);
  const jySuis = participants.some((p) => p.accountId === accountId);
  const cestMoi = sortie.authorId === accountId;
  const couleur = teinte(sortie.placeId ?? sortie.id);

  /**
   * L'action tient dans une pastille à droite du nom plutôt que dans une barre pleine
   * largeur : la carte descend d'environ 70 px, ce qui fait tenir une sortie de plus à
   * l'écran sans rien retirer de ce qui se lit. Se retirer d'une sortie qu'on a rejointe
   * reste possible depuis sa page de détail — c'est un geste rare, il n'a pas à occuper
   * l'écran principal.
   */
  const pastilleAction =
    "shrink-0 rounded-[var(--radius-pilule)] px-4 py-2.5 text-sm font-bold shadow-[inset_0_0_0_2px_var(--color-trait)] active:translate-y-[1px]";

  return (
    <Carte accent={couleur} className="!p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <h2 className="titre text-xl font-bold leading-tight">
          <Link href={`/sortie/${sortie.id}`} className="underline-offset-4 hover:underline">
            {sortie.placeName}
          </Link>
        </h2>
        {/*
          « jusqu'à » et « dès », écrits.

          Le même emplacement portait l'heure de fin pour une sortie en cours et l'heure de
          début pour une sortie à venir, avec la même icône d'horloge : seule la couleur les
          distinguait, et personne n'apprend un code couleur qu'on ne lui a pas donné. Deux
          mots règlent la question, et l'horloge devient inutile — elle prenait la place
          qu'ils occupent.
        */}
        <span
          className="shrink-0 rounded-[var(--radius-pilule)] px-2.5 py-1 text-sm font-bold"
          style={
            aVenir
              ? { background: "var(--color-bleu-doux)", color: "var(--color-bleu)" }
              : { background: "var(--color-ambre-doux)", color: "var(--color-ambre)" }
          }
        >
          {aVenir
            ? t("aVenirDate", {
                jour: jourCourt(sortie.startsAt, locale).jour,
                heure: heureCourte(sortie.startsAt),
              })
            : t("enCoursJusqua", { heure: heureCourte(sortie.endsAt) })}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <Jeton nom={sortie.authorName} id={sortie.authorId} />

        <div className="min-w-0 flex-1">
          <p className="font-bold leading-tight">{cestMoi ? t("vous") : sortie.authorName}</p>
          {sortie.authorChildren.length > 0 ? (
            <p className="text-sm text-[color:var(--color-doux)]">
              {t("avecEnfants", { liste: listeFr(sortie.authorChildren) })}
            </p>
          ) : null}
        </div>

        {cestMoi ? (
          <form action={retirerSortie} className="text-right">
            <input type="hidden" name="sortie" value={sortie.id} />
            {/*
              Tant que la minute de silence court (notifiedAt vide), retirer la sortie ne
              réveille personne : le bouton dit « Annuler », et la petite ligne dit
              pourquoi c'est encore sans conséquence. Une fois les alertes parties, le
              même geste redevient « Rentrés » — on ne reprend pas ce qui a sonné.
            */}
            <button className={pastilleAction}>
              {aVenir || !sortie.notifiedAt ? t("annuler") : t("rentres")}
            </button>
            {!aVenir && !sortie.notifiedAt ? (
              <p className="mt-1 text-xs leading-tight text-[color:var(--color-doux)]">
                {t("pasEncorePrevenu")}
              </p>
            ) : null}
          </form>
        ) : jySuis ? (
          <Pastille couleur="vert">{t("vousYEtes")}</Pastille>
        ) : (
          <form action={rejoindreSortie}>
            <input type="hidden" name="sortie" value={sortie.id} />
            {mesEnfants.map((id) => (
              <input key={id} type="hidden" name="enfant" value={id} />
            ))}
            <button
              className={pastilleAction}
              style={{ background: "var(--color-vert)", color: "var(--color-fond)" }}
            >
              {t("nousAussi")}
            </button>
          </form>
        )}
      </div>

      {sortie.note ? <p className="mt-2 text-[0.95rem]">{sortie.note}</p> : null}

      {autres.length > 0 ? (
        <details className="mt-2">
          {/*
            « 5 autres familles » et non « +5 ».

            Trois visages s'affichaient, suivis de « +5 » où 5 était le total : on lisait
            « trois, et cinq de plus ». Le nombre annoncé compte maintenant tout le monde,
            et les visages ne le contredisent plus.
          */}
          <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-sm font-bold text-[color:var(--color-vert)]">
            <span className="flex -space-x-2">
              {autres.slice(0, 3).map((p) => (
                <Jeton key={p.accountId} nom={p.displayName} id={p.accountId} taille={24} />
              ))}
            </span>
            {t("autresFamilles", { n: autres.length })}
          </summary>
          <ul className="mt-2 space-y-1.5 text-sm">
            {autres.map((p) => (
              <li key={p.accountId} className="flex items-center gap-2">
                <Jeton nom={p.displayName} id={p.accountId} taille={26} />
                <span>
                  <span className="font-semibold">
                    {p.accountId === accountId ? t("vous") : p.displayName}
                  </span>
                  {p.children.length > 0 ? (
                    <span className="text-[color:var(--color-doux)]">
                      {" "}
                      {t("avecEnfants", { liste: listeFr(p.children) })}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Carte>
  );
}
