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
 * Elle commence par quelqu'un, pas par un produit. Un parent qui confie le prénom de sa
 * fille à un site veut savoir qui est derrière, et « Michael, papa de deux filles au
 * Petit-Lancy » répond mieux que n'importe quelle phrase sur la protection des données.
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
          Bonjour, je m&apos;appelle Michael. Je suis papa de deux petites filles scolarisées
          au Petit-Lancy.
        </p>
        <p className="mt-3 leading-relaxed">
          Un samedi sur deux, on arrive au parc et il n&apos;y a personne que mes filles
          connaissent. Elles jouent dix minutes, puis viennent demander quand on rentre. Les
          copains de la classe étaient peut-être au parc d&apos;à côté, ou passés une heure
          plus tôt.
        </p>
        <p className="mt-3 font-bold leading-relaxed">
          J&apos;ai créé Allezou pour ça : que nos enfants retrouvent dehors des enfants
          qu&apos;ils connaissent.
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

      <h2 className="titre mb-2 text-xl font-bold">L&apos;ajouter à votre téléphone</h2>
      <p className="mb-4 leading-relaxed text-[color:var(--color-doux)]">
        Allezou est un site web, pas une vraie application à télécharger dans un magasin.
        Selon votre navigateur, il vous proposera peut-être de l&apos;installer tout seul.
        Vous pouvez accepter : c&apos;est un raccourci vers cette page, qui l&apos;ouvre en
        plein écran et vous évite de vous reconnecter à chaque fois.
      </p>
      <Carte className="mb-10">
        <ul className="space-y-3">
          <li>
            <p className="font-bold">Si rien ne vous est proposé</p>
            <p className="leading-relaxed text-[color:var(--color-doux)]">
              Cherchez « Installer l&apos;application » dans le menu de votre navigateur,
              souvent en haut à droite.
            </p>
          </li>
          <li>
            <p className="font-bold">Sur iPhone</p>
            <p className="leading-relaxed text-[color:var(--color-doux)]">
              Touchez le bouton Partager, en bas de l&apos;écran, puis « Sur l&apos;écran
              d&apos;accueil ». C&apos;est aussi la seule façon d&apos;y recevoir les
              notifications.
            </p>
          </li>
        </ul>
      </Carte>

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

      <h2 className="titre mb-2 text-xl font-bold">Gratuit, et hébergé en Suisse</h2>
      <p className="mb-10 leading-relaxed text-[color:var(--color-doux)]">
        Il n&apos;y a pas d&apos;entreprise derrière Allezou et rien n&apos;est payant. Les
        serveurs sont en Suisse. L&apos;agenda se remplit tout seul depuis les sites des
        communes genevoises.
      </p>

      <Carte accent="vert">
        <form action={entrer} className="space-y-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name="ne_plus_afficher"
              className="mt-0.5 h-6 w-6 shrink-0 accent-[color:var(--color-vert)]"
            />
            <span className="leading-snug">Ne plus afficher cette page sur cet appareil</span>
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

/**
 * Les cercles en premier.
 *
 * Sans eux, les trois autres gestes n'ont personne à qui parler : une sortie publiée dans le
 * vide ne sert à rien, et c'est la première chose à faire en arrivant.
 */
const GESTES: { emoji: string; accent: Teinte; titre: string; texte: string }[] = [
  {
    emoji: "👥",
    accent: "corail",
    titre: "Créer vos cercles",
    texte:
      "Vous réunissez les familles avec qui vos enfants aiment passer du temps : la classe, le voisinage. Vous les invitez avec un lien, par WhatsApp ou par message. Rien de ce que vous publiez ne sort de ces cercles.",
  },
  {
    emoji: "🌳",
    accent: "vert",
    titre: "Dire que vous sortez",
    texte:
      "Vous choisissez un parc dans la liste et l'heure à laquelle vous repartez. Les familles de vos cercles le voient aussitôt. La sortie s'efface toute seule une fois l'heure passée.",
  },
  {
    emoji: "🛝",
    accent: "bleu",
    titre: "Voir qui est dehors",
    texte:
      "Vous voyez qui est sorti en ce moment, et vous les rejoignez en un clic si vous en avez envie.",
  },
  {
    emoji: "📅",
    accent: "violet",
    titre: "Suivre l'agenda du canton",
    texte:
      "Les activités pour les familles à Genève et dans les communes. Leurs sites sont relevés plusieurs fois par jour, vous n'avez rien à surveiller. Vous cochez celles où vous irez, et vous voyez qui de vos cercles y sera aussi.",
  },
  {
    emoji: "🔔",
    accent: "rose",
    titre: "Être prévenu de ce qui vous intéresse",
    texte:
      "Vous choisissez vos mots : « piscine », « contes », « judo ». Dès qu'une activité qui en contient un paraît à l'agenda, votre téléphone vous le dit. Vous pouvez aussi demander à être averti de toutes les activités sur inscription, où s'y prendre tard revient souvent à ne pas y aller.",
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
      "Vous choisissez un lieu dans une liste. L'application ne demande jamais à votre téléphone où vous êtes.",
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
