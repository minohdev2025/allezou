/**
 * Cercles, invitations, rôles.
 *
 * C'est ici que se joue le vrai verrou du produit. L'isolation technique peut être parfaite
 * et le produit échouer quand même, par une invitation transmise trop loin : la composition
 * du cercle compte autant que la règle de visibilité.
 *
 * Le parcours d'entrée est donc en deux temps — un membre partage un lien, l'administrateur
 * valide la personne. Suivre le lien ne fait entrer personne : cela dépose une demande.
 * Tant qu'elle est en attente, la personne n'est membre de rien et ne voit rien, ce que le
 * schéma garantit en gardant les demandes hors de la table des membres.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { recordAudit } from "./audit";
import { db, type Executor } from "./db";
import { asDate } from "./db/rows";
import * as s from "./db/schema";
import { generateToken, hashToken } from "./tokens";
import { isActiveMember, isCircleAdmin } from "./visibility";

/**
 * Une semaine par défaut, et le nombre de familles annoncé par celui qui invite.
 *
 * Un lien qui reste ouvert est une porte qu'on oublie d'avoir laissée ouverte. Après ce
 * délai le cercle continue de vivre normalement : c'est seulement l'entrée qui se referme,
 * et il faut un nouveau lien pour la rouvrir.
 */
export const DUREE_INVITATION_JOURS = 7;
export const USAGES_INVITATION_PAR_DEFAUT = 20;
export const USAGES_INVITATION_MAX = 100;
export const DUREE_INVITATION_MAX_JOURS = 60;

export const circleNameSchema = z.string().trim().min(1).max(60);

export type CircleError =
  | "nom_invalide"
  | "pas_membre"
  | "cercle_inconnu"
  | "pas_admin"
  | "invitation_inconnue"
  | "invitation_revoquee"
  | "invitation_expiree"
  | "invitation_epuisee"
  | "deja_membre"
  | "demande_inconnue"
  | "demande_deja_traitee"
  | "cible_inconnue"
  | "action_sur_soi";

export type Result<T> = { ok: true; value: T } | { ok: false; reason: CircleError };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const ko = <T>(reason: CircleError): Result<T> => ({ ok: false, reason });

type Circle = typeof s.circle.$inferSelect;
type CircleInvite = typeof s.circleInvite.$inferSelect;
type JoinRequest = typeof s.circleJoinRequest.$inferSelect;

/* ------------------------------------------------------------------ création */

export async function createCircle(actorId: string, rawName: string): Promise<Result<Circle>> {
  const name = circleNameSchema.safeParse(rawName);
  if (!name.success) return ko("nom_invalide");

  return db.transaction(async (tx) => {
    const [circle] = await tx
      .insert(s.circle)
      .values({ name: name.data, createdBy: actorId })
      .returning();

    await tx.insert(s.circleMembership).values({
      circleId: circle.id,
      accountId: actorId,
      role: "admin",
    });

    await recordAudit(tx, {
      action: "cercle.cree",
      actorId,
      circleId: circle.id,
      detail: { nom: circle.name },
    });

    return ok(circle);
  });
}

/* ---------------------------------------------------------------- invitations */

/**
 * N'importe quel membre actif peut créer un lien d'invitation — c'est le « membre propose ».
 * Le lien seul ne fait entrer personne.
 */
export async function createInvite(
  actorId: string,
  circleId: string,
  options: { maxUses?: number; days?: number } = {},
): Promise<Result<{ token: string; invite: CircleInvite }>> {
  if (!(await isActiveMember(actorId, circleId))) return ko("pas_membre");

  // Bornes appliquées ici et pas seulement à l'écran : une action serveur est joignable
  // par une requête directe, un champ de formulaire ne protège rien.
  const maxUses = Math.min(
    Math.max(options.maxUses ?? USAGES_INVITATION_PAR_DEFAUT, 1),
    USAGES_INVITATION_MAX,
  );
  const days = Math.min(
    Math.max(options.days ?? DUREE_INVITATION_JOURS, 1),
    DUREE_INVITATION_MAX_JOURS,
  );
  const token = generateToken();

  return db.transaction(async (tx) => {
    const [invite] = await tx
      .insert(s.circleInvite)
      .values({
        circleId,
        createdBy: actorId,
        tokenHash: hashToken(token),
        maxUses,
        expiresAt: sql`now() + make_interval(days => ${days})`,
      })
      .returning();

    await recordAudit(tx, {
      action: "cercle.invitation.creee",
      actorId,
      circleId,
      detail: { usages: maxUses, jours: days },
    });

    return ok({ token, invite });
  });
}

/** Révocable par un administrateur du cercle, ou par la personne qui l'a créée. */
export async function revokeInvite(actorId: string, inviteId: string): Promise<Result<void>> {
  const [invite] = await db
    .select()
    .from(s.circleInvite)
    .where(eq(s.circleInvite.id, inviteId))
    .limit(1);

  if (!invite) return ko("invitation_inconnue");

  const admin = await isCircleAdmin(actorId, invite.circleId);
  if (!admin && invite.createdBy !== actorId) return ko("pas_admin");

  return db.transaction(async (tx) => {
    await tx.execute(sql`
      update circle_invite set revoked_at = now()
      where id = ${inviteId} and revoked_at is null
    `);
    await recordAudit(tx, {
      action: "cercle.invitation.revoquee",
      actorId,
      circleId: invite.circleId,
    });
    return ok(undefined as void);
  });
}

/**
 * Le nom du cercle derrière un lien d'invitation, ou rien.
 *
 * Celui qui arrive par WhatsApp voyait « Quelqu'un vous a transmis une invitation » et
 * devait donner son adresse électronique pour apprendre où il entrait. Nommer le cercle
 * lève cette hésitation au moment exact où elle se produit.
 *
 * Ce que cela divulgue, et à qui : le nom d'un cercle, à quelqu'un qui détient déjà le
 * jeton. Détenir le jeton, c'est avoir reçu le lien — et ce lien fait bien plus que nommer,
 * il fait entrer. Le remède si un lien va trop loin reste le même qu'avant : le révoquer.
 *
 * Un jeton révoqué, expiré, épuisé ou inventé rend `null`, tous les quatre de la même
 * façon. Distinguer « ce lien a expiré » de « ce lien n'a jamais existé » ici apprendrait à
 * qui essaie des jetons au hasard lesquels ont déjà servi.
 *
 * Le nom rendu est celui d'origine, jamais un alias : l'alias est le nom qu'un membre s'est
 * donné pour lui-même, et il n'a rien à faire chez quelqu'un qui n'est pas encore entré.
 */
export type InvitationLisible = { circleName: string; expiresAt: Date };

export async function inviteInfoForToken(token: string): Promise<InvitationLisible | null> {
  const rows = await db.execute<{ name: string; expires_at: Date }>(sql`
    select c.name, i.expires_at
    from circle_invite i
    join circle c on c.id = i.circle_id and c.archived_at is null
    where i.token_hash = ${hashToken(token)}
      and i.revoked_at is null
      and i.expires_at > now()
      and i.use_count < i.max_uses
    limit 1
  `);

  const invite = rows[0];
  return invite ? { circleName: invite.name, expiresAt: asDate(invite.expires_at) } : null;
}

/** Le seul nom du cercle, pour l'écran qui accueille celui qui suit le lien. */
export async function circleNameForInvite(token: string): Promise<string | null> {
  return (await inviteInfoForToken(token))?.circleName ?? null;
}

/**
 * Suivre un lien d'invitation. Dépose une demande en attente — n'accorde aucun accès.
 *
 * L'usage du lien est décompté ici et non à la validation : un lien « valable 20 fois »
 * compte les personnes qui l'ont suivi, pas celles que l'admin a acceptées. C'est la lecture
 * prudente de « usage limité ».
 */
export async function requestJoin(
  actorId: string,
  token: string,
): Promise<Result<JoinRequest>> {
  return db.transaction(async (tx) => {
    const rows = await tx.execute<{
      id: string;
      circle_id: string;
      revoked: boolean;
      expired: boolean;
      exhausted: boolean;
    }>(sql`
      select
        id,
        circle_id,
        (revoked_at is not null) as revoked,
        (expires_at <= now()) as expired,
        (use_count >= max_uses) as exhausted
      from circle_invite
      where token_hash = ${hashToken(token)}
      for update
    `);

    const invite = rows[0];
    if (!invite) return ko<JoinRequest>("invitation_inconnue");
    if (invite.revoked) return ko<JoinRequest>("invitation_revoquee");
    if (invite.expired) return ko<JoinRequest>("invitation_expiree");
    if (invite.exhausted) return ko<JoinRequest>("invitation_epuisee");

    if (await isActiveMember(actorId, invite.circle_id, tx)) {
      return ko<JoinRequest>("deja_membre");
    }

    // Deuxième clic sur le même lien : on renvoie la demande déjà déposée sans en créer
    // une seconde ni consommer un usage de plus.
    const [pending] = await tx
      .select()
      .from(s.circleJoinRequest)
      .where(
        and(
          eq(s.circleJoinRequest.circleId, invite.circle_id),
          eq(s.circleJoinRequest.accountId, actorId),
          eq(s.circleJoinRequest.status, "pending"),
        ),
      )
      .limit(1);

    if (pending) return ok(pending);

    await tx.execute(sql`
      update circle_invite set use_count = use_count + 1 where id = ${invite.id}
    `);

    const [request] = await tx
      .insert(s.circleJoinRequest)
      .values({
        circleId: invite.circle_id,
        accountId: actorId,
        inviteId: invite.id,
      })
      .returning();

    await recordAudit(tx, {
      action: "cercle.demande.deposee",
      actorId,
      circleId: invite.circle_id,
      targetAccountId: actorId,
    });

    return ok(request);
  });
}

/* -------------------------------------------- les cercles de l'autre parent */

export type CoparentCircle = {
  circleId: string;
  circleName: string;
  coparentName: string;
  demandee: boolean;
};

/**
 * Les cercles où l'autre parent est déjà, et pas moi.
 *
 * Deux parents des mêmes enfants veulent presque toujours la classe en commun, et rien ne
 * les y aidait : il fallait redemander un lien d'invitation à quelqu'un qui l'avait envoyé
 * trois semaines plus tôt. Le raccourci s'arrête là où commence la règle du produit — il
 * dépose une demande, un administrateur valide, comme pour n'importe quel lien.
 *
 * Ce que cela révèle tient en un nom de cercle, à quelqu'un qui partage déjà ses enfants
 * avec le membre en question. Les membres du cercle, eux, n'apprennent rien tant que la
 * demande n'est pas déposée.
 */
export async function coparentCircles(actorId: string): Promise<CoparentCircle[]> {
  const rows = await db.execute<{
    circle_id: string;
    circle_name: string;
    coparent_name: string;
    demandee: boolean;
  }>(sql`
    select c.id as circle_id, c.name as circle_name, a.display_name as coparent_name,
           exists (
             select 1 from circle_join_request r
             where r.circle_id = c.id and r.account_id = ${actorId} and r.status = 'pending'
           ) as demandee
    from coparent p
    join account a
      on a.id = case when p.account_a = ${actorId} then p.account_b else p.account_a end
     and a.deleted_at is null
    join circle_membership m on m.account_id = a.id and m.left_at is null
    join circle c on c.id = m.circle_id and c.archived_at is null
    where (p.account_a = ${actorId} or p.account_b = ${actorId})
      and not exists (
        select 1 from circle_membership mien
        where mien.circle_id = c.id and mien.account_id = ${actorId} and mien.left_at is null
      )
    order by c.name asc
  `);

  return rows.map((r) => ({
    circleId: r.circle_id,
    circleName: r.circle_name,
    coparentName: r.coparent_name,
    demandee: r.demandee,
  }));
}

/**
 * Demander à rejoindre un cercle sans lien, parce que l'autre parent y est.
 *
 * La garde est la même que celle du lien : on ne peut demander que là où l'on a une raison
 * d'être. Ici, la raison est le lien co-parent — sans lui, la demande est refusée sans dire
 * si le cercle existe.
 */
export async function requestJoinAsCoparent(
  actorId: string,
  circleId: string,
): Promise<Result<JoinRequest>> {
  return db.transaction(async (tx) => {
    const autorise = await tx.execute<{ un: number }>(sql`
      select 1 as un
      from coparent p
      join circle_membership m
        on m.account_id = case when p.account_a = ${actorId} then p.account_b else p.account_a end
       and m.circle_id = ${circleId} and m.left_at is null
      join circle c on c.id = m.circle_id and c.archived_at is null
      where (p.account_a = ${actorId} or p.account_b = ${actorId})
      limit 1
    `);

    if (autorise.length === 0) return ko<JoinRequest>("cercle_inconnu");
    if (await isActiveMember(actorId, circleId, tx)) return ko<JoinRequest>("deja_membre");

    const [pending] = await tx
      .select()
      .from(s.circleJoinRequest)
      .where(
        and(
          eq(s.circleJoinRequest.circleId, circleId),
          eq(s.circleJoinRequest.accountId, actorId),
          eq(s.circleJoinRequest.status, "pending"),
        ),
      )
      .limit(1);

    if (pending) return ok(pending);

    const [request] = await tx
      .insert(s.circleJoinRequest)
      .values({ circleId, accountId: actorId })
      .returning();

    await recordAudit(tx, {
      action: "cercle.demande.deposee",
      actorId,
      circleId,
      targetAccountId: actorId,
    });

    return ok(request);
  });
}

export type PendingRequest = {
  id: string;
  accountId: string;
  displayName: string;
  requestedAt: Date;
};

/** Les demandes en attente d'un cercle. Réservé aux administrateurs. */
export async function listPendingRequests(
  actorId: string,
  circleId: string,
): Promise<Result<PendingRequest[]>> {
  if (!(await isCircleAdmin(actorId, circleId))) return ko("pas_admin");

  const rows = await db.execute<{
    id: string;
    account_id: string;
    display_name: string;
    requested_at: Date;
  }>(sql`
    select r.id, r.account_id, a.display_name, r.requested_at
    from circle_join_request r
    join account a on a.id = r.account_id and a.deleted_at is null
    where r.circle_id = ${circleId} and r.status = 'pending'
    order by r.requested_at asc
  `);

  return ok(
    rows.map((r) => ({
      id: r.id,
      accountId: r.account_id,
      displayName: r.display_name,
      requestedAt: asDate(r.requested_at),
    })),
  );
}

async function decideJoin(
  actorId: string,
  requestId: string,
  decision: "approved" | "rejected",
): Promise<Result<void>> {
  return db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(s.circleJoinRequest)
      .where(eq(s.circleJoinRequest.id, requestId))
      .limit(1);

    if (!request) return ko<void>("demande_inconnue");
    if (request.status !== "pending") return ko<void>("demande_deja_traitee");
    if (!(await isCircleAdmin(actorId, request.circleId, tx))) return ko<void>("pas_admin");

    await tx.execute(sql`
      update circle_join_request
      set status = ${decision}, decided_at = now(), decided_by = ${actorId}
      where id = ${requestId}
    `);

    if (decision === "approved") {
      await tx.insert(s.circleMembership).values({
        circleId: request.circleId,
        accountId: request.accountId,
        role: "member",
      });
    }

    await recordAudit(tx, {
      action: decision === "approved" ? "cercle.demande.acceptee" : "cercle.demande.refusee",
      actorId,
      circleId: request.circleId,
      targetAccountId: request.accountId,
    });

    return ok(undefined as void);
  });
}

export const approveJoin = (actorId: string, requestId: string) =>
  decideJoin(actorId, requestId, "approved");

export const rejectJoin = (actorId: string, requestId: string) =>
  decideJoin(actorId, requestId, "rejected");

/* --------------------------------------------------------- départs et rôles */

/**
 * Un cercle ne reste jamais sans administrateur : le membre le plus ancien est promu.
 * Sans admin, plus personne ne peut révoquer une invitation ni exclure quelqu'un — c'est
 * une fuite lente. Un cercle qui n'a plus aucun membre est archivé.
 */
async function ensureAdminSuccession(
  exec: Executor,
  circleId: string,
  actorId: string | null,
  /** Écarté de la succession — utilisé quand quelqu'un vient de renoncer à son rôle. */
  excluding?: string,
): Promise<void> {
  const admins = await exec.execute(sql`
    select 1 from circle_membership
    where circle_id = ${circleId} and left_at is null and role = 'admin'
    limit 1
  `);
  if (admins.length > 0) return;

  const candidates = await exec.execute<{ account_id: string }>(sql`
    select m.account_id
    from circle_membership m
    join account a on a.id = m.account_id and a.deleted_at is null
    where m.circle_id = ${circleId}
      and m.left_at is null
      ${excluding ? sql`and m.account_id <> ${excluding}` : sql``}
    order by m.joined_at asc, m.account_id asc
    limit 1
  `);

  const successor = candidates[0];
  if (!successor) {
    await exec.execute(sql`
      update circle set archived_at = now()
      where id = ${circleId} and archived_at is null
    `);
    return;
  }

  await exec.execute(sql`
    update circle_membership set role = 'admin'
    where circle_id = ${circleId} and account_id = ${successor.account_id} and left_at is null
  `);

  await recordAudit(exec, {
    action: "cercle.admin.succession",
    actorId,
    circleId,
    targetAccountId: successor.account_id,
  });
}

export async function leaveCircle(actorId: string, circleId: string): Promise<Result<void>> {
  return db.transaction(async (tx) => {
    if (!(await isActiveMember(actorId, circleId, tx))) return ko<void>("pas_membre");

    await tx.execute(sql`
      update circle_membership set left_at = now()
      where circle_id = ${circleId} and account_id = ${actorId} and left_at is null
    `);

    await recordAudit(tx, {
      action: "cercle.membre.parti",
      actorId,
      circleId,
      targetAccountId: actorId,
    });

    await ensureAdminSuccession(tx, circleId, actorId);
    return ok(undefined as void);
  });
}

/**
 * Comment cette personne appelle ce cercle.
 *
 * Celui qui crée un cercle le nomme pour lui-même. « Classe 4P » dit quelque chose au parent
 * délégué et rien à celui qui a trois enfants dans trois classes et voudrait lire « Classe de
 * Jules ». Le nom d'origine ne bouge pas : chacun pose le sien par-dessus, et personne
 * d'autre ne le voit.
 *
 * Un alias identique au nom d'origine est effacé plutôt que gardé. Sans cela, le cercle
 * renommé plus tard par son administrateur laisserait derrière lui des copies figées du nom
 * d'avant, chez ceux qui n'avaient rien voulu changer.
 */
export async function setCircleAlias(
  actorId: string,
  circleId: string,
  saisie: string,
): Promise<Result<void>> {
  if (!(await isActiveMember(actorId, circleId))) return ko("pas_membre");

  const [cercle] = await db
    .select({ name: s.circle.name })
    .from(s.circle)
    .where(and(eq(s.circle.id, circleId), isNull(s.circle.archivedAt)))
    .limit(1);

  if (!cercle) return ko("cercle_inconnu");

  const alias = saisie.trim().slice(0, 60);
  const garde = alias && alias !== cercle.name ? alias : null;

  await db
    .update(s.circleMembership)
    .set({ alias: garde })
    .where(
      and(
        eq(s.circleMembership.accountId, actorId),
        eq(s.circleMembership.circleId, circleId),
        isNull(s.circleMembership.leftAt),
      ),
    );

  return ok(undefined as void);
}

export async function removeMember(
  actorId: string,
  circleId: string,
  targetId: string,
): Promise<Result<void>> {
  if (actorId === targetId) return ko("action_sur_soi");

  return db.transaction(async (tx) => {
    if (!(await isCircleAdmin(actorId, circleId, tx))) return ko<void>("pas_admin");
    if (!(await isActiveMember(targetId, circleId, tx))) return ko<void>("cible_inconnue");

    await tx.execute(sql`
      update circle_membership set left_at = now()
      where circle_id = ${circleId} and account_id = ${targetId} and left_at is null
    `);

    await recordAudit(tx, {
      action: "cercle.membre.exclu",
      actorId,
      circleId,
      targetAccountId: targetId,
    });

    await ensureAdminSuccession(tx, circleId, actorId);
    return ok(undefined as void);
  });
}

export async function setRole(
  actorId: string,
  circleId: string,
  targetId: string,
  role: "admin" | "member",
): Promise<Result<void>> {
  return db.transaction(async (tx) => {
    if (!(await isCircleAdmin(actorId, circleId, tx))) return ko<void>("pas_admin");
    if (!(await isActiveMember(targetId, circleId, tx))) return ko<void>("cible_inconnue");

    await tx.execute(sql`
      update circle_membership set role = ${role}
      where circle_id = ${circleId} and account_id = ${targetId} and left_at is null
    `);

    await recordAudit(tx, {
      action: "cercle.role.change",
      actorId,
      circleId,
      targetAccountId: targetId,
      detail: { role },
    });

    // Si c'était le dernier administrateur qui renonce, quelqu'un d'autre doit prendre
    // le relais — sinon plus personne ne peut révoquer une invitation.
    await ensureAdminSuccession(
      tx,
      circleId,
      actorId,
      role === "member" ? targetId : undefined,
    );
    return ok(undefined as void);
  });
}

/* -------------------------------------------------------------- liens coupés */

/** Ordre canonique imposé par la base : la coupure est la même dans les deux sens. */
function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * Couper le lien avec une personne d'un cercle : elle ne voit plus mes publications, et
 * je ne vois plus les siennes. Rien ne le lui signale.
 *
 * Volontairement absent du journal d'audit : c'est un réglage personnel de discrétion,
 * pas un changement de droits. En garder trace reviendrait à tenir un registre de qui
 * s'évite, ce qui n'est pas le rôle de ce produit.
 */
export async function cutLink(
  actorId: string,
  circleId: string,
  otherId: string,
): Promise<Result<void>> {
  if (actorId === otherId) return ko("action_sur_soi");
  if (!(await isActiveMember(actorId, circleId))) return ko("pas_membre");
  if (!(await isActiveMember(otherId, circleId))) return ko("cible_inconnue");

  const [accountA, accountB] = canonicalPair(actorId, otherId);
  await db
    .insert(s.circleLinkCut)
    .values({ circleId, accountA, accountB, cutBy: actorId })
    .onConflictDoNothing();

  return ok(undefined as void);
}

export async function restoreLink(
  actorId: string,
  circleId: string,
  otherId: string,
): Promise<Result<void>> {
  if (actorId === otherId) return ko("action_sur_soi");
  if (!(await isActiveMember(actorId, circleId))) return ko("pas_membre");

  const [accountA, accountB] = canonicalPair(actorId, otherId);
  await db
    .delete(s.circleLinkCut)
    .where(
      and(
        eq(s.circleLinkCut.circleId, circleId),
        eq(s.circleLinkCut.accountA, accountA),
        eq(s.circleLinkCut.accountB, accountB),
      ),
    );

  return ok(undefined as void);
}

/* ------------------------------------------------------------------ lectures */

export async function listInvites(
  actorId: string,
  circleId: string,
): Promise<Result<CircleInvite[]>> {
  if (!(await isActiveMember(actorId, circleId))) return ko("pas_membre");

  const admin = await isCircleAdmin(actorId, circleId);
  const rows = await db
    .select()
    .from(s.circleInvite)
    .where(
      admin
        ? and(eq(s.circleInvite.circleId, circleId), isNull(s.circleInvite.revokedAt))
        : and(
            eq(s.circleInvite.circleId, circleId),
            eq(s.circleInvite.createdBy, actorId),
            isNull(s.circleInvite.revokedAt),
          ),
    );

  return ok(rows);
}
