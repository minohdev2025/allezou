/**
 * Passage des sources et santé de l'agenda.
 *
 * Une source qui cesse de fonctionner en silence dégrade la confiance plus qu'une absence
 * totale d'agenda. Chaque passage inscrit donc son résultat sur la source, et `sourceHealth`
 * expose de quoi afficher « cette source n'a rien renvoyé depuis huit jours » plutôt que de
 * laisser un calendrier se vider sans que personne ne s'en aperçoive.
 *
 * Chaque activité passe par les contrôles de `controles.ts` avant d'entrer au calendrier.
 * Ce qui les passe se publie seul ; ce qui en échoue un seul attend une relecture. La file
 * n'a pas disparu, elle est devenue l'exception.
 */

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "../db";
import { asDate, asDateOrNull } from "../db/rows";
import * as s from "../db/schema";
import { controler, type Echec } from "./controles";
import { jsonLdAdapter } from "./jsonld";
import { minimaxAdapter } from "./minimax";
import { clamp, type Adapter, type RawEvent, type Source } from "./types";

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
  /** Nouvelles activités entrées au calendrier sans passer par personne. */
  published: number;
  /** Nouvelles activités retenues en file : au moins un contrôle a échoué. */
  held: number;
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
    published: 0,
    held: 0,
  };

  const adapter = adapters[source.kind];
  if (!adapter) {
    return finish(source, { ...report, error: `Aucun adaptateur pour « ${source.kind} »` });
  }

  try {
    const events = await adapter(source);
    report.found = events.length;

    for (const event of events) {
      const echecs = [
        ...controler(event, { source, texteSource: event.texteSource }),
        ...(await chercherDoublon(event, source.id)),
      ];

      const contenu = {
        title: event.title,
        description: event.description,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        placeLabel: event.placeLabel,
        url: event.url,
        minAge: event.minAge,
        maxAge: event.maxAge,
        commune: source.commune,
      };

      const [existing] = await db
        .select({ id: s.event.id, publishedAt: s.event.publishedAt })
        .from(s.event)
        .where(and(eq(s.event.sourceId, source.id), eq(s.event.externalId, event.externalId)))
        .limit(1);

      if (existing) {
        // L'état de relecture ne bouge jamais ici : un événement déjà relu ne repart pas en
        // file, un événement écarté ne réapparaît pas.
        //
        // Le contenu, lui, n'est remplacé que par une lecture qui passe les contrôles. Sans
        // cette réserve, une source qui se met à mal lire réécrirait en silence une activité
        // vérifiée par une activité douteuse, sans repasser devant personne.
        const remplacable = !existing.publishedAt || echecs.length === 0;

        await db
          .update(s.event)
          .set({
            ...(remplacable ? contenu : {}),
            controles: echecs.length > 0 ? echecs : null,
            updatedAt: new Date(),
          })
          .where(eq(s.event.id, existing.id));
        report.updated += 1;
      } else {
        const publiable = source.autoPublish && echecs.length === 0;

        await db.insert(s.event).values({
          ...contenu,
          origin: source.kind === "html_ai" ? "ai" : "feed",
          sourceId: source.id,
          externalId: event.externalId,
          publishedAt: publiable ? new Date() : null,
          controles: echecs.length > 0 ? echecs : null,
        });
        report.created += 1;
        if (publiable) report.published += 1;
        else report.held += 1;
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

/**
 * Cherche la même activité chez une autre source.
 *
 * Deux communes qui annoncent le même titre à la même heure recopient l'une sur l'autre, ou
 * relaient un événement cantonal. Dans les deux cas le calendrier afficherait deux fois la
 * même sortie à un parent : c'est une erreur visible, et elle mérite un œil.
 */
async function chercherDoublon(event: RawEvent, sourceId: string): Promise<Echec[]> {
  const rows = await db
    .select({ commune: s.event.commune })
    .from(s.event)
    .where(
      and(
        eq(s.event.startsAt, event.startsAt),
        // `cast` explicite : sans lui, Postgres ne sait pas de quel type est le paramètre
        // qu'on lui demande de mettre en minuscules, et refuse la requête entière.
        sql`lower(${s.event.title}) = lower(cast(${event.title} as text))`,
        sql`${s.event.sourceId} is distinct from cast(${sourceId} as uuid)`,
        isNull(s.event.rejectedAt),
      ),
    )
    .limit(1);

  if (rows.length === 0) return [];

  const ailleurs = rows[0].commune ? ` (${rows[0].commune})` : "";
  return [
    {
      code: "doublon",
      detail: `Une autre source annonce déjà « ${event.title} » à la même heure${ailleurs}.`,
    },
  ];
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
  /** Pourquoi cette activité est là plutôt qu'au calendrier. */
  controles: Echec[];
};

/**
 * Ce qui attend une relecture.
 *
 * Depuis que les contrôles remplacent l'œil humain, la file ne reçoit plus tout ce que le
 * modèle a lu : elle reçoit ce qui a échoué à un contrôle, et ce que des sources encore
 * jeunes envoient délibérément à la main. Chaque fiche porte donc le motif de sa présence,
 * sans quoi la relire consisterait à deviner ce qu'on lui reproche.
 */
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
    controles: Echec[] | null;
  }>(sql`
    select e.id, e.title, e.description, e.starts_at, e.ends_at, e.place_label, e.url,
           e.commune, e.min_age, e.max_age, e.controles,
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
    controles: r.controles ?? [],
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
      // Quelqu'un a regardé : les contrôles ont dit ce qu'ils avaient à dire, et les laisser
      // afficherait un reproche à une activité qui vient d'être vérifiée à la main.
      controles: null,
      // L'origine ne change pas : corriger une heure ne fait pas de nous la source de
      // l'activité, et le parent qui la lit doit continuer à voir d'où elle vient.
      updatedAt: new Date(),
    })
    .where(and(eq(s.event.id, eventId), isNull(s.event.publishedAt)));
}

export async function publishEvent(eventId: string): Promise<void> {
  await db
    .update(s.event)
    .set({ publishedAt: new Date(), rejectedAt: null, controles: null })
    .where(and(eq(s.event.id, eventId), isNull(s.event.publishedAt)));
}

export async function rejectEvent(eventId: string): Promise<void> {
  await db
    .update(s.event)
    .set({ rejectedAt: new Date() })
    .where(and(eq(s.event.id, eventId), isNull(s.event.publishedAt)));
}
