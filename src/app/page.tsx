import Link from "next/link";
import { redirect } from "next/navigation";

import { accueilMasque, currentAccount } from "@/lib/session";
import { entrer } from "./actions";
import { Bouton, Carte, type Teinte } from "./ui";

/**
 * L'accueil public.
 *
 * Cette page existe parce qu'on parle d'Allezou de bouche à oreille : la personne qui suit
 * le lien n'a pas de compte et n'a rien lu. La faire tomber sur un formulaire de connexion
 * lui demandait son adresse électronique avant de lui avoir dit à quoi elle sert.
 *
 * Qui est déjà connecté n'a rien à faire ici et repart vers l'écran des sorties. Qui a
 * coché « ne plus afficher » aussi : la page a fait son travail une fois, et on ne redemande
 * pas à quelqu'un de relire une présentation à chaque connexion. `/?revoir=1` la ramène.
 */
export default async function Accueil({
  searchParams,
}: {
  searchParams: Promise<{ revoir?: string }>;
}) {
  if (await currentAccount()) redirect("/maintenant");

  const { revoir } = await searchParams;
  if (!revoir && (await accueilMasque())) redirect("/connexion");

  return (
    <main className="apparait">
      <header className="mb-9 text-center">
        <div aria-hidden className="mb-3 text-6xl leading-none">
          🌳
        </div>
        <h1 className="text-4xl font-bold tracking-tight">Allezou</h1>
        <p className="mx-auto mt-3 max-w-xs leading-snug text-[color:var(--color-doux)]">
          Savoir qui est dehors, parmi les gens qu&apos;on connaît déjà.
        </p>
      </header>

      <Carte accent="ambre" className="mb-9">
        <p className="leading-relaxed">
          Samedi matin, vous êtes au parc du Gué avec vos enfants. Deux familles de la classe
          y seraient bien allées aussi. Personne ne le sait, et le groupe WhatsApp de la
          classe est trop bruyant pour qu&apos;on y écrive ça.
        </p>
        <p className="mt-3 font-bold leading-relaxed">
          Allezou sert à dire où vous êtes, à des gens qui vous connaissent déjà.
        </p>
      </Carte>

      <h2 className="titre mb-4 text-xl font-bold">Ce qu&apos;on y fait</h2>
      <ul className="mb-10 space-y-4">
        {GESTES.map((geste) => (
          <li key={geste.titre}>
            <Carte accent={geste.accent}>
              <p className="mb-1 flex items-center gap-2 text-lg font-bold">
                <span aria-hidden className="text-2xl leading-none">
                  {geste.emoji}
                </span>
                {geste.titre}
              </p>
              <p className="leading-relaxed text-[color:var(--color-doux)]">{geste.texte}</p>
            </Carte>
          </li>
        ))}
      </ul>

      <h2 className="titre mb-2 text-xl font-bold">Ce qu&apos;Allezou ne fait pas</h2>
      <p className="mb-4 leading-relaxed text-[color:var(--color-doux)]">
        Une application qui parle d&apos;enfants doit dire où elle s&apos;arrête.
      </p>
      <Carte className="mb-10">
        <ul className="space-y-4">
          {ABSENCES.map((absence) => (
            <li key={absence.titre}>
              <p className="font-bold">{absence.titre}</p>
              <p className="leading-relaxed text-[color:var(--color-doux)]">{absence.texte}</p>
            </li>
          ))}
        </ul>
      </Carte>

      <h2 className="titre mb-2 text-xl font-bold">Qui tient ce site</h2>
      <p className="mb-10 leading-relaxed text-[color:var(--color-doux)]">
        Michael Urbina, en son nom propre, depuis Petit-Lancy. Il n&apos;y a pas
        d&apos;entreprise derrière et rien n&apos;est payant. Les serveurs sont en Suisse.
        L&apos;agenda se remplit tout seul depuis les sites des communes genevoises.
      </p>

      <Carte accent="vert">
        <form action={entrer} className="space-y-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name="ne_plus_afficher"
              className="mt-0.5 h-6 w-6 shrink-0 accent-[color:var(--color-vert)]"
            />
            <span className="leading-snug">
              Ne plus afficher cette page sur cet appareil
            </span>
          </label>
          <Bouton type="submit">Entrer</Bouton>
        </form>
      </Carte>

      <p className="mt-8 text-center text-sm">
        <Link
          href="/donnees"
          className="font-semibold text-[color:var(--color-doux)] underline underline-offset-4"
        >
          Ce qu&apos;Allezou enregistre, et qui peut le voir
        </Link>
      </p>
    </main>
  );
}

const GESTES: { emoji: string; accent: Teinte; titre: string; texte: string }[] = [
  {
    emoji: "🌳",
    accent: "vert",
    titre: "Dire qu'on est dehors",
    texte:
      "Vous touchez un lieu et une heure de fin. Les parents de vos cercles le voient tout de suite. La sortie s'efface toute seule une fois l'heure passée.",
  },
  {
    emoji: "👀",
    accent: "bleu",
    titre: "Voir qui est sorti",
    texte:
      "La liste des familles dehors en ce moment, avec le prénom des enfants qui y sont. Vous les rejoignez d'un geste, et votre nom s'ajoute à la sortie.",
  },
  {
    emoji: "📅",
    accent: "violet",
    titre: "Suivre l'agenda du canton",
    texte:
      "Les activités pour les familles à Genève et dans les communes. Vous cochez celles où vous irez, et vous voyez qui de vos cercles y sera aussi.",
  },
  {
    emoji: "🫂",
    accent: "corail",
    titre: "Choisir qui vous lit",
    texte:
      "Un cercle, c'est une classe ou un voisinage. On y entre par un lien que vous envoyez vous-même, et un administrateur du cercle valide l'entrée.",
  },
];

const ABSENCES: { titre: string; texte: string }[] = [
  {
    titre: "Pas de messagerie",
    texte: "Il n'y a ni fil de discussion, ni message privé.",
  },
  {
    titre: "Pas de position GPS",
    texte:
      "Un lieu se choisit dans une liste. L'application ne demande jamais à votre téléphone où vous êtes.",
  },
  {
    titre: "Pas d'historique",
    texte:
      "Une sortie disparaît 24 heures après sa fin. Personne ne peut reconstituer où votre famille est allée le mois dernier.",
  },
  {
    titre: "Pas d'inconnus",
    texte:
      "Vous ne voyez que les membres de vos cercles. Rejoindre une sortie ne vous montre à personne d'autre.",
  },
  {
    titre: "Pas de publicité, pas de traceur",
    texte: "Vos données ne partent chez personne, et ne sont vendues à personne.",
  },
  {
    titre: "Sur vos enfants, un prénom",
    texte: "Et rien de plus : c'est tout ce qu'Allezou sait d'eux.",
  },
];
