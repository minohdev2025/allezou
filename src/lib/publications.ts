/**
 * Publier : « nous sommes là » et « nous y serons ».
 *
 * Deux gestes maximum pour l'action la plus fréquente. Concrètement : un lieu et une durée,
 * les destinataires étant déjà cochés par défaut. Tout le reste — quels cercles sont cochés,
 * qui est masqué — se règle en amont, au calme, pas au parc avec un enfant dans les bras.
 *
 * Les destinataires retenus sont toujours renvoyés par ces fonctions, pour que l'interface
 * puisse les écrire en toutes lettres dans le geste : un destinataire par défaut silencieux
 * est le moyen le plus probable de diffuser au mauvais cercle.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "./db";
import * as s from "./db/schema";
import {
  canSeePublication,
  visiblePublications,
  type VisiblePublication,
} from "./visibility";

/** Bornes d'une sortie : assez pour une matinée au parc, pas pour un séjour. */
export const DUREE_MIN_MINUTES = 15;
export const DUREE_MAX_MINUTES = 8 * 60;
export const DUREE_DEFAUT_MINUTES = 120;

/**
 * Une sortie peut être annoncée à l'avance, mais pas indéfiniment : au-delà de deux
 * semaines, ce n'est plus une sortie, c'est un projet — et cela relève de l'agenda.
 */
export const AVANCE_MAX_JOURS = 14;
/** Tolérance sur une heure de début légèrement passée, le temps de valider le formulaire. */
export const TOLERANCE_PASSE_MINUTES = 5;

/** Une présence expirée disparaît définitivement passé ce délai. Aucun historique. */
export const RETENTION_APRES_EXPIRATION = "24 hours";

export const noteSchema = z.string().trim().max(140).optional();
export const eventTitleSchema = z.string().trim().min(1).max(120);

export type PublicationError =
  | "lieu_inconnu"
  | "activite_inconnue"
  | "aucun_destinataire"
  | "cercle_interdit"
  | "duree_invalide"
  | "note_invalide"
  | "titre_invalide"
  | "dates_invalides"
  | "publication_inconnue"
  | "pas_auteur"
  | "enfant_inconnu"
  | "pas_une_presence"
  | "sortie_invisible"
  | "debut_invalide"

export type Result<T> = { ok: true; value: T } | { ok: false; reason: PublicationError };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const ko = <T>(reason: PublicationError): Result<T> => ({ ok: false, reason });

export type PublishedTo = {
  publicationId: string;
  circles: { id: string; name: string }[];
  endsAt: Date;
};

/* ------------------------------------------------------------- destinataires */

/** Les cercles cochés par défaut au moment de publier. */
export async function defaultAudience(
  actorId: string,
): Promise<{ id: string; name: string }[]> {
  const rows = await db.execute<{ id: string; name: string }>(sql`
    select c.id, c.name
    from circle_membership m
    join circle c on c.id = m.circle_id and c.archived_at is null
    where m.account_id = ${actorId}
      and m.left_at is null
      and m.default_audience
    order by c.name asc
  `);
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

/** Cocher ou décocher un cercle pour les prochaines publications. */
export async function setDefaultAudience(
  actorId: string,
  circleId: string,
  included: boolean,
): Promise<void> {
  await db
    .update(s.circleMembership)
    .set({ defaultAudience: included })
    .where(
      and(
        eq(s.circleMembership.accountId, actorId),
        eq(s.circleMembership.circleId, circleId),
        isNull(s.circleMembership.leftAt),
      ),
    );
}

/**
 * Ne garde que les cercles dont l'auteur est réellement membre actif.
 *
 * La règle de visibilité l'exige déjà à la lecture ; ce filtre est une seconde barrière,
 * pour qu'on ne puisse pas non plus *écrire* un destinataire auquel on n'a pas droit.
 */
async function allowedCircles(
  actorId: string,
  circleIds: string[],
): Promise<{ id: string; name: string }[]> {
  if (circleIds.length === 0) return [];
  const rows = await db
    .select({ id: s.circle.id, name: s.circle.name })
    .from(s.circleMembership)
    .innerJoin(s.circle, eq(s.circle.id, s.circleMembership.circleId))
    .where(
      and(
        eq(s.circleMembership.accountId, actorId),
        isNull(s.circleMembership.leftAt),
        isNull(s.circle.archivedAt),
        inArray(s.circleMembership.circleId, circleIds),
      ),
    );
  return rows;
}

/* --------------------------------------------------------- présence spontanée */

/**
 * Ne garde que les enfants dont la personne est réellement parent.
 * On ne déclare pas la présence de l'enfant de quelqu'un d'autre.
 */
async function ownedChildren(actorId: string, childIds: string[]): Promise<string[]> {
  if (childIds.length === 0) return [];
  const rows = await db
    .select({ childId: s.childParent.childId })
    .from(s.childParent)
    .innerJoin(s.child, eq(s.child.id, s.childParent.childId))
    .where(
      and(
        eq(s.childParent.accountId, actorId),
        isNull(s.child.deletedAt),
        inArray(s.childParent.childId, childIds),
      ),
    );
  return rows.map((r) => r.childId);
}

export type PresenceInput = {
  placeId: string;
  /** Absent = les cercles cochés par défaut. */
  circleIds?: string[];
  minutes?: number;
  note?: string;
  hiddenFrom?: string[];
  /** Les enfants présents. Leur prénom s'affiche à qui voit la sortie. */
  childIds?: string[];
  /** Absent = on y est déjà. Sinon, l'heure à laquelle on y sera. */
  startsAt?: Date;
};

export async function declarePresence(
  actorId: string,
  input: PresenceInput,
): Promise<Result<PublishedTo>> {
  const minutes = input.minutes ?? DUREE_DEFAUT_MINUTES;
  if (
    !Number.isFinite(minutes) ||
    minutes < DUREE_MIN_MINUTES ||
    minutes > DUREE_MAX_MINUTES
  ) {
    return ko("duree_invalide");
  }

  const note = noteSchema.safeParse(input.note);
  if (!note.success) return ko("note_invalide");

  const [place] = await db
    .select({ id: s.place.id })
    .from(s.place)
    .where(and(eq(s.place.id, input.placeId), isNull(s.place.archivedAt)))
    .limit(1);
  if (!place) return ko("lieu_inconnu");

  const wanted = input.circleIds ?? (await defaultAudience(actorId)).map((c) => c.id);
  const circles = await allowedCircles(actorId, wanted);
  if (circles.length === 0) return ko("aucun_destinataire");
  if (circles.length !== new Set(wanted).size) return ko("cercle_interdit");

  const childIds = input.childIds ?? [];
  const children = await ownedChildren(actorId, childIds);
  if (children.length !== new Set(childIds).size) return ko("enfant_inconnu");

  // Sans heure de début, on y est déjà : l'horloge de la base fait foi.
  const debut = input.startsAt;
  if (debut) {
    const ecart = debut.getTime() - Date.now();
    if (
      Number.isNaN(debut.getTime()) ||
      ecart < -TOLERANCE_PASSE_MINUTES * 60_000 ||
      ecart > AVANCE_MAX_JOURS * 24 * 3_600_000
    ) {
      return ko("debut_invalide");
    }
  }

  return db.transaction(async (tx) => {
    const [publication] = await tx
      .insert(s.publication)
      .values({
        authorId: actorId,
        kind: "presence",
        placeId: place.id,
        note: note.data,
        startsAt: debut ?? sql`now()`,
        endsAt: debut
          ? new Date(debut.getTime() + minutes * 60_000)
          : sql`now() + make_interval(mins => ${minutes})`,
      })
      .returning();

    await attachAudience(tx, publication.id, circles, input.hiddenFrom);
    await attachParticipant(tx, publication.id, actorId, children);

    return ok({ publicationId: publication.id, circles, endsAt: publication.endsAt });
  });
}

/**
 * Rejoindre une sortie déjà déclarée — le « +n ».
 *
 * On ne peut rejoindre que ce qu'on voit déjà : la vérification passe par la règle de
 * visibilité, pas par une requête d'ici. Et rejoindre n'expose qu'aux personnes avec qui
 * on partage déjà un cercle destinataire, jamais à l'ensemble de l'audience de l'auteur.
 */
export async function joinPresence(
  actorId: string,
  publicationId: string,
  childIds: string[] = [],
): Promise<Result<void>> {
  const [publication] = await db
    .select({ kind: s.publication.kind, authorId: s.publication.authorId })
    .from(s.publication)
    .where(eq(s.publication.id, publicationId))
    .limit(1);

  if (!publication) return ko("publication_inconnue");
  if (publication.kind !== "presence") return ko("pas_une_presence");
  if (!(await canSeePublication(actorId, publicationId))) return ko("sortie_invisible");

  const children = await ownedChildren(actorId, childIds);
  if (children.length !== new Set(childIds).size) return ko("enfant_inconnu");

  return db.transaction(async (tx) => {
    await tx
      .insert(s.publicationParticipant)
      .values({ publicationId, accountId: actorId })
      .onConflictDoNothing();

    // On remplace la liste d'enfants : rejoindre à nouveau sert à la corriger.
    await tx
      .delete(s.publicationParticipantChild)
      .where(
        and(
          eq(s.publicationParticipantChild.publicationId, publicationId),
          eq(s.publicationParticipantChild.accountId, actorId),
        ),
      );

    if (children.length > 0) {
      await tx
        .insert(s.publicationParticipantChild)
        .values(children.map((childId) => ({ publicationId, accountId: actorId, childId })));
    }

    return ok(undefined as void);
  });
}

/** Se retirer d'une sortie qu'on avait rejointe. L'auteur, lui, retire sa sortie. */
export async function leavePresence(
  actorId: string,
  publicationId: string,
): Promise<Result<void>> {
  const [publication] = await db
    .select({ authorId: s.publication.authorId })
    .from(s.publication)
    .where(eq(s.publication.id, publicationId))
    .limit(1);

  if (!publication) return ko("publication_inconnue");
  if (publication.authorId === actorId) return ko("pas_auteur");

  await db
    .delete(s.publicationParticipant)
    .where(
      and(
        eq(s.publicationParticipant.publicationId, publicationId),
        eq(s.publicationParticipant.accountId, actorId),
      ),
    );

  return ok(undefined as void);
}

/* ------------------------------------------------- participation à une activité */

export type AttendanceInput = {
  eventId: string;
  circleIds?: string[];
  hiddenFrom?: string[];
  childIds?: string[];
};

export async function declareAttendance(
  actorId: string,
  input: AttendanceInput,
): Promise<Result<PublishedTo>> {
  const [event] = await db
    .select({ id: s.event.id, startsAt: s.event.startsAt, endsAt: s.event.endsAt })
    .from(s.event)
    .where(eq(s.event.id, input.eventId))
    .limit(1);
  if (!event) return ko("activite_inconnue");

  const wanted = input.circleIds ?? (await defaultAudience(actorId)).map((c) => c.id);
  const circles = await allowedCircles(actorId, wanted);
  if (circles.length === 0) return ko("aucun_destinataire");
  if (circles.length !== new Set(wanted).size) return ko("cercle_interdit");

  const childIds = input.childIds ?? [];
  const children = await ownedChildren(actorId, childIds);
  if (children.length !== new Set(childIds).size) return ko("enfant_inconnu");

  return db.transaction(async (tx) => {
    const [publication] = await tx
      .insert(s.publication)
      .values({
        authorId: actorId,
        kind: "attendance",
        eventId: event.id,
        startsAt: event.startsAt,
        // Une activité sans heure de fin reste visible jusqu'au soir même.
        endsAt: event.endsAt ?? new Date(event.startsAt.getTime() + 4 * 3_600_000),
      })
      .returning();

    await attachAudience(tx, publication.id, circles, input.hiddenFrom);
    await attachParticipant(tx, publication.id, actorId, children);

    return ok({ publicationId: publication.id, circles, endsAt: publication.endsAt });
  });
}

/**
 * « 4 janvier, visite du Muséum, 14h-16h » : un seul geste crée l'entrée au calendrier
 * et y inscrit son auteur.
 *
 * L'activité entre au calendrier pour tout le monde ; c'est la participation qui porte
 * la visibilité. Une activité n'a pas de visibilité propre.
 */
export type NewEventInput = {
  title: string;
  startsAt: Date;
  endsAt?: Date;
  placeId?: string;
  placeLabel?: string;
  circleIds?: string[];
  hiddenFrom?: string[];
};

export async function createEventAndAttend(
  actorId: string,
  input: NewEventInput,
): Promise<Result<PublishedTo & { eventId: string }>> {
  const title = eventTitleSchema.safeParse(input.title);
  if (!title.success) return ko("titre_invalide");
  if (input.endsAt && input.endsAt < input.startsAt) return ko("dates_invalides");

  // La commune vient du lieu choisi au catalogue, quand il y en a un.
  const [lieu] = input.placeId
    ? await db
        .select({ commune: s.place.commune })
        .from(s.place)
        .where(eq(s.place.id, input.placeId))
        .limit(1)
    : [];

  const [event] = await db
    .insert(s.event)
    .values({
      title: title.data,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      placeId: input.placeId,
      placeLabel: input.placeLabel,
      commune: lieu?.commune ?? null,
      origin: "parent",
      createdBy: actorId,
      // Saisie par un parent : publiée immédiatement, pas de file de relecture.
      publishedAt: sql`now()`,
    })
    .returning();

  const attendance = await declareAttendance(actorId, {
    eventId: event.id,
    circleIds: input.circleIds,
    hiddenFrom: input.hiddenFrom,
  });

  if (!attendance.ok) return attendance;
  return ok({ ...attendance.value, eventId: event.id });
}

/* ------------------------------------------------------------------ retrait */

export async function withdraw(
  actorId: string,
  publicationId: string,
): Promise<Result<void>> {
  const [publication] = await db
    .select({ authorId: s.publication.authorId })
    .from(s.publication)
    .where(eq(s.publication.id, publicationId))
    .limit(1);

  if (!publication) return ko("publication_inconnue");
  if (publication.authorId !== actorId) return ko("pas_auteur");

  await db.execute(sql`
    update publication set withdrawn_at = now()
    where id = ${publicationId} and withdrawn_at is null
  `);
  return ok(undefined as void);
}

/* ------------------------------------------------------------------ lectures */

/** L'écran principal : qui est dehors en ce moment, parmi les cercles qu'on suit. */
export function currentlyOut(actorId: string): Promise<VisiblePublication[]> {
  return visiblePublications(actorId, { kind: "presence", onlyStarted: true });
}

/** Les sorties annoncées pour plus tard — « nous serons au parc à 15h ». */
export function upcomingOutings(actorId: string): Promise<VisiblePublication[]> {
  return visiblePublications(actorId, { kind: "presence", onlyUpcoming: true });
}

/**
 * Trois durées proposées à l'écran, dont une qui dépend de l'heure qu'il est.
 * « jusqu'à midi » à 9 h du matin dit quelque chose ; « 180 minutes » non.
 */
export function dureesProposees(maintenant = new Date()): {
  minutes: number;
  libelle: string;
}[] {
  // On lit la partie « heure » plutôt que la chaîne entière : en français, une heure seule
  // se formate « 07 h », que Number() ne sait pas lire.
  const parties = new Intl.DateTimeFormat("fr-CH", {
    hour: "numeric",
    hour12: false,
    timeZone: "Europe/Zurich",
  }).formatToParts(maintenant);

  const heure = Number(parties.find((p) => p.type === "hour")?.value ?? NaN);

  // Un repère de fin naturel : midi le matin, 18 h l'après-midi.
  const repere = heure < 11 ? 12 : 18;
  const minutesJusquAuRepere = (repere - heure) * 60;

  // Les trois propositions doivent être distinctes : à 16 h, « jusqu'à 18h » vaudrait
  // exactement 2 heures et l'on afficherait deux fois le même bouton.
  const contextuelleUtilisable =
    minutesJusquAuRepere > 120 && minutesJusquAuRepere <= DUREE_MAX_MINUTES;

  const contextuelle = contextuelleUtilisable
    ? { minutes: minutesJusquAuRepere, libelle: `jusqu'à ${repere}h` }
    : { minutes: 240, libelle: "4 h" };

  return [{ minutes: 60, libelle: "1 h" }, { minutes: 120, libelle: "2 h" }, contextuelle];
}

/** Les participations visibles à une activité du calendrier. */
export function attendanceFor(
  actorId: string,
  eventId: string,
): Promise<VisiblePublication[]> {
  return visiblePublications(actorId, { kind: "attendance", eventId });
}

/* ------------------------------------------------------------------- purge */

/**
 * Efface les publications expirées. Rien ne subsiste : une présence passée n'a pas
 * vocation à devenir un historique de déplacement, même agrégé.
 * À appeler par une tâche planifiée.
 */
export async function purgeExpired(): Promise<number> {
  const rows = await db.execute<{ id: string }>(sql`
    delete from publication
    where ends_at < now() - interval '${sql.raw(RETENTION_APRES_EXPIRATION)}'
    returning id
  `);
  return rows.length;
}

async function attachAudience(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  publicationId: string,
  circles: { id: string }[],
  hiddenFrom?: string[],
): Promise<void> {
  await tx
    .insert(s.publicationCircle)
    .values(circles.map((c) => ({ publicationId, circleId: c.id })));

  if (hiddenFrom && hiddenFrom.length > 0) {
    await tx
      .insert(s.publicationHiddenFrom)
      .values([...new Set(hiddenFrom)].map((accountId) => ({ publicationId, accountId })));
  }
}

/** Inscrit une famille à une sortie, avec les enfants qu'elle amène. */
async function attachParticipant(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  publicationId: string,
  accountId: string,
  children: string[],
): Promise<void> {
  await tx
    .insert(s.publicationParticipant)
    .values({ publicationId, accountId })
    .onConflictDoNothing();

  if (children.length > 0) {
    await tx
      .insert(s.publicationParticipantChild)
      .values(children.map((childId) => ({ publicationId, accountId, childId })));
  }
}
