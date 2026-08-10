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
