import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { marked } from "marked";
import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

import { FilDarianeSchema } from "../ui";

// Le gabarit du layout ajoute « · Allezou » : le répéter ici le mettrait deux fois.
export async function generateMetadata() {
  const [t, locale] = await Promise.all([getTranslations("Donnees"), getLocale()]);
  const prefixe = locale === "fr" ? "" : `/${locale}`;
  return {
    title: t("titreOnglet"),
    alternates: {
      canonical: `https://allezou.ch${prefixe}/donnees`,
    },
  };
}

/**
 * Rendue à chaque requête, comme le reste : la politique de sécurité du contenu porte un
 * nonce différent à chaque fois, qu'une page figée au moment du build ne pourrait pas porter.
 */
export const dynamic = "force-dynamic";

/**
 * La page d'information rend directement `DONNEES.md`.
 *
 * Une seule source : ce que le dépôt documente et ce que les parents lisent ne peuvent pas
 * diverger. Le fichier doit être livré à côté du serveur en production.
 *
 * Chaque langue a son fichier — DONNEES.en.md, DONNEES.sq.md… — traduction du français,
 * qui reste l'original et le seul qui fasse foi. Une langue dont le fichier manque lit le
 * français : une promesse de confidentialité approximative serait pire qu'une promesse en
 * français.
 */
async function sourcePour(locale: string): Promise<string> {
  if (locale !== "fr") {
    try {
      return await readFile(join(process.cwd(), `DONNEES.${locale}.md`), "utf8");
    } catch {
      // Pas encore traduit : le français fait foi.
    }
  }
  return readFile(join(process.cwd(), "DONNEES.md"), "utf8");
}

export default async function Donnees() {
  const [t, locale] = await Promise.all([getTranslations("Donnees"), getLocale()]);
  const source = await sourcePour(locale);
  const html = await marked.parse(source);

  // URL absolue du fil d'Ariane. La home par défaut n'a pas de préfixe
  // de locale (fr = défaut), les autres oui.
  const prefixe = locale === "fr" ? "" : `/${locale}`;
  const urlPage = `https://allezou.ch${prefixe}/donnees`;

  return (
    <main>
      <FilDarianeSchema items={[{ nom: "Accueil", url: `https://allezou.ch${prefixe}` }, { nom: t("titre"), url: urlPage }]} />
      <article
        className="prose-totir"
        // Le contenu vient d'un fichier du dépôt, pas d'une saisie utilisateur.
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <p className="mt-10 text-center">
        <Link href="/" className="underline underline-offset-4">
          {t("retour")}
        </Link>
      </p>
    </main>
  );
}
