/**
 * Ce que ces tests garantissent : une énumération française se lit comme du français.
 *
 * `join(" et ")` marche jusqu'à deux, et une famille de trois lisait « Léa et Matéo et
 * Jules » sur chacune de ses sorties. Le défaut n'existe pas dans le monde d'un parent de
 * deux enfants, ce qui explique qu'il ait tenu si longtemps.
 */

import { describe, expect, it } from "vitest";

import { listeFr } from "@/lib/texte";

describe("Énumérer des prénoms", () => {
  it("rend un prénom seul tel quel", () => {
    expect(listeFr(["Léa"])).toBe("Léa");
  });

  it("relie deux prénoms par « et »", () => {
    expect(listeFr(["Léa", "Matéo"])).toBe("Léa et Matéo");
  });

  it("sépare par des virgules jusqu'au dernier", () => {
    expect(listeFr(["Léa", "Matéo", "Jules"])).toBe("Léa, Matéo et Jules");
    expect(listeFr(["Léa", "Matéo", "Jules", "Anna"])).toBe("Léa, Matéo, Jules et Anna");
  });

  it("ne rend rien pour une liste vide", () => {
    expect(listeFr([])).toBe("");
  });
});
