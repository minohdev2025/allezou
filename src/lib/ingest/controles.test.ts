/**
 * Ce que ces tests garantissent : une activité lue par le modèle ne rejoint le calendrier
 * que si la page d'origine dit bien ce qu'elle prétend. Ils sont écrits pour être lus par
 * quelqu'un qui ne programme pas : chaque cas décrit une page, une lecture, et ce que le
 * contrôle en pense.
 */

import { describe, expect, it } from "vitest";

import {
  controler,
  couverture,
  ecrituresDeLaDate,
  ecrituresDeLHeure,
  memeDomaine,
  type ContexteControle,
} from "@/lib/ingest/controles";
import { normaliser } from "@/lib/texte";
import type { RawEvent } from "@/lib/ingest/types";

const SOURCE_LUE = { url: "https://www.lancy.ch/agenda", kind: "html_ai" as const };
const SOURCE_STRUCTUREE = { url: "https://www.lancy.ch/agenda", kind: "jsonld" as const };

/** Samedi 12 septembre 2026 à 14h, heure de Genève. */
const DEBUT = new Date("2026-09-12T14:00:00+02:00");

const PAGE =
  "Agenda communal de Lancy. Samedi 12 septembre 2026, 14h00 : Atelier chocolat à la " +
  "Maison de quartier du Petit-Lancy. Pour les enfants dès 5 ans. Goûter offert.";

const uneLecture = (modifications: Partial<RawEvent> = {}): RawEvent => ({
  externalId: "atelier|2026-09-12",
  title: "Atelier chocolat",
  description: "Goûter offert",
  startsAt: DEBUT,
  placeLabel: "Maison de quartier du Petit-Lancy",
  url: "https://www.lancy.ch/agenda/atelier-chocolat",
  minAge: 5,
  ...modifications,
});

/** Les codes des contrôles en défaut, pour comparer sans se soucier de la formulation. */
function codes(
  event: RawEvent,
  texteSource = PAGE,
  source: ContexteControle["source"] = SOURCE_LUE,
): string[] {
  return controler(event, { source, texteSource }).map((echec) => echec.code);
}

describe("Une lecture fidèle passe", () => {
  it("ne reproche rien à ce que la page dit vraiment", () => {
    expect(codes(uneLecture())).toEqual([]);
  });

  it("ne s'arrête ni aux accents ni aux majuscules", () => {
    expect(codes(uneLecture({ title: "ATELIER CHOCOLAT" }))).toEqual([]);
    expect(normaliser("Fête de l'Escalade")).toBe("fete de l escalade");
  });

  it("accepte la date écrite en chiffres", () => {
    const page = "Atelier chocolat, 12.09.2026 à 14h00, Maison de quartier du Petit-Lancy.";
    expect(codes(uneLecture({ description: undefined, minAge: undefined }), page)).toEqual([]);
  });
});

describe("La date lue existe-t-elle sur la page", () => {
  it("signale une date que la page n'écrit nulle part", () => {
    const event = uneLecture({ startsAt: new Date("2026-09-19T14:00:00+02:00") });
    expect(codes(event)).toContain("date_absente");
  });

  it("ne prend pas le 14 pour le 4", () => {
    const page = "Mercredi 14 janvier 2026 à 14h00 : Atelier chocolat.";
    const event = uneLecture({
      startsAt: new Date("2026-01-04T14:00:00+01:00"),
      description: undefined,
      placeLabel: undefined,
      minAge: undefined,
    });
    expect(codes(event, page)).toContain("date_absente");
  });

  it("écrit le premier du mois comme la page l'écrit", () => {
    expect(ecrituresDeLaDate(new Date("2026-02-01T10:00:00+01:00"))).toContain("1er fevrier");
  });
});

describe("L'heure lue existe-t-elle sur la page", () => {
  it("signale l'activité sans horaire, que le modèle sort à minuit", () => {
    const page = "Atelier chocolat, samedi 12 septembre 2026, Maison de quartier.";
    const event = uneLecture({
      startsAt: new Date("2026-09-12T00:00:00+02:00"),
      description: undefined,
      placeLabel: undefined,
      minAge: undefined,
    });
    expect(codes(event, page)).toContain("heure_absente");
  });

  it("reconnaît « 14 h 30 » autant que « 14h30 »", () => {
    const heures = ecrituresDeLHeure(new Date("2026-09-12T14:30:00+02:00"));
    expect(heures).toContain("14h30");
    expect(heures).toContain("14 h 30");
  });
});

describe("Le titre est-il recopié ou reformulé", () => {
  it("signale un titre que le modèle a réécrit", () => {
    expect(codes(uneLecture({ title: "Atelier de chocolat pour enfants" }))).toContain(
      "titre_reformule",
    );
  });

  it("écarte un titre de rubrique pris pour une activité", () => {
    const page = `${PAGE} Manifestations`;
    expect(codes(uneLecture({ title: "Manifestations" }), page)).toContain("titre_generique");
  });
});

describe("Les champs absents de la page mais présents dans la réponse", () => {
  it("signale un lieu qui ne figure pas sur la page", () => {
    expect(codes(uneLecture({ placeLabel: "Salle communale du Grand-Saconnex" }))).toContain(
      "lieu_absent",
    );
  });

  it("signale une description dont les mots sortent de nulle part", () => {
    expect(
      codes(uneLecture({ description: "Spectacle de marionnettes suivi d'un concours" })),
    ).toContain("description_inventee");
  });

  it("signale une tranche d'âge que la page n'annonce pas", () => {
    expect(codes(uneLecture({ minAge: 8 }))).toContain("age_absent");
  });

  it("tolère un lieu écrit autrement, tant que ses mots sont sur la page", () => {
    expect(codes(uneLecture({ placeLabel: "Maison de quartier, Petit-Lancy" }))).toEqual([]);
  });
});

describe("L'URL appartient-elle au site de la source", () => {
  it("signale une fiche hébergée ailleurs", () => {
    expect(codes(uneLecture({ url: "https://www.onex.ch/agenda/atelier" }))).toContain(
      "url_hors_domaine",
    );
  });

  it("accepte un sous-domaine du site de la source", () => {
    expect(memeDomaine("https://agenda.lancy.ch/fiche", "https://www.lancy.ch/agenda")).toBe(
      true,
    );
  });

  it("refuse une URL illisible plutôt que de lui faire confiance", () => {
    expect(memeDomaine("pas une url", "https://www.lancy.ch/agenda")).toBe(false);
  });
});

describe("Une durée invraisemblable", () => {
  it("signale une activité qui durerait deux ans", () => {
    const event = uneLecture({ endsAt: new Date("2028-09-12T14:00:00+02:00") });
    expect(codes(event)).toContain("duree_invraisemblable");
  });

  it("signale une fin qui précède le début", () => {
    const event = uneLecture({ endsAt: new Date("2026-09-11T14:00:00+02:00") });
    expect(codes(event)).toContain("duree_invraisemblable");
  });
});

describe("Un flux structuré n'a rien à confronter", () => {
  it("ne reproche pas à une fiche JSON-LD ce qui n'est pas écrit en toutes lettres", () => {
    const event = uneLecture({ title: "Un titre absent de la page", minAge: 12 });
    expect(codes(event, "page sans rapport", SOURCE_STRUCTUREE)).toEqual([]);
  });

  it("garde tout de même les contrôles qui ne dépendent pas de la page", () => {
    const event = uneLecture({ url: "https://exemple.test/ailleurs" });
    expect(codes(event, "", SOURCE_STRUCTUREE)).toEqual(["url_hors_domaine"]);
  });
});

describe("Une page qu'on n'a pas conservée", () => {
  it("retient l'activité plutôt que de la publier sans preuve", () => {
    expect(codes(uneLecture(), "")).toEqual(["date_absente"]);
  });
});

describe("Couverture des mots d'un extrait", () => {
  it("ignore les mots trop courts et trop courants", () => {
    expect(couverture("pour les 5 ans", normaliser(PAGE))).toBe(1);
  });

  it("compte la part des mots retrouvés", () => {
    expect(couverture("chocolat marionnettes", normaliser(PAGE))).toBe(0.5);
  });
});
