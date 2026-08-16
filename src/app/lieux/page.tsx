import Link from "next/link";

import {
  CATEGORIES_LIEU,
  EMOJIS_CATEGORIE,
  LIBELLES_CATEGORIE,
  estCategorieLieu,
} from "@/lib/categories-lieu";
import { VALIDATIONS_RENOMMAGE, openRenames, searchPlaces } from "@/lib/places";
import { estRelecteur, requireAccount } from "@/lib/session";
import {
  completerAdresseLieu,
  completerCategorieLieu,
  proposerAdresse,
  proposerRenommage,
  retirerLieu,
  validerRenommage,
} from "../actions";
import { Alerte, Carte, Navigation, Pastille, Titre, Vide, lienCarte, teinte } from "../ui";

const MESSAGES: Record<string, string> = {
  nom_invalide: "Ce nom ne convient pas : de 2 à 80 caractères.",
  lieu_inconnu: "Ce lieu n'existe plus.",
  adresse_invalide: "Cette adresse ne convient pas : 160 caractères au plus.",
  adresse_deja_connue: "Quelqu'un vient de la donner. Rechargez pour la voir.",
  categorie_invalide: "Cette catégorie n'existe pas.",
  categorie_deja_connue: "Quelqu'un vient de le classer. Rechargez pour le voir.",
  proposition_close: "Cette correction a déjà été tranchée.",
  proposition_inconnue: "Cette correction n'existe pas.",
};

/**
 * Le catalogue des lieux, et sa correction collective.
 *
 * Personne ne décide seul du nom d'un lieu commun : une correction s'applique quand
 * plusieurs personnes l'ont validée. C'est ce qui remplace une modération centrale — et
 * ce qui permet de réparer « parc du gué » écrit à la va-vite un samedi matin.
 */
export default async function Lieux({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    erreur?: string;
    propose?: string;
    applique?: string;
    adresse?: string;
    categorie?: string;
    retire?: string;
  }>;
}) {
  const account = await requireAccount();
  const { q, erreur, propose, applique, adresse, categorie, retire } = await searchParams;
  const relecteur = estRelecteur(account);

  const [lieux, corrections] = await Promise.all([
    searchPlaces(q ?? "", 100),
    openRenames(account.id),
  ]);

  const parLieu = new Map<string, (typeof corrections)[number][]>();
  for (const c of corrections) {
    parLieu.set(c.placeId, [...(parLieu.get(c.placeId) ?? []), c]);
  }

  return (
    <main className="apparait">
      <Titre
        emoji="📍"
        sous={`Les lieux que vous proposez à vos cercles. Un nom mal écrit se corrige à ${VALIDATIONS_RENOMMAGE}.`}
      >
        Les lieux
      </Titre>

      {erreur ? <Alerte ton="erreur">{MESSAGES[erreur] ?? "Cela n'a pas marché."}</Alerte> : null}
      {applique ? <Alerte ton="succes">Le lieu est renommé pour tout le monde.</Alerte> : null}
      {adresse ? <Alerte ton="succes">Merci : le lieu se trouve maintenant.</Alerte> : null}
      {categorie ? <Alerte ton="succes">Merci : le lieu est classé.</Alerte> : null}
      {retire ? <Alerte ton="succes">Le lieu est retiré du catalogue.</Alerte> : null}
      {propose && !applique ? (
        <Alerte>
          Votre correction est proposée. Elle s&apos;appliquera quand {VALIDATIONS_RENOMMAGE}{" "}
          personnes l&apos;auront validée, et la vôtre compte déjà.
        </Alerte>
      ) : null}

      <form method="get" className="mb-6 flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Chercher un lieu"
          className="min-w-0 flex-1 rounded-[var(--radius-pilule)] bg-[color:var(--color-surface)] px-5 py-3 text-base ring-2 ring-[color:var(--color-trait)] outline-none focus:ring-[color:var(--color-vert)]"
        />
        <button className="shrink-0 rounded-[var(--radius-pilule)] px-5 py-3 font-bold shadow-[inset_0_0_0_2px_var(--color-trait)]">
          Chercher
        </button>
      </form>

      {lieux.length === 0 ? (
        <Vide emoji="🔍" titre={q ? "Aucun lieu de ce nom" : "Aucun lieu"}>
          {q ? (
            <Link href="/lieux" className="font-bold underline underline-offset-4">
              Voir tous les lieux
            </Link>
          ) : (
            <Link href="/sortir/lieu" className="font-bold underline underline-offset-4">
              Ajouter le premier
            </Link>
          )}
        </Vide>
      ) : (
        <ul className="space-y-3">
          {lieux.map((lieu) => {
            const couleur = teinte(lieu.id);
            const enAttente = parLieu.get(lieu.id) ?? [];
            const classe = lieu.categorie && estCategorieLieu(lieu.categorie) ? lieu.categorie : null;
            const sousLigne = [classe ? LIBELLES_CATEGORIE[classe] : null, lieu.commune]
              .filter(Boolean)
              .join(" · ");

            return (
              <li key={lieu.id}>
                <Carte accent={couleur} className="!p-4">
                  <div className="mb-3 flex items-start gap-3">
                    <span
                      aria-hidden
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl"
                      style={{ background: `var(--color-${couleur}-doux)` }}
                    >
                      {classe ? EMOJIS_CATEGORIE[classe] : "📍"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="titre text-lg font-bold leading-tight">{lieu.name}</h2>
                      {sousLigne ? (
                        <p className="text-sm text-[color:var(--color-doux)]">{sousLigne}</p>
                      ) : null}
                      {lieu.address ? (
                        <p className="mt-0.5 text-sm">
                          <a
                            href={lienCarte(lieu.name, lieu.address, lieu.commune, lieu)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[color:var(--color-doux)] underline underline-offset-4"
                          >
                            {lieu.address} ↗
                          </a>
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {/*
                    Une adresse absente se donne seul : remplir un vide n'est pas défaire le
                    travail de quelqu'un, et cent lieux sont entrés avant que ce champ existe.
                    Une adresse déjà écrite se corrige à plusieurs, comme le nom, parce que
                    l'écraser en est bien le contraire.
                  */}
                  {!lieu.address ? (
                    <form action={completerAdresseLieu} className="mb-2 flex gap-2">
                      <input type="hidden" name="lieu" value={lieu.id} />
                      <input
                        name="adresse"
                        required
                        maxLength={160}
                        placeholder="Où est-ce ? Une adresse, un repère"
                        className="min-w-0 flex-1 rounded-xl bg-[color:var(--color-fond)] px-3 py-2 text-sm ring-2 ring-[color:var(--color-trait)] outline-none focus:ring-[color:var(--color-vert)]"
                      />
                      <button className="shrink-0 rounded-[var(--radius-pilule)] px-3 py-2 text-sm font-bold text-[color:var(--color-doux)] shadow-[inset_0_0_0_2px_var(--color-trait)]">
                        Donner
                      </button>
                    </form>
                  ) : null}

                  {/*
                    Classer un lieu encore sans catégorie : un vide se remplit seul, comme
                    l'adresse — et chaque catégorie est le bouton d'envoi, un seul geste.
                  */}
                  {!classe ? (
                    <details className="mb-2">
                      <summary className="cursor-pointer py-1 text-sm font-bold text-[color:var(--color-doux)]">
                        C&apos;est quoi, ce lieu ? Parc, piscine…
                      </summary>
                      <form action={completerCategorieLieu} className="mt-2 flex flex-wrap gap-1.5">
                        <input type="hidden" name="lieu" value={lieu.id} />
                        {CATEGORIES_LIEU.map((c) => (
                          <button
                            key={c}
                            name="categorie"
                            value={c}
                            className="rounded-[var(--radius-pilule)] px-3 py-1.5 text-sm font-bold text-[color:var(--color-doux)] shadow-[inset_0_0_0_2px_var(--color-trait)]"
                          >
                            {EMOJIS_CATEGORIE[c]} {LIBELLES_CATEGORIE[c]}
                          </button>
                        ))}
                      </form>
                    </details>
                  ) : null}

                  {enAttente.map((correction) => (
                    <div
                      key={correction.id}
                      className="mb-2 flex items-center gap-3 rounded-2xl px-4 py-2.5"
                      style={{ background: "var(--color-ambre-doux)" }}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold">
                          « {correction.proposedName ?? correction.proposedAddress} »
                        </span>
                        <span className="text-sm text-[color:var(--color-ambre)]">
                          {/* Sans ce mot, deux propositions voisines se ressemblent trop. */}
                          {correction.proposedName ? "nouveau nom" : "nouvelle adresse"} ·{" "}
                          {correction.votes} sur {correction.needed} validations
                        </span>
                      </span>
                      {correction.dejaVote ? (
                        <Pastille couleur="ambre">votre voix compte</Pastille>
                      ) : (
                        <form action={validerRenommage}>
                          <input type="hidden" name="proposition" value={correction.id} />
                          <button className="shrink-0 rounded-[var(--radius-pilule)] px-4 py-2 text-sm font-bold text-[color:var(--color-fond)] shadow-[0_2px_0_0_rgba(0,0,0,0.18)] [background:var(--color-ambre)]">
                            Je valide
                          </button>
                        </form>
                      )}
                    </div>
                  ))}

                  <details>
                    <summary className="cursor-pointer py-1 text-sm font-bold text-[color:var(--color-doux)]">
                      Le nom est mal écrit ?
                    </summary>
                    <form action={proposerRenommage} className="mt-2 flex gap-2">
                      <input type="hidden" name="lieu" value={lieu.id} />
                      <input
                        name="nom"
                        defaultValue={lieu.name}
                        maxLength={80}
                        required
                        className="min-w-0 flex-1 rounded-xl bg-[color:var(--color-fond)] px-3 py-2 ring-2 ring-[color:var(--color-trait)] outline-none focus:ring-[color:var(--color-vert)]"
                      />
                      <button className="shrink-0 rounded-[var(--radius-pilule)] px-4 py-2 text-sm font-bold shadow-[inset_0_0_0_2px_var(--color-trait)]">
                        Proposer
                      </button>
                    </form>
                  </details>

                  {/*
                    Retirer un lieu est le seul geste de cette page qui ne soit pas
                    collectif : c'est celui du relecteur devant un doublon manifeste, et
                    c'est un archivage — les sorties passées gardent leur lieu, une
                    erreur se répare en base.
                  */}
                  {relecteur ? (
                    <details>
                      <summary className="cursor-pointer py-1 text-sm font-bold text-[color:var(--color-doux)]">
                        Ce lieu est en trop ? (relecture)
                      </summary>
                      <form action={retirerLieu} className="mt-2">
                        <input type="hidden" name="lieu" value={lieu.id} />
                        <button className="rounded-[var(--radius-pilule)] px-4 py-2 text-sm font-bold text-[color:var(--color-fond)] shadow-[0_2px_0_0_rgba(0,0,0,0.18)] [background:var(--color-corail)]">
                          Retirer du catalogue
                        </button>
                      </form>
                    </details>
                  ) : null}

                  {lieu.address ? (
                    <details>
                      <summary className="cursor-pointer py-1 text-sm font-bold text-[color:var(--color-doux)]">
                        L&apos;adresse est fausse ?
                      </summary>
                      <p className="mt-1 text-sm leading-snug text-[color:var(--color-doux)]">
                        Comme pour le nom, il faut {VALIDATIONS_RENOMMAGE} validations : c&apos;est
                        elle qui envoie les familles au bon endroit.
                      </p>
                      <form action={proposerAdresse} className="mt-2 flex gap-2">
                        <input type="hidden" name="lieu" value={lieu.id} />
                        <input
                          name="adresse"
                          defaultValue={lieu.address}
                          maxLength={160}
                          required
                          className="min-w-0 flex-1 rounded-xl bg-[color:var(--color-fond)] px-3 py-2 ring-2 ring-[color:var(--color-trait)] outline-none focus:ring-[color:var(--color-vert)]"
                        />
                        <button className="shrink-0 rounded-[var(--radius-pilule)] px-4 py-2 text-sm font-bold shadow-[inset_0_0_0_2px_var(--color-trait)]">
                          Proposer
                        </button>
                      </form>
                    </details>
                  ) : null}
                </Carte>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-7 text-center">
        <Link
          href="/sortir/lieu"
          className="font-bold text-[color:var(--color-vert)] underline underline-offset-4"
        >
          Ajouter un lieu
        </Link>
      </p>

      <Navigation actif="vous" />
    </main>
  );
}
