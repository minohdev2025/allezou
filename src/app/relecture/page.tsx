import Link from "next/link";

import { pendingReview, sourceHealth } from "@/lib/ingest/run";
import { jobStatus } from "@/lib/scheduler";
import { requireRelecteur } from "@/lib/session";
import { ecarterActivite, publierActivite } from "../actions";
import { Bouton, Carte, Pastille, Titre, Vide, heureCourte, jourCourt, teinte } from "../ui";

/** « 2026-08-11T22:00 », le format attendu par un champ datetime-local, à l'heure de Genève. */
function pourChamp(date: Date | null): string {
  if (!date) return "";
  const parties = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const lire = (type: string) => parties.find((p) => p.type === type)?.value ?? "";
  return `${lire("year")}-${lire("month")}-${lire("day")}T${lire("hour")}:${lire("minute")}`;
}

const champ =
  "w-full rounded-xl bg-[color:var(--color-fond)] px-3 py-2 text-base ring-2 ring-[color:var(--color-trait)] outline-none focus:ring-[color:var(--color-vert)]";

/** Le motif, en deux mots, avant le détail que le contrôle a écrit. */
const MOTIFS: Record<string, string> = {
  date_absente: "Date",
  heure_absente: "Heure",
  titre_reformule: "Titre",
  titre_generique: "Rubrique",
  lieu_absent: "Lieu",
  age_absent: "Âge",
  description_inventee: "Description",
  url_hors_domaine: "Lien",
  duree_invraisemblable: "Durée",
  doublon: "Doublon",
};

/**
 * La file de relecture.
 *
 * Depuis que les contrôles automatiques décident de la publication, cet écran ne reçoit plus
 * le tout-venant de l'agenda : il reçoit ce qui a échoué à un contrôle. Chaque fiche dit
 * lequel, sinon relire consiste à chercher soi-même ce qu'on reproche à l'activité.
 *
 * Accepter ou refuser ne suffit pas : une activité réelle mal datée doit pouvoir être
 * corrigée, sinon la seule issue devant elle est de la jeter.
 */
export default async function Relecture() {
  await requireRelecteur();
  const [attente, sante, taches] = await Promise.all([
    pendingReview(50),
    sourceHealth(),
    jobStatus(),
  ]);

  return (
    <main className="apparait">
      <Titre
        emoji="🧐"
        sous="Ce que les contrôles automatiques n'ont pas laissé passer. Le reste est déjà au calendrier."
      >
        À relire
      </Titre>

      <section className="mb-8">
        <h2 className="titre mb-3 text-lg font-bold">Tâches automatiques</h2>
        <ul className="space-y-2">
          {taches.map((tache) => (
            <li
              key={tache.name}
              className="rounded-2xl bg-[color:var(--color-surface)] px-4 py-3 ring-2 ring-[color:var(--color-trait)]"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold">{tache.libelle}</span>
                <Pastille couleur={tache.enRetard ? "corail" : "vert"}>
                  {tache.lastOkAt
                    ? `${jourCourt(tache.lastOkAt).nombre} ${jourCourt(tache.lastOkAt).mois} à ${heureCourte(tache.lastOkAt)}`
                    : "jamais exécutée"}
                </Pastille>
              </div>
              {tache.lastError ? (
                <p className="mt-1 text-sm text-[color:var(--color-corail)]">
                  {tache.lastError}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-[color:var(--color-doux)]">
          C&apos;est ici qu&apos;on vérifie que l&apos;effacement quotidien promis aux parents a
          bien lieu.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="titre mb-3 text-lg font-bold">Santé des sources</h2>
        <ul className="space-y-2">
          {sante.map((source) => (
            <li
              key={source.id}
              className="rounded-2xl bg-[color:var(--color-surface)] px-4 py-3 ring-2 ring-[color:var(--color-trait)]"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold">{source.name}</span>
                <Pastille couleur={source.muette ? "corail" : "vert"}>
                  {source.joursSansContenu === null
                    ? "jamais rien rapporté"
                    : `${source.lastEventCount ?? 0} activités, il y a ${source.joursSansContenu} j`}
                </Pastille>
              </div>
              {source.lastError ? (
                <p className="mt-1 text-sm text-[color:var(--color-corail)]">
                  {source.lastError}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <h2 className="titre mb-3 text-lg font-bold">
        {attente.length === 0
          ? "Rien en attente"
          : `${attente.length} en attente de relecture`}
      </h2>

      {attente.length === 0 ? (
        <Vide emoji="✅" titre="Rien n'a bloqué">
          Les activités du dernier passage ont toutes passé les contrôles. Repassez après le
          prochain.
        </Vide>
      ) : (
        <ul className="space-y-4">
          {attente.map((activite) => {
            const date = jourCourt(activite.startsAt);
            return (
              <li key={activite.id}>
                <Carte accent={teinte(activite.id)}>
                  <p className="mb-2 text-sm text-[color:var(--color-doux)]">
                    {activite.sourceName} · {date.jour} {date.nombre} {date.mois}
                  </p>

                  {activite.controles.length > 0 ? (
                    <ul
                      className="mb-3 space-y-1 rounded-2xl px-4 py-3 text-sm leading-snug"
                      style={{ background: "var(--color-corail-doux)" }}
                    >
                      {activite.controles.map((controle) => (
                        <li key={controle.code}>
                          <span className="font-bold">
                            {MOTIFS[controle.code] ?? controle.code}
                          </span>{" "}
                          : {controle.detail}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mb-3 text-sm text-[color:var(--color-doux)]">
                      Aucun contrôle en défaut : cette source passe encore tout par la file, le
                      temps qu&apos;on regarde ce qu&apos;elle rapporte.
                    </p>
                  )}

                  <form action={publierActivite} className="space-y-3">
                    <input type="hidden" name="activite" value={activite.id} />

                    <label className="block">
                      <span className="mb-1 block text-sm font-bold">Titre</span>
                      <input
                        name="titre"
                        defaultValue={activite.title}
                        maxLength={120}
                        className={champ}
                      />
                    </label>

                    <div className="flex gap-2">
                      <label className="flex-1">
                        <span className="mb-1 block text-sm font-bold">Début</span>
                        <input
                          type="datetime-local"
                          name="debut"
                          defaultValue={pourChamp(activite.startsAt)}
                          className={champ}
                        />
                      </label>
                      <label className="flex-1">
                        <span className="mb-1 block text-sm font-bold">Fin</span>
                        <input
                          type="datetime-local"
                          name="fin"
                          defaultValue={pourChamp(activite.endsAt)}
                          className={champ}
                        />
                      </label>
                    </div>

                    <div className="flex gap-2">
                      <label className="flex-1">
                        <span className="mb-1 block text-sm font-bold">Lieu</span>
                        <input
                          name="lieu"
                          defaultValue={activite.placeLabel ?? ""}
                          maxLength={120}
                          className={champ}
                        />
                      </label>
                      <label className="w-32">
                        <span className="mb-1 block text-sm font-bold">Commune</span>
                        <input
                          name="commune"
                          defaultValue={activite.commune ?? ""}
                          maxLength={60}
                          className={champ}
                        />
                      </label>
                    </div>

                    <div className="flex gap-2">
                      <label className="flex-1">
                        <span className="mb-1 block text-sm font-bold">Âge min.</span>
                        <input
                          type="number"
                          name="ageMin"
                          min={0}
                          max={18}
                          defaultValue={activite.minAge ?? ""}
                          className={champ}
                        />
                      </label>
                      <label className="flex-1">
                        <span className="mb-1 block text-sm font-bold">Âge max.</span>
                        <input
                          type="number"
                          name="ageMax"
                          min={0}
                          max={18}
                          defaultValue={activite.maxAge ?? ""}
                          className={champ}
                        />
                      </label>
                    </div>

                    {activite.url ? (
                      <p className="text-sm">
                        <a
                          href={activite.url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-4"
                        >
                          Voir la page d&apos;origine ↗
                        </a>
                      </p>
                    ) : null}

                    <Bouton className="!py-2.5">Publier</Bouton>
                  </form>

                  <form action={ecarterActivite} className="mt-2">
                    <input type="hidden" name="activite" value={activite.id} />
                    <Bouton variante="second" className="!py-2.5">
                      Écarter
                    </Bouton>
                  </form>
                </Carte>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-8 text-center">
        <Link
          href="/maintenant"
          className="text-[color:var(--color-doux)] underline underline-offset-4"
        >
          Retour
        </Link>
      </p>
    </main>
  );
}
