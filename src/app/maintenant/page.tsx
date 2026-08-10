import Link from "next/link";

import { myChildren } from "@/lib/children";
import { currentlyOut, upcomingOutings } from "@/lib/publications";
import { requireAccount } from "@/lib/session";
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
  const [sorties, aVenir, cercles, enfants] = await Promise.all([
    currentlyOut(account.id),
    upcomingOutings(account.id),
    readerCircles(account.id),
    myChildren(account.id),
  ]);

  return (
    <main className="apparait">
      <header className="mb-6">
        <p className="text-[color:var(--color-doux)]">Bonjour {account.displayName} 👋</p>
        <h1 className="text-[1.75rem] font-bold leading-tight">Qui est dehors&nbsp;?</h1>
      </header>

      <div className="mb-7">
        <LienBouton href="/sortir" variante="principal" className="!py-5 !text-xl">
          <IconeArbre className="h-7 w-7" />
          Nous sortons
        </LienBouton>
      </div>

      {cercles.length === 0 ? (
        <Vide emoji="🫱" titre="Aucun cercle pour l'instant">
          <p className="mb-4">C&apos;est là que se partagent les sorties.</p>
          {/*
            « Rejoindre ou créer » et pas « créer » : on arrive presque toujours ici parce
            qu'on a été invité. Envoyer d'emblée vers la création ferait fabriquer un cercle
            vide à quelqu'un qui a déjà le lien du bon dans ses messages.
          */}
          <LienBouton href="/cercles">Rejoindre ou créer un cercle</LienBouton>
        </Vide>
      ) : (
        <>
          {sorties.length === 0 ? (
            <Vide emoji="🌤️" titre="Personne n'est dehors">
              Parmi vos cercles, personne n&apos;a déclaré de sortie en cours.
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
              <h2 className="titre mb-3 text-lg font-bold">À venir</h2>
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
            ? `${jourCourt(sortie.startsAt).jour} dès ${heureCourte(sortie.startsAt)}`
            : `jusqu'à ${heureCourte(sortie.endsAt)}`}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <Jeton nom={sortie.authorName} id={sortie.authorId} />

        <div className="min-w-0 flex-1">
          <p className="font-bold leading-tight">{cestMoi ? "Vous" : sortie.authorName}</p>
          {sortie.authorChildren.length > 0 ? (
            <p className="text-sm text-[color:var(--color-doux)]">
              avec {sortie.authorChildren.join(" et ")}
            </p>
          ) : null}
        </div>

        {cestMoi ? (
          <form action={retirerSortie}>
            <input type="hidden" name="sortie" value={sortie.id} />
            <button className={pastilleAction}>
              {aVenir ? "Annuler" : "Rentrés"}
            </button>
          </form>
        ) : jySuis ? (
          <Pastille couleur="vert">Vous y êtes</Pastille>
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
              Nous aussi
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
            {autres.length} autre{autres.length > 1 ? "s" : ""} famille
            {autres.length > 1 ? "s" : ""}
          </summary>
          <ul className="mt-2 space-y-1.5 text-sm">
            {autres.map((p) => (
              <li key={p.accountId} className="flex items-center gap-2">
                <Jeton nom={p.displayName} id={p.accountId} taille={26} />
                <span>
                  <span className="font-semibold">
                    {p.accountId === accountId ? "Vous" : p.displayName}
                  </span>
                  {p.children.length > 0 ? (
                    <span className="text-[color:var(--color-doux)]">
                      {" "}
                      avec {p.children.join(" et ")}
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
