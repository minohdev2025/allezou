/**
 * Les namespaces référencés par les composants client voyagent bien jusqu'au navigateur.
 *
 * Un composant client (en `"use client"`) appelle `useTranslations("X")`. Si le namespace
 * `X` ne fait pas partie de la liste blanche que `src/app/[locale]/layout.tsx` passe à
 * `NextIntlClientProvider`, `t("clé")` renvoie la clé brute — `"X.clé"` — et le texte
 * s'affiche tel quel à l'écran. C'est arrivé une fois (août 2026, bannière de demande de
 * notifications) : le composant était là, la traduction aussi, mais la liste du layout ne
 * laissait pas passer le namespace. Une famille voyait « DemandeNotifications.activer » à
 * la place de « Activer les alertes ».
 *
 * Ce test ferme la porte :
 *   1. Il découvre tout ce que les composants client demandent (regex sur
 *      `useTranslations("X")`), sans dépendre d'une liste maintenue à la main.
 *   2. Il extrait la liste blanche du layout (même technique).
 *   3. Il vérifie les inclusions dans les deux sens et la parité entre les cinq langues.
 *
 * Si quelqu'un ajoute un composant client sans étendre la liste, ce test échoue. Si
 * quelqu'un retire un composant client sans nettoyer la liste, il échoue aussi : une
 * chaîne qui reste listée pour rien n'est qu'un détail, mais elle signale qu'on a oublié
 * autre chose.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import es from "../../messages/es.json";
import fr from "../../messages/fr.json";
import pt from "../../messages/pt.json";
import sq from "../../messages/sq.json";

const RACINE = join(__dirname, "..", "..");
const LAYOUT = join(RACINE, "src", "app", "[locale]", "layout.tsx");

/** Les chaînes littérales du tableau `messagesClient` du layout. */
function listeBlancheLayout(): string[] {
  const source = readFileSync(LAYOUT, "utf8");
  // Le tableau est écrit sur plusieurs lignes, sans virgule finale ; on accepte les deux.
  const entete = source.indexOf("messagesClient = Object.fromEntries");
  if (entete < 0) {
    throw new Error("Bloc `messagesClient = Object.fromEntries(...)` introuvable dans layout.tsx");
  }
  const crochetOuvrant = source.indexOf("[", entete);
  const crochetFermant = source.indexOf("]", crochetOuvrant);
  const bloc = source.slice(crochetOuvrant, crochetFermant + 1);
  const chaines = [...bloc.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  // On filtre les chaînes qui ne ressemblent pas à un identifiant de namespace :
  // seules les lettres, en CamelCase, à commencer par une majuscule.
  return chaines.filter((c) => /^[A-Z][A-Za-z0-9]*$/.test(c));
}

/** Les noms de fichiers `*.tsx` qui commencent par la directive `"use client"`. */
function fichiersClient(): string[] {
  const sortie = execSync(
    `grep -rl --include="*.tsx" '^"use client"' "${join(RACINE, "src")}"`,
    { encoding: "utf8" },
  );
  return sortie.trim().split("\n").filter(Boolean);
}

/** Les namespaces (`useTranslations("X")`) qu'un fichier utilise, après nettoyage. */
function namespacesUtilises(chemin: string): Set<string> {
  const source = readFileSync(chemin, "utf8");
  const trouves = new Set<string>();
  // `useTranslations("X")` et `useTranslations("X.Y")` : on garde la racine.
  for (const m of source.matchAll(/useTranslations\(\s*["']([^"']+)["']/g)) {
    const racine = m[1].split(".")[0];
    if (/^[A-Z][A-Za-z0-9]*$/.test(racine)) {
      trouves.add(racine);
    }
  }
  return trouves;
}

const CATALOGUES = { fr, en, es, pt, sq } as const;

describe("namespaces des composants client", () => {
  const blanches = listeBlancheLayout();
  const client = fichiersClient().flatMap((f) => [...namespacesUtilises(f)]);
  const utilises = new Set(client);

  it("au moins un namespace client est référencé (sinon ce test est inerte)", () => {
    expect(utilises.size).toBeGreaterThan(0);
  });

  it("la liste blanche du layout n'est pas vide", () => {
    expect(blanches.length).toBeGreaterThan(0);
  });

  it("chaque namespace utilisé par un composant client est listé dans le layout", () => {
    const manquants = [...utilises].filter((ns) => !blanches.includes(ns));
    expect(
      manquants,
      `Namespaces oubliés dans layout.tsx > messagesClient : ${manquants.join(", ")}\n` +
        `Sinon, t("...") côté navigateur renvoie la clé brute.`,
    ).toEqual([]);
  });

  it("chaque namespace listé dans le layout est utilisé par au moins un composant client", () => {
    const inutiles = blanches.filter((ns) => !utilises.has(ns));
    expect(
      inutiles,
      `Namespaces listés sans consommateur : ${inutiles.join(", ")}\n` +
        `Une chaîne embarquée pour rien est une occasion d'oublier ce qui compte.`,
    ).toEqual([]);
  });

  it("chaque namespace client existe dans les cinq catalogues", () => {
    const clesRacines = (catalogue: Record<string, unknown>) =>
      new Set(Object.keys(catalogue));
    for (const [langue, catalogue] of Object.entries(CATALOGUES)) {
      const racines = clesRacines(catalogue as Record<string, unknown>);
      const manquants = [...utilises].filter((ns) => !racines.has(ns));
      expect(
        manquants,
        `${langue} : namespaces manquants à la racine — ${manquants.join(", ")}`,
      ).toEqual([]);
    }
  });

  it("la liste blanche du layout ne contient pas de namespace inventé", () => {
    const racinesFr = new Set(Object.keys(fr));
    const inconnus = blanches.filter((ns) => !racinesFr.has(ns));
    expect(inconnus, `Namespaces inconnus dans fr.json : ${inconnus.join(", ")}`).toEqual([]);
  });
});
