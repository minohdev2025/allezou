import Link from "next/link";

import { estRelecteur, requireAccount } from "@/lib/session";
import { readerCircles } from "@/lib/visibility";
import { creerCercle, seDeconnecter } from "../actions";
import {
  Alerte,
  Bouton,
  Carte,
  Champ,
  IconeCercles,
  IconePlus,
  LienBouton,
  Navigation,
  Pastille,
  Titre,
  teinte,
} from "../ui";

export default async function Cercles({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const account = await requireAccount();
  const { erreur } = await searchParams;
  const cercles = await readerCircles(account.id);
  const relecteur = estRelecteur(account);

  return (
    <main className="apparait">
      <Titre emoji="🫂" sous="Une classe, une école, un voisinage — des gens que vous connaissez déjà.">
        Vos cercles
      </Titre>

      {erreur ? <Alerte ton="erreur">Il faut un nom de cercle.</Alerte> : null}

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
                  </span>
                  {cercle.role === "admin" ? <Pastille couleur={couleur}>admin</Pastille> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}

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

      <div className="mt-8 space-y-3">
        <LienBouton href="/reglages">🔔 Notifications</LienBouton>
        <LienBouton href="/compte">🙂 Votre compte et vos enfants</LienBouton>
        <LienBouton href="/lieux">📍 Les lieux</LienBouton>
        {relecteur ? <LienBouton href="/relecture">🧐 Relire l&apos;agenda</LienBouton> : null}
      </div>

      <div className="mt-10 space-y-4 text-center text-sm">
        <p>
          <Link
            href="/donnees"
            className="font-semibold text-[color:var(--color-doux)] underline underline-offset-4"
          >
            Ce que Totir enregistre
          </Link>
        </p>
        <form action={seDeconnecter}>
          <button className="text-[color:var(--color-doux)] underline underline-offset-4">
            Se déconnecter
          </button>
        </form>
      </div>

      <Navigation actif="cercles" />
    </main>
  );
}
