import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { marked } from "marked";
import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

import { FilDarianeSchema } from "../ui";

/*
 * Page « Qui sommes-nous » — version longue et détaillée de ce qui tient
 * déjà en quelques lignes sur la home. Contenu chargé depuis APROPOS.md
 * (un fichier par langue), même mécanique que /donnees : une seule source
 * du contenu, traduction si le fichier localisé existe, français par défaut.
 *
 * La page est indexable et suivie (E-E-A-T = signal de confiance fort pour
 * un site qui parle d'enfants). Le contenu est du Markdown versionné
 * dans le dépôt — pas de saisie utilisateur, donc `dangerouslySetInnerHTML`
 * est sûr ici.
 */

export async function generateMetadata() {
  const [t, locale] = await Promise.all([getTranslations("APropos"), getLocale()]);
  const prefixe = locale === "fr" ? "" : `/${locale}`;
  return {
    title: t("titreOnglet"),
    description: t("description"),
    alternates: {
      // Canonical self-referencing : chaque variante pointe vers elle-même.
      // Google accepte que les variantes linguistiques soient chacune leur
      // propre canonical (tant que les hreflang sont cohérents).
      canonical: `https://allezou.ch${prefixe}/a-propos`,
    },
  };
}

async function sourcePour(locale: string): Promise<string> {
  if (locale !== "fr") {
    try {
      return await readFile(join(process.cwd(), `APROPOS.${locale}.md`), "utf8");
    } catch {
      // Pas encore traduit : le français fait foi.
    }
  }
  return readFile(join(process.cwd(), "APROPOS.md"), "utf8");
}

export default async function APropos() {
  const [t, locale] = await Promise.all([getTranslations("APropos"), getLocale()]);
  const source = await sourcePour(locale);
  const html = await marked.parse(source);

  const prefixe = locale === "fr" ? "" : `/${locale}`;
  const urlPage = `https://allezou.ch${prefixe}/a-propos`;

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
