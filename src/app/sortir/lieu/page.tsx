import Link from "next/link";

import { requireAccount } from "@/lib/session";
import { ajouterLieu } from "../../actions";
import { Alerte, Bouton, Carte, Champ, Titre } from "../../ui";
import { ChoisirLaPosition } from "./position-client";

export default async function NouveauLieu({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  await requireAccount();
  const { erreur } = await searchParams;

  return (
    <main className="apparait">
      <Titre
        emoji="📍"
        sous="Il rejoint le catalogue commun. Si son nom est mal écrit, n'importe qui pourra proposer une correction : elle s'applique quand trois personnes l'ont validée."
      >
        Ajouter un lieu
      </Titre>

      {erreur ? (
        <Alerte ton="erreur">
          {erreur === "adresse_invalide"
            ? "Cette adresse est trop longue : 160 caractères au plus."
            : erreur === "position_invalide"
              ? "Ce point ne ressemble pas à un endroit sur Terre. Reposez-le sur la carte."
              : "Ce nom de lieu ne convient pas."}
        </Alerte>
      ) : null}

      <Carte accent="violet">
        <form action={ajouterLieu} className="space-y-5">
          <Champ label="Nom du lieu" name="nom" required maxLength={80} placeholder="Parc du Gué" />
          <Champ label="Commune" name="commune" maxLength={60} placeholder="Petit-Lancy" />
          <Champ
            label="Où est-ce ?"
            aide="Une adresse ou un repère, pour la famille qui ne connaît pas le quartier. Vous pouvez laisser vide."
            name="adresse"
            maxLength={160}
            placeholder="Chemin du Gué 12, derrière l'école"
          />
          <ChoisirLaPosition
            cleApi={process.env.GOOGLE_MAPS_API_KEY ?? null}
            mapId={process.env.GOOGLE_MAPS_MAP_ID ?? null}
          />
          <Bouton type="submit">Ajouter</Bouton>
        </form>
      </Carte>

      <p className="mt-7 text-center">
        <Link href="/sortir" className="text-[color:var(--color-doux)] underline underline-offset-4">
          Retour
        </Link>
      </p>
    </main>
  );
}
