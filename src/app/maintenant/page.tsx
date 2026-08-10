import Link from "next/link";

import { myChildren } from "@/lib/children";
import { currentlyOut, upcomingOutings } from "@/lib/publications";
import { requireAccount } from "@/lib/session";
import { readerCircles, visibleParticipants, type VisiblePublication } from "@/lib/visibility";
import { quitterSortie, rejoindreSortie, retirerSortie } from "../actions";
import {
  Bouton,
  Carte,
  IconeArbre,
  IconeHorloge,
  IconeMaison,
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
          <LienBouton href="/cercles">Créer un cercle</LienBouton>
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

  return (
    <Carte accent={couleur}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <h2 className="titre text-xl font-bold leading-tight">
          <Link href={`/sortie/${sortie.id}`} className="underline-offset-4 hover:underline">
            {sortie.placeName}
          </Link>
        </h2>
        <span
          className="flex shrink-0 items-center gap-1 rounded-[var(--radius-pilule)] px-2.5 py-1 text-sm font-bold"
          style={
            aVenir
              ? { background: "var(--color-bleu-doux)", color: "var(--color-bleu)" }
              : { background: "var(--color-ambre-doux)", color: "var(--color-ambre)" }
          }
        >
          <IconeHorloge className="h-4 w-4" />
          {aVenir
            ? `${jourCourt(sortie.startsAt).jour} ${heureCourte(sortie.startsAt)}`
            : heureCourte(sortie.endsAt)}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <Jeton nom={sortie.authorName} id={sortie.authorId} />
        <div className="min-w-0">
          <p className="font-bold">{cestMoi ? "Vous" : sortie.authorName}</p>
          {sortie.authorChildren.length > 0 ? (
            <p className="text-sm text-[color:var(--color-doux)]">
              avec {sortie.authorChildren.join(" et ")}
            </p>
          ) : null}
        </div>
      </div>

      {sortie.note ? <p className="mt-3 text-[0.95rem]">{sortie.note}</p> : null}

      {autres.length > 0 ? (
        <details className="mt-3 rounded-2xl bg-[color:var(--color-fond)] px-4 py-2">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-bold text-[color:var(--color-vert)]">
            <span className="flex -space-x-2">
              {autres.slice(0, 3).map((p) => (
                <Jeton key={p.accountId} nom={p.displayName} id={p.accountId} taille={28} />
              ))}
            </span>
            +{autres.length} avec eux
          </summary>
          <ul className="mt-3 space-y-2 pb-2">
            {autres.map((p) => (
              <li key={p.accountId} className="flex items-center gap-3">
                <Jeton nom={p.displayName} id={p.accountId} taille={32} />
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

      <div className="mt-4">
        {cestMoi ? (
          <form action={retirerSortie}>
            <input type="hidden" name="sortie" value={sortie.id} />
            <Bouton variante="second">
              {aVenir ? (
                "Annuler cette sortie"
              ) : (
                <>
                  <IconeMaison className="h-5 w-5" />
                  Nous rentrons
                </>
              )}
            </Bouton>
          </form>
        ) : jySuis ? (
          <div className="flex items-center gap-3">
            <Pastille couleur="vert">Vous y êtes</Pastille>
            <form action={quitterSortie} className="flex-1">
              <input type="hidden" name="sortie" value={sortie.id} />
              <Bouton variante="discret" className="!py-2">
                Finalement non
              </Bouton>
            </form>
          </div>
        ) : (
          <form action={rejoindreSortie}>
            <input type="hidden" name="sortie" value={sortie.id} />
            {mesEnfants.map((id) => (
              <input key={id} type="hidden" name="enfant" value={id} />
            ))}
            <Bouton variante="second">Nous venons aussi 🙋</Bouton>
          </form>
        )}
      </div>
    </Carte>
  );
}
