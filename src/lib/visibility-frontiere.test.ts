/**
 * La garde qui tient la promesse du README.
 *
 * `visibility.test.ts` démontre que la règle est juste. Ce test-ci vérifie qu'on ne peut
 * pas la contourner : il compte les endroits du code qui lisent la table `publication`
 * sans passer par `visibility.ts`, et refuse tout nouvel endroit qui n'aurait pas été
 * discuté.
 *
 * Pourquoi ce n'est pas zéro. Certaines lectures ne traversent aucune frontière
 * d'audience, et les faire passer par la règle n'apporterait rien :
 *
 * - lire ses propres lignes (« ma dernière sortie », « mon inscription à cette
 *   activité ») — la règle dit de toute façon qu'on voit ce qu'on publie ;
 * - lire le seul `author_id` ou `kind` d'une publication pour décider si celui qui
 *   demande a le droit de la modifier. Rien de ce qu'un parent a écrit n'en sort : la
 *   réponse est « c'est à vous » ou « ce n'est pas à vous ».
 *
 * Ce qui reste interdit, et que ce test attrape : lire le contenu d'une publication pour
 * le montrer à quelqu'un, ou en dresser une liste, sans le prédicat. C'est le chemin par
 * lequel une isolation se perd, et il n'a pas d'exception.
 *
 * Quand ce test échoue, la bonne question n'est pas « comment le faire taire » mais
 * « cette nouvelle lecture montre-t-elle à quelqu'un ce qu'un autre a publié ? ». Si oui,
 * elle doit passer par visibility.ts. Si non, ajoutez-la ici avec sa raison.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const RACINE_SRC = fileURLToPath(new URL("..", import.meta.url));

/**
 * Les lectures directes tolérées, fichier par fichier, avec leur compte exact.
 *
 * Le compte est là pour que l'ajout d'une lecture dans un fichier déjà listé fasse tomber
 * le test : autrement, `publications.ts` deviendrait une porte ouverte au motif qu'elle
 * l'est déjà un peu.
 */
const TOLEREES: Record<string, { lectures: number; pourquoi: string }> = {
  "lib/publications.ts": {
    lectures: 8,
    pourquoi:
      "sept contrôles d'auteur avant une écriture (rejoindre, prolonger, annoter, " +
      "changer les destinataires, quitter, retirer) et « ma dernière sortie », qui ne " +
      "lit que ses propres lignes.",
  },
  "lib/notifications.ts": {
    lectures: 2,
    pourquoi:
      "la forme de la publication pour choisir le mot du message, et les noms de " +
      "cercles ajoutés à une liste de destinataires qui vient déjà, elle, de " +
      "readersOfPublication.",
  },
};

/** Les fichiers qu'on ne regarde pas : la règle elle-même, et tout ce qui est de test. */
function aExaminer(chemin: string): boolean {
  if (chemin.endsWith(".test.ts") || chemin.endsWith(".test.tsx")) return false;
  if (chemin.startsWith("test/")) return false;
  if (chemin === "lib/visibility.ts") return false;
  return chemin.endsWith(".ts") || chemin.endsWith(".tsx");
}

function fichiersSources(dossier = RACINE_SRC, prefixe = ""): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(dossier)) {
    const complet = join(dossier, entree);
    const relatif = prefixe ? `${prefixe}/${entree}` : entree;
    if (statSync(complet).isDirectory()) {
      trouves.push(...fichiersSources(complet, relatif));
    } else if (aExaminer(relatif)) {
      trouves.push(relatif);
    }
  }
  return trouves;
}

/**
 * Compte les lectures de la table dans un fichier.
 *
 * Deux écritures possibles, l'une en SQL brut et l'autre par le constructeur de requêtes.
 * `\b` empêche `publication_circle` et ses sœurs de compter : ce sont des tables de
 * rattachement, sans contenu à protéger. Les écritures ne comptent pas non plus — insérer
 * ou effacer ne montre rien à personne, et la règle porte sur ce qu'on donne à voir.
 */
export function lecturesDirectes(source: string): number {
  return source.split("\n").filter((ligne) => {
    if (/delete\s+from\s+publication\b/.test(ligne)) return false;
    return /\bfrom\s+publication\b/.test(ligne) || /\.from\(s\.publication\)/.test(ligne);
  }).length;
}

describe("La table publication ne se lit pas ailleurs que dans visibility.ts", () => {
  it("aucun fichier ne la lit hors de ceux qui sont écrits ici", () => {
    const constate: Record<string, number> = {};

    for (const fichier of fichiersSources()) {
      const lectures = lecturesDirectes(readFileSync(join(RACINE_SRC, fichier), "utf8"));
      if (lectures > 0) constate[fichier] = lectures;
    }

    const attendu = Object.fromEntries(
      Object.entries(TOLEREES).map(([fichier, { lectures }]) => [fichier, lectures]),
    );

    expect(constate).toEqual(attendu);
  });

  it("le détecteur reconnaît les deux écritures, et se tait sur le reste", () => {
    // Témoin : si ces quatre lignes ne se comptaient pas comme elles doivent, le test
    // ci-dessus passerait pour de mauvaises raisons.
    expect(lecturesDirectes("    from publication p")).toBe(1);
    expect(lecturesDirectes("    .from(s.publication)")).toBe(1);
    expect(lecturesDirectes("    from publication_circle pc")).toBe(0);
    expect(lecturesDirectes("    delete from publication")).toBe(0);
  });

  it("chaque tolérance dit pourquoi elle existe", () => {
    for (const [fichier, { pourquoi }] of Object.entries(TOLEREES)) {
      expect(pourquoi.length, `${fichier} sans justification`).toBeGreaterThan(20);
    }
  });
});
