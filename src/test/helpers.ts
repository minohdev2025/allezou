/** Fabriques pour les tests. Rien ici ne doit contourner le schéma : tout passe par les tables. */

import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import * as s from "@/lib/db/schema";

export type Account = typeof s.account.$inferSelect;
export type Circle = typeof s.circle.$inferSelect;
export type Place = typeof s.place.$inferSelect;
export type Event = typeof s.event.$inferSelect;
export type Publication = typeof s.publication.$inferSelect;

let counter = 0;

export async function resetDatabase(): Promise<void> {
  await db.execute(sql`
    truncate table
      account, child, child_parent, coparent_invite,
      circle, circle_membership, circle_link_cut, circle_invite, circle_join_request,
      place, place_rename_proposal, place_rename_vote,
      source, event,
      publication, publication_circle, publication_hidden_from,
      publication_participant, publication_participant_child,
      notification_pref, notification_mute, push_subscription,
      magic_link, session, audit_log
    restart identity cascade
  `);
  counter = 0;
}

export function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

export async function createAccount(displayName?: string): Promise<Account> {
  counter += 1;
  const n = counter;
  const [row] = await db
    .insert(s.account)
    .values({
      email: `parent${n}@example.test`,
      displayName: displayName ?? `Parent ${n}`,
    })
    .returning();
  return row;
}

/** Crée un cercle dont `admin` est administrateur et membre actif. */
export async function createCircle(admin: Account, name = "Classe 4P"): Promise<Circle> {
  const [row] = await db
    .insert(s.circle)
    .values({ name, createdBy: admin.id })
    .returning();
  await db.insert(s.circleMembership).values({
    circleId: row.id,
    accountId: admin.id,
    role: "admin",
  });
  return row;
}

export async function join(
  circle: Circle,
  account: Account,
  options: { role?: "admin" | "member"; joinedAt?: Date } = {},
): Promise<void> {
  await db.insert(s.circleMembership).values({
    circleId: circle.id,
    accountId: account.id,
    role: options.role ?? "member",
    ...(options.joinedAt ? { joinedAt: options.joinedAt } : {}),
  });
}

/**
 * Par défaut, l'heure vient de la base et non de Node : les deux horloges diffèrent de
 * quelques millisecondes, ce qui suffit à faire sortir quelqu'un avant son entrée.
 */
export async function leave(circle: Circle, account: Account, at?: Date): Promise<void> {
  await db.execute(sql`
    update circle_membership
    set left_at = ${at ? sql`${at.toISOString()}::timestamptz` : sql`now()`}
    where circle_id = ${circle.id}
      and account_id = ${account.id}
      and left_at is null
  `);
}

/** Range les deux comptes dans l'ordre canonique imposé en base. */
function canonicalPair(a: Account, b: Account): [string, string] {
  return a.id < b.id ? [a.id, b.id] : [b.id, a.id];
}

/** Coupe le lien entre deux membres d'un cercle. Symétrique : une seule ligne. */
export async function cutLink(
  circle: Circle,
  a: Account,
  b: Account,
  by: Account = a,
): Promise<void> {
  const [accountA, accountB] = canonicalPair(a, b);
  await db.insert(s.circleLinkCut).values({
    circleId: circle.id,
    accountA,
    accountB,
    cutBy: by.id,
  });
}

export async function createPlace(name = "Parc du Gué", by?: Account): Promise<Place> {
  const [row] = await db
    .insert(s.place)
    .values({ name, commune: "Lancy", createdBy: by?.id })
    .returning();
  return row;
}

export async function createEvent(
  options: {
    title?: string;
    startsAt?: Date;
    endsAt?: Date;
    by?: Account;
    minAge?: number;
    maxAge?: number;
    commune?: string;
    tarif?: "gratuit" | "payant" | "inconnu";
    acces?: "libre" | "inscription" | "inconnu";
    /** La source ne l'annonce plus. */
    retiree?: boolean;
  } = {},
): Promise<Event> {
  const startsAt = options.startsAt ?? minutesFromNow(60);
  const [row] = await db
    .insert(s.event)
    .values({
      title: options.title ?? "Visite du Muséum",
      startsAt,
      endsAt: options.endsAt ?? new Date(startsAt.getTime() + 2 * 3_600_000),
      minAge: options.minAge,
      maxAge: options.maxAge,
      commune: options.commune,
      tarif: options.tarif,
      acces: options.acces,
      withdrawnAt: options.retiree ? new Date() : undefined,
      origin: "parent",
      createdBy: options.by?.id,
      publishedAt: new Date(),
    })
    .returning();
  return row;
}

/** « Nous sommes au parc jusqu'à telle heure », visible par les cercles indiqués. */
export async function declarePresence(options: {
  author: Account;
  place: Place;
  circles: Circle[];
  startsAt?: Date;
  endsAt?: Date;
  hiddenFrom?: Account[];
  note?: string;
}): Promise<Publication> {
  const [row] = await db
    .insert(s.publication)
    .values({
      authorId: options.author.id,
      kind: "presence",
      placeId: options.place.id,
      note: options.note,
      startsAt: options.startsAt ?? minutesFromNow(-5),
      endsAt: options.endsAt ?? minutesFromNow(120),
    })
    .returning();

  await attachAudience(row, options.circles, options.hiddenFrom);
  return row;
}

/** « Nous serons à cette activité », rattachée à une entrée du calendrier. */
export async function declareAttendance(options: {
  author: Account;
  event: Event;
  circles: Circle[];
  hiddenFrom?: Account[];
}): Promise<Publication> {
  const [row] = await db
    .insert(s.publication)
    .values({
      authorId: options.author.id,
      kind: "attendance",
      eventId: options.event.id,
      startsAt: options.event.startsAt,
      endsAt: options.event.endsAt ?? minutesFromNow(240),
    })
    .returning();

  await attachAudience(row, options.circles, options.hiddenFrom);
  return row;
}

async function attachAudience(
  publication: Publication,
  circles: Circle[],
  hiddenFrom?: Account[],
): Promise<void> {
  if (circles.length > 0) {
    await db.insert(s.publicationCircle).values(
      circles.map((c) => ({ publicationId: publication.id, circleId: c.id })),
    );
  }
  if (hiddenFrom && hiddenFrom.length > 0) {
    await db.insert(s.publicationHiddenFrom).values(
      hiddenFrom.map((a) => ({ publicationId: publication.id, accountId: a.id })),
    );
  }
  // L'auteur figure toujours parmi les participants, comme en production.
  await db
    .insert(s.publicationParticipant)
    .values({ publicationId: publication.id, accountId: publication.authorId })
    .onConflictDoNothing();
}

export async function createChild(
  parent: Account,
  firstName = "Matéo",
): Promise<typeof s.child.$inferSelect> {
  const [row] = await db.insert(s.child).values({ firstName }).returning();
  await db.insert(s.childParent).values({ childId: row.id, accountId: parent.id });
  return row;
}

export async function createSource(options: {
  name?: string;
  url?: string;
  kind?: "ical" | "jsonld" | "html_ai";
  autoPublish?: boolean;
  active?: boolean;
}): Promise<typeof s.source.$inferSelect> {
  const [row] = await db
    .insert(s.source)
    .values({
      name: options.name ?? "Agenda de test",
      url: options.url ?? "https://example.test/agenda",
      kind: options.kind ?? "jsonld",
      autoPublish: options.autoPublish ?? false,
      active: options.active ?? true,
    })
    .returning();
  return row;
}

export async function withdraw(publication: Publication): Promise<void> {
  await db.execute(sql`
    update publication set withdrawn_at = now() where id = ${publication.id}
  `);
}

export async function deleteAccount(account: Account): Promise<void> {
  await db.execute(sql`
    update account set deleted_at = now() where id = ${account.id}
  `);
}

export async function archiveCircle(circle: Circle): Promise<void> {
  await db.execute(sql`
    update circle set archived_at = now() where id = ${circle.id}
  `);
}
