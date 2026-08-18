import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { marked } from "marked";
import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

// Le gabarit du layout ajoute « · Allezou » : le répéter ici le mettrait deux fois.
export async function generateMetadata() {
  const t = await getTranslations("Questions");
  return { title: t("titreOnglet") };
}

/**
 * Rendue à chaque requête, comme le reste : la politique de sécurité du contenu porte un
 * nonce différent à chaque fois, qu'une page figée au moment du build ne pourrait pas porter.
 */
export const dynamic = "force-dynamic";

/**
 * Les questions fréquentes, rendues depuis `QUESTIONS.md` — même chemin que `/donnees`.
 *
 * Sans capture d'écran, et c'est délibéré : une capture périme à la première retouche
 * d'interface, et personne ne la regravera sur un projet tenu à une paire de mains. Une
 * copie d'écran fausse dit une application qui n'existe pas, juste à côté de la page qui
 * demande qu'on lui fasse confiance.
 *
 * Chaque langue a son fichier — QUESTIONS.en.md, QUESTIONS.sq.md… — comme pour /donnees :
 * le français reste l'original, et une langue dont le fichier manque le lit.
 */
async function sourcePour(locale: string): Promise<string> {
  if (locale !== "fr") {
    try {
      return await readFile(join(process.cwd(), `QUESTIONS.${locale}.md`), "utf8");
    } catch {
      // Pas encore traduit : le français fait foi.
    }
  }
  return readFile(join(process.cwd(), "QUESTIONS.md"), "utf8");
}

export default async function Questions() {
  const [t, locale] = await Promise.all([getTranslations("Questions"), getLocale()]);
  const source = await sourcePour(locale);
  const html = await marked.parse(source);

  return (
    <main>
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
