/**
 * Le calendrier des vacances genevoises, et son découpage en semaines.
 *
 * Le dernier test est une alarme : il échoue quand la table recopiée du canton n'a plus
 * six mois devant elle. Le corriger, c'est recopier l'année suivante depuis ge.ch — pas
 * repousser la date.
 */

import { describe, expect, it } from "vitest";

import { decalerJour, jourDeSemaine } from "@/lib/heure";
import { jourGenevois } from "@/lib/ingest/types";
import {
  VACANCES_GENEVE,
  lundiDe,
  semaineDeVacances,
  semaineDuJour,
  semainesDe,
  vacancesAVenir,
  vacancesDuMoment,
} from "@/lib/vacances";

const parId = (id: string) => {
  const v = VACANCES_GENEVE.find((x) => x.id === id);
  if (!v) throw new Error(id);
  return v;
};

describe("Les semaines de vacances", () => {
  it("l'automne tient en une semaine, du lundi au vendredi", () => {
    expect(semainesDe(parId("automne-2026"))).toEqual([
      { lundi: "2026-10-19", debut: "2026-10-19", fin: "2026-10-23", jusquAu: "2026-10-25" },
    ]);
  });

  it("Noël 2026 commence un jeudi et compte trois semaines", () => {
    expect(semainesDe(parId("noel-2026"))).toEqual([
      { lundi: "2026-12-21", debut: "2026-12-24", fin: "2026-12-27", jusquAu: "2026-12-27" },
      { lundi: "2026-12-28", debut: "2026-12-28", fin: "2027-01-03", jusquAu: "2027-01-03" },
      { lundi: "2027-01-04", debut: "2027-01-04", fin: "2027-01-08", jusquAu: "2027-01-10" },
    ]);
  });

  it("l'été 2027 finit un mercredi : le jeudi de la rentrée n'est pas en vacances", () => {
    const semaines = semainesDe(parId("ete-2027"));
    expect(semaines).toHaveLength(8);
    expect(semaines.at(-1)).toEqual({
      lundi: "2027-08-23",
      debut: "2027-08-23",
      fin: "2027-08-25",
      jusquAu: "2027-08-25",
    });
  });

  it("chaque semaine est désignée par un lundi, et les semaines se suivent", () => {
    for (const v of VACANCES_GENEVE) {
      const semaines = semainesDe(v);
      expect(semaines.length, v.id).toBeGreaterThan(0);
      for (const [i, s] of semaines.entries()) {
        expect(jourDeSemaine(s.lundi), `${v.id} ${s.lundi}`).toBe(1);
        if (i > 0) expect(s.lundi).toBe(decalerJour(semaines[i - 1].lundi, 7));
      }
      expect(semaines[0].debut).toBe(v.debut);
      expect(semaines.at(-1)?.fin).toBe(v.fin);
    }
  });

  it("deux périodes ne se chevauchent jamais", () => {
    const triees = [...VACANCES_GENEVE].sort((a, b) => a.debut.localeCompare(b.debut));
    for (let i = 1; i < triees.length; i++) {
      expect(triees[i].debut > triees[i - 1].fin, triees[i].id).toBe(true);
    }
  });

  it("retrouve une semaine par son lundi, et rien pour une semaine d'école", () => {
    expect(semaineDeVacances("2026-12-28")?.vacances.id).toBe("noel-2026");
    expect(semaineDeVacances("2026-11-02")).toBeNull();
    expect(lundiDe("2026-10-25")).toBe("2026-10-19");
  });

  it("le samedi qui suit l'automne est encore en vacances, le lundi d'après non", () => {
    expect(semaineDuJour("2026-10-24")?.lundi).toBe("2026-10-19");
    expect(semaineDuJour("2026-10-26")).toBeNull();
    // Le lundi qui précède Noël est un jour d'école, même s'il ouvre la semaine.
    expect(semaineDuJour("2026-12-21")).toBeNull();
  });
});

describe("Les vacances dont on parle", () => {
  it("pendant l'automne, ce sont celles d'automne", () => {
    expect(vacancesDuMoment("2026-10-21")?.id).toBe("automne-2026");
  });

  it("trois semaines avant Noël, on en parle ; six semaines avant, pas encore", () => {
    expect(vacancesDuMoment("2026-12-05")?.id).toBe("noel-2026");
    expect(vacancesDuMoment("2026-11-10")).toBeNull();
  });

  it("les réglages montrent l'année qui vient", () => {
    expect(vacancesAVenir("2026-10-19").map((v) => v.id)).toEqual([
      "automne-2026",
      "noel-2026",
      "fevrier-2027",
      "paques-2027",
      "ete-2027",
    ]);
  });
});

describe("La table du canton", () => {
  it("couvre encore au moins six mois — sinon, recopier l'année suivante depuis ge.ch", () => {
    const derniere = VACANCES_GENEVE.map((v) => v.fin).sort().at(-1)!;
    const dansSixMois = decalerJour(jourGenevois(new Date()), 183);
    expect(derniere >= dansSixMois, `la table s'arrête au ${derniere}`).toBe(true);
  });
});
