import { getTranslations } from "next-intl/server";

import { LANGUES, languesVisibles, type Locale } from "@/i18n/routing";

import { requireAccount } from "@/lib/session";
import { changerLangue, changerNom, seDeconnecter } from "../../actions";
import { Bouton, Carte, Champ, Navigation } from "../../ui";
import { EnteteReglages } from "../_entete";

/**
 * Profil identité : le nom que les autres voient sur vos sorties et vos
 * messages, et la langue dans laquelle l'app vous parle. Pas de péage caché :
 * tout est modifiable sans confirmation, le prénom se voit partout.
 *
 * La famille (vos enfants, l'autre parent, les clés d'accès) vit sur
 * `/reglages/enfants` et `/reglages/passkeys` — accessibles depuis le hub.
 * On ne duplique plus le lien ici : il était redondant avec la tuile
 * Famille du hub, et cette page reste centrée sur l'identité.
 */
export default async function ReglagesProfil() {
  const t = await getTranslations("Reglages");
  const account = await requireAccount();

  // Langues proposées : on n'affiche que celles qu'on promeut, plus la langue
  // courante — un compte qui a déjà choisi le shqip (avant qu'on l'ait retiré
  // du sélecteur public) doit pouvoir en sortir. Mêmes règles que sur les
  // pages publiques : `languesVisibles` est l'autorité.
  const visibles = languesVisibles(account.locale);
  const disponibles = visibles.filter((l) => l !== account.locale);

  return (
    <main className="apparait">
      <EnteteReglages titre={t("profilTitre")} />

      <Carte className="mb-5">
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

      <Carte className="mb-5">
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