import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { redirect } from "next/navigation";

import { accueilMasque, currentAccount } from "@/lib/session";
import { entrer } from "./actions";
import { ChoixLangue } from "./langue";
import { MaquetteSortie } from "./maquette";
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

  const t = await getTranslations("Accueil");

  return (
    <main className="apparait">
      <header className="mb-9 text-center">
        <div aria-hidden className="mb-3 text-6xl leading-none">
          🌳
        </div>
        <h1 className="text-4xl font-bold tracking-tight">{t("titre")}</h1>
        <p className="mx-auto mt-3 max-w-xs leading-snug text-[color:var(--color-doux)]">
          {t("accroche")}
        </p>
      </header>

      <ChoixLangue href="/" />

      <Carte accent="ambre" className="mb-9">
        <p className="leading-relaxed">{t("presentation")}</p>
        <p className="mt-3 leading-relaxed">{t("constat")}</p>
        <p className="mt-3 font-bold leading-relaxed">{t("mission")}</p>
      </Carte>

      <h2 className="titre mb-4 text-xl font-bold">{t("titreGestes")}</h2>
      <ul className="mb-10 space-y-4">
        {GESTES.map((geste) => (
          <li key={geste.cle}>
            <Carte accent={geste.accent}>
              <p className="mb-1 flex items-center gap-2 text-lg font-bold">
                <span aria-hidden className="text-2xl leading-none">
                  {geste.emoji}
                </span>
                {t(`gestes.${geste.cle}.titre`)}
              </p>
              <p className="leading-relaxed text-[color:var(--color-doux)]">
                {t(`gestes.${geste.cle}.texte`)}
              </p>
              {/*
                La maquette, plutôt qu'une capture : la page décrivait cinq écrans sans en
                montrer aucun, et demandait une adresse électronique sur la foi d'un texte.
                Un seul écran suffit, celui que les autres familles voient.
              */}
              {geste.avecMaquette ? <MaquetteSortie className="mt-4" /> : null}
            </Carte>
          </li>
        ))}
      </ul>

      <h2 className="titre mb-2 text-xl font-bold">{t("installation.titre")}</h2>
      <p className="mb-4 leading-relaxed text-[color:var(--color-doux)]">
        {t("installation.intro")}
      </p>
      <Carte className="mb-10">
        <ul className="space-y-3">
          <li>
            <p className="font-bold">{t("installation.sansProposition.titre")}</p>
            <p className="leading-relaxed text-[color:var(--color-doux)]">
              {t("installation.sansProposition.texte")}
            </p>
          </li>
          <li>
            <p className="font-bold">{t("installation.iphone.titre")}</p>
            <p className="leading-relaxed text-[color:var(--color-doux)]">
              {t("installation.iphone.texte")}
            </p>
          </li>
        </ul>
      </Carte>

      <h2 className="titre mb-2 text-xl font-bold">{t("absencesTitre")}</h2>
      <p className="mb-4 leading-relaxed text-[color:var(--color-doux)]">{t("absencesIntro")}</p>
      <Carte className="mb-10">
        <ul className="space-y-4">
          {ABSENCES.map((absence) => (
            <li key={absence.cle}>
              <p className="font-bold">{t(`absences.${absence.cle}.titre`)}</p>
              <p className="leading-relaxed text-[color:var(--color-doux)]">
                {t(`absences.${absence.cle}.texte`)}
              </p>
            </li>
          ))}
        </ul>
      </Carte>

      <h2 className="titre mb-2 text-xl font-bold">{t("gratuitTitre")}</h2>
      <p className="mb-10 leading-relaxed text-[color:var(--color-doux)]">{t("gratuitTexte")}</p>

      <Carte accent="vert">
        <form action={entrer} className="space-y-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name="ne_plus_afficher"
              className="mt-0.5 h-6 w-6 shrink-0 accent-[color:var(--color-vert)]"
            />
            <span className="leading-snug">{t("nePlusAfficher")}</span>
          </label>
          <Bouton type="submit">{t("entrer")}</Bouton>
        </form>
      </Carte>

      <p className="mt-8 text-center text-sm">
        <Link
          href="/donnees"
          className="font-semibold text-[color:var(--color-doux)] underline underline-offset-4"
        >
          {t("lienDonnees")}
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
const GESTES: {
  emoji: string;
  accent: Teinte;
  /** Sous-clé dans les messages `Accueil.gestes` : le titre et le texte en dépendent. */
  cle: string;
  /** Montre la carte de sortie dessinée sous le texte. Un seul geste la porte. */
  avecMaquette?: boolean;
}[] = [
  { emoji: "👥", accent: "corail", cle: "cercles" },
  { emoji: "🌳", accent: "vert", cle: "sortir" },
  { emoji: "🛝", accent: "bleu", cle: "voir", avecMaquette: true },
  { emoji: "📅", accent: "violet", cle: "agenda" },
  { emoji: "🔔", accent: "rose", cle: "notifications" },
];

/** Sous-clé dans les messages `Accueil.absences` : le titre et le texte en dépendent. */
const ABSENCES: { cle: string }[] = [
  { cle: "messagerie" },
  { cle: "position" },
  { cle: "historique" },
  { cle: "inconnus" },
  { cle: "publicite" },
  { cle: "prenom" },
];
