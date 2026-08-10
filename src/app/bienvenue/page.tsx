import { requireAccount } from "@/lib/session";
import { enregistrerNom } from "../actions";
import { Alerte, Bouton, Carte, Champ, Titre } from "../ui";

export default async function Bienvenue({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  await requireAccount();
  const { erreur } = await searchParams;

  return (
    <main className="apparait">
      <Titre emoji="👋" sous="Deux questions, et c'est fini.">
        Bienvenue
      </Titre>

      {erreur ? <Alerte ton="erreur">Il faut écrire quelque chose.</Alerte> : null}

      <Carte accent="bleu">
        <form action={enregistrerNom} className="space-y-5">
          <Champ
            label="Sous quel nom voulez-vous apparaître ?"
            aide="C'est ce que verront les membres de vos cercles. « Sophie », « Maman de Léa », ce que vous voulez."
            name="nom"
            required
            maxLength={60}
            autoComplete="off"
            placeholder="Maman de Léa"
          />
          <Bouton type="submit">Continuer</Bouton>
        </form>
      </Carte>
    </main>
  );
}
