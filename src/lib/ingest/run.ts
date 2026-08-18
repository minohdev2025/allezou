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

import { and, eq, isNull, or, sql } from "drizzle-orm";

import { db } from "../db";
import { asDate, asDateOrNull } from "../db/rows";
import * as s from "../db/schema";
import { controler, type Echec } from "./controles";
import type { Acces, Tarif } from "./tarif";
import { icalAdapter } from "./ical";
import { jsonLdAdapter } from "./jsonld";
import { minimaxAdapter } from "./minimax";
import { verifierExtraction, type Verificateur } from "./verification";
import { clamp, jourGenevois, type Adapter, type RawEvent, type Source } from "./types";

/** Au-delà de ce délai sans succès, la source est signalée dans l'interface. */
export const SEUIL_SOURCE_MUETTE_JOURS = 7;

/**
 * Combien de temps une activité peut manquer à l'appel avant d'être retirée de l'agenda.
 *
 * Trois passages, à six heures d'intervalle. Une page communale qui bafouille le temps d'un
 * rafraîchissement, une pagination qui saute, un serveur qui répond à moitié : rien de tout
 * cela ne doit retirer une sortie à laquelle des familles se sont inscrites. Trois absences
 * d'affilée, en revanche, ne sont plus un accident.
 */
export const DELAI_DISPARITION_HEURES = 18;

export type Adapters = Partial<Record<(typeof s.sourceKind.enumValues)[number], Adapter>>;

export const defaultAdapters: Adapters = {
  ical: icalAdapter,
  jsonld: jsonLdAdapter,
  html_ai: minimaxAdapter,
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
  /** Activités retirées de l'agenda parce que la source ne les annonce plus. */
  withdrawn: number;
  error?: string;
};

/** La relecture croisée se débraye par source : `config.verifierIA: false`. */
function verificationActive(config: Source["config"]): boolean {
  return (config as { verifierIA?: unknown } | null)?.verifierIA !== false;
}

export async function runSource(
  sourceId: string,
  adapters: Adapters = defaultAdapters,
  verifier: Verificateur = verifierExtraction,
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
    withdrawn: 0,
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
        .select({
          id: s.event.id,
          publishedAt: s.event.publishedAt,
          rejectedAt: s.event.rejectedAt,
        })
        .from(s.event)
        .where(and(eq(s.event.sourceId, source.id), eq(s.event.externalId, event.externalId)))
        .limit(1);

      const echecs = [
        ...controler(event, { source, texteSource: event.texteSource }),
        ...(await chercherDoublon(event, source.id)),
      ];

      /*
        La relecture croisée garde la porte de la première publication, et elle seule.

        Elle ne relit que ce que les contrôles littéraux laissent passer : ce qui a déjà
        échoué attend de toute façon une relecture humaine, et payer un appel pour le dire
        deux fois n'apprend rien. Elle ne relit pas non plus ce qui est déjà publié : le
        contenu affiché a été vérifié à son entrée, et un vérificateur qui aurait un doute
        passager rangerait des activités saines parmi les signalées, passage après passage.
      */
      if (
        source.kind === "html_ai" &&
        echecs.length === 0 &&
        !existing?.publishedAt &&
        verificationActive(source.config)
      ) {
        echecs.push(...(await verifier(event)));
      }

      const contenu = {
        title: event.title,
        description: event.description,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        placeLabel: event.placeLabel,
        url: event.url,
        minAge: event.minAge,
        maxAge: event.maxAge,
        tarif: event.tarif ?? "inconnu",
        acces: event.acces ?? "inconnu",
        allDay: event.allDay ?? false,
        recurrence: event.recurrence,
        commune: source.commune,
      };

      if (existing) {
        // Un événement écarté à la main ne réapparaît pas, et un événement publié le reste :
        // aucune décision humaine ne se défait ici.
        //
        // Une activité restée en file, en revanche, n'est le fruit d'aucune décision : c'est
        // un contrôle qui l'y a mise. Si la lecture d'aujourd'hui passe, elle rejoint le
        // calendrier comme l'aurait fait une activité découverte ce matin. Sans cela, une
        // activité retenue pour un contrôle depuis corrigé y serait restée pour toujours,
        // sans que rien ne lui soit plus reproché.
        //
        // `withdrawnAt` est remis à zéro : une commune qui réannonce une activité qu'elle
        // avait retirée la remet à l'agenda, sans qu'on ait à s'en occuper.
        //
        // Le contenu n'est remplacé que par une lecture qui passe les contrôles. Sans cette
        // réserve, une source qui se met à mal lire réécrirait en silence une activité
        // vérifiée par une activité douteuse, sans repasser devant personne.
        const remplacable = !existing.publishedAt || echecs.length === 0;
        const publiable =
          !existing.publishedAt &&
          !existing.rejectedAt &&
          source.autoPublish &&
          echecs.length === 0;

        await db
          .update(s.event)
          .set({
            ...(remplacable ? contenu : {}),
            ...(publiable ? { publishedAt: new Date() } : {}),
            controles: echecs.length > 0 ? echecs : null,
            lastSeenAt: sql`now()`,
            withdrawnAt: null,
            updatedAt: new Date(),
          })
          .where(eq(s.event.id, existing.id));

        report.updated += 1;
        if (publiable) report.published += 1;
      } else {
        const publiable = source.autoPublish && echecs.length === 0;

        await db.insert(s.event).values({
          ...contenu,
          origin: source.kind === "html_ai" ? "ai" : "feed",
          sourceId: source.id,
          externalId: event.externalId,
          publishedAt: publiable ? new Date() : null,
          controles: echecs.length > 0 ? echecs : null,
          lastSeenAt: sql`now()`,
        });
        report.created += 1;
        if (publiable) report.published += 1;
        else report.held += 1;
      }
    }

    report.withdrawn = await retirerLesDisparues(source.id);

    return finish(source, { ...report, ok: true });
  } catch (error) {
    return finish(source, {
      ...report,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Retire de l'agenda ce que la source n'annonce plus.
 *
 * Une activité annulée disparaît de la page de la commune sans autre forme de procès. Tant
 * qu'on ne comparait qu'à ce que la page annonce, elle restait publiée jusqu'à sa date, et
 * une famille pouvait se déplacer pour une sortie qui n'existait plus.
 *
 * On ne touche qu'au futur : ce qui a déjà eu lieu a eu lieu, et le sortir de l'agenda
 * effacerait la trace d'une sortie à laquelle des familles sont allées.
 *
 * `updated_at` sert de repli pour les activités entrées avant que cette colonne existe :
 * sans lui, tout l'agenda serait retiré au premier passage.
 */
async function retirerLesDisparues(sourceId: string): Promise<number> {
  const rows = await db.execute<{ id: string }>(sql`
    update event
    set withdrawn_at = now()
    where source_id = ${sourceId}
      and published_at is not null
      and withdrawn_at is null
      and starts_at > now()
      and coalesce(last_seen_at, updated_at)
          < now() - make_interval(hours => ${DELAI_DISPARITION_HEURES})
    returning id
  `);

  return rows.length;
}

/**
 * Cherche la même activité ailleurs, ou deux fois chez la même source.
 *
 * Deux communes qui annoncent le même titre à la même heure recopient l'une sur l'autre, ou
 * relaient un événement cantonal. Une source qui l'annonce deux fois a changé sa façon de
 * l'écrire entre deux passages, et l'ancienne version est restée. Dans les deux cas le
 * calendrier montrerait deux fois la même sortie à un parent.
 *
 * Deux comparaisons, apprises l'une après l'autre :
 *
 * 1. **Le même titre à la même heure**, chez soi ou ailleurs. C'est le cas d'origine.
 * 2. **Un titre contenu dans un autre, le même jour, chez la même source.** Lancy affiche la
 *    rubrique à gauche du titre — « Concert Musique à Pont-Rouge », « Animation Biblio-Bingo »
 *    — et le modèle la reprenait une fois sur deux. Comme l'identité d'une activité est son
 *    titre et son jour, la version longue entrait comme une activité de plus : quarante paires
 *    de jumelles à Lancy, dont plusieurs publiées des deux côtés, c'est-à-dire montrées deux
 *    fois à un parent. La consigne donnée au modèle a été resserrée, mais une consigne se
 *    respecte à peu près : ce contrôle est ce qui reste quand elle dérape.
 *
 * Le jour et non l'heure pour ce second cas : la version longue et la courte se lisent parfois
 * à quelques minutes d'écart, et attendre l'égalité à la seconde reviendrait à ne rien voir.
 *
 * On exclut la ligne de l'activité elle-même, et elle seule.
 */
async function chercherDoublon(event: RawEvent, sourceId: string): Promise<Echec[]> {
  const pasSoiMeme = sql`not (${s.event.sourceId} is not distinct from cast(${sourceId} as uuid)
           and ${s.event.externalId} is not distinct from cast(${event.externalId} as text))`;

  // Les dates passent par `eq`, jamais par un fragment brut : drizzle connaît le type de la
  // colonne et encode l'horodatage, là où le pilote refuse tout net un objet Date qu'on lui
  // tend dans un `sql` littéral.
  const memeTitreMemeHeure = and(
    eq(s.event.startsAt, event.startsAt),
    // `cast` explicite : sans lui, Postgres ne sait pas de quel type est le paramètre qu'on
    // lui demande de mettre en minuscules, et refuse la requête entière.
    sql`lower(${s.event.title}) = lower(cast(${event.title} as text))`,
  );

  const titreEmboiteMemeJour = and(
    eq(s.event.sourceId, sourceId),
    sql`date(${s.event.startsAt} at time zone 'Europe/Zurich')
        = cast(${jourGenevois(event.startsAt)} as date)`,
    sql`(
      position(lower(${s.event.title}) in lower(cast(${event.title} as text))) > 0
      or position(lower(cast(${event.title} as text)) in lower(${s.event.title})) > 0
    )`,
  );

  const rows = await db
    .select({ commune: s.event.commune, sourceId: s.event.sourceId, title: s.event.title })
    .from(s.event)
    .where(
      and(
        or(memeTitreMemeHeure, titreEmboiteMemeJour),
        pasSoiMeme,
        isNull(s.event.rejectedAt),
        isNull(s.event.withdrawnAt),
      ),
    )
    .limit(1);

  if (rows.length === 0) return [];

  const memeSource = rows[0].sourceId === sourceId;
  const ailleurs = rows[0].commune ? ` (${rows[0].commune})` : "";

  return [
    {
      code: "doublon",
      detail: memeSource
        ? `Cette source annonce déjà « ${rows[0].title} » ce jour-là.`
        : `Une autre source annonce déjà « ${event.title} » à la même heure${ailleurs}.`,
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
  allDay: boolean;
  recurrence: string | null;
  placeLabel: string | null;
  commune: string | null;
  minAge: number | null;
  maxAge: number | null;
  url: string | null;
  tarif: Tarif;
  acces: Acces;
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
    all_day: boolean;
    recurrence: string | null;
    tarif: Tarif;
    acces: Acces;
    source_name: string | null;
    controles: Echec[] | null;
  }>(sql`
    select e.id, e.title, e.description, e.starts_at, e.ends_at, e.place_label, e.url,
           e.commune, e.min_age, e.max_age, e.controles, e.all_day, e.recurrence,
           e.tarif, e.acces,
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
    allDay: r.all_day,
    recurrence: r.recurrence,
    tarif: r.tarif,
    acces: r.acces,
    sourceName: r.source_name,
    controles: r.controles ?? [],
  }));
}

/**
 * Ce qu'un relecteur peut corriger avant de publier.
 *
 * Tous les champs qu'un parent lit, et pas seulement ceux que le modèle rate le plus souvent :
 * ne pouvoir corriger que la moitié d'une fiche oblige à écarter une activité juste pour un
 * champ faux, alors qu'elle ne demandait qu'une retouche.
 */
export type Correction = {
  title?: string;
  description?: string | null;
  startsAt?: Date;
  endsAt?: Date | null;
  allDay?: boolean;
  recurrence?: string | null;
  placeLabel?: string | null;
  commune?: string | null;
  url?: string | null;
  minAge?: number | null;
  maxAge?: number | null;
  tarif?: Tarif;
  acces?: Acces;
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

/* --------------------------------------------------- publiées, mais signalées */

export type FlaggedEvent = {
  id: string;
  title: string;
  startsAt: Date;
  url: string | null;
  sourceName: string | null;
  controles: Echec[];
};

/**
 * Ce qui est publié mais dont la dernière lecture ne passe plus les contrôles.
 *
 * Le contenu affiché reste celui qui avait été vérifié : c'est ce qui empêche une source
 * devenue mauvaise de réécrire en silence une activité validée. Mais sans cet écran, la
 * dérive ne se voyait nulle part, `pendingReview` ne listant que le non-publié. Une commune
 * qui refait son site passerait inaperçue jusqu'à ce que quelqu'un compare à la main.
 */
export async function flaggedPublished(limit = 50): Promise<FlaggedEvent[]> {
  const rows = await db.execute<{
    id: string;
    title: string;
    starts_at: Date;
    url: string | null;
    source_name: string | null;
    controles: Echec[] | null;
  }>(sql`
    select e.id, e.title, e.starts_at, e.url, e.controles, src.name as source_name
    from event e
    left join source src on src.id = e.source_id
    where e.published_at is not null
      and e.rejected_at is null
      and e.withdrawn_at is null
      and e.controles is not null
      and e.starts_at > now()
    order by e.starts_at asc
    limit ${limit}
  `);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    startsAt: asDate(r.starts_at),
    url: r.url,
    sourceName: r.source_name,
    controles: r.controles ?? [],
  }));
}

/** « J'ai regardé, elle est juste. » Le signalement s'efface, l'activité reste publiée. */
export async function clearWarnings(eventId: string): Promise<void> {
  await db.update(s.event).set({ controles: null }).where(eq(s.event.id, eventId));
}

/**
 * Retirer de l'agenda une activité publiée.
 *
 * On pose `rejectedAt` et non `withdrawnAt` : le second est une observation de la machine,
 * que le passage suivant défait si la source réannonce l'activité. Une décision prise par
 * quelqu'un ne doit pas se faire défaire six heures plus tard.
 */
export async function withdrawEvent(eventId: string): Promise<void> {
  await db.update(s.event).set({ rejectedAt: new Date() }).where(eq(s.event.id, eventId));
}

export async function rejectEvent(eventId: string): Promise<void> {
  await db
    .update(s.event)
    .set({ rejectedAt: new Date() })
    .where(and(eq(s.event.id, eventId), isNull(s.event.publishedAt)));
}
