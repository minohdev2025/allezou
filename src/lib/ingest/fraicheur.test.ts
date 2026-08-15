/**
 * Ce que ces tests garantissent : une activité annulée sort de l'agenda, une activité déjà
 * publiée dont la relecture ne passe plus se voit, et une commune qui corrige un horaire ne
 * crée pas un doublon à côté de l'ancienne version.
 *
 * Les trois répondent à la même question, posée une fois toutes les six heures : qu'est-ce
 * que la source annonce **encore** ?
 */

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { identiteLue } from "@/lib/ingest/minimax";
import {
  clearWarnings,
  flaggedPublished,
  pendingReview,
  rejectEvent,
  runSource,
  withdrawEvent,
  type Adapters,
} from "@/lib/ingest/run";
import type { RawEvent } from "@/lib/ingest/types";
import { createSource, minutesFromNow, resetDatabase } from "@/test/helpers";

function adaptateur(events: RawEvent[] | Error): Adapters {
  const fn = async () => {
    if (events instanceof Error) throw events;
    return events;
  };
  return { ical: fn, jsonld: fn, html_ai: fn };
}

const unEvenement = (overrides: Partial<RawEvent> = {}): RawEvent => ({
  externalId: "https://example.test/agenda/atelier",
  title: "Atelier chocolat",
  startsAt: minutesFromNow(60 * 24),
  endsAt: minutesFromNow(60 * 26),
  placeLabel: "Maison de quartier",
  url: "https://example.test/agenda/atelier",
  ...overrides,
});

/** Une page qui annonce vraiment ce que la lecture prétend y avoir lu. */
function pageQuiDitTout(event: RawEvent): string {
  const jour = new Intl.DateTimeFormat("fr-CH", {
    timeZone: "Europe/Zurich",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(event.startsAt);

  const heure = new Intl.DateTimeFormat("fr-CH", {
    timeZone: "Europe/Zurich",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(event.startsAt);

  return `Agenda communal. ${jour}, ${heure} : ${event.title}. ${event.placeLabel}.`;
}

/** Recule la dernière vue de toutes les activités, comme si des passages les avaient manquées. */
async function vieillir(heures: number): Promise<void> {
  await db.execute(sql`
    update event
    set last_seen_at = now() - make_interval(hours => ${heures}),
        updated_at = now() - make_interval(hours => ${heures})
  `);
}

beforeEach(async () => {
  await resetDatabase();
});

describe("Identité d'une activité lue par le modèle", () => {
  it("ne bouge pas quand la commune corrige l'heure", () => {
    const matin = identiteLue("Atelier chocolat", new Date("2026-09-12T10:00:00+02:00"));
    const apresMidi = identiteLue("Atelier chocolat", new Date("2026-09-12T14:00:00+02:00"));

    expect(matin).toBe(apresMidi);
  });

  it("ne bouge pas pour une majuscule ou un accent", () => {
    const propre = identiteLue("Fête de l'Escalade", new Date("2026-12-12T18:00:00+01:00"));
    const abime = identiteLue("FETE DE L'ESCALADE", new Date("2026-12-12T18:00:00+01:00"));

    expect(propre).toBe(abime);
  });

  it("sépare deux occurrences d'un rendez-vous hebdomadaire", () => {
    const mercredi = identiteLue("Bibliobus", new Date("2026-09-09T10:00:00+02:00"));
    const suivant = identiteLue("Bibliobus", new Date("2026-09-16T10:00:00+02:00"));

    expect(mercredi).not.toBe(suivant);
  });

  it("prend le jour tel qu'il est à Genève, pas à Greenwich", () => {
    // 00h30 à Genève un 12 septembre, c'est encore le 11 en temps universel.
    const nuit = identiteLue("Nuit des chauves-souris", new Date("2026-09-11T22:30:00Z"));

    expect(nuit).toContain("2026-09-12");
  });
});

describe("Ce que la source n'annonce plus", () => {
  it("retire de l'agenda une activité disparue depuis trois passages", async () => {
    const source = await createSource({ kind: "jsonld", autoPublish: true });
    await runSource(source.id, adaptateur([unEvenement()]));
    await vieillir(24);

    const rapport = await runSource(source.id, adaptateur([]));

    expect(rapport.withdrawn).toBe(1);
    const rows = await db.execute<{ withdrawn_at: Date | null }>(
      sql`select withdrawn_at from event`,
    );
    expect(rows[0].withdrawn_at).not.toBeNull();
  });

  it("laisse passer une absence isolée", async () => {
    const source = await createSource({ kind: "jsonld", autoPublish: true });
    await runSource(source.id, adaptateur([unEvenement()]));

    // Une page qui bafouille le temps d'un rafraîchissement ne doit rien retirer.
    const rapport = await runSource(source.id, adaptateur([]));

    expect(rapport.withdrawn).toBe(0);
  });

  it("la remet à l'agenda si la commune la réannonce", async () => {
    const source = await createSource({ kind: "jsonld", autoPublish: true });
    await runSource(source.id, adaptateur([unEvenement()]));
    await vieillir(24);
    await runSource(source.id, adaptateur([]));

    await runSource(source.id, adaptateur([unEvenement()]));

    const rows = await db.execute<{ withdrawn_at: Date | null }>(
      sql`select withdrawn_at from event`,
    );
    expect(rows[0].withdrawn_at).toBeNull();
  });

  it("ne touche pas à ce qui a déjà eu lieu", async () => {
    const source = await createSource({ kind: "jsonld", autoPublish: true });
    await runSource(
      source.id,
      adaptateur([
        unEvenement({ startsAt: minutesFromNow(-300), endsAt: minutesFromNow(-120) }),
      ]),
    );
    await vieillir(24);

    const rapport = await runSource(source.id, adaptateur([]));

    expect(rapport.withdrawn).toBe(0);
  });

  it("ne retire rien quand le passage a échoué", async () => {
    const source = await createSource({ kind: "jsonld", autoPublish: true });
    await runSource(source.id, adaptateur([unEvenement()]));
    await vieillir(24);

    // Un réseau qui tombe ne doit pas vider l'agenda.
    const rapport = await runSource(source.id, adaptateur(new Error("réseau")));

    expect(rapport.ok).toBe(false);
    expect(rapport.withdrawn).toBe(0);
  });
});

describe("Publiées, mais signalées", () => {
  /** Publie une activité vérifiée, puis relit la même page devenue muette. */
  async function publierPuisPerdreLaPage(): Promise<string> {
    const source = await createSource({ kind: "html_ai", autoPublish: true });
    const event = unEvenement();

    await runSource(source.id, adaptateur([{ ...event, texteSource: pageQuiDitTout(event) }]));
    await runSource(source.id, adaptateur([{ ...event, texteSource: "page devenue muette" }]));

    return source.id;
  }

  it("montre ce qui est publié et dont la relecture ne passe plus", async () => {
    await publierPuisPerdreLaPage();

    const signalees = await flaggedPublished();
    expect(signalees.map((e) => e.title)).toEqual(["Atelier chocolat"]);
    expect(signalees[0].controles.map((c) => c.code)).toContain("date_absente");
  });

  it("garde le contenu vérifié plutôt que la lecture douteuse", async () => {
    const source = await createSource({ kind: "html_ai", autoPublish: true });
    const event = unEvenement();
    await runSource(source.id, adaptateur([{ ...event, texteSource: pageQuiDitTout(event) }]));

    await runSource(
      source.id,
      adaptateur([{ ...event, title: "Titre douteux", texteSource: "page muette" }]),
    );

    const rows = await db.execute<{ title: string }>(sql`select title from event`);
    expect(rows[0].title).toBe("Atelier chocolat");
  });

  it("« elle est juste » efface le signalement sans dépublier", async () => {
    await publierPuisPerdreLaPage();
    await clearWarnings((await flaggedPublished())[0].id);

    expect(await flaggedPublished()).toEqual([]);
    const rows = await db.execute<{ published_at: Date | null }>(
      sql`select published_at from event`,
    );
    expect(rows[0].published_at).not.toBeNull();
  });

  it("une activité retirée à la main ne revient pas au passage suivant", async () => {
    const source = await createSource({ kind: "jsonld", autoPublish: true });
    await runSource(source.id, adaptateur([unEvenement()]));
    const rows = await db.execute<{ id: string }>(sql`select id from event`);
    await withdrawEvent(rows[0].id);

    await runSource(source.id, adaptateur([unEvenement()]));

    const apres = await db.execute<{ rejected_at: Date | null }>(
      sql`select rejected_at from event`,
    );
    expect(apres[0].rejected_at).not.toBeNull();
  });
});

describe("Une activité restée en file", () => {
  it("rejoint le calendrier dès que la lecture repasse les contrôles", async () => {
    const source = await createSource({ kind: "html_ai", autoPublish: true });
    const event = unEvenement();

    // Première lecture : la page ne confirme rien, l'activité attend.
    await runSource(source.id, adaptateur([{ ...event, texteSource: "page muette" }]));
    expect(await pendingReview()).toHaveLength(1);

    // La page dit maintenant ce qu'il faut. Rien ne la retient plus, et personne n'a eu à
    // cliquer : une activité en file n'est le fruit d'aucune décision humaine.
    const rapport = await runSource(
      source.id,
      adaptateur([{ ...event, texteSource: pageQuiDitTout(event) }]),
    );

    expect(rapport.published).toBe(1);
    expect(await pendingReview()).toEqual([]);
  });

  it("ne revient pas quand un relecteur l'a écartée", async () => {
    const source = await createSource({ kind: "html_ai", autoPublish: true });
    const event = unEvenement();
    await runSource(source.id, adaptateur([{ ...event, texteSource: "page muette" }]));
    await rejectEvent((await pendingReview())[0].id);

    await runSource(
      source.id,
      adaptateur([{ ...event, texteSource: pageQuiDitTout(event) }]),
    );

    const rows = await db.execute<{ published_at: Date | null }>(
      sql`select published_at from event`,
    );
    expect(rows[0].published_at).toBeNull();
  });
});

describe("Deux fois la même activité chez une même source", () => {
  it("part en file plutôt que de s'afficher deux fois", async () => {
    const source = await createSource({ kind: "html_ai", autoPublish: true });
    const event = unEvenement();
    const page = pageQuiDitTout(event);

    await runSource(source.id, adaptateur([{ ...event, texteSource: page }]));
    // Même titre, même heure, mais une identité que la source rend autrement.
    await runSource(
      source.id,
      adaptateur([{ ...event, externalId: "autre-identifiant", texteSource: page }]),
    );

    const attente = await pendingReview();
    expect(attente.map((e) => e.controles.map((c) => c.code))).toEqual([["doublon"]]);
  });
});
