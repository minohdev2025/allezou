/**
 * Les enfants d'un compte, et le lien entre deux parents.
 *
 * Un enfant n'est **qu'un prénom**. Pas de nom de famille, pas d'année de naissance, pas de
 * photo, pas de genre, pas d'école. Les membres d'un cercle connaissent déjà les enfants
 * dont il est question — l'app n'a rien à ajouter. Revenir là-dessus demande une décision
 * explicite et écrite (PRODUIT.md), pas un champ ajouté au passage.
 *
 * Un enfant peut être rattaché à deux comptes : chaque parent voit et déclare les mêmes
 * enfants. Le lien se crée par invitation, jamais par déduction sur un nom ou une adresse.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "./db";
import * as s from "./db/schema";
import { generateToken, hashToken } from "./tokens";

export const DUREE_INVITATION_COPARENT_JOURS = 14;

export const firstNameSchema = z.string().trim().min(1).max(40);

export type ChildError =
  | "prenom_invalide"
  | "enfant_inconnu"
  | "pas_parent"
  | "pas_membre"
  | "invitation_inconnue"
  | "invitation_expiree"
  | "invitation_utilisee"
  | "invitation_revoquee"
  | "invitation_a_soi";

export type Result<T> = { ok: true; value: T } | { ok: false; reason: ChildError };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const ko = <T>(reason: ChildError): Result<T> => ({ ok: false, reason });

export type Child = typeof s.child.$inferSelect;

export async function addChild(
  actorId: string,
  input: { firstName: string },
): Promise<Result<Child>> {
  const firstName = firstNameSchema.safeParse(input.firstName);
  if (!firstName.success) return ko("prenom_invalide");

  return db.transaction(async (tx) => {
    const [child] = await tx
      .insert(s.child)
      .values({ firstName: firstName.data })
      .returning();

    await tx.insert(s.childParent).values({ childId: child.id, accountId: actorId });

    return ok(child);
  });
}

/** Les enfants d'un compte, y compris ceux partagés avec l'autre parent. */
export async function myChildren(actorId: string): Promise<Child[]> {
  return db
    .select({
      id: s.child.id,
      firstName: s.child.firstName,
      createdAt: s.child.createdAt,
      deletedAt: s.child.deletedAt,
    })
    .from(s.childParent)
    .innerJoin(s.child, eq(s.child.id, s.childParent.childId))
    .where(and(eq(s.childParent.accountId, actorId), isNull(s.child.deletedAt)))
    .orderBy(s.child.firstName);
}

export async function isParentOf(actorId: string, childId: string): Promise<boolean> {
  const rows = await db
    .select({ childId: s.childParent.childId })
    .from(s.childParent)
    .innerJoin(s.child, eq(s.child.id, s.childParent.childId))
    .where(
      and(
        eq(s.childParent.accountId, actorId),
        eq(s.childParent.childId, childId),
        isNull(s.child.deletedAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function renameChild(
  actorId: string,
  childId: string,
  firstName: string,
): Promise<Result<void>> {
  const parsed = firstNameSchema.safeParse(firstName);
  if (!parsed.success) return ko("prenom_invalide");
  if (!(await isParentOf(actorId, childId))) return ko("pas_parent");

  await db.update(s.child).set({ firstName: parsed.data }).where(eq(s.child.id, childId));
  return ok(undefined as void);
}

/**
 * Retire un enfant. L'autre parent, s'il existe, garde le sien : on ne supprime la fiche
 * que lorsque plus personne n'y est rattaché.
 */
export async function removeChild(actorId: string, childId: string): Promise<Result<void>> {
  if (!(await isParentOf(actorId, childId))) return ko("pas_parent");

  return db.transaction(async (tx) => {
    await tx
      .delete(s.childParent)
      .where(
        and(eq(s.childParent.childId, childId), eq(s.childParent.accountId, actorId)),
      );

    const restants = await tx
      .select({ accountId: s.childParent.accountId })
      .from(s.childParent)
      .where(eq(s.childParent.childId, childId))
      .limit(1);

    if (restants.length === 0) {
      await tx.update(s.child).set({ deletedAt: sql`now()` }).where(eq(s.child.id, childId));
    }

    return ok(undefined as void);
  });
}

/* -------------------------------------------------------------- co-parents */

/**
 * Invite l'autre parent à rejoindre les mêmes enfants. Le lien se partage comme on veut —
 * par message, de vive voix — et ne vaut qu'une fois.
 */
export async function inviteCoparent(actorId: string): Promise<{ token: string }> {
  const token = generateToken();
  await db.insert(s.coparentInvite).values({
    createdBy: actorId,
    tokenHash: hashToken(token),
    expiresAt: sql`now() + make_interval(days => ${DUREE_INVITATION_COPARENT_JOURS})`,
  });
  return { token };
}

/** Accepte l'invitation : les enfants de l'émetteur deviennent aussi les siens. */
export async function acceptCoparent(
  actorId: string,
  token: string,
): Promise<Result<{ children: number }>> {
  return db.transaction(async (tx) => {
    const rows = await tx.execute<{
      id: string;
      created_by: string;
      used: boolean;
      revoked: boolean;
      expired: boolean;
    }>(sql`
      select
        id, created_by,
        (used_at is not null) as used,
        (revoked_at is not null) as revoked,
        (expires_at <= now()) as expired
      from coparent_invite
      where token_hash = ${hashToken(token)}
      for update
    `);

    const invite = rows[0];
    if (!invite) return ko<{ children: number }>("invitation_inconnue");
    if (invite.revoked) return ko<{ children: number }>("invitation_revoquee");
    if (invite.used) return ko<{ children: number }>("invitation_utilisee");
    if (invite.expired) return ko<{ children: number }>("invitation_expiree");
    if (invite.created_by === actorId) return ko<{ children: number }>("invitation_a_soi");

    const rattaches = await tx.execute<{ child_id: string }>(sql`
      insert into child_parent (child_id, account_id)
      select cp.child_id, ${actorId}
      from child_parent cp
      join child c on c.id = cp.child_id and c.deleted_at is null
      where cp.account_id = ${invite.created_by}
      on conflict do nothing
      returning child_id
    `);

    await tx.execute(sql`
      update coparent_invite set used_at = now(), used_by = ${actorId} where id = ${invite.id}
    `);

    return ok({ children: rattaches.length });
  });
}

export async function revokeCoparentInvite(actorId: string): Promise<void> {
  await db.execute(sql`
    update coparent_invite set revoked_at = now()
    where created_by = ${actorId} and used_at is null and revoked_at is null
  `);
}

/* ------------------------------------------------ quel enfant, quel cercle */

/**
 * Pourquoi je suis dans ce cercle.
 *
 * Presque toujours parce qu'un de mes enfants est dans cette classe. Le dire permet de ne
 * plus adresser au cercle de l'aînée une sortie où seul le petit est venu. Un cercle de
 * voisinage n'en porte aucun.
 *
 * Le lien appartient à l'enfant, pas au compte qui l'a posé : les deux parents d'un même
 * enfant voient donc le même rattachement, et chacun peut le défaire. C'est le bon
 * comportement — une classe est un fait, pas une préférence, et deux parents n'ont pas à
 * la déclarer chacun de leur côté — mais ce n'est pas ce que « personnel » laissait
 * entendre. Les autres membres du cercle, eux, n'en apprennent rien : chacun ne voit dans
 * cet écran que ses propres enfants.
 */
export type EnfantDuCercle = { id: string; firstName: string; lie: boolean };

export async function childrenInCircle(
  actorId: string,
  circleId: string,
): Promise<EnfantDuCercle[]> {
  const rows = await db.execute<{ id: string; first_name: string; lie: boolean }>(sql`
    select ch.id, ch.first_name,
           exists (
             select 1 from child_circle cc
             where cc.child_id = ch.id and cc.circle_id = ${circleId}
           ) as lie
    from child_parent cp
    join child ch on ch.id = cp.child_id and ch.deleted_at is null
    where cp.account_id = ${actorId}
    order by ch.first_name asc
  `);

  return rows.map((r) => ({ id: r.id, firstName: r.first_name, lie: r.lie }));
}

/**
 * Rattache ou détache un enfant d'un cercle.
 *
 * Deux gardes, et pas une de moins : il faut être parent de cet enfant, et membre actif de
 * ce cercle. Une action serveur est joignable par une requête directe, et sans la seconde
 * garde n'importe qui apprendrait l'existence d'un cercle en tentant de s'y rattacher.
 */
export async function setChildInCircle(
  actorId: string,
  childId: string,
  circleId: string,
  lie: boolean,
): Promise<Result<void>> {
  if (!(await isParentOf(actorId, childId))) return ko("pas_parent");

  const [membre] = await db
    .select({ id: s.circleMembership.accountId })
    .from(s.circleMembership)
    .where(
      and(
        eq(s.circleMembership.accountId, actorId),
        eq(s.circleMembership.circleId, circleId),
        isNull(s.circleMembership.leftAt),
      ),
    )
    .limit(1);

  if (!membre) return ko("pas_membre");

  if (lie) {
    await db.insert(s.childCircle).values({ childId, circleId }).onConflictDoNothing();
  } else {
    await db
      .delete(s.childCircle)
      .where(and(eq(s.childCircle.childId, childId), eq(s.childCircle.circleId, circleId)));
  }

  return ok(undefined as void);
}

/** Les cercles que chacun de mes enfants concerne, pour l'écran de sortie. */
export async function circlesByChild(actorId: string): Promise<Record<string, string[]>> {
  const rows = await db.execute<{ child_id: string; circle_id: string }>(sql`
    select cc.child_id, cc.circle_id
    from child_circle cc
    join child_parent cp on cp.child_id = cc.child_id and cp.account_id = ${actorId}
    join circle_membership m
      on m.circle_id = cc.circle_id and m.account_id = ${actorId} and m.left_at is null
  `);

  const parEnfant: Record<string, string[]> = {};
  for (const r of rows) {
    parEnfant[r.child_id] = [...(parEnfant[r.child_id] ?? []), r.circle_id];
  }
  return parEnfant;
}
