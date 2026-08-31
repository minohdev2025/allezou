import { getTranslations } from "next-intl/server";

import { LANGUES, type Locale } from "@/i18n/routing";

import { requireAccount } from "@/lib/session";
import { changerLangue, changerNom, seDeconnecter } from "../../actions";
import { Bouton, Carte, Champ, LienBouton, Navigation } from "../../ui";
import { EnteteReglages } from "../_entete";

/**
 * Profil identité : le nom que les autres voient sur vos sorties et vos
 * messages, et la langue dans laquelle l'app vous parle. Pas de péage caché :
 * tout est modifiable sans confirmation, le prénom se voit partout.
 *
 * La carte « Famille » renvoie vers `/reglages/enfants` où se gèrent les
 * enfants du compte et l'invitation de l'autre parent — c'est volontairement
 * sur une autre page, parce que la co-parentalité mérite son propre écran
 * (formulaire long, listes d'enfants à renommer ou fusionner).
 */
export default async function ReglagesProfil() {
  const t = await getTranslations("Reglages");
  const account = await requireAccount();

  // Langues proposées : on prend celles déclarées dans le routing plutôt que
  // de hardcoder une liste ici. Si la locale courante n'y figure plus, on ne
  // l'affiche pas en bouton (l'utilisateur ne peut pas la re-sélectionner).
  const toutes = Object.keys(LANGUES) as Locale[];
  const disponibles = toutes.filter((l) => l !== account.locale);

  return (
    <main className="apparait">
      <EnteteReglages titre={t("profilTitre")} />

      <Carte accent="bleu" className="mb-5">
        <form action={changerNom} className="space-y-4">
          <Champ
            label={t("nomLabel")}
            aide={t("nomAide")}
            name="nom"
            defaultValue={account.displayName}
            required
            maxLength={60}
          />
          <Bouton variante="second">{t("enregistrer")}</Bouton>
        </form>
      </Carte>

      <Carte accent="vert" className="mb-5">
        <h2 className="titre mb-2 text-lg font-bold">{t("langueTitre")}</h2>
        <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
          {t("langueTexte")}
        </p>
        <form action={changerLangue} className="flex flex-wrap gap-2">
          <span
            aria-current="true"
            className="rounded-[var(--radius-pilule)] px-3 py-2 text-sm font-bold"
            style={{ background: "var(--color-vert-doux)", color: "var(--color-vert)" }}
          >
            {LANGUES[account.locale as Locale]}
          </span>
          {disponibles.map((langue) => (
            <button
              key={langue}
              name="langue"
              value={langue}
              className="rounded-[var(--radius-pilule)] px-3 py-2 text-sm font-bold text-[color:var(--color-doux)] shadow-[inset_0_0_0_2px_var(--color-trait)]"
            >
              {LANGUES[langue]}
            </button>
          ))}
        </form>
      </Carte>

      <Carte accent="ambre" className="mb-5">
        <h2 className="titre mb-2 text-lg font-bold">{t("familleTitre")}</h2>
        <p className="mb-4 text-sm leading-snug text-[color:var(--color-doux)]">
          {t("familleTexte")}
        </p>
        <LienBouton href="/reglages/enfants">{t("familleBouton")}</LienBouton>
      </Carte>

      <form action={seDeconnecter} className="mt-8 text-center">
        <button className="text-sm text-[color:var(--color-doux)] underline underline-offset-4 active:opacity-70">
          {t("deconnexion")}
        </button>
      </form>
      <div className="mt-8 flex-1" aria-hidden />
      <Navigation actif="reglages" />

    </main>
  );
}