import Link from "next/link";
import { redirect } from "next/navigation";

import { lienDeConnexionEnDeveloppement } from "@/lib/mail";
import { currentAccount, destinationSure } from "@/lib/session";
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
 * Ce qui attend quelqu'un qui n'est jamais venu : trois étapes, dans l'ordre où on les vit.
 *
 * Texte de Michael, repris tel quel. Les versions successives écrites ici annonçaient ce qui
 * n'existe pas — pas de mot de passe, rien d'autre qu'un prénom — là où quelqu'un qui hésite
 * veut savoir ce qui va se passer.
 */
const ETAPES = [
  {
    titre: "Vous entrez votre adresse électronique",
    texte:
      "Après avoir entré votre adresse électronique ci-dessous, vous recevez un lien de connexion. Il ne sert qu'une fois et est valable 15 minutes.",
  },
  {
    titre: "Vous choisissez un nom et vous ajoutez ceux de vos enfants",
    texte:
      "Ce sont les noms que les autres utilisateurs verront et avec lesquels ils pourront vous identifier.",
  },
  {
    titre: "Vous rejoignez un cercle, ou vous créez le vôtre",
    texte:
      "Si un autre parent vous a envoyé un lien, il vous fait entrer dans son cercle. Sinon, créez le vôtre et invitez les familles de votre choix.",
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
  searchParams: Promise<{
    envoye?: string;
    erreur?: string;
    premiere?: string;
    suite?: string;
  }>;
}) {
  if (await currentAccount()) redirect("/maintenant");

  const { envoye, erreur, premiere, suite } = await searchParams;
  const premiereFois = premiere === "1";
  // Vérifiée ici pour ne pas la réafficher telle quelle : elle vient d'une URL.
  const reprise = destinationSure(suite);
  const lienDeDeveloppement = envoye ? lienDeConnexionEnDeveloppement() : null;

  return (
    <main className="apparait">
      <header className="mb-7 text-center">
        <div aria-hidden className="mb-3 text-6xl leading-none">
          🌳
        </div>
        <h1 className="text-4xl font-bold tracking-tight">Allezou</h1>
        <p className="mx-auto mt-3 max-w-xs leading-snug text-[color:var(--color-doux)]">
          Pour que nos enfants se retrouvent dehors.
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

      {reprise ? (
        <Alerte>
          <strong className="mb-1 block">Une invitation vous attend 🔗</strong>
          Connectez-vous et vous y reviendrez tout seul.
        </Alerte>
      ) : null}

      <div className="mb-6 flex gap-2">
        <Onglet href={lien("/connexion", reprise)} actif={!premiereFois}>
          J&apos;ai déjà un compte
        </Onglet>
        <Onglet href={lien("/connexion?premiere=1", reprise)} actif={premiereFois}>
          Je n&apos;ai pas encore de compte
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
              {reprise ? <input type="hidden" name="suite" value={reprise} /> : null}
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
              {reprise ? <input type="hidden" name="suite" value={reprise} /> : null}
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
        <p>
          <Link
            href="/questions"
            className="font-semibold text-[color:var(--color-doux)] underline underline-offset-4"
          >
            Questions fréquentes
          </Link>
        </p>
      </div>
    </main>
  );
}

/** Passer d'un onglet à l'autre ne doit pas faire tomber l'invitation qu'on suivait. */
function lien(base: string, reprise: string | undefined): string {
  if (!reprise) return base;
  return `${base}${base.includes("?") ? "&" : "?"}suite=${encodeURIComponent(reprise)}`;
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
      // Les deux onglets ont la même hauteur puisqu'ils sont côte à côte, mais l'un tient sur
      // une ligne et l'autre sur deux : sans centrage, le court se colle en haut de sa case.
      className="flex flex-1 items-center justify-center rounded-[var(--radius-pilule)] px-3 py-2.5 text-center text-sm font-bold"
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
