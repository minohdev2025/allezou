/**
 * Traçabilité des actes sensibles.
 *
 * Ce journal existe pour une seule raison : pouvoir répondre à « qui a fait entrer cette
 * personne dans ce cercle, et quand ». Il enregistre des changements de droits, jamais des
 * usages.
 *
 * Aucune publication n'y entre — ni présence, ni participation, ni lieu fréquenté. Un
 * journal qui enregistrerait les sorties reconstituerait exactement l'historique de
 * déplacement que PRODUIT.md interdit. La liste blanche ci-dessous est la garantie, et un
 * test vérifie qu'elle ne contient rien qui touche aux publications.
 */

import type { Executor } from "./db";
import * as s from "./db/schema";

export type { Executor };

export const AUDIT_ACTIONS = [
  "cercle.cree",
  "cercle.invitation.creee",
  "cercle.invitation.revoquee",
  "cercle.demande.deposee",
  "cercle.demande.acceptee",
  "cercle.demande.refusee",
  "cercle.membre.parti",
  "cercle.membre.exclu",
  "cercle.role.change",
  "cercle.admin.succession",
  "compte.supprime",
  "compte.sessions.revoquees",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditEntry = {
  action: AuditAction;
  actorId?: string | null;
  circleId?: string | null;
  targetAccountId?: string | null;
  detail?: Record<string, unknown>;
};

export async function recordAudit(exec: Executor, entry: AuditEntry): Promise<void> {
  // Garde d'exécution et non seulement de compilation : la liste blanche est la garantie
  // qu'aucune publication n'atterrit ici, elle doit tenir même hors du typage.
  if (!(AUDIT_ACTIONS as readonly string[]).includes(entry.action)) {
    throw new Error(`Action de journal non autorisée : ${entry.action}`);
  }

  await exec.insert(s.auditLog).values({
    action: entry.action,
    actorId: entry.actorId ?? null,
    circleId: entry.circleId ?? null,
    targetAccountId: entry.targetAccountId ?? null,
    detail: entry.detail ?? null,
  });
}
