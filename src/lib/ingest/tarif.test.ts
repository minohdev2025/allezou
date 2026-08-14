/**
 * Ce que ces tests garantissent : le prix et l'inscription sont lus dans les mots que la
 * source a écrits, et une page qui n'en dit rien reste « non défini ». Jamais gratuit par
 * défaut : c'est la seule erreur de ce module qui ferait arriver une famille sans argent
 * devant une caisse.
 */

import { describe, expect, it } from "vitest";

import { lireTarifEtAcces } from "@/lib/ingest/tarif";

const tarif = (...textes: (string | null | undefined)[]) =>
  lireTarifEtAcces(...textes).tarif;
const acces = (...textes: (string | null | undefined)[]) =>
  lireTarifEtAcces(...textes).acces;

describe("Le prix", () => {
  it("reste non défini quand la page n'en dit rien", () => {
    expect(tarif("Atelier chocolat", "Venez nombreux au parc.")).toBe("inconnu");
    expect(tarif()).toBe("inconnu");
    expect(tarif(null, undefined)).toBe("inconnu");
  });

  it("lit « gratuit » sous toutes ses formes", () => {
    expect(tarif("Concert gratuit")).toBe("gratuit");
    expect(tarif("Entrée gratuite")).toBe("gratuit");
    expect(tarif("Animation offerte", "Ouvert à tous, entrée libre")).toBe("gratuit");
    expect(tarif("Visite guidée", "Sans frais pour les habitants")).toBe("gratuit");
  });

  it("lit un montant comme une page suisse l'écrit", () => {
    expect(tarif("Spectacle", "CHF 12 pour les enfants")).toBe("payant");
    expect(tarif("Spectacle", "Entrée : 15.-")).toBe("payant");
    expect(tarif("Spectacle", "Tarif réduit pour les familles")).toBe("payant");
    expect(tarif("Spectacle", "20 francs à l'entrée")).toBe("payant");
    expect(tarif("Spectacle", "Billetterie sur place")).toBe("payant");
  });

  it("penche vers payant quand la page dit les deux", () => {
    // Quelqu'un paie. L'apprendre à la caisse est pire que de payer en le sachant.
    expect(tarif("Cirque", "Gratuit jusqu'à 12 ans, CHF 15 dès 16 ans")).toBe("payant");
  });

  it("ne prend pas l'accent pour une différence", () => {
    expect(tarif("ENTRÉE LIBRE")).toBe("gratuit");
    expect(tarif("Gratuité pour les moins de 6 ans")).toBe("gratuit");
  });
});

describe("L'inscription", () => {
  it("reste non définie quand la page n'en dit rien", () => {
    expect(acces("Marché de Noël", "Sur la place du village")).toBe("inconnu");
  });

  it("reconnaît une inscription demandée", () => {
    expect(acces("Atelier", "Sur inscription auprès de la mairie")).toBe("inscription");
    expect(acces("Atelier", "Inscription obligatoire")).toBe("inscription");
    expect(acces("Atelier", "Réservation nécessaire")).toBe("inscription");
    expect(acces("Atelier", "Places limitées")).toBe("inscription");
    expect(acces("Atelier", "Billetterie en ligne")).toBe("inscription");
  });

  it("reconnaît une entrée libre", () => {
    expect(acces("Concert", "Entrée libre")).toBe("libre");
    expect(acces("Concert", "Sans inscription")).toBe("libre");
    expect(acces("Exposition", "En libre accès toute la journée")).toBe("libre");
  });

  it("penche vers l'inscription quand la page dit les deux", () => {
    // Arriver devant une porte pleine coûte la sortie. S'inscrire pour rien coûte une minute.
    expect(acces("Fête", "Entrée libre, sur inscription pour le repas")).toBe("inscription");
  });
});

describe("Les deux ensemble", () => {
  it("lit « entrée libre » comme un prix et comme un accès", () => {
    expect(lireTarifEtAcces("Concert de l'Escalade", "Entrée libre")).toEqual({
      tarif: "gratuit",
      acces: "libre",
    });
  });

  it("laisse une activité muette entièrement non définie", () => {
    expect(lireTarifEtAcces("Vide-greniers du village")).toEqual({
      tarif: "inconnu",
      acces: "inconnu",
    });
  });
});
