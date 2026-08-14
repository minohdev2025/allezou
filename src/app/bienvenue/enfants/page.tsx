import { myChildren } from "@/lib/children";
import { requireAccount } from "@/lib/session";
import { ajouterEnfant } from "../../actions";
import { Alerte, Bouton, Carte, Champ, IconePlus, LienBouton, Pastille, Titre, teinte } from "../../ui";

export default async function Enfants({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const account = await requireAccount();
  const { erreur } = await searchParams;
  const enfants = await myChildren(account.id);

  return (
    <main className="apparait">
      <Titre
        emoji="🧒"
        sous="Leur prénom sert à dire qui est présent à une sortie. Allezou n'enregistre rien d'autre à leur sujet : ni âge, ni nom de famille."
      >
        Vos enfants
      </Titre>

      {erreur ? <Alerte ton="erreur">Il faut un prénom.</Alerte> : null}

      {enfants.length > 0 ? (
        <div className="mb-5 flex flex-wrap gap-2">
          {enfants.map((enfant) => (
            <Pastille key={enfant.id} couleur={teinte(enfant.id)}>
              {enfant.firstName}
            </Pastille>
          ))}
        </div>
      ) : null}

      <Carte accent="ambre" className="mb-6">
        <form action={ajouterEnfant} className="space-y-4">
          <Champ label="Prénom" name="prenom" required maxLength={40} placeholder="Matéo" />
          <Bouton type="submit" variante="second">
            <IconePlus className="h-5 w-5" />
            Ajouter
          </Bouton>
        </form>
      </Carte>

      <LienBouton href="/cercles" variante="principal">
        {enfants.length > 0 ? "C'est bon" : "Passer cette étape"}
      </LienBouton>
    </main>
  );
}
