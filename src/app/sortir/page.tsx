import Link from "next/link";

import { myChildren } from "@/lib/children";
import { searchPlaces } from "@/lib/places";
import { defaultAudience, dureesProposees, lastOuting } from "@/lib/publications";
import { requireAccount } from "@/lib/session";
import { declarerSortie, refaireDerniereSortie } from "../actions";
import { Alerte, Bouton, Carte, IconePlus, Pastille, Titre, Vide, teinte } from "../ui";

const MESSAGES: Record<string, string> = {
  aucun_destinataire:
    "Aucun cercle n'est coché pour vos sorties. Ouvrez un cercle pour en cocher un.",
  lieu_inconnu: "Ce lieu n'existe plus.",
  duree_invalide: "Cette durée n'est pas possible.",
  debut_invalide:
    "Cette heure ne convient pas : une sortie s'annonce jusqu'à deux semaines à l'avance, pas dans le passé.",
};

/**
 * Deux gestes : on arrive ici, on touche un lieu. C'est tout.
 *
 * L'heure et la durée sont au-dessus, déjà réglées sur « maintenant, 2 heures » — on n'y
 * touche que si l'on veut autre chose. Tout tient dans un seul formulaire : les lieux en
 * sont les boutons d'envoi, ce qui permet d'emporter les réglages sans une ligne de
 * JavaScript.
 */
export default async function Sortir({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; q?: string }>;
}) {
  const account = await requireAccount();
  const { erreur, q } = await searchParams;
  const recherche = (q ?? "").trim();

  const [lieux, cercles, enfants, derniere] = await Promise.all([
    searchPlaces(recherche, 30),
    defaultAudience(account.id),
    myChildren(account.id),
    lastOuting(account.id),
  ]);

  const durees = dureesProposees();

  return (
    <main className="apparait">
      <Titre emoji="🌳" sous="Touchez le lieu où vous êtes — ou où vous serez.">
        Nous sortons
      </Titre>

      {erreur ? (
        <Alerte ton="erreur">{MESSAGES[erreur] ?? "La sortie n'a pas pu être déclarée."}</Alerte>
      ) : null}

      {derniere ? (
        <form action={refaireDerniereSortie} className="mb-5">
          <Bouton>Comme la dernière fois — {derniere.placeName}</Bouton>
        </form>
      ) : null}

      <Carte className="mb-5" accent="bleu">
        <p className="mb-2 text-sm font-bold text-[color:var(--color-doux)]">Sera visible par</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {cercles.length > 0 ? (
            cercles.map((c) => (
              <Pastille key={c.id} couleur={teinte(c.id)}>
                {c.name}
              </Pastille>
            ))
          ) : (
            <Pastille couleur="corail">aucun cercle</Pastille>
          )}
        </div>
      </Carte>

      {/*
        La recherche n'apparaît que lorsqu'elle sert. En dessous d'une dizaine de lieux, le
        défilement va plus vite qu'un champ à remplir — et l'écran doit rester à deux gestes.
        Elle est en dehors du formulaire de sortie : on n'imbrique pas deux formulaires.
      */}
      {lieux.length > 8 || recherche ? (
        <form method="get" className="mb-5 flex gap-2">
          <input
            name="q"
            defaultValue={recherche}
            placeholder="Chercher un lieu"
            className="min-w-0 flex-1 rounded-[var(--radius-pilule)] bg-[color:var(--color-surface)] px-5 py-3 text-base ring-2 ring-[color:var(--color-trait)] outline-none focus:ring-[color:var(--color-vert)]"
          />
          <button className="shrink-0 rounded-[var(--radius-pilule)] px-5 py-3 font-bold shadow-[inset_0_0_0_2px_var(--color-trait)]">
            Chercher
          </button>
        </form>
      ) : null}

      {lieux.length === 0 ? (
        <Vide emoji="📍" titre={recherche ? "Aucun lieu de ce nom" : "Aucun lieu dans le catalogue"}>
          {recherche ? (
            <Link href="/sortir" className="font-bold underline underline-offset-4">
              Voir tous les lieux
            </Link>
          ) : (
            <Link href="/sortir/lieu" className="font-bold underline underline-offset-4">
              Ajouter le premier
            </Link>
          )}
        </Vide>
      ) : (
        <form action={declarerSortie}>
          {enfants.length > 0 ? (
            <fieldset className="mb-4">
              <legend className="mb-2 font-bold">Qui vient</legend>
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

          <fieldset className="mb-4">
            <legend className="mb-2 font-bold">Combien de temps</legend>
            <div className="flex gap-2">
              {durees.map((duree) => (
                <label key={duree.minutes} className="flex-1">
                  <input
                    type="radio"
                    name="duree"
                    value={duree.minutes}
                    defaultChecked={duree.minutes === 120}
                    className="peer sr-only"
                  />
                  <span className="flex h-12 cursor-pointer items-center justify-center rounded-[var(--radius-pilule)] bg-[color:var(--color-surface)] text-center font-bold text-[color:var(--color-doux)] shadow-[inset_0_0_0_2px_var(--color-trait)] peer-checked:bg-[color:var(--color-vert)] peer-checked:text-[color:var(--color-fond)] peer-checked:shadow-none">
                    {duree.libelle}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="mb-5 block">
            <span className="mb-1 block font-bold">À partir de quand</span>
            <span className="mb-2 block text-sm text-[color:var(--color-doux)]">
              Laissez vide si vous y êtes déjà.
            </span>
            <input
              type="datetime-local"
              name="debut"
              className="w-full rounded-2xl bg-[color:var(--color-surface)] px-4 py-3.5 text-base ring-2 ring-[color:var(--color-trait)] outline-none focus:ring-[color:var(--color-vert)]"
            />
          </label>

          <p className="mb-2 font-bold">Où</p>
          <ul className="space-y-3">
            {lieux.map((lieu) => (
              <li key={lieu.id}>
                <button
                  name="lieu"
                  value={lieu.id}
                  className="flex w-full items-center gap-4 rounded-[var(--radius-carte)] bg-[color:var(--color-surface)] px-5 py-4 text-left transition-transform active:translate-y-[2px]"
                  style={{
                    boxShadow: `inset 0 0 0 2px var(--color-${teinte(lieu.id)}), 0 3px 0 0 var(--color-${teinte(lieu.id)}-doux)`,
                  }}
                >
                  <span
                    aria-hidden
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl"
                    style={{ background: `var(--color-${teinte(lieu.id)}-doux)` }}
                  >
                    📍
                  </span>
                  <span className="min-w-0">
                    <span className="titre block text-lg font-bold leading-tight">
                      {lieu.name}
                    </span>
                    {lieu.commune ? (
                      <span className="block text-sm text-[color:var(--color-doux)]">
                        {lieu.commune}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </form>
      )}

      <div className="mt-7 space-y-3 text-center">
        <p>
          <Link
            href="/sortir/lieu"
            className="inline-flex items-center gap-1 font-bold text-[color:var(--color-vert)] underline underline-offset-4"
          >
            <IconePlus className="h-5 w-5" />
            Le lieu n&apos;est pas dans la liste
          </Link>
        </p>
        <p>
          <Link
            href="/maintenant"
            className="text-[color:var(--color-doux)] underline underline-offset-4"
          >
            Annuler
          </Link>
        </p>
      </div>
    </main>
  );
}
