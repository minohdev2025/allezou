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
  // Cercles — la liste blanche d'origine. Voir le commentaire en tête.
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
  "cercle.lien_coupe",
  "cercle.lien_retabli",
  // Co-parentalité — pas dans l'original, ajouté pour répondre à
  // « qui a invité mon ex et quand ». Pas une publication, donc OK.
  "coparent.invitation.creee",
  "coparent.invitation.acceptee",
  "coparent.separation",
  // Auth — pas dans l'original, ajouté pour pouvoir répondre à
  // « je n'ai jamais reçu mon lien magique » et détecter les attaques
  // (même IP qui demande 100 liens / minute). Pas une publication, donc OK.
  "auth.lien_magique.demande",
  "auth.lien_magique.consomme",
  "auth.lien_magique.consommation.echec",
  "auth.passkey.enregistree",
  "auth.passkey.utilisee",
  "auth.passkey.utilisation.echec",
  "auth.session.detruite",
  "auth.tentative.bloquee_rate_limit",
  // Comptes.
  "compte.supprime",
  "compte.sessions.revoquees",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * Issue d'une action d'auth : `ok` quand elle a réussi, ou un code court
 * qui dit pourquoi elle a échoué. Les actions non-auth (cercle.*, compte.*)
 * restent à `ok` — leur succès/échec est encodé dans l'action elle-même
 * (cercle.demande.refusee vs cercle.demande.acceptee).
 */
export type AuditOutcome =
  | "ok"
  | "entree_invalide"
  | "rate_limite"
  | "expire"
  | "deja_utilise"
  | "jeton_inconnu"
  | "non_authentifie"
  | "refuse"
  | "erreur_interne";

export type AuditEntry = {
  action: AuditAction;
  actorId?: string | null;
  circleId?: string | null;
  targetAccountId?: string | null;
  /**
   * Email visé par l'action, dans le cas d'auth (avant création du compte).
   * Nul sinon. RGPD-compatible : c'est l'utilisateur qui l'a fourni.
   */
  targetEmail?: string | null;
  outcome?: AuditOutcome;
  /**
   * Hash SHA-256 salé de l'IP du client. Voir `audit-ip.ts` pour le calcul
   * et le sel. Nul si l'IP est absente (tests, scripts).
   */
  ipHash?: string | null;
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
    targetEmail: entry.targetEmail ?? null,
    outcome: entry.outcome ?? "ok",
    ipHash: entry.ipHash ?? null,
    detail: entry.detail ?? null,
  });
}
