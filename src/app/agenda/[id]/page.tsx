import Link from "next/link";
import { notFound } from "next/navigation";

import { calendarEntry } from "@/lib/calendar";
import { myChildren } from "@/lib/children";
import { LIBELLES_ACCES, LIBELLES_TARIF } from "@/lib/ingest/tarif";
import { defaultAudience, myAttendance } from "@/lib/publications";
import { requireAccount } from "@/lib/session";
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
  teinte,
} from "../../ui";

const MESSAGES: Record<string, string> = {
  aucun_destinataire: "Choisissez au moins un cercle, sinon personne ne verra que vous y allez.",
  cercle_interdit: "Un de ces cercles ne vous appartient pas.",
  activite_inconnue: "Cette activité n'existe plus.",
};

export default async function Activite({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const account = await requireAccount();
  const { id } = await params;
  const { erreur } = await searchParams;

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
  const date = jourCourt(activite.startsAt);
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
            {activite.enCours ? (
              <span className="text-xs font-bold uppercase">en cours</span>
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
            {heureCourte(activite.startsAt)}
            {activite.endsAt ? ` – ${heureCourte(activite.endsAt)}` : null}
          </p>
        </div>

        <h1 className="text-[1.6rem] font-bold leading-tight">{activite.title}</h1>

        {activite.place ? (
          <p className="mt-2 text-[color:var(--color-doux)]">📍 {activite.place}</p>
        ) : null}

        {/*
          Ici « non défini » s'affiche, contrairement à la liste. Sur la page d'une activité,
          un parent décide s'il y va : lui dire qu'on ignore le prix vaut mieux que de le
          laisser supposer, et le lien vers le site de l'organisateur est juste en dessous.
        */}
        <div className="mt-3 flex flex-wrap gap-2">
          <Pastille couleur={activite.tarif === "gratuit" ? "vert" : "violet"}>
            {LIBELLES_TARIF[activite.tarif]}
          </Pastille>
          <Pastille couleur={activite.acces === "inscription" ? "corail" : "bleu"}>
            {LIBELLES_ACCES[activite.acces]}
          </Pastille>
          {activite.ageLabel ? <Pastille couleur="ambre">{activite.ageLabel}</Pastille> : null}
          {activite.commune ? <Pastille couleur="bleu">{activite.commune}</Pastille> : null}
        </div>
      </header>

      {erreur ? (
        <Alerte ton="erreur">{MESSAGES[erreur] ?? "L'inscription n'a pas pu être faite."}</Alerte>
      ) : null}

      {/*
        Une activité retirée reste lisible, et reste sur l'écran de qui s'y était inscrit.
        La faire disparaître sans un mot serait la pire façon d'annoncer une annulation.
      */}
      {activite.retiree ? (
        <Alerte ton="erreur">
          <strong className="mb-1 block text-lg">Elle n&apos;est plus annoncée</strong>
          L&apos;organisateur ne la publie plus sur son site. Elle a sans doute été annulée ou
          déplacée. Vérifiez sur sa page avant de vous déplacer.
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
          Voir tous les détails ↗
        </a>
      ) : null}

      {activite.attendees.length > 0 ? (
        <Carte className="mb-5" accent="vert">
          <h2 className="titre mb-3 text-lg font-bold">
            {activite.attendees.length === 1 ? "Une famille y va" : "Ces familles y vont"}
          </h2>
          <ul className="space-y-2">
            {activite.attendees.map((a) => (
              <li key={a.publicationId} className="flex items-center gap-3">
                <Jeton nom={a.displayName} id={a.accountId} taille={32} />
                <span className="font-semibold">
                  {a.accountId === account.id ? "Vous" : a.displayName}
                </span>
              </li>
            ))}
          </ul>
        </Carte>
      ) : null}

      {activite.retiree ? (
        inscription ? (
          <Carte accent="corail">
            <p className="leading-snug">
              Vous étiez inscrit·e. Votre inscription reste visible de vos cercles, pour que
              personne ne se déplace en croyant vous y retrouver. Retirez-la si vous n&apos;y
              allez plus.
            </p>
          </Carte>
        ) : null
      ) : cercles.length === 0 ? (
        <Carte>
          <p className="text-[color:var(--color-doux)]">
            Rejoignez un cercle pour pouvoir dire que vous y allez.
          </p>
        </Carte>
      ) : (
        <Carte accent="violet">
          <h2 className="titre mb-1 text-lg font-bold">
            {inscription ? "Vous y allez" : "Vous y allez ?"}
          </h2>
          <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
            Choisissez qui le voit. L&apos;activité, elle, reste visible de tous : c&apos;est
            votre inscription qui est privée.
          </p>

          <form action={sInscrireActivite} className="space-y-4">
            <input type="hidden" name="activite" value={id} />

            <fieldset>
              <legend className="mb-2 font-bold">Visible par</legend>
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
                <legend className="mb-2 font-bold">Avec</legend>
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

            <Bouton>{inscription ? "Mettre à jour" : "Nous y allons"}</Bouton>
          </form>

          {inscription ? (
            <form action={annulerParticipation} className="mt-3">
              <input type="hidden" name="activite" value={id} />
              <Bouton variante="discret">Finalement non</Bouton>
            </form>
          ) : null}
        </Carte>
      )}

      {activite.sourceName ? (
        <p className="mt-6 text-center text-xs text-[color:var(--color-doux)]">
          Source : {activite.sourceName} · mise à jour le{" "}
          {jourCourt(activite.updatedAt).nombre} {jourCourt(activite.updatedAt).mois}
        </p>
      ) : null}

      <p className="mt-4 text-center">
        <Link href="/agenda" className="text-[color:var(--color-doux)] underline underline-offset-4">
          Retour à l&apos;agenda
        </Link>
      </p>
    </main>
  );
}
