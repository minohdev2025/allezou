import { Link } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { calendarEntry } from "@/lib/calendar";
import { myChildren } from "@/lib/children";
import { defaultAudience, myAttendance } from "@/lib/publications";
import { requireAccount } from "@/lib/session";
import { localeSure } from "@/lib/traduire";
import { readerCircles } from "@/lib/visibility";
import { annulerParticipation, sInscrireActivite } from "../../actions";
import {
  Alerte,
  Bouton,
  Carte,
  IconeHorloge,
  Jeton,
  PUCE_COCHEE,
  Pastille,
  heureCourte,
  jourCourt,
  lienCarte,
  teinte,
} from "../../ui";

export default async function Activite({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const t = await getTranslations("AgendaActivite");
  const tE = await getTranslations("Etiquettes");
  const locale = localeSure(await getLocale());
  const account = await requireAccount();
  const { id } = await params;
  const { erreur } = await searchParams;

  const MESSAGES: Record<string, string> = {
    aucun_destinataire: t("erreurs.aucun_destinataire"),
    cercle_interdit: t("erreurs.cercle_interdit"),
    activite_inconnue: t("erreurs.activite_inconnue"),
  };

  const activite = await calendarEntry(account.id, id);
  if (!activite) notFound();

  const [cercles, enfants, inscription, defauts] = await Promise.all([
    readerCircles(account.id),
    myChildren(account.id),
    myAttendance(account.id, id),
    defaultAudience(account.id),
  ]);

  const cerclesCoches = new Set(
    inscription ? inscription.circleIds : defauts.map((c) => c.id),
  );
  const enfantsCoches = new Set(inscription ? inscription.childIds : enfants.map((e) => e.id));
  const date = jourCourt(activite.startsAt, locale);
  const fin = activite.endsAt ? jourCourt(activite.endsAt, locale) : date;
  const couleur = teinte(activite.id);

  return (
    <main className="apparait">
      <header className="mb-6">
        <div className="mb-3 flex items-center gap-3">
          <div
            aria-hidden
            className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl px-1 text-center leading-none"
            style={{
              background: `var(--color-${couleur}-doux)`,
              color: `var(--color-${couleur})`,
            }}
          >
            {/*
              Une activité commencée n'a plus de date de début utile : c'est celle de fin qui
              dit s'il reste du temps pour y aller. « En cours » seul ne le disait pas, et la
              date de début affichée ailleurs était pire — « 22 juillet » pour une exposition
              qu'on regarde le 12 août.
            */}
            {activite.enCours ? (
              activite.endsAt ? (
                <>
                  <span className="text-xs font-bold uppercase">{t("jusquAu")}</span>
                  <span className="titre text-2xl font-bold">{fin.nombre}</span>
                  <span className="text-xs font-bold">{fin.mois}</span>
                </>
              ) : (
                <span className="text-xs font-bold uppercase">{t("enCours")}</span>
              )
            ) : (
              <>
                <span className="text-xs font-bold uppercase">{date.jour}</span>
                <span className="titre text-2xl font-bold">{date.nombre}</span>
                <span className="text-xs font-bold">{date.mois}</span>
              </>
            )}
          </div>
          <p className="flex items-center gap-2 font-bold text-[color:var(--color-doux)]">
            <IconeHorloge className="h-5 w-5" />
            {activite.allDay ? (
              // L'organisateur n'annonce pas d'horaire : le dire vaut mieux qu'un 00:00 faux.
              t("touteLaJournee")
            ) : (
              <>
                {heureCourte(activite.startsAt)}
                {activite.endsAt ? ` – ${heureCourte(activite.endsAt)}` : null}
              </>
            )}
            {activite.recurrence ? `, ${activite.recurrence}` : null}
          </p>
        </div>

        <h1 className="text-[1.6rem] font-bold leading-tight">{activite.title}</h1>

        {activite.place ? (
          <p className="mt-2">
            {/*
              Un parent qui décide d'y aller cherche d'abord où c'est. Le repère est exact
              dès que le géocodage a trouvé, et retombe sur une recherche sinon.
            */}
            <a
              href={lienCarte(activite.place, null, activite.commune, activite)}
              target="_blank"
              rel="noreferrer"
              className="text-[color:var(--color-doux)] underline underline-offset-4"
            >
              📍 {activite.place} ↗
            </a>
          </p>
        ) : null}

        {/*
          Ici « non défini » s'affiche, contrairement à la liste. Sur la page d'une activité,
          un parent décide s'il y va : lui dire qu'on ignore le prix vaut mieux que de le
          laisser supposer, et le lien vers le site de l'organisateur est juste en dessous.
        */}
        <div className="mt-3 flex flex-wrap gap-2">
          <Pastille couleur={activite.tarif === "gratuit" ? "vert" : "violet"}>
            {tE(`tarif.${activite.tarif}`)}
          </Pastille>
          <Pastille couleur={activite.acces === "inscription" ? "corail" : "bleu"}>
            {tE(`acces.${activite.acces}`)}
          </Pastille>
          {activite.ageLabel ? <Pastille couleur="ambre">{activite.ageLabel}</Pastille> : null}
          {activite.commune ? <Pastille couleur="bleu">{activite.commune}</Pastille> : null}
        </div>
      </header>

      {erreur ? (
        <Alerte ton="erreur">{MESSAGES[erreur] ?? t("erreurGenerique")}</Alerte>
      ) : null}

      {/*
        Une activité retirée reste lisible, et reste sur l'écran de qui s'y était inscrit.
        La faire disparaître sans un mot serait la pire façon d'annoncer une annulation.
      */}
      {activite.retiree ? (
        <Alerte ton="erreur">
          <strong className="mb-1 block text-lg">{t("elleNestPlusAnnoncee")}</strong>
          {t("organisateurRetire")}
        </Alerte>
      ) : null}

      {activite.description ? (
        <Carte className="mb-5">
          <p className="leading-snug">{activite.description}</p>
        </Carte>
      ) : null}

      {activite.url ? (
        <a
          href={activite.url}
          target="_blank"
          rel="noreferrer"
          data-bouton
          className="mb-5 flex w-full items-center justify-center gap-2 rounded-[var(--radius-pilule)] bg-[color:var(--color-surface)] px-5 py-3.5 text-center text-[1.05rem] font-semibold shadow-[inset_0_0_0_2px_var(--color-trait)]"
        >
          {t("voirDetails")}
        </a>
      ) : null}

      {activite.attendees.length > 0 ? (
        <Carte className="mb-5" accent="vert">
          <h2 className="titre mb-3 text-lg font-bold">
            {t("familles", { n: activite.attendees.length })}
          </h2>
          <ul className="space-y-2">
            {activite.attendees.map((a) => (
              <li key={a.publicationId} className="flex items-center gap-3">
                <Jeton nom={a.displayName} id={a.accountId} taille={32} />
                <span className="font-semibold">
                  {a.accountId === account.id ? t("vous") : a.displayName}
                </span>
              </li>
            ))}
          </ul>
        </Carte>
      ) : null}

      {activite.retiree ? (
        inscription ? (
          <Carte accent="corail">
            <p className="leading-snug">{t("inscritRetireInfo")}</p>
          </Carte>
        ) : null
      ) : cercles.length === 0 ? (
        <Carte>
          <p className="text-[color:var(--color-doux)]">{t("rejoindreCercle")}</p>
        </Carte>
      ) : (
        <Carte accent="violet">
          <h2 className="titre mb-1 text-lg font-bold">
            {inscription ? t("vousYAllezTitre") : t("vousYAllezQuestion")}
          </h2>
          <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
            {t("choisissezQuiLeVoit")}
          </p>

          <form action={sInscrireActivite} className="space-y-4">
            <input type="hidden" name="activite" value={id} />

            <fieldset>
              <legend className="mb-2 font-bold">{t("visiblePar")}</legend>
              <div className="flex flex-wrap gap-2">
                {cercles.map((cercle) => (
                  <label key={cercle.id}>
                    <input
                      type="checkbox"
                      name="cercle"
                      value={cercle.id}
                      defaultChecked={cerclesCoches.has(cercle.id)}
                      className="peer sr-only"
                    />
                    <span
                      className={`inline-flex cursor-pointer items-center rounded-[var(--radius-pilule)] px-4 py-2 font-bold text-[color:var(--color-doux)] shadow-[inset_0_0_0_2px_var(--color-trait)] peer-checked:text-[color:var(--color-fond)] peer-checked:shadow-none ${PUCE_COCHEE[teinte(cercle.id)]}`}
                    >
                      {cercle.name}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {enfants.length > 0 ? (
              <fieldset>
                <legend className="mb-2 font-bold">{t("avec")}</legend>
                <div className="flex flex-wrap gap-2">
                  {enfants.map((enfant) => (
                    <label key={enfant.id}>
                      <input
                        type="checkbox"
                        name="enfant"
                        value={enfant.id}
                        defaultChecked={enfantsCoches.has(enfant.id)}
                        className="peer sr-only"
                      />
                      <span className="inline-flex cursor-pointer items-center rounded-[var(--radius-pilule)] px-4 py-2 font-bold text-[color:var(--color-doux)] shadow-[inset_0_0_0_2px_var(--color-trait)] peer-checked:bg-[color:var(--color-violet)] peer-checked:text-[color:var(--color-fond)] peer-checked:shadow-none">
                        {enfant.firstName}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <Bouton>{inscription ? t("mettreAJour") : t("nousYAllons")}</Bouton>
          </form>

          {inscription ? (
            <form action={annulerParticipation} className="mt-3">
              <input type="hidden" name="activite" value={id} />
              <Bouton variante="discret">{t("finalementNon")}</Bouton>
            </form>
          ) : null}
        </Carte>
      )}

      {activite.sourceName ? (
        <p className="mt-6 text-center text-xs text-[color:var(--color-doux)]">
          {t("source", {
            nom: activite.sourceName,
            jour: jourCourt(activite.updatedAt, locale).nombre,
            mois: jourCourt(activite.updatedAt, locale).mois,
          })}
        </p>
      ) : null}

      <p className="mt-4 text-center">
        <Link href="/agenda" className="text-[color:var(--color-doux)] underline underline-offset-4">
          {t("retourAgenda")}
        </Link>
      </p>
    </main>
  );
}
