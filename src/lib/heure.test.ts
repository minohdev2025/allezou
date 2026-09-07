/**
 * Ce que ces tests garantissent : une heure saisie à l'écran veut dire l'heure de Genève,
 * même si le serveur tourne ailleurs.
 */

import { describe, expect, it } from "vitest";

import { heureDeGeneve, minutesJusquAHeurePrecise } from "@/lib/heure";

describe("Heure saisie à l'écran", () => {
  it("lit une heure d'été à Genève (UTC+2)", () => {
    expect(heureDeGeneve("2026-08-15T15:00")?.toISOString()).toBe("2026-08-15T13:00:00.000Z");
  });

  it("lit une heure d'hiver à Genève (UTC+1)", () => {
    expect(heureDeGeneve("2026-01-04T14:00")?.toISOString()).toBe("2026-01-04T13:00:00.000Z");
  });

  it("reste juste la veille et le jour du changement d'heure", () => {
    // Passage à l'heure d'été le dimanche 29 mars 2026 à 2 h.
    expect(heureDeGeneve("2026-03-28T15:00")?.toISOString()).toBe("2026-03-28T14:00:00.000Z");
    expect(heureDeGeneve("2026-03-29T15:00")?.toISOString()).toBe("2026-03-29T13:00:00.000Z");
  });

  it("refuse une saisie vide ou mal formée", () => {
    expect(heureDeGeneve("")).toBeNull();
    expect(heureDeGeneve(null)).toBeNull();
    expect(heureDeGeneve("demain 15h")).toBeNull();
    expect(heureDeGeneve("2026-13-45T99:99")).toBeNull();
  });
});

describe("Heure de retour saisie seule (« jusqu'à 18:30 »)", () => {
  // Un samedi d'été : « maintenant » = 14 h à Genève, le serveur peut être ailleurs.
  const maintenant = new Date("2026-08-15T12:00:00.000Z"); // 14 h Genève

  it("compte les minutes jusqu'à l'heure saisie, au jour d'aujourd'hui à Genève", () => {
    expect(minutesJusquAHeurePrecise("18:30", null, maintenant)).toBe(270);
    expect(minutesJusquAHeurePrecise("14:15", null, maintenant)).toBe(15);
  });

  it("se cale sur le départ annoncé quand il est rempli", () => {
    const debut = heureDeGeneve("2026-08-15T16:00")!;
    expect(minutesJusquAHeurePrecise("18:30", debut, maintenant)).toBe(150);
  });

  it("donne une durée négative plutôt qu'« après minuit » — le serveur la refusera", () => {
    // 22 h saisies alors qu'on annonce un départ à 10 h le lendemain n'existe pas ici :
    // la sortie s'annonce pour la journée, pas à cheval.
    const debut = heureDeGeneve("2026-08-15T23:30")!;
    expect(minutesJusquAHeurePrecise("00:30", debut, maintenant)).toBe(-1380);
  });

  it("reste null quand la saisie est vide ou illisible : l'appelant retombe sur la puce", () => {
    expect(minutesJusquAHeurePrecise("", null, maintenant)).toBeNull();
    expect(minutesJusquAHeurePrecise(null, null, maintenant)).toBeNull();
    expect(minutesJusquAHeurePrecise("bientôt", null, maintenant)).toBeNull();
    expect(minutesJusquAHeurePrecise("25:99", null, maintenant)).toBeNull();
  });
});
