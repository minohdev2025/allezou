import { redirect } from "next/navigation";

import { currentAccount } from "@/lib/session";
import { demanderAdhesion } from "../../actions";
import { Alerte, Bouton, Carte, LienBouton, Titre } from "../../ui";

const MESSAGES: Record<string, string> = {
  invitation_inconnue: "Ce lien d'invitation n'existe pas.",
  invitation_revoquee: "Cette invitation a été annulée.",
  invitation_expiree: "Cette invitation a expiré. Demandez-en une nouvelle.",
  invitation_epuisee: "Cette invitation a déjà servi au nombre de personnes prévu.",
  deja_membre: "Vous faites déjà partie de ce cercle.",
};

export default async function Rejoindre({
  params,
  searchParams,
}: {
  params: Promise<{ jeton: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { jeton } = await params;
  const { erreur } = await searchParams;

  const account = await currentAccount();
  if (!account) redirect(`/connexion?suite=/rejoindre/${jeton}`);

  return (
    <main className="apparait">
      <Titre emoji="✉️" sous="Quelqu'un vous a transmis une invitation.">
        Rejoindre un cercle
      </Titre>

      {erreur ? (
        <Alerte ton="erreur">{MESSAGES[erreur] ?? "Cette invitation ne fonctionne pas."}</Alerte>
      ) : null}

      <Carte className="mb-6" accent="bleu">
        <p className="leading-snug">
          Suivre ce lien ne vous fait pas entrer tout de suite : un administrateur du cercle
          validera votre demande. Tant qu&apos;elle est en attente, vous ne voyez rien de ce
          qui s&apos;y partage.
        </p>
      </Carte>

      <form action={demanderAdhesion} className="mb-4">
        <input type="hidden" name="jeton" value={jeton} />
        <Bouton type="submit">Demander à rejoindre</Bouton>
      </form>

      <LienBouton href="/maintenant">Pas maintenant</LienBouton>
    </main>
  );
}
