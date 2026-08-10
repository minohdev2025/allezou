import Link from "next/link";

import { requireAccount } from "@/lib/session";
import { ajouterLieu } from "../../actions";
import { Alerte, Bouton, Carte, Champ, Titre } from "../../ui";

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
        sous="Il rejoint le catalogue commun. Si son nom est mal écrit, n'importe qui pourra proposer une correction — elle s'applique quand trois personnes l'ont validée."
      >
        Ajouter un lieu
      </Titre>

      {erreur ? <Alerte ton="erreur">Ce nom de lieu ne convient pas.</Alerte> : null}

      <Carte accent="violet">
        <form action={ajouterLieu} className="space-y-5">
          <Champ label="Nom du lieu" name="nom" required maxLength={80} placeholder="Parc du Gué" />
          <Champ label="Commune" name="commune" maxLength={60} placeholder="Petit-Lancy" />
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
