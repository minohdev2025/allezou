/**
 * Les cinq catalogues de traduction marchent du même pas.
 *
 * Une clé qui manque dans une langue ne se voit pas en développement (on développe en
 * français) : elle se découvre sur le téléphone d'une famille albanophone, en production.
 * Ce test rend le décalage impossible : mêmes clés partout, et les arguments ICU d'une
 * valeur française — {mot}, {n, plural…} — présents dans chacune de ses traductions, parce
 * qu'une traduction qui perd un argument perd l'information qu'il portait.
 */

import { describe, expect, it } from "vitest";

import { routing } from "@/i18n/routing";

import en from "../../messages/en.json";
import es from "../../messages/es.json";
import fr from "../../messages/fr.json";
import pt from "../../messages/pt.json";
import sq from "../../messages/sq.json";

const CATALOGUES: Record<string, Record<string, unknown>> = { fr, en, es, pt, sq };

/** Les chemins de toutes les feuilles d'un catalogue : « Compte.erreurs.nom ». */
function feuilles(objet: Record<string, unknown>, prefixe = ""): string[] {
  return Object.entries(objet).flatMap(([cle, valeur]) => {
    const chemin = prefixe ? `${prefixe}.${cle}` : cle;
    if (valeur && typeof valeur === "object") {
      return feuilles(valeur as Record<string, unknown>, chemin);
    }
    return [chemin];
  });
}

function valeurAu(objet: Record<string, unknown>, chemin: string): unknown {
  return chemin
    .split(".")
    .reduce<unknown>((courant, cle) => (courant as Record<string, unknown>)?.[cle], objet);
}

/** Les noms d'arguments ICU d'une valeur : « {mot} », « {n, plural, … } » → mot, n. */
function argumentsICU(valeur: string): string[] {
  // Une branche plural (« one { », « =1 { »…) ouvre une accolade qui n'introduit pas un
  // argument mais un texte littéral — parfois lui-même commencé par une lettre, comme dans
  // « one {Vous êtes seul·e} ». On l'efface avant l'extraction : sinon le premier mot de
  // chaque branche se ferait passer pour un argument, et deux langues qui choisissent des
  // mots différents pour « y va »/« y vont » se verraient à tort accusées d'un argument
  // perdu.
  const sansBranches = valeur.replace(/(?:\b(?:zero|one|two|few|many|other)|=\d+)\s*\{/g, "");
  const noms = [...sansBranches.matchAll(/\{\s*([a-zA-Z0-9_]+)/g)].map((m) => m[1]);
  return [...new Set(noms)].sort();
}

describe("catalogues de traduction", () => {
  it("le routage et les fichiers de messages servent les mêmes langues", () => {
    expect([...routing.locales].sort()).toEqual(Object.keys(CATALOGUES).sort());
  });

  const reference = feuilles(fr).sort();

  for (const [langue, catalogue] of Object.entries(CATALOGUES)) {
    if (langue === "fr") continue;

    it(`${langue} : mêmes clés que le français`, () => {
      expect(feuilles(catalogue).sort()).toEqual(reference);
    });

    it(`${langue} : mêmes arguments ICU que le français`, () => {
      for (const chemin of reference) {
        const enFrancais = valeurAu(fr, chemin);
        const traduit = valeurAu(catalogue, chemin);
        if (typeof enFrancais !== "string" || typeof traduit !== "string") continue;
        expect(argumentsICU(traduit), `arguments de ${chemin}`).toEqual(
          argumentsICU(enFrancais),
        );
      }
    });
  }
});
