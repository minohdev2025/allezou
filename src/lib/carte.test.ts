/**
 * Ce que ces tests garantissent : une carte qui s'ouvre cadre tout ce qu'elle doit
 * montrer, une distance annoncée est juste à l'échelle où on la lit, et un lien
 * d'itinéraire tombe sur le bon point sans dépendre d'une recherche textuelle.
 */

import { describe, expect, it } from "vitest";

import {
  GENEVE,
  cadrageInitial,
  distanceMetres,
  formatDistance,
  lienItineraire,
} from "@/lib/carte";

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

describe("La distance à vol d'oiseau", () => {
  it("est nulle d'un point à lui-même", () => {
    expect(distanceMetres(GUE, GUE)).toBe(0);
  });

  it("retrouve l'ordre de grandeur connu entre deux points du canton", () => {
    // Du parc du Gué au parc des Bastions : environ 2,5 km à vol d'oiseau.
    const d = distanceMetres(GUE, BASTIONS);
    expect(d).toBeGreaterThan(2_000);
    expect(d).toBeLessThan(3_000);
    // Symétrique : l'aller vaut le retour.
    expect(distanceMetres(BASTIONS, GUE)).toBeCloseTo(d, 6);
  });
});

describe("La distance qui se lit", () => {
  it("arrondit à la dizaine de mètres sous le kilomètre", () => {
    expect(formatDistance(4)).toBe("10 m");
    expect(formatDistance(846)).toBe("850 m");
  });

  it("passe en kilomètres au-delà, avec une virgule", () => {
    expect(formatDistance(2_147)).toBe("2,1 km");
    expect(formatDistance(12_449)).toBe("12,4 km");
  });
});
