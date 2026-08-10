import { requireAccount } from "@/lib/session";
import { LienBouton, Titre } from "../../ui";

export default async function Merci() {
  await requireAccount();

  return (
    <main className="apparait">
      <Titre
        emoji="🎉"
        sous="Un administrateur du cercle va la recevoir. Vous verrez le cercle apparaître dans votre liste une fois qu'elle sera acceptée."
      >
        Demande envoyée
      </Titre>
      <LienBouton href="/maintenant" variante="principal">
        Continuer
      </LienBouton>
    </main>
  );
}
