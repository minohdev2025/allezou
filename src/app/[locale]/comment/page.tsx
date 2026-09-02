import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { marked } from "marked";
import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

import { FilDarianeSchema } from "../ui";

/*
 * Page « Comment ça marche » — la version détaillée de la home (qui
 * survole les grandes sections). Contenu chargé depuis COMMENT.md, même
 * mécanique que /donnees et /a-propos : un fichier .md par langue,
 * français par défaut.
 */

export async function generateMetadata() {
  const [t, locale] = await Promise.all([getTranslations("Comment"), getLocale()]);
  const prefixe = locale === "fr" ? "" : `/${locale}`;
  return {
    title: t("titreOnglet"),
    description: t("description"),
    alternates: {
      canonical: `https://allezou.ch${prefixe}/comment`,
    },
  };
}

async function sourcePour(locale: string): Promise<string> {
  if (locale !== "fr") {
    try {
      return await readFile(join(process.cwd(), `COMMENT.${locale}.md`), "utf8");
    } catch {
      // Pas encore traduit : le français fait foi.
    }
  }
  return readFile(join(process.cwd(), "COMMENT.md"), "utf8");
}

export default async function Comment() {
  const [t, locale] = await Promise.all([getTranslations("Comment"), getLocale()]);
  const source = await sourcePour(locale);
  const html = await marked.parse(source);

  const prefixe = locale === "fr" ? "" : `/${locale}`;
  const urlPage = `https://allezou.ch${prefixe}/comment`;

  return (
    <main>
      <FilDarianeSchema items={[{ nom: "Accueil", url: `https://allezou.ch${prefixe}` }, { nom: t("titre"), url: urlPage }]} />
      <article
        className="prose-totir"
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
