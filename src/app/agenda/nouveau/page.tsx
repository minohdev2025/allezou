import Link from "next/link";

import { myChildren } from "@/lib/children";
import { searchPlaces } from "@/lib/places";
import { defaultAudience } from "@/lib/publications";
import { requireAccount } from "@/lib/session";
import { readerCircles } from "@/lib/visibility";
import { proposerActivite } from "../../actions";
import { Alerte, Bouton, Carte, Champ, PUCE_COCHEE, Titre, teinte } from "../../ui";

const MESSAGES: Record<string, string> = {
  titre_invalide: "Il faut un titre, de 3 à 120 caractères.",
  dates_invalides: "La date de début est nécessaire, et la fin doit venir après.",
  aucun_destinataire: "Choisissez au moins un cercle, sinon personne ne le verra.",
  cercle_interdit: "Un de ces cercles ne vous appartient pas.",
};

const champ =
  "w-full rounded-2xl bg-[color:var(--color-surface)] px-4 py-3.5 text-base ring-2 ring-[color:var(--color-trait)] outline-none focus:ring-[color:var(--color-vert)]";

/**
 * Proposer une activité à l'agenda.
 *
 * Un seul geste crée l'entrée du calendrier *et* y inscrit son auteur : quelqu'un qui
 * signale une activité y va, sinon il ne la signalerait pas. L'activité elle-même est
 * publique ; c'est l'inscription qui choisit ses cercles.
 */
export default async function NouvelleActivite({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const account = await requireAccount();
  const { erreur } = await searchParams;

  const [lieux, cercles, enfants, defauts] = await Promise.all([
    searchPlaces("", 50),
    readerCircles(account.id),
    myChildren(account.id),
    defaultAudience(account.id),
  ]);

  const cochesParDefaut = new Set(defauts.map((c) => c.id));

  return (
    <main className="apparait">
      <Titre
        emoji="📅"
        sous="Un atelier, une fête de quartier, une sortie au musée — ce que l'agenda du canton ne connaît pas."
      >
        Proposer une activité
      </Titre>

      {erreur ? (
        <Alerte ton="erreur">{MESSAGES[erreur] ?? "L'activité n'a pas pu être créée."}</Alerte>
      ) : null}

      {cercles.length === 0 ? (
        <Carte>
          <p className="text-[color:var(--color-doux)]">
            Rejoignez un cercle avant de proposer une activité : il faut bien quelqu&apos;un à
            qui la montrer.
          </p>
        </Carte>
      ) : (
        <Carte accent="bleu">
          <form action={proposerActivite} className="space-y-5">
            <Champ
              label="Quoi ?"
              name="titre"
              required
              maxLength={120}
              placeholder="Atelier poterie à la Ludothèque"
            />

            <div className="flex gap-2">
              <label className="flex-1">
                <span className="mb-1 block font-bold">Début</span>
                <input type="datetime-local" name="debut" required className={champ} />
              </label>
              <label className="flex-1">
                <span className="mb-1 block font-bold">Fin</span>
                <input type="datetime-local" name="fin" className={champ} />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block font-bold">Où ?</span>
              <span className="mb-2 block text-sm text-[color:var(--color-doux)]">
                Un lieu du catalogue, ou écrivez-le en dessous s&apos;il n&apos;y est pas.
              </span>
              <select name="lieu" className={champ} defaultValue="">
                <option value="">— choisir un lieu —</option>
                {lieux.map((lieu) => (
                  <option key={lieu.id} value={lieu.id}>
                    {lieu.name}
                    {lieu.commune ? ` · ${lieu.commune}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <input
              name="lieuLibre"
              maxLength={120}
              placeholder="Ou un lieu en toutes lettres"
              className={champ}
            />

            <fieldset>
              <legend className="mb-2 font-bold">Visible par</legend>
              <div className="flex flex-wrap gap-2">
                {cercles.map((cercle) => (
                  <label key={cercle.id}>
                    <input
                      type="checkbox"
                      name="cercle"
                      value={cercle.id}
                      defaultChecked={cochesParDefaut.has(cercle.id)}
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
                <legend className="mb-2 font-bold">Vous y allez avec</legend>
                <div className="flex flex-wrap gap-2">
                  {enfants.map((enfant) => (
                    <label key={enfant.id}>
                      <input
                        type="checkbox"
                        name="enfant"
                        value={enfant.id}
                        defaultChecked
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

            <Bouton type="submit">Proposer et s&apos;y inscrire</Bouton>
          </form>
        </Carte>
      )}

      <p className="mt-6 text-center">
        <Link href="/agenda" className="text-[color:var(--color-doux)] underline underline-offset-4">
          Retour à l&apos;agenda
        </Link>
      </p>
    </main>
  );
}
