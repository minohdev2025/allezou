/**
 * Ce que ces tests garantissent : une carte qui s'ouvre cadre tout ce qu'elle doit
 * montrer, et un lien d'itinéraire tombe sur le bon point sans dépendre d'une
 * recherche textuelle.
 */

import { describe, expect, it } from "vitest";

import { GENEVE, cadrageInitial, lienItineraire } from "@/lib/carte";

const GUE = { lat: 46.1858307, lon: 6.1206841 };
const BASTIONS = { lat: 46.2003, lon: 6.1454 };

describe("Le lien d'itinéraire", () => {
  it("vise les coordonnées, pas un nom ambigu", () => {
    expect(lienItineraire(GUE)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=46.1858307%2C6.1206841",
    );
  });
});

describe("Le cadrage initial", () => {
  it("montre Genève quand il n'y a rien à montrer", () => {
    expect(cadrageInitial([])).toEqual({ defaultCenter: GENEVE, defaultZoom: 12 });
  });

  it("regarde un lieu unique de près", () => {
    expect(cadrageInitial([GUE])).toEqual({
      defaultCenter: { lat: GUE.lat, lng: GUE.lon },
      defaultZoom: 15,
    });
  });

  it("englobe tous les points, dans n'importe quel ordre", () => {
    const attendu = {
      defaultBounds: {
        north: BASTIONS.lat,
        south: GUE.lat,
        east: BASTIONS.lon,
        west: GUE.lon,
        padding: 56,
      },
    };
    expect(cadrageInitial([GUE, BASTIONS])).toEqual(attendu);
    expect(cadrageInitial([BASTIONS, GUE])).toEqual(attendu);
  });
});
