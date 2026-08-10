/**
 * Passage des sources et santé de l'agenda.
 *
 * Une source qui cesse de fonctionner en silence dégrade la confiance plus qu'une absence
 * totale d'agenda. Chaque passage inscrit donc son résultat sur la source, et `sourceHealth`
 * expose de quoi afficher « cette source n'a rien renvoyé depuis huit jours » plutôt que de
 * laisser un calendrier se vider sans que personne ne s'en aperçoive.
 */

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "../db";
import { asDate, asDateOrNull } from "../db/rows";
import * as s from "../db/schema";
import { jsonLdAdapter } from "./jsonld";
import { minimaxAdapter } from "./minimax";
import { clamp, type Adapter, type Source } from "./types";

/** Au-delà de ce délai sans succès, la source est signalée dans l'interface. */
export const SEUIL_SOURCE_MUETTE_JOURS = 7;

export type Adapters = Partial<Record<(typeof s.sourceKind.enumValues)[number], Adapter>>;

export const defaultAdapters: Adapters = {
  jsonld: jsonLdAdapter,
  html_ai: minimaxAdapter,
  // `ical` reste à écrire : aucune source genevoise vérifiée n'en expose pour l'instant.
};

export type IngestReport = {
  sourceId: string;
  sourceName: string;
  ok: boolean;
  found: number;
  created: number;
  updated: number;
  error?: string;
};

export async function runSource(
  sourceId: string,
  adapters: Adapters = defaultAdapters,
): Promise<IngestReport> {
  const [source] = await db.select().from(s.source).where(eq(s.source.id, sourceId)).limit(1);
  if (!source) throw new Error(`Source inconnue : ${sourceId}`);

  const report: IngestReport = {
    sourceId: source.id,
    sourceName: source.name,
    ok: false,
    found: 0,
    created: 0,
    updated: 0,
  };

  const adapter = adapters[source.kind];
  if (!adapter) {
    return finish(source, { ...report, error: `Aucun adaptateur pour « ${source.kind} »` });
  }

  try {
    const events = await adapter(source);
    report.found = events.length;

    for (const event of events) {
      const [existing] = await db
        .select({ id: s.event.id })
        .from(s.event)
        .where(and(eq(s.event.sourceId, source.id), eq(s.event.externalId, event.externalId)))
        .limit(1);

      if (existing) {
        // On met à jour le contenu mais jamais l'état de relecture : un événement déjà
        // relu ne repart pas en file, un événement écarté ne réapparaît pas.
        await db
          .update(s.event)
          .set({
            title: event.title,
            description: event.description,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            placeLabel: event.placeLabel,
            url: event.url,
            minAge: event.minAge,
            maxAge: event.maxAge,
            commune: source.commune,
            updatedAt: new Date(),
          })
          .where(eq(s.event.id, existing.id));
        report.updated += 1;
      } else {
        await db.insert(s.event).values({
          title: event.title,
          description: event.description,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          placeLabel: event.placeLabel,
          url: event.url,
          minAge: event.minAge,
          maxAge: event.maxAge,
          commune: source.commune,
          origin: source.kind === "html_ai" ? "ai" : "feed",
          sourceId: source.id,
          externalId: event.externalId,
          // Seuls les flux structurés se publient seuls.
          publishedAt: source.autoPublish ? new Date() : null,
        });
        report.created += 1;
      }
    }

    return finish(source, { ...report, ok: true });
  } catch (error) {
    return finish(source, {
      ...report,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function finish(source: Source, report: IngestReport): Promise<IngestReport> {
  await db
    .update(s.source)
    .set({
      // Horloge de la base et non celle de Node : ces dates sont comparées à now() en SQL,
      // et quelques millisecondes d'écart suffisent à produire « il y a -1 jour ».
      lastRunAt: sql`now()`,
      ...(report.ok
        ? {
            lastSuccessAt: sql`now()`,
            lastEventCount: report.found,
            lastError: null,
            ...(report.found > 0 ? { lastNonEmptyAt: sql`now()` } : {}),
          }
        : { lastError: clamp(report.error, 500) ?? "échec sans message" }),
    })
    .where(eq(s.source.id, source.id));

  return report;
}

export async function runAllSources(adapters: Adapters = defaultAdapters) {
  const sources = await db
    .select({ id: s.source.id })
    .from(s.source)
    .where(eq(s.source.active, true));

  const reports: IngestReport[] = [];
  for (const source of sources) {
    reports.push(await runSource(source.id, adapters));
  }
  return reports;
}

export type SourceHealth = {
  id: string;
  name: string;
  kind: (typeof s.sourceKind.enumValues)[number];
  autoPublish: boolean;
  /** Dernier passage techniquement réussi — peut n'avoir rien rapporté. */
  lastSuccessAt: Date | null;
  /** Dernier passage ayant réellement rapporté des activités. */
  lastNonEmptyAt: Date | null;
  lastEventCount: number | null;
  lastError: string | null;
  /** Jours sans qu'aucune activité ne soit remontée. Null si jamais rien n'est remonté. */
  joursSansContenu: number | null;
  /**
   * Vrai si la source doit être signalée dans l'interface plutôt que passée sous silence.
   * Une source qui répond correctement mais ne rapporte plus rien compte comme muette :
   * du point de vue d'un parent, c'est la même panne.
   */
  muette: boolean;
};

export async function sourceHealth(): Promise<SourceHealth[]> {
  const rows = await db.execute<{
    id: string;
    name: string;
    kind: (typeof s.sourceKind.enumValues)[number];
    auto_publish: boolean;
    last_success_at: Date | null;
    last_non_empty_at: Date | null;
    last_event_count: number | null;
    last_error: string | null;
    jours: number | null;
  }>(sql`
    select
      id, name, kind, auto_publish, last_success_at, last_non_empty_at,
      last_event_count, last_error,
      case
        when last_non_empty_at is null then null
        else floor(extract(epoch from (now() - last_non_empty_at)) / 86400)::int
      end as jours
    from source
    where active
    order by name asc
  `);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    autoPublish: r.auto_publish,
    lastSuccessAt: asDateOrNull(r.last_success_at),
    lastNonEmptyAt: asDateOrNull(r.last_non_empty_at),
    lastEventCount: r.last_event_count,
    lastError: r.last_error,
    joursSansContenu: r.jours,
    muette: r.jours === null || r.jours >= SEUIL_SOURCE_MUETTE_JOURS,
  }));
}

/* -------------------------------------------------------- file de relecture */

export type PendingEvent = {
  id: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  placeLabel: string | null;
  commune: string | null;
  minAge: number | null;
  maxAge: number | null;
  url: string | null;
  sourceName: string | null;
};

/** Ce qui attend une relecture : uniquement ce qui vient d'une lecture par l'IA. */
export async function pendingReview(limit = 50): Promise<PendingEvent[]> {
  const rows = await db.execute<{
    id: string;
    title: string;
    description: string | null;
    starts_at: Date;
    ends_at: Date | null;
    place_label: string | null;
    commune: string | null;
    min_age: number | null;
    max_age: number | null;
    url: string | null;
    source_name: string | null;
  }>(sql`
    select e.id, e.title, e.description, e.starts_at, e.ends_at, e.place_label, e.url,
           e.commune, e.min_age, e.max_age,
           src.name as source_name
    from event e
    left join source src on src.id = e.source_id
    where e.published_at is null
      and e.rejected_at is null
    order by e.starts_at asc
    limit ${limit}
  `);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    startsAt: asDate(r.starts_at),
    endsAt: asDateOrNull(r.ends_at),
    placeLabel: r.place_label,
    commune: r.commune,
    minAge: r.min_age,
    maxAge: r.max_age,
    url: r.url,
    sourceName: r.source_name,
  }));
}

export type Correction = {
  title?: string;
  startsAt?: Date;
  endsAt?: Date | null;
  placeLabel?: string | null;
  commune?: string | null;
  minAge?: number | null;
  maxAge?: number | null;
};

/**
 * Corriger puis publier.
 *
 * Une lecture par l'IA se trompe surtout sur les heures — une activité sans horaire écrit
 * ressort volontiers à minuit. Accepter ou refuser ne suffit donc pas : il faut pouvoir
 * rectifier, sinon la seule option devant une bonne activité mal datée est de la jeter.
 */
export async function correctAndPublish(
  eventId: string,
  correction: Correction,
): Promise<void> {
  const champs = Object.fromEntries(
    Object.entries(correction).filter(([, v]) => v !== undefined),
  );

  await db
    .update(s.event)
    .set({
      ...champs,
      publishedAt: new Date(),
      rejectedAt: null,
      // L'origine ne change pas : corriger une heure ne fait pas de nous la source de
      // l'activité, et le parent qui la lit doit continuer à voir d'où elle vient.
      updatedAt: new Date(),
    })
    .where(and(eq(s.event.id, eventId), isNull(s.event.publishedAt)));
}

export async function publishEvent(eventId: string): Promise<void> {
  await db
    .update(s.event)
    .set({ publishedAt: new Date(), rejectedAt: null })
    .where(and(eq(s.event.id, eventId), isNull(s.event.publishedAt)));
}

export async function rejectEvent(eventId: string): Promise<void> {
  await db
    .update(s.event)
    .set({ rejectedAt: new Date() })
    .where(and(eq(s.event.id, eventId), isNull(s.event.publishedAt)));
}
