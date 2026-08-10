/**
 * Ce que ces tests garantissent : une heure saisie à l'écran veut dire l'heure de Genève,
 * même si le serveur tourne ailleurs.
 */

import { describe, expect, it } from "vitest";

import { heureDeGeneve } from "@/lib/heure";

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
