/**
 * Le calendrier tel qu'un parent le lit.
 *
 * Les activités sont publiques : tout le monde voit les mêmes. Ce qui change d'une personne
 * à l'autre, c'est qui elle voit inscrit dessus — et cela passe par la règle de visibilité,
 * jamais par une requête d'ici.
 *
 * Chaque entrée porte sa provenance et sa date de mise à jour, pour qu'un parent puisse
 * savoir d'où vient l'information et de quand elle date.
 */

import { sql, type SQL } from "drizzle-orm";

import { db } from "./db";
import { asDate, asDateOrNull } from "./db/rows";
import { visiblePublications } from "./visibility";

export type CalendarEntry = {
  id: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  place: string | null;
  commune: string | null;
  url: string | null;
  origin: "parent" | "feed" | "ai";
  sourceName: string | null;
  updatedAt: Date;
  /** « dès 5 ans », « 3-8 ans » — tel que l'organisateur l'annonce, ou null. */
  ageLabel: string | null;
  /** Déjà commencé et pas terminé : une exposition, un festival, un été d'animations. */
  enCours: boolean;
  /** Les personnes inscrites que ce lecteur a le droit de voir. */
  attendees: { publicationId: string; accountId: string; displayName: string }[];
};

export const FENETRES = ["aujourd_hui", "demain", "week_end", "quinzaine"] as const;
export type Fenetre = (typeof FENETRES)[number];

export const LIBELLES_FENETRE: Record<Fenetre, string> = {
  aujourd_hui: "Aujourd'hui",
  demain: "Demain",
  week_end: "Ce week-end",
  quinzaine: "15 jours",
};

/** Tranches proposées à l'écran. L'âge choisi n'est jamais enregistré. */
export const TRANCHES_AGE = [
  { valeur: 2, libelle: "0-3 ans" },
  { valeur: 5, libelle: "4-6 ans" },
  { valeur: 8, libelle: "7-10 ans" },
  { valeur: 12, libelle: "11 ans et +" },
] as const;

export type FiltreAgenda = {
  quand?: Fenetre;
  /** Âge choisi à l'écran, pour cette consultation seulement. */
  age?: number;
  commune?: string;
  /** Ne garder que les activités où une famille de mes cercles est déjà inscrite. */
  avecMonCercle?: boolean;
  limit?: number;
};

function libelleAge(min: number | null, max: number | null): string | null {
  if (min !== null && max !== null) return `${min}-${max} ans`;
  if (min !== null) return `dès ${min} ans`;
  if (max !== null) return `jusqu'à ${max} ans`;
  return null;
}

/**
 * « Aujourd'hui », « ce week-end » se calculent à l'heure de Genève, pas à celle du serveur.
 * Un parent qui ouvre l'app à 23 h veut les activités de sa journée à lui.
 */
function fenetreSql(quand: Fenetre): SQL {
  const local = sql`(now() at time zone 'Europe/Zurich')`;
  const minuit = sql`date_trunc('day', ${local})`;
  // Les parenthèses intérieures ne sont pas décoratives : `AT TIME ZONE` se lie plus fort
  // que `+`, donc sans elles il s'appliquerait à l'intervalle et non à la date entière.
  const zone = (moment: SQL) => sql`((${moment}) at time zone 'Europe/Zurich')`;

  switch (quand) {
    case "aujourd_hui":
      return sql`e.starts_at < ${zone(sql`${minuit} + interval '1 day'`)}`;

    case "demain":
      return sql`e.starts_at >= ${zone(sql`${minuit} + interval '1 day'`)}
             and e.starts_at < ${zone(sql`${minuit} + interval '2 days'`)}`;

    case "week_end": {
      // Samedi à venir, ou aujourd'hui si on y est déjà ; jusqu'au lundi matin.
      const samedi = sql`case
          when extract(isodow from ${local}) >= 6 then ${minuit}
          else ${minuit} + make_interval(days => (6 - extract(isodow from ${local}))::int)
        end`;
      const lundi = sql`${minuit} + make_interval(days => (8 - extract(isodow from ${local}))::int)`;
      return sql`e.starts_at >= ${zone(samedi)} and e.starts_at < ${zone(lundi)}`;
    }

    default:
      return sql`e.starts_at <= now() + interval '15 days'`;
  }
}

export async function upcomingCalendar(
  actorId: string,
  filtre: FiltreAgenda = {},
): Promise<CalendarEntry[]> {
  const limit = Math.min(Math.max(filtre.limit ?? 100, 1), 500);

  // Une seule lecture des participations, par la règle commune.
  const participations = await visiblePublications(actorId, { kind: "attendance" });
  const parEvenement = new Map<string, CalendarEntry["attendees"]>();
  for (const p of participations) {
    if (!p.eventId) continue;
    const liste = parEvenement.get(p.eventId) ?? [];
    liste.push({ publicationId: p.id, accountId: p.authorId, displayName: p.authorName });
    parEvenement.set(p.eventId, liste);
  }

  /**
   * « Où va quelqu'un de mes cercles » veut dire quelqu'un d'autre.
   *
   * Sa propre inscription ne doit pas faire ressortir l'activité : on chercherait alors ce
   * qu'on sait déjà. Elle reste bien sûr affichée dans la liste des inscrits.
   */
  const idsAvecMonCercle = [...parEvenement.entries()]
    .filter(([, inscrits]) => inscrits.some((i) => i.accountId !== actorId))
    .map(([eventId]) => eventId);

  if (filtre.avecMonCercle && idsAvecMonCercle.length === 0) return [];

  const conditions: SQL[] = [
    sql`e.published_at is not null`,
    // Ce qui est terminé n'a plus lieu d'apparaître, quelle que soit la fenêtre demandée.
    sql`coalesce(e.ends_at, e.starts_at + interval '2 hours') >= now()`,
    fenetreSql(filtre.quand ?? "quinzaine"),
  ];

  if (filtre.age !== undefined) {
    // Une activité sans tranche annoncée reste affichée : on masque ce qui ne convient
    // manifestement pas, jamais ce dont on ignore s'il convient.
    conditions.push(sql`(
      e.min_age is null and e.max_age is null
      or coalesce(e.min_age, 0) <= ${filtre.age} and coalesce(e.max_age, 18) >= ${filtre.age}
    )`);
  }

  if (filtre.commune) {
    conditions.push(sql`e.commune = ${filtre.commune}`);
  }

  if (filtre.avecMonCercle) {
    conditions.push(sql`e.id = any(${sql.param(idsAvecMonCercle)}::uuid[])`);
  }

  const rows = await db.execute<{
    id: string;
    title: string;
    description: string | null;
    starts_at: Date;
    ends_at: Date | null;
    place: string | null;
    commune: string | null;
    url: string | null;
    origin: "parent" | "feed" | "ai";
    source_name: string | null;
    updated_at: Date;
    min_age: number | null;
    max_age: number | null;
    en_cours: boolean;
  }>(sql`
    select
      e.id, e.title, e.description, e.starts_at, e.ends_at, e.url, e.origin, e.updated_at,
      e.min_age, e.max_age, e.commune,
      (e.starts_at <= now()) as en_cours,
      coalesce(pl.name, e.place_label) as place,
      src.name as source_name
    from event e
    left join place pl on pl.id = e.place_id
    left join source src on src.id = e.source_id
    where ${sql.join(conditions, sql` and `)}
    -- Une exposition commencée en juin n'a pas à s'afficher avant les activités de demain
    -- sous prétexte qu'elle a commencé avant : ce qui compte, c'est la prochaine occasion.
    --
    -- Entre deux activités déjà commencées, toutes égales sur ce critère, c'est la fin qui
    -- départage : celle qui ferme samedi passe avant celle qui dure jusqu'en octobre.
    -- Sans cela, l'ordre entre elles était celui que la base voulait bien rendre.
    order by
      greatest(e.starts_at, now()) asc,
      coalesce(e.ends_at, e.starts_at + interval '2 hours') asc,
      e.starts_at asc
    limit ${limit}
  `);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    startsAt: asDate(r.starts_at),
    endsAt: asDateOrNull(r.ends_at),
    place: r.place,
    commune: r.commune,
    url: r.url,
    origin: r.origin,
    sourceName: r.source_name,
    updatedAt: asDate(r.updated_at),
    ageLabel: libelleAge(r.min_age, r.max_age),
    enCours: r.en_cours,
    attendees: parEvenement.get(r.id) ?? [],
  }));
}

/** Une activité précise, avec les personnes inscrites que ce lecteur a le droit de voir. */
export async function calendarEntry(
  actorId: string,
  eventId: string,
): Promise<CalendarEntry | null> {
  const rows = await db.execute<{
    id: string;
    title: string;
    description: string | null;
    starts_at: Date;
    ends_at: Date | null;
    place: string | null;
    commune: string | null;
    url: string | null;
    origin: "parent" | "feed" | "ai";
    source_name: string | null;
    updated_at: Date;
    min_age: number | null;
    max_age: number | null;
    en_cours: boolean;
  }>(sql`
    select
      e.id, e.title, e.description, e.starts_at, e.ends_at, e.url, e.origin, e.updated_at,
      e.min_age, e.max_age, e.commune,
      (e.starts_at <= now()) as en_cours,
      coalesce(pl.name, e.place_label) as place,
      src.name as source_name
    from event e
    left join place pl on pl.id = e.place_id
    left join source src on src.id = e.source_id
    where e.id = ${eventId}
      and e.published_at is not null
    limit 1
  `);

  const r = rows[0];
  if (!r) return null;

  const participations = await visiblePublications(actorId, {
    kind: "attendance",
    eventId,
  });

  return {
    id: r.id,
    title: r.title,
    description: r.description,
    startsAt: asDate(r.starts_at),
    endsAt: asDateOrNull(r.ends_at),
    place: r.place,
    commune: r.commune,
    url: r.url,
    origin: r.origin,
    sourceName: r.source_name,
    updatedAt: asDate(r.updated_at),
    ageLabel: libelleAge(r.min_age, r.max_age),
    enCours: r.en_cours,
    attendees: participations.map((p) => ({
      publicationId: p.id,
      accountId: p.authorId,
      displayName: p.authorName,
    })),
  };
}

/** Les communes réellement représentées à l'agenda — pas une liste figée dans le code. */
export async function communesDisponibles(): Promise<string[]> {
  const rows = await db.execute<{ commune: string }>(sql`
    select distinct commune
    from event
    where published_at is not null
      and commune is not null
      and coalesce(ends_at, starts_at + interval '2 hours') >= now()
    order by commune asc
  `);
  return rows.map((r) => r.commune);
}

/**
 * Efface les activités passées qui n'intéressent plus personne.
 * Le calendrier n'a pas vocation à devenir une archive.
 */
export async function purgePastEvents(days = 90): Promise<number> {
  const rows = await db.execute<{ id: string }>(sql`
    delete from event
    where coalesce(ends_at, starts_at) < now() - make_interval(days => ${days})
    returning id
  `);
  return rows.length;
}
