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

import { db, type Executor } from "./db";
import * as s from "./db/schema";
import { normaliser } from "./texte";
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
    await rattacherAuxCoparents(tx, actorId, child.id);

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
 * Le lien entre deux parents, et ce qu'il vaut.
 *
 * Il ne fusionne pas deux comptes. Chacun garde son adresse, ses cercles, ses réglages, et
 * une sortie continue de porter le nom de qui l'a publiée : c'est ce qui permet au cercle
 * de lire « Sophie au parc avec Léa » plutôt qu'une famille sans visage.
 *
 * Ce qu'il partage, ce sont les enfants, et il les partage pour la suite : un enfant ajouté
 * par l'un devient l'enfant de l'autre. Le lien ne valait auparavant qu'à la seconde où on
 * l'acceptait, si bien que le petit dernier restait invisible chez l'autre parent sans que
 * rien ne le dise — d'où l'impression, juste, qu'on recopiait une liste.
 */

/** Les deux comptes rangés comme la base l'exige : accountA < accountB. */
function paire(x: string, y: string): { a: string; b: string } {
  return x < y ? { a: x, b: y } : { a: y, b: x };
}

/** Un enfant ajouté par l'un est l'enfant des deux. */
async function rattacherAuxCoparents(
  exec: Executor,
  actorId: string,
  childId: string,
): Promise<void> {
  await exec.execute(sql`
    insert into child_parent (child_id, account_id)
    select ${childId}::uuid,
           case when account_a = ${actorId} then account_b else account_a end
    from coparent
    where account_a = ${actorId} or account_b = ${actorId}
    on conflict do nothing
  `);
}

export type Coparent = { id: string; displayName: string };

/** Avec qui je partage mes enfants. */
export async function coparents(actorId: string): Promise<Coparent[]> {
  const rows = await db.execute<{ id: string; display_name: string }>(sql`
    select a.id, a.display_name
    from coparent c
    join account a
      on a.id = case when c.account_a = ${actorId} then c.account_b else c.account_a end
     and a.deleted_at is null
    where c.account_a = ${actorId} or c.account_b = ${actorId}
    order by a.display_name asc
  `);

  return rows.map((r) => ({ id: r.id, displayName: r.display_name }));
}

/**
 * Défait le lien. Ce qui a été partagé le reste : les deux comptes demeurent parents des
 * enfants qu'ils ont en commun, et chacun peut retirer les siens un par un. Seule la suite
 * s'arrête. L'autre parent n'est prévenu de rien ; le lien disparaît de son écran.
 */
export async function unlinkCoparent(actorId: string, otherId: string): Promise<void> {
  const { a, b } = paire(actorId, otherId);
  await db.execute(sql`delete from coparent where account_a = ${a} and account_b = ${b}`);
}

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

/**
 * Le nom du parent qui invite, lisible avant d'avoir un compte.
 *
 * Même raison que pour le nom du cercle sur l'écran d'invitation : celui qui suit ce lien
 * l'a reçu d'une personne qu'il connaît, et on lui demandait son adresse électronique avant
 * de lui dire de quoi il s'agissait. Le jeton fait trente-deux octets tirés au hasard :
 * qui n'en a pas reçu un n'apprend rien.
 */
export async function parentNameForInvite(token: string): Promise<string | null> {
  const rows = await db.execute<{ display_name: string }>(sql`
    select a.display_name
    from coparent_invite i
    join account a on a.id = i.created_by
    where i.token_hash = ${hashToken(token)}
      and i.used_at is null and i.revoked_at is null and i.expires_at > now()
  `);

  return rows[0]?.display_name ?? null;
}

/** Un lien créé, pas encore utilisé : de quoi proposer de l'annuler. */
export async function hasPendingCoparentInvite(actorId: string): Promise<boolean> {
  const rows = await db.execute<{ un: number }>(sql`
    select 1 as un from coparent_invite
    where created_by = ${actorId} and used_at is null and revoked_at is null
      and expires_at > now()
    limit 1
  `);

  return rows.length > 0;
}

/**
 * Accepte l'invitation : les deux comptes deviennent parents des mêmes enfants, et le
 * restent pour ceux qui viendront.
 *
 * La mise en commun va dans les deux sens. Le cas ordinaire est que chacun a créé son
 * compte de son côté et y a tapé ses enfants ; ne verser que ceux de l'émetteur laisserait
 * la moitié de la famille d'un seul côté. Deux prénoms identiques donnent alors deux fiches,
 * que l'écran du compte propose de réunir — l'app ne décide jamais toute seule que deux
 * prénoms désignent le même enfant.
 */
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

    const { a, b } = paire(actorId, invite.created_by);

    await tx.execute(sql`
      insert into coparent (account_a, account_b) values (${a}, ${b}) on conflict do nothing
    `);

    const rattaches = await tx.execute<{ account_id: string }>(sql`
      insert into child_parent (child_id, account_id)
      select cp.child_id,
             case when cp.account_id = ${a} then ${b}::uuid else ${a}::uuid end
      from child_parent cp
      join child c on c.id = cp.child_id and c.deleted_at is null
      where cp.account_id in (${a}, ${b})
      on conflict do nothing
      returning account_id
    `);

    await tx.execute(sql`
      update coparent_invite set used_at = now(), used_by = ${actorId} where id = ${invite.id}
    `);

    return ok({ children: rattaches.filter((r) => r.account_id === actorId).length });
  });
}

/**
 * Réunit deux fiches qui désignent le même enfant.
 *
 * Le cas qui l'exige : deux parents ont chacun créé leur compte et tapé « Léa », puis se
 * sont liés. Rien dans la base ne permet de deviner qu'il s'agit du même enfant — deux
 * prénoms identiques sous le même toit existent, et déduire sur un prénom est précisément ce
 * que PRODUIT.md refuse. C'est donc un parent qui l'affirme, d'un geste, sur son écran.
 *
 * La fiche absorbée cède ses cercles, ses parents et ses présences passées, puis s'efface.
 * Les sorties déjà publiées gardent le bon enfant plutôt que d'en perdre un.
 */
export async function mergeChildren(
  actorId: string,
  keepId: string,
  absorbId: string,
): Promise<Result<void>> {
  if (keepId === absorbId) return ko("enfant_inconnu");
  if (!(await isParentOf(actorId, keepId))) return ko("pas_parent");
  if (!(await isParentOf(actorId, absorbId))) return ko("pas_parent");

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into child_parent (child_id, account_id)
      select ${keepId}::uuid, account_id from child_parent where child_id = ${absorbId}
      on conflict do nothing
    `);
    await tx.execute(sql`delete from child_parent where child_id = ${absorbId}`);

    await tx.execute(sql`
      insert into child_circle (child_id, circle_id)
      select ${keepId}::uuid, circle_id from child_circle where child_id = ${absorbId}
      on conflict do nothing
    `);
    await tx.execute(sql`delete from child_circle where child_id = ${absorbId}`);

    // Une sortie qui nommait déjà les deux fiches ne peut pas nommer deux fois la même :
    // on retire le doublon avant de reporter le reste.
    await tx.execute(sql`
      delete from publication_participant_child d
      where d.child_id = ${absorbId}
        and exists (
          select 1 from publication_participant_child k
          where k.publication_id = d.publication_id
            and k.account_id = d.account_id
            and k.child_id = ${keepId}
        )
    `);
    await tx.execute(sql`
      update publication_participant_child set child_id = ${keepId} where child_id = ${absorbId}
    `);

    await tx.execute(sql`update child set deleted_at = now() where id = ${absorbId}`);
  });

  return ok(undefined as void);
}

/**
 * Les fiches qui portent le même prénom, groupées, la plus ancienne en tête.
 *
 * Calculé sur la liste déjà chargée : l'écran du compte connaît ses enfants, ce n'est pas
 * à la base de recompter. L'accent ne fait pas la différence — « Lea » et « Léa » sont la
 * même question posée au parent.
 */
export function duplicateChildren(children: Child[]): Child[][] {
  const parPrenom = new Map<string, Child[]>();
  for (const enfant of children) {
    const cle = normaliser(enfant.firstName);
    parPrenom.set(cle, [...(parPrenom.get(cle) ?? []), enfant]);
  }

  return [...parPrenom.values()]
    .filter((groupe) => groupe.length > 1)
    .map((groupe) =>
      [...groupe].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime()),
    );
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
