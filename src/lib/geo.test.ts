/**
 * Ce que ces tests garantissent : chaque adresse n'est demandée qu'une fois, une adresse
 * introuvable n'est pas redemandée éternellement, et un service indisponible ne fait pas
 * échouer le passage.
 *
 * Nominatim est un service bénévole. Marteler ce qu'on ne trouve pas serait le plus sûr
 * moyen d'en être écarté.
 */

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  geocoderCeQuiManque,
  geocoderUnLieu,
  requeteDeLieu,
  variantesDeRequete,
  type Coordonnees,
} from "@/lib/geo";
import { createPlace } from "@/lib/places";
import { createAccount, createEvent, resetDatabase } from "@/test/helpers";

const GUE: Coordonnees = { lat: 46.1858307, lon: 6.1206841 };

/** Un géocodeur de test : n'appelle rien, retient ce qu'on lui a demandé. */
function geocodeur(reponse: Coordonnees | null | Error = GUE) {
  const demandes: string[] = [];
  const chercher = async (requete: string) => {
    demandes.push(requete);
    if (reponse instanceof Error) throw reponse;
    return reponse;
  };
  return { demandes, chercher };
}

/** Sans pause : la politique d'usage vaut pour le réseau, pas pour un test. */
const passer = (chercher: (r: string) => Promise<Coordonnees | null>, limite = 20) =>
  geocoderCeQuiManque({ limite, chercher, pause: 0 });

beforeEach(async () => {
  await resetDatabase();
});

describe("Ce qu'on donne à chercher", () => {
  it("assemble le nom, l'adresse et la commune", () => {
    expect(requeteDeLieu("Parc du Gué", "Chemin du Gué 12", "Petit-Lancy")).toBe(
      "Parc du Gué, Chemin du Gué 12, Petit-Lancy",
    );
  });

  it("se passe de ce qui manque", () => {
    expect(requeteDeLieu("Parc du Gué", null, "Petit-Lancy")).toBe("Parc du Gué, Petit-Lancy");
    expect(requeteDeLieu("Parc du Gué")).toBe("Parc du Gué");
  });
});

describe("Chercher une seconde fois sans le sigle", () => {
  it("propose la forme sans parenthèses", () => {
    expect(variantesDeRequete("Musée d'ethnographie de Genève (MEG), Genève")).toEqual([
      "Musée d'ethnographie de Genève (MEG), Genève",
      "Musée d'ethnographie de Genève, Genève",
    ]);
  });

  it("ne propose rien de plus quand il n'y a pas de sigle", () => {
    expect(variantesDeRequete("Parc du Gué, Petit-Lancy")).toEqual(["Parc du Gué, Petit-Lancy"]);
  });

  it("ne coûte une requête de plus que sur ce qu'on aurait manqué", async () => {
    const alice = await createAccount("Alice");
    await createPlace(alice.id, { name: "Musée d'ethnographie de Genève (MEG)" });

    const demandes: string[] = [];
    const rapport = await geocoderCeQuiManque({
      pause: 0,
      chercher: async (requete) => {
        demandes.push(requete);
        // Le sigle fait échouer la première forme, comme chez Nominatim.
        return requete.includes("(") ? null : GUE;
      },
    });

    expect(demandes).toEqual([
      "Musée d'ethnographie de Genève (MEG)",
      "Musée d'ethnographie de Genève",
    ]);
    expect(rapport).toEqual({ demandes: 1, trouves: 1 });
  });
});

describe("Donner des coordonnées à ce qui n'en a pas", () => {
  it("géocode un lieu du catalogue", async () => {
    const alice = await createAccount("Alice");
    await createPlace(alice.id, {
      name: "Parc du Gué",
      commune: "Petit-Lancy",
      address: "Chemin du Gué 12",
    });

    const { demandes, chercher } = geocodeur();
    const rapport = await passer(chercher);

    expect(demandes).toEqual(["Parc du Gué, Chemin du Gué 12, Petit-Lancy"]);
    expect(rapport).toEqual({ demandes: 1, trouves: 1 });

    const rows = await db.execute<{ lat: number; lon: number }>(
      sql`select lat, lon from place`,
    );
    expect(rows[0].lat).toBeCloseTo(GUE.lat, 5);
    expect(rows[0].lon).toBeCloseTo(GUE.lon, 5);
  });

  it("ne redemande pas une adresse déjà cherchée", async () => {
    const alice = await createAccount("Alice");
    await createPlace(alice.id, { name: "Parc du Gué", commune: "Petit-Lancy" });

    await passer(geocodeur().chercher);
    const second = geocodeur();
    const rapport = await passer(second.chercher);

    expect(second.demandes).toEqual([]);
    expect(rapport.demandes).toBe(0);
  });

  it("marque la tentative même quand rien ne correspond", async () => {
    const alice = await createAccount("Alice");
    await createPlace(alice.id, { name: "Salle sans nom sur aucune carte" });

    const rapport = await passer(geocodeur(null).chercher);

    expect(rapport).toEqual({ demandes: 1, trouves: 0 });
    // Sans cette date, on redemanderait la même adresse introuvable toutes les heures.
    const rows = await db.execute<{ geocoded_at: Date | null; lat: number | null }>(
      sql`select geocoded_at, lat from place`,
    );
    expect(rows[0].geocoded_at).not.toBeNull();
    expect(rows[0].lat).toBeNull();
  });

  it("ne s'arrête pas quand le service est indisponible", async () => {
    const alice = await createAccount("Alice");
    await createPlace(alice.id, { name: "Parc du Gué" });

    const rapport = await passer(geocodeur(new Error("503")).chercher);

    expect(rapport).toEqual({ demandes: 1, trouves: 0 });
  });

  it("géocode aussi les activités de l'agenda qui annoncent un lieu", async () => {
    await createEvent({
      title: "Atelier chocolat",
      placeLabel: "Maison de quartier",
      commune: "Lancy",
    });

    const { demandes, chercher } = geocodeur();
    await passer(chercher);

    expect(demandes).toEqual(["Maison de quartier, Lancy"]);

    const rows = await db.execute<{ lat: number | null }>(sql`select lat from event`);
    expect(rows[0].lat).toBeCloseTo(GUE.lat, 5);
  });

  it("laisse de côté une activité sans lieu écrit", async () => {
    await createEvent({ title: "Atelier chocolat", commune: "Lancy" });

    const { demandes } = geocodeur();
    expect(await passer(geocodeur().chercher)).toEqual({ demandes: 0, trouves: 0 });
    expect(demandes).toEqual([]);
  });

  it("s'arrête à sa limite, et reprend au passage suivant", async () => {
    const alice = await createAccount("Alice");
    await createPlace(alice.id, { name: "Parc du Gué" });
    await createPlace(alice.id, { name: "Parc des Evaux" });
    await createPlace(alice.id, { name: "Parc Chauvet-Lullin" });

    const premier = geocodeur();
    expect(await passer(premier.chercher, 2)).toEqual({ demandes: 2, trouves: 2 });

    const second = geocodeur();
    expect(await passer(second.chercher, 2)).toEqual({ demandes: 1, trouves: 1 });
    });
  });

  /*
   * L'appel direct à Nominatim, depuis l'ajout d'un lieu.
   *
   * Différent de `geocoderCeQuiManque` : un seul lieu à géocoder, pas une file, et le délai
   * est appliqué **avant** la requête (et non après) pour qu'un ajout ne rejoigne jamais une
   * rafale. Le contrat testé ici est le comportement observable : on assemble la requête, on
   * applique la pause, on retourne ce que Nominatim a trouvé, et `null` quand Nominatim n'a
   * rien ou qu'il a échoué.
   */
  describe("Géocodage d'un seul lieu", () => {
    it("assemble, attend, et retourne les coordonnées", async () => {
      const { chercher, demandes } = geocodeur();
      const debut = Date.now();
      const trouve = await geocoderUnLieu(
        "Parc du Gué",
        "Chemin du Gué 12",
        "Petit-Lancy",
        { chercher, pause: 50 },
      );
      const duree = Date.now() - debut;

      expect(trouve).toEqual(GUE);
      expect(demandes).toEqual(["Parc du Gué, Chemin du Gué 12, Petit-Lancy"]);
      // La pause est appliquée **avant** la requête : la durée ne peut pas être inférieure.
      expect(duree).toBeGreaterThanOrEqual(50);
    });

    it("renvoie null quand Nominatim n'a rien", async () => {
      const { chercher } = geocodeur(null);
      const trouve = await geocoderUnLieu("Inconnu", null, null, { chercher, pause: 0 });
      expect(trouve).toBeNull();
    });

    it("renvoie null quand Nominatim échoue", async () => {
      const { chercher } = geocodeur(new Error("HTTP 500"));
      const trouve = await geocoderUnLieu("Parc", null, null, { chercher, pause: 0 });
      expect(trouve).toBeNull();
    });
  });
