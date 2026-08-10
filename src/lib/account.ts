/**
 * Suppression d'un compte.
 *
 * La page d'information promet qu'un parent peut partir et que ses données disparaissent.
 * Ce fichier est ce qui rend cette phrase vraie — sinon elle ne serait qu'une intention.
 *
 * Ce qui disparaît : les sorties, les participations, le rattachement aux enfants, les
 * réglages, les sessions, l'adresse électronique et le nom affiché.
 * Ce qui subsiste, volontairement : les cercles qu'il avait créés — ils appartiennent à
 * leurs membres, pas à leur fondateur — et les entrées du journal d'audit, dont les
 * références au compte sont effacées mais dont la trace de l'acte reste.
 */

import { and, eq, isNull, sql } from "drizzle-orm";

import { recordAudit } from "./audit";
import { leaveCircle } from "./circles";
import { db } from "./db";
import * as s from "./db/schema";

export type DeleteReport = {
  cerclesQuittes: number;
  sortiesEffacees: number;
  enfantsDetaches: number;
};

export async function deleteAccount(actorId: string): Promise<DeleteReport> {
  // 1. Quitter tous les cercles, un par un : chaque départ peut déclencher une succession
  //    d'administrateur, qui doit se jouer dans sa propre transaction.
  const cercles = await db
    .select({ circleId: s.circleMembership.circleId })
    .from(s.circleMembership)
    .where(
      and(eq(s.circleMembership.accountId, actorId), isNull(s.circleMembership.leftAt)),
    );

  for (const { circleId } of cercles) {
    await leaveCircle(actorId, circleId);
  }

  return db.transaction(async (tx) => {
    // 2. Les sorties dont il est l'auteur disparaissent, avec leurs destinataires et
    //    leurs participants (cascade en base).
    const sorties = await tx.execute<{ id: string }>(sql`
      delete from publication where author_id = ${actorId} returning id
    `);

    // 3. Ses participations aux sorties des autres.
    await tx.execute(sql`
      delete from publication_participant where account_id = ${actorId}
    `);
    await tx.execute(sql`
      delete from publication_hidden_from where account_id = ${actorId}
    `);

    // 4. Ses enfants : le rattachement disparaît ; la fiche aussi s'il était le seul parent.
    const enfants = await tx.execute<{ child_id: string }>(sql`
      delete from child_parent where account_id = ${actorId} returning child_id
    `);
    await tx.execute(sql`
      update child set deleted_at = now()
      where deleted_at is null
        and not exists (select 1 from child_parent cp where cp.child_id = child.id)
    `);

    // 5. Réglages, accès, appareils.
    await tx.execute(sql`delete from notification_pref where account_id = ${actorId}`);
    await tx.execute(sql`
      delete from notification_mute
      where account_id = ${actorId} or muted_account_id = ${actorId}
    `);
    await tx.execute(sql`
      delete from circle_link_cut where account_a = ${actorId} or account_b = ${actorId}
    `);
    await tx.execute(sql`delete from push_subscription where account_id = ${actorId}`);
    await tx.execute(sql`delete from session where account_id = ${actorId}`);
    await tx.execute(sql`
      delete from magic_link
      where email = (select email from account where id = ${actorId})
    `);

    // 6. Le journal garde la trace des actes, plus les personnes.
    await tx.execute(sql`
      update audit_log set actor_id = null where actor_id = ${actorId}
    `);
    await tx.execute(sql`
      update audit_log set target_account_id = null where target_account_id = ${actorId}
    `);

    // 7. Le compte lui-même : adresse et nom effacés, ligne conservée uniquement pour que
    //    les clés étrangères restantes ne pointent pas dans le vide.
    await tx.execute(sql`
      update account
      set email = 'supprime+' || id || '@totir.invalid',
          display_name = 'Compte supprimé',
          last_seen_at = null,
          deleted_at = now()
      where id = ${actorId}
    `);

    await recordAudit(tx, { action: "compte.supprime" });

    return {
      cerclesQuittes: cercles.length,
      sortiesEffacees: sorties.length,
      enfantsDetaches: enfants.length,
    };
  });
}
