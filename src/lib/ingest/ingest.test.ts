/**
 * Ce que ces tests garantissent : seuls les flux structurés se publient seuls, ce qui vient
 * d'une lecture par l'IA attend une relecture, un événement écarté ne revient pas, et une
 * source en panne est signalée au lieu de disparaître en silence.
 */

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { eventsFromHtml } from "@/lib/ingest/jsonld";
import { htmlToText } from "@/lib/ingest/minimax";
import {
  pendingReview,
  publishEvent,
  rejectEvent,
  runSource,
  sourceHealth,
  type Adapters,
} from "@/lib/ingest/run";
import type { RawEvent } from "@/lib/ingest/types";
import { createSource, minutesFromNow, resetDatabase } from "@/test/helpers";

/** Adaptateurs de test : aucun accès réseau. */
function adaptateur(events: RawEvent[] | Error): Adapters {
  const fn = async () => {
    if (events instanceof Error) throw events;
    return events;
  };
  return { jsonld: fn, html_ai: fn };
}

const unEvenement = (overrides: Partial<RawEvent> = {}): RawEvent => ({
  externalId: "https://example.test/agenda/atelier",
  title: "Atelier chocolat",
  description: "Pour les 5-10 ans",
  startsAt: minutesFromNow(60 * 24),
  endsAt: minutesFromNow(60 * 26),
  placeLabel: "Maison de quartier, Lancy",
  url: "https://example.test/agenda/atelier",
  ...overrides,
});

beforeEach(async () => {
  await resetDatabase();
});

describe("Lecture du JSON-LD (format réel de geneve.ch)", () => {
  const page = `
    <html><head>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@graph":[{
      "@type":"Event",
      "name":"Concert à La Chaloupe à Vapeur !",
      "url":"https://www.geneve.ch/agenda/concert-chaloupe-vapeur-0",
      "description":"Un concert live d'improvisation",
      "startDate":"2026-08-09T16:00:00+0200",
      "endDate":"2026-08-09T18:00:00+0200",
      "location":{"@type":"Place","name":"La Chaloupe à vapeur",
        "address":{"@type":"PostalAddress","streetAddress":"Rue de Lausanne 126"}}
    }]}
    </script></head><body></body></html>`;

  it("extrait titre, dates et lieu", () => {
    const [event] = eventsFromHtml(page, "https://www.geneve.ch/agenda/concert-chaloupe-vapeur-0");

    expect(event.title).toBe("Concert à La Chaloupe à Vapeur !");
    expect(event.startsAt.toISOString()).toBe("2026-08-09T14:00:00.000Z");
    expect(event.endsAt?.toISOString()).toBe("2026-08-09T16:00:00.000Z");
    expect(event.placeLabel).toBe("La Chaloupe à vapeur, Rue de Lausanne 126");
  });

  it("ignore un bloc sans date plutôt que d'inventer", () => {
    const sansDate = page.replace(/"startDate":"[^"]+",/, "");
    expect(eventsFromHtml(sansDate, "https://example.test")).toEqual([]);
  });

  it("ignore un bloc JSON illisible sans échouer", () => {
    expect(eventsFromHtml('<script type="application/ld+json">{oops</script>', "x")).toEqual([]);
  });

  it("lit la tranche d'âge quand elle est écrite, et rien sinon", async () => {
    const { parseAgeRange } = await import("@/lib/ingest/types");

    expect(parseAgeRange("Atelier 3-8 ans")).toEqual({ minAge: 3, maxAge: 8 });
    expect(parseAgeRange("de 7 à 12 ans")).toEqual({ minAge: 7, maxAge: 12 });
    expect(parseAgeRange("dès 5 ans")).toEqual({ minAge: 5 });
    expect(parseAgeRange("à partir de 10 ans")).toEqual({ minAge: 10 });
    expect(parseAgeRange("jusqu'à 3 ans")).toEqual({ maxAge: 3 });
    // Rien d'écrit, rien de deviné.
    expect(parseAgeRange("Spectacle pour toute la famille")).toEqual({});
    expect(parseAgeRange(undefined)).toEqual({});
  });

  it("récupère la tranche d'âge depuis le JSON-LD", () => {
    const avecAge = page.replace(
      '"startDate"',
      '"typicalAgeRange":"3-8 ans","startDate"',
    );
    const [event] = eventsFromHtml(avecAge, "https://example.test");
    expect(event.minAge).toBe(3);
    expect(event.maxAge).toBe(8);
  });

  it("extrait le JSON d'une réponse de modèle bavard", async () => {
    const { parseModelJson } = await import("@/lib/ingest/minimax");

    // Bloc de raisonnement avant, phrase après, accolade dans le texte : tout doit tomber.
    const reponse = `<think>Je regarde la page…</think>
      \`\`\`json
      {"evenements":[{"titre":"Atelier {spécial}","debut":"2026-01-04T14:00:00+01:00"}]}
      \`\`\`
      J'espère que cela convient {sinon dites-le}.`;

    expect(parseModelJson(reponse)).toEqual({
      evenements: [{ titre: "Atelier {spécial}", debut: "2026-01-04T14:00:00+01:00" }],
    });
  });

  it("réduit une page à son texte pour la lecture par l'IA", () => {
    const texte = htmlToText("<div><script>var a=1</script><h1>Atelier</h1><p>14h00</p></div>");
    expect(texte).toBe("Atelier 14h00");
  });
});

describe("Passage d'une source", () => {
  it("un flux structuré publie directement", async () => {
    const source = await createSource({ kind: "jsonld", autoPublish: true });

    const rapport = await runSource(source.id, adaptateur([unEvenement()]));

    expect(rapport.ok).toBe(true);
    expect(rapport.created).toBe(1);
    expect(await pendingReview()).toEqual([]);

    const rows = await db.execute<{ published_at: Date | null; origin: string }>(
      sql`select published_at, origin from event`,
    );
    expect(rows[0].published_at).not.toBeNull();
    expect(rows[0].origin).toBe("feed");
  });

  it("une lecture par l'IA attend une relecture", async () => {
    const source = await createSource({ kind: "html_ai", autoPublish: false });

    await runSource(source.id, adaptateur([unEvenement()]));

    const attente = await pendingReview();
    expect(attente.map((e) => e.title)).toEqual(["Atelier chocolat"]);
    expect(attente[0].sourceName).toBe("Agenda de test");

    const rows = await db.execute<{ origin: string }>(sql`select origin from event`);
    expect(rows[0].origin).toBe("ai");
  });

  it("un second passage met à jour sans dupliquer", async () => {
    const source = await createSource({ kind: "jsonld", autoPublish: true });

    await runSource(source.id, adaptateur([unEvenement()]));
    const second = await runSource(
      source.id,
      adaptateur([unEvenement({ title: "Atelier chocolat (complet)" })]),
    );

    expect(second.created).toBe(0);
    expect(second.updated).toBe(1);

    const rows = await db.execute<{ title: string }>(sql`select title from event`);
    expect(rows.map((r) => r.title)).toEqual(["Atelier chocolat (complet)"]);
  });

  it("un événement écarté ne réapparaît pas au passage suivant", async () => {
    const source = await createSource({ kind: "html_ai" });

    await runSource(source.id, adaptateur([unEvenement()]));
    const attente = await pendingReview();
    await rejectEvent(attente[0].id);

    expect(await pendingReview()).toEqual([]);

    await runSource(source.id, adaptateur([unEvenement()]));

    expect(await pendingReview()).toEqual([]);
  });

  it("un événement publié à la relecture le reste", async () => {
    const source = await createSource({ kind: "html_ai" });

    await runSource(source.id, adaptateur([unEvenement()]));
    const attente = await pendingReview();
    await publishEvent(attente[0].id);

    await runSource(source.id, adaptateur([unEvenement({ title: "Atelier chocolat, 15h" })]));

    expect(await pendingReview()).toEqual([]);
    const rows = await db.execute<{ title: string; published_at: Date | null }>(
      sql`select title, published_at from event`,
    );
    expect(rows[0].title).toBe("Atelier chocolat, 15h");
    expect(rows[0].published_at).not.toBeNull();
  });
});

describe("Santé des sources", () => {
  it("inscrit l'erreur d'un passage en échec", async () => {
    const source = await createSource({ kind: "jsonld", name: "Commune muette" });

    const rapport = await runSource(source.id, adaptateur(new Error("HTTP 503")));

    expect(rapport.ok).toBe(false);
    expect(rapport.error).toContain("503");

    const [sante] = await sourceHealth();
    expect(sante.name).toBe("Commune muette");
    expect(sante.lastError).toContain("503");
  });

  it("signale une source qui n'a jamais rien renvoyé", async () => {
    await createSource({ name: "Jamais passée" });

    const [sante] = await sourceHealth();
    expect(sante.joursSansContenu).toBeNull();
    expect(sante.muette).toBe(true);
  });

  it("ne signale pas une source qui vient de rapporter des activités", async () => {
    const source = await createSource({ kind: "jsonld", autoPublish: true });
    await runSource(source.id, adaptateur([unEvenement()]));

    const [sante] = await sourceHealth();
    expect(sante.joursSansContenu).toBe(0);
    expect(sante.lastEventCount).toBe(1);
    expect(sante.muette).toBe(false);
    expect(sante.lastError).toBeNull();
  });

  it("signale une source silencieuse depuis trop longtemps", async () => {
    const source = await createSource({ kind: "jsonld", autoPublish: true });
    await runSource(source.id, adaptateur([unEvenement()]));

    await db.execute(sql`
      update source set last_non_empty_at = now() - interval '9 days' where id = ${source.id}
    `);

    const [sante] = await sourceHealth();
    expect(sante.joursSansContenu).toBe(9);
    expect(sante.muette).toBe(true);
  });

  it("signale une source qui répond correctement mais ne rapporte plus rien", async () => {
    // C'est la panne la plus traître : techniquement tout va bien, l'agenda se vide.
    const source = await createSource({ kind: "jsonld", autoPublish: true, name: "Vidée" });
    await runSource(source.id, adaptateur([unEvenement()]));
    await db.execute(sql`
      update source set last_non_empty_at = now() - interval '10 days' where id = ${source.id}
    `);

    const rapport = await runSource(source.id, adaptateur([]));

    expect(rapport.ok).toBe(true);
    expect(rapport.found).toBe(0);

    const [sante] = await sourceHealth();
    expect(sante.lastError).toBeNull();
    expect(sante.lastSuccessAt).toBeInstanceOf(Date);
    expect(sante.lastEventCount).toBe(0);
    expect(sante.muette).toBe(true);
  });

  it("refuse une source sans adaptateur, sans faire échouer le reste", async () => {
    const source = await createSource({ kind: "ical", name: "Flux iCal" });

    const rapport = await runSource(source.id, { jsonld: async () => [] });

    expect(rapport.ok).toBe(false);
    expect(rapport.error).toContain("ical");
  });
});
