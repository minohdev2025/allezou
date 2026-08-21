/**
 * Ce que ces tests garantissent : la destination de reprise après connexion ne peut désigner
 * qu'une invitation de ce site.
 *
 * Ce qui entre dans `destinationSure` vient d'une URL, donc de n'importe qui. Un lien bien
 * tourné qui enverrait quelqu'un ailleurs juste après s'être connecté chez nous serait la
 * forme la plus efficace d'hameçonnage : la personne vient de prouver qu'elle nous fait
 * confiance, et elle enchaînerait sur un site qu'elle croirait encore le nôtre.
 */

import { describe, expect, it } from "vitest";

import { destinationSure } from "@/lib/session";

const JETON = "aBcD1234_-eFgH5678";

describe("La destination de reprise", () => {
  it("accepte une invitation de ce site", () => {
    expect(destinationSure(`/rejoindre/${JETON}`)).toBe(`/rejoindre/${JETON}`);
  });

  it("accepte l'invitation de l'autre parent", () => {
    expect(destinationSure(`/parent/${JETON}`)).toBe(`/parent/${JETON}`);
  });

  it("refuse une adresse extérieure", () => {
    expect(destinationSure("https://exemple.test/rejoindre/abcdefghij")).toBeUndefined();
  });

  it("refuse une adresse sans protocole, qui en désigne une autre", () => {
    // « //exemple.test » ressemble à un chemin et mène ailleurs : c'est le piège classique.
    expect(destinationSure("//exemple.test/rejoindre/abcdefghij")).toBeUndefined();
    expect(destinationSure("/\\exemple.test/rejoindre/abcdefghij")).toBeUndefined();
  });

  it("refuse un autre écran, même chez nous", () => {
    // La reprise ne sert qu'aux invitations : élargir sans raison élargit la surface.
    expect(destinationSure("/compte")).toBeUndefined();
    expect(destinationSure("/relecture")).toBeUndefined();
  });

  it("refuse ce qui n'a pas la forme d'un jeton", () => {
    expect(destinationSure("/rejoindre/court")).toBeUndefined();
    expect(destinationSure("/rejoindre/")).toBeUndefined();
    expect(destinationSure("/parent/court")).toBeUndefined();
    expect(destinationSure(`/rejoindre/${JETON}?redirect=ailleurs`)).toBeUndefined();
    expect(destinationSure(`/rejoindre/${JETON}/../compte`)).toBeUndefined();
  });

  it("laisse passer l'absence", () => {
    expect(destinationSure(undefined)).toBeUndefined();
    expect(destinationSure(null)).toBeUndefined();
    expect(destinationSure("")).toBeUndefined();
  });
});
