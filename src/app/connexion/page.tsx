import Link from "next/link";
import { redirect } from "next/navigation";

import { lienDeConnexionEnDeveloppement } from "@/lib/mail";
import { currentAccount } from "@/lib/session";
import { connecterParCleAcces, demanderLien, preparerConnexionCle } from "../actions";
import { ConnexionParCleAcces } from "../passkey-client";
import { Alerte, Bouton, Carte, Champ } from "../ui";

const MESSAGES: Record<string, string> = {
  adresse_invalide: "Cette adresse ne semble pas valide.",
  trop_de_demandes:
    "Un lien vient déjà d'être envoyé à cette adresse. Attendez une minute avant d'en redemander un.",
  lien_inconnu: "Ce lien n'existe pas. Il a peut-être été mal recopié.",
  lien_expire: "Ce lien a expiré. Les liens ne sont valables qu'un quart d'heure.",
  lien_deja_utilise: "Ce lien a déjà servi. Chaque lien ne fonctionne qu'une fois.",
};

export default async function Connexion({
  searchParams,
}: {
  searchParams: Promise<{ envoye?: string; erreur?: string }>;
}) {
  if (await currentAccount()) redirect("/maintenant");

  const { envoye, erreur } = await searchParams;
  const lienDeDeveloppement = envoye ? lienDeConnexionEnDeveloppement() : null;

  return (
    <main className="apparait">
      <header className="mb-8 text-center">
        <div aria-hidden className="mb-3 text-6xl leading-none">
          🌳
        </div>
        <h1 className="text-4xl font-bold tracking-tight">Totir</h1>
        <p className="mx-auto mt-3 max-w-xs leading-snug text-[color:var(--color-doux)]">
          Savoir qui est dehors, parmi les gens qu&apos;on connaît déjà.
        </p>
      </header>

      {envoye ? (
        <Alerte ton="succes">
          <strong className="mb-1 block text-lg">C&apos;est parti 📬</strong>
          Regardez votre boîte de réception. Le lien est valable un quart d&apos;heure et ne
          fonctionne qu&apos;une fois.
        </Alerte>
      ) : null}

      {erreur ? <Alerte ton="erreur">{MESSAGES[erreur] ?? "Ce lien ne fonctionne pas."}</Alerte> : null}

      {lienDeDeveloppement ? (
        <Alerte>
          <strong className="mb-1 block">Développement : aucun SMTP configuré</strong>
          <p className="mb-2 text-sm">
            Le courriel n&apos;est pas parti. Voici le lien qu&apos;il contenait. Ce bloc
            n&apos;apparaît jamais en production.
          </p>
          <Link
            href={lienDeDeveloppement}
            className="block break-all font-bold underline underline-offset-4"
          >
            {lienDeDeveloppement}
          </Link>
        </Alerte>
      ) : null}

      <ConnexionParCleAcces
        preparer={preparerConnexionCle}
        connecter={connecterParCleAcces}
      />

      <Carte accent="vert">
        <form action={demanderLien} className="space-y-5">
          <Champ
            label="Votre adresse électronique"
            aide="Pas de mot de passe à retenir : vous recevez un lien qui vous connecte."
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            required
            placeholder="sophie@exemple.ch"
          />
          <Bouton type="submit">Recevoir mon lien</Bouton>
        </form>
      </Carte>

      <p className="mt-8 text-center text-sm">
        <Link
          href="/donnees"
          className="font-semibold text-[color:var(--color-doux)] underline underline-offset-4"
        >
          Ce que Totir enregistre, et qui peut le voir
        </Link>
      </p>
    </main>
  );
}
