/**
 * Ce que ces tests garantissent : le verdict du vérificateur se traduit toujours de la
 * même façon en échecs de contrôle, une réponse au format relâché ne fait pas échouer la
 * relecture, et l'activité est présentée au vérificateur comme une page l'écrirait.
 *
 * L'appel réseau, lui, n'est pas testé ici : c'est le même chemin que la lecture, et une
 * panne le rend muet — ce que les tests d'ingestion vérifient de leur côté.
 */

import { describe, expect, it } from "vitest";

import {
  alignerVerdicts,
  echecsDuVerdict,
  presenterLActivite,
  SEUIL_CERTITUDE,
  verdictSchema,
} from "@/lib/ingest/verification";
import type { RawEvent } from "@/lib/ingest/types";

const activite = (overrides: Partial<RawEvent> = {}): RawEvent => ({
  externalId: "atelier chocolat|2026-09-12",
  title: "Atelier chocolat",
  startsAt: new Date("2026-09-12T14:30:00+02:00"),
  ...overrides,
});

describe("Traduction du verdict en échecs", () => {
  it("ne dit rien quand tout correspond", () => {
    expect(
      echecsDuVerdict({ certitude: 0.95, annulee: false, problemes: [] }),
    ).toEqual([]);
  });

  it("signale une annulation même quand le reste correspond", () => {
    const echecs = echecsDuVerdict({
      certitude: 0.9,
      annulee: true,
      problemes: [],
    });
    expect(echecs.map((e) => e.code)).toEqual(["activite_annulee"]);
  });

  it("rapporte les contradictions, trois au plus", () => {
    const echecs = echecsDuVerdict({
      certitude: 0.9,
      annulee: false,
      problemes: ["la date diffère", "l'heure diffère", "le lieu diffère", "le titre diffère"],
    });
    expect(echecs).toHaveLength(1);
    expect(echecs[0].code).toBe("verification_ia");
    expect(echecs[0].detail).toBe("la date diffère ; l'heure diffère ; le lieu diffère");
  });

  it("retient une certitude trop basse, même sans contradiction nommée", () => {
    const echecs = echecsDuVerdict({
      certitude: SEUIL_CERTITUDE - 0.1,
      annulee: false,
      problemes: [],
    });
    expect(echecs.map((e) => e.code)).toEqual(["verification_ia"]);
    expect(echecs[0].detail).toContain("certitude");
  });

  it("ne double pas le motif quand contradiction et doute vont ensemble", () => {
    // Une contradiction nommée dit déjà pourquoi la certitude est basse : deux échecs
    // pour la même cause rempliraient l'écran de relecture sans rien apprendre.
    const echecs = echecsDuVerdict({
      certitude: 0.2,
      annulee: false,
      problemes: ["la date diffère"],
    });
    expect(echecs).toHaveLength(1);
  });
});

describe("Lecture du verdict rendu par le modèle", () => {
  it("accepte les champs omis ou à null, qui disent la même chose", () => {
    expect(verdictSchema.parse({ certitude: 0.9 })).toEqual({
      certitude: 0.9,
      annulee: false,
      problemes: [],
    });
    expect(verdictSchema.parse({ certitude: 0.9, problemes: null, annulee: null })).toEqual({
      certitude: 0.9,
      annulee: false,
      problemes: [],
    });
  });

  it("refuse une certitude hors de l'intervalle", () => {
    expect(verdictSchema.safeParse({ certitude: 1.4 }).success).toBe(false);
  });
});

describe("Alignement des verdicts du tri famille", () => {
  it("range chaque verdict à son rang, même rendus dans le désordre", () => {
    const verdicts = alignerVerdicts(
      {
        verdicts: [
          { rang: 2, famille: "non" },
          { rang: 0, famille: "oui" },
          { rang: 1, famille: "doute" },
        ],
      },
      3,
    );
    expect(verdicts).toEqual(["oui", "doute", "non"]);
  });

  it("un rang oublié devient un doute, le sort le plus honnête pour un oubli", () => {
    expect(
      alignerVerdicts({ verdicts: [{ rang: 0, famille: "oui" }] }, 3),
    ).toEqual(["oui", "doute", "doute"]);
  });

  it("refuse un verdict hors vocabulaire plutôt que de l'interpréter", () => {
    expect(() =>
      alignerVerdicts({ verdicts: [{ rang: 0, famille: "peut-être" }] }, 1),
    ).toThrow();
  });
});

describe("Présentation de l'activité au vérificateur", () => {
  it("écrit la date et l'heure comme une page le ferait", () => {
    const texte = presenterLActivite(
      activite({ placeLabel: "Maison de quartier", recurrence: "les samedis" }),
    );
    expect(texte).toContain("Titre : Atelier chocolat");
    expect(texte).toContain("12 septembre 2026");
    expect(texte).toContain("14:30");
    expect(texte).toContain("Lieu : Maison de quartier");
    expect(texte).toContain("Rythme : les samedis");
  });

  it("n'annonce pas d'heure pour une activité qui tient la journée", () => {
    // Le modèle a rendu minuit faute d'horaire écrit : présenter « 00:00 » au vérificateur
    // l'inviterait à chercher sur la page une heure qui n'a jamais existé.
    const texte = presenterLActivite(
      activite({
        startsAt: new Date("2026-09-12T00:00:00+02:00"),
        allDay: true,
      }),
    );
    expect(texte).toContain("sans horaire annoncé");
    expect(texte).not.toContain("00:00");
  });

  it("dit l'âge tel qu'il est borné", () => {
    expect(presenterLActivite(activite({ minAge: 5, maxAge: 10 }))).toContain(
      "Âge : 5 à 10 ans",
    );
    expect(presenterLActivite(activite({ minAge: 5 }))).toContain("Âge : 5 à ? ans");
  });
});
