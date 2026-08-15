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

/**
 * Ce qui attend quelqu'un qui n'est jamais venu.
 *
 * Trois choses qu'un formulaire ne dit pas, et qui font hésiter : il n'y a pas de compte à
 * créer, on ne demandera presque rien, et l'application ne sert à rien tant qu'on n'est pas
 * dans un cercle.
 */
const ETAPES = [
  {
    titre: "Vous recevez un lien par courriel",
    texte:
      "Il n'y a pas de mot de passe à choisir, ni à retenir. Le lien vous connecte, et il ne fonctionne qu'une fois.",
  },
  {
    titre: "Vous donnez un nom et les prénoms de vos enfants",
    texte:
      "Le nom que les autres verront, « Sophie » ou « Maman de Léa », comme vous voulez. Sur vos enfants, un prénom et rien d'autre.",
  },
  {
    titre: "Vous entrez dans un cercle, ou vous créez le vôtre",
    texte:
      "Si un parent vous a envoyé un lien d'invitation, il vous y fait entrer. Sinon vous créez votre cercle et vous invitez qui vous voulez. Seul, Allezou ne montre rien.",
  },
];

/**
 * La connexion, et la première connexion.
 *
 * Le même formulaire sert aux deux, parce qu'il n'y a pas de compte à créer : le premier
 * lien suivi ouvre le compte. Mais les deux personnes n'ont pas les mêmes questions, et
 * l'écran unique servait mal les deux. Quelqu'un qui revient veut son champ et rien de plus.
 * Quelqu'un qui arrive voyait un bouton « clé d'accès » qui ne pouvait rien lui donner,
 * puisqu'il n'en a pas encore, et aucune idée de ce qui l'attendait après le lien.
 *
 * Le choix passe par l'adresse plutôt que par du JavaScript : l'écran se partage, se
 * recharge, et fonctionne pendant que le reste charge encore.
 */
export default async function Connexion({
  searchParams,
}: {
  searchParams: Promise<{ envoye?: string; erreur?: string; premiere?: string }>;
}) {
  if (await currentAccount()) redirect("/maintenant");

  const { envoye, erreur, premiere } = await searchParams;
  const premiereFois = premiere === "1";
  const lienDeDeveloppement = envoye ? lienDeConnexionEnDeveloppement() : null;

  return (
    <main className="apparait">
      <header className="mb-7 text-center">
        <div aria-hidden className="mb-3 text-6xl leading-none">
          🌳
        </div>
        <h1 className="text-4xl font-bold tracking-tight">Allezou</h1>
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

      <div className="mb-6 flex gap-2">
        <Onglet href="/connexion" actif={!premiereFois}>
          Je reviens
        </Onglet>
        <Onglet href="/connexion?premiere=1" actif={premiereFois}>
          C&apos;est ma première fois
        </Onglet>
      </div>

      {premiereFois ? (
        <>
          <ol className="mb-6 space-y-3">
            {ETAPES.map((etape, rang) => (
              <li key={etape.titre}>
                <Carte accent="ambre" className="!p-4">
                  <p className="mb-1 flex items-baseline gap-2 font-bold">
                    <span
                      aria-hidden
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm"
                      style={{
                        background: "var(--color-ambre-doux)",
                        color: "var(--color-ambre)",
                      }}
                    >
                      {rang + 1}
                    </span>
                    {etape.titre}
                  </p>
                  <p className="leading-relaxed text-[color:var(--color-doux)]">{etape.texte}</p>
                </Carte>
              </li>
            ))}
          </ol>

          <Carte accent="vert">
            <form action={demanderLien} className="space-y-5">
              <Champ
                label="Votre adresse électronique"
                aide="C'est tout ce qu'il faut. Le lien que vous recevrez ouvrira votre compte."
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                required
                placeholder="sophie@exemple.ch"
              />
              <Bouton type="submit">Commencer</Bouton>
            </form>
          </Carte>
        </>
      ) : (
        <>
          {/* La clé d'accès n'a de sens que pour qui en a déjà posé une sur cet appareil. */}
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
        </>
      )}

      <div className="mt-8 space-y-3 text-center text-sm">
        {/* `revoir` passe outre la case « ne plus afficher » : rien de ce qu'on coche ici
            ne doit fermer une porte définitivement. */}
        <p>
          <Link
            href="/?revoir=1"
            className="font-semibold text-[color:var(--color-doux)] underline underline-offset-4"
          >
            À quoi sert Allezou ?
          </Link>
        </p>
        <p>
          <Link
            href="/donnees"
            className="font-semibold text-[color:var(--color-doux)] underline underline-offset-4"
          >
            Ce qu&apos;Allezou enregistre, et qui peut le voir
          </Link>
        </p>
      </div>
    </main>
  );
}

/** Deux chemins, côte à côte, et celui qu'on suit se voit. */
function Onglet({
  href,
  actif,
  children,
}: {
  href: string;
  actif: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={actif ? "page" : undefined}
      className="flex-1 rounded-[var(--radius-pilule)] px-3 py-2.5 text-center text-sm font-bold"
      style={
        actif
          ? { background: "var(--color-vert)", color: "var(--color-fond)" }
          : {
              background: "var(--color-surface)",
              color: "var(--color-doux)",
              boxShadow: "inset 0 0 0 2px var(--color-trait)",
            }
      }
    >
      {children}
    </Link>
  );
}
