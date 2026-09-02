import type { Metadata } from "next";

import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

/*
 * Page « Les parcs pour enfants à Genève » — la pièce SEO long-tail du
 * site. Référencée depuis /reglages (section « En savoir plus »), elle
 * vise les recherches « parc enfants Genève », « aire de jeux [commune] »,
 * « où jouer avec les enfants à Genève ».
 *
 * Contenu chargé depuis PARCS.md, même mécanique que /donnees.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Parcs");
  return {
    title: t("titreOnglet"),
    description: t("description"),
    robots: { index: false, follow: false },
  };
}

export default async function Parcs() {
  const t = await getTranslations("Parcs");
  const locale = await getLocale();

  return (
    <main className="apparait mx-auto max-w-lg px-5 py-10">
      <h1 className="titre mb-4 text-3xl font-bold tracking-tight">{t("titre")}</h1>
      <p className="mb-3 text-sm leading-snug text-[color:var(--color-doux)]">
        {t("phraseIntro")}
      </p>
      <article className="prose-totir mt-4 rounded-[var(--radius-carte)] bg-[color:var(--color-surface)] p-5 text-[color:var(--color-encre)] shadow-[inset_0_0_0_2px_var(--color-trait)]">
        <p>{t("placeholder")}</p>
        <p className="mt-3 text-sm text-[color:var(--color-doux)]">
          Locale courante : <code>{locale}</code>
        </p>
      </article>
      <p className="mt-10 text-center text-sm">
        <Link href="/reglages" className="underline underline-offset-4">
          {t("retour")}
        </Link>
      </p>
    </main>
  );
}
