import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { marked } from "marked";
import Link from "next/link";

export const metadata = { title: "Vos données dans Totir" };

/**
 * La page d'information rend directement `DONNEES.md`.
 *
 * Une seule source : ce que le dépôt documente et ce que les parents lisent ne peuvent pas
 * diverger. Le fichier doit être livré à côté du serveur en production.
 */
export default async function Donnees() {
  const source = await readFile(join(process.cwd(), "DONNEES.md"), "utf8");
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
          Retour
        </Link>
      </p>
    </main>
  );
}
