import Link from "next/link";

import { requireAccount } from "@/lib/session";
import { readerCircles } from "@/lib/visibility";
import { creerCercle, rejoindreParLien } from "../actions";
import {
  Alerte,
  Bouton,
  Carte,
  Champ,
  IconeCercles,
  IconePlus,
  Navigation,
  Pastille,
  Titre,
  Vide,
  teinte,
} from "../ui";

const MESSAGES: Record<string, string> = {
  "1": "Il faut un nom de cercle.",
  lien_vide: "Collez le lien que vous avez reçu, ou seulement le code qu'il contient.",
};

/**
 * Les deux façons d'avoir un cercle, données comme deux gestes distincts.
 *
 * Elles ne se valent pas selon le moment : quelqu'un qui ouvre l'application pour la
 * première fois y arrive presque toujours parce qu'on l'a invité, alors que quelqu'un qui a
 * déjà des cercles vient plus souvent en créer un. L'ordre suit ce constat.
 */
function CarteInvitation({ mise = "second" }: { mise?: "principal" | "second" }) {
  return (
    <Carte accent="bleu">
      <form action={rejoindreParLien} className="space-y-5">
        <Champ
          label="J'ai reçu une invitation"
          aide="Collez le lien reçu par message, ou seulement le code qu'il contient."
          name="lien"
          required
          autoComplete="off"
          placeholder="https://…/rejoindre/…"
        />
        <Bouton type="submit" variante={mise}>
          Suivre l&apos;invitation
        </Bouton>
      </form>
    </Carte>
  );
}

function CarteCreation() {
  return (
    <Carte accent="rose">
      <form action={creerCercle} className="space-y-5">
        <Champ
          label="Créer un cercle"
          aide="Vous en serez l'administrateur : c'est vous qui validerez les entrées."
          name="nom"
          required
          maxLength={60}
          placeholder="Classe de 4P"
        />
        <Bouton type="submit" variante="second">
          <IconePlus className="h-5 w-5" />
          Créer
        </Bouton>
      </form>
    </Carte>
  );
}

export default async function Cercles({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const account = await requireAccount();
  const { erreur } = await searchParams;
  const cercles = await readerCircles(account.id);

  return (
    <main className="apparait">
      <Titre emoji="👥" sous="Une classe, une école, un voisinage : des gens que vous connaissez déjà.">
        Vos cercles
      </Titre>

      {erreur ? (
        <Alerte ton="erreur">{MESSAGES[erreur] ?? "Cela n'a pas marché."}</Alerte>
      ) : null}

      {cercles.length === 0 ? (
        /*
          Un formulaire nu ne dit pas à quoi sert ce qu'il demande. Quelqu'un qui arrive ici
          au sortir de l'inscription n'a encore rien vu de l'application : l'écran doit dire
          ce qu'est un cercle, et pourquoi il ne se passera rien tant qu'il n'en a pas.
        */
        <Vide emoji="👥" titre="Vous n'avez encore aucun cercle">
          <p className="leading-snug">
            Un cercle, c&apos;est une classe, une école, un voisinage : les familles à qui
            vos sorties seront visibles. Tant qu&apos;il n&apos;y en a aucun, personne ne
            voit les vôtres et vous ne voyez celles de personne.
          </p>
        </Vide>
      ) : null}

      {cercles.length > 0 ? (
        <ul className="mb-7 space-y-3">
          {cercles.map((cercle) => {
            const couleur = teinte(cercle.id);
            return (
              <li key={cercle.id}>
                <Link
                  href={`/cercles/${cercle.id}`}
                  data-bouton
                  className="flex items-center gap-4 rounded-[var(--radius-carte)] bg-[color:var(--color-surface)] px-5 py-4"
                  style={{
                    boxShadow: `inset 0 0 0 2px var(--color-${couleur}), 0 3px 0 0 var(--color-${couleur}-doux)`,
                  }}
                >
                  <span
                    aria-hidden
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
                    style={{
                      background: `var(--color-${couleur}-doux)`,
                      color: `var(--color-${couleur})`,
                    }}
                  >
                    <IconeCercles className="h-6 w-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="titre block text-lg font-bold leading-tight">
                      {cercle.name}
                    </span>
                    {/*
                      Trois cercles qui ne montrent qu'un nom se ressemblent tous. Le nombre
                      de familles est la première chose qui les distingue, et la seule qui
                      dise si l'un est resté vide.
                    */}
                    <span className="block text-sm text-[color:var(--color-doux)]">
                      {cercle.memberCount} famille{cercle.memberCount > 1 ? "s" : ""}
                    </span>
                  </span>
                  {cercle.role === "admin" ? <Pastille couleur={couleur}>admin</Pastille> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className={`space-y-4 ${cercles.length === 0 ? "mt-5" : ""}`}>
        {cercles.length === 0 ? (
          <>
            <CarteInvitation mise="principal" />
            <CarteCreation />
          </>
        ) : (
          <>
            <CarteCreation />
            <CarteInvitation />
          </>
        )}
      </div>

      <Navigation actif="cercles" />
    </main>
  );
}
