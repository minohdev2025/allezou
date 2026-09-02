import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { marked } from "marked";
import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

import { SchemaJsonLd, FilDarianeSchema } from "../ui";

// Le gabarit du layout ajoute « · Allezou » : le répéter ici le mettrait deux fois.
export async function generateMetadata() {
  const [t, locale] = await Promise.all([getTranslations("Questions"), getLocale()]);
  const prefixe = locale === "fr" ? "" : `/${locale}`;
  return {
    title: t("titreOnglet"),
    alternates: {
      canonical: `https://allezou.ch${prefixe}/questions`,
    },
  };
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

/**
 * Extrait les vraies Q&R du Markdown pour le JSON-LD FAQPage.
 *
 * QUESTIONS.md a une structure mixte : des tutoriels en numéroté (1./2./3.) et
 * de vraies Q&R sous forme « **Question ?** \n Réponse ». Les premières ne
 * sont PAS des Q&R au sens schema.org/FAQPage — Google pénalise les FAQ
 * gonflées artificiellement. On n'injecte dans le schema que les vraies
 * questions, repérables par leur format gras suivi d'un « ? » en fin de
 * ligne, suivies d'un paragraphe de réponse.
 *
 * Retourne `null` si aucune Q&R n'est trouvée : la page est rendue sans
 * schema, plutôt qu'avec un schema vide qui pourrait être interprété comme
 * une page sans FAQ.
 */
function extraireQuestionsReponses(source: string): { question: string; reponse: string }[] | null {
  const lignes = source.split("\n");
  const resultat: { question: string; reponse: string }[] = [];
  let i = 0;
  while (i < lignes.length) {
    const ligne = lignes[i].trim();
    // Pattern : ligne qui commence par **, finit par ?, et se termine par **
    const match = ligne.match(/^\*\*(.+?\?)\*\*$/);
    if (match) {
      const question = match[1].trim();
      // La réponse est la ou les lignes suivantes, jusqu'au prochain ** ou ligne vide double
      const reponse: string[] = [];
      let j = i + 1;
      while (j < lignes.length) {
        const suivante = lignes[j];
        // Stop si on rencontre une nouvelle question ou un titre H2
        if (/^\*\*.+\?\*\*$/.test(suivante.trim()) || /^## /.test(suivante)) break;
        reponse.push(suivante);
        j++;
      }
      // Nettoyer la réponse : retirer les lignes vides en tête/fin, joindre
      const reponseNettoyee = reponse.join("\n").trim();
      if (reponseNettoyee.length > 0) {
        resultat.push({ question, reponse: reponseNettoyee });
      }
      i = j;
    } else {
      i++;
    }
  }
  return resultat.length > 0 ? resultat : null;
}

export default async function Questions() {
  const [t, locale] = await Promise.all([getTranslations("Questions"), getLocale()]);
  const source = await sourcePour(locale);
  const html = await marked.parse(source);

  const qrs = extraireQuestionsReponses(source);
  const faqSchema = qrs
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: qrs.map((qr) => ({
          "@type": "Question",
          name: qr.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: qr.reponse,
          },
        })),
      }
    : null;

  const prefixe = locale === "fr" ? "" : `/${locale}`;
  const urlPage = `https://allezou.ch${prefixe}/questions`;

  return (
    <main>
      {faqSchema ? <SchemaJsonLd donnees={faqSchema} /> : null}
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
