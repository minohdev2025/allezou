/**
 * Effacement automatique. Tout ce que la page d'information promet est fait ici.
 *
 * Une donnée qui n'a plus d'usage doit disparaître sans que personne n'ait à y penser :
 * l'expiration plutôt que la suppression manuelle. À brancher sur une tâche planifiée
 * quotidienne (`npm run maintenance`).
 */

import { sql } from "drizzle-orm";

import { purgePastEvents } from "./calendar";
import { db } from "./db";
import { purgeExpired } from "./publications";

/**
 * Le journal d'audit n'enregistre que des changements de droits, jamais des sorties.
 * Douze mois suffisent pour comprendre comment quelqu'un est entré dans un cercle ;
 * au-delà, ce n'est plus de la sécurité, c'est une archive.
 */
export const RETENTION_AUDIT_MOIS = 12;

/** Les activités du calendrier passées depuis plus longtemps ne servent plus. */
export const RETENTION_EVENEMENTS_JOURS = 90;

export async function purgeAuditLog(months = RETENTION_AUDIT_MOIS): Promise<number> {
  const rows = await db.execute<{ id: string }>(sql`
    delete from audit_log
    where at < now() - make_interval(months => ${months})
    returning id
  `);
  return rows.length;
}

/** Liens de connexion et sessions périmés : plus rien à en faire. */
export async function purgeAccessTokens(): Promise<{ links: number; sessions: number }> {
  const links = await db.execute<{ id: string }>(sql`
    delete from magic_link
    where expires_at < now() - interval '1 day' or used_at is not null
    returning id
  `);
  const sessions = await db.execute<{ id: string }>(sql`
    delete from session where expires_at < now() returning id
  `);
  return { links: links.length, sessions: sessions.length };
}

/** Abonnements push définitivement muets : on ne garde pas d'adresse d'appareil morte. */
export async function purgeDeadSubscriptions(days = 30): Promise<number> {
  const rows = await db.execute<{ id: string }>(sql`
    delete from push_subscription
    where failed_at is not null and failed_at < now() - make_interval(days => ${days})
    returning id
  `);
  return rows.length;
}

export type PurgeReport = {
  presencesExpirees: number;
  activitesPassees: number;
  journalAudit: number;
  liensDeConnexion: number;
  sessions: number;
  abonnementsMorts: number;
};

export async function purgeAll(): Promise<PurgeReport> {
  const presencesExpirees = await purgeExpired();
  const activitesPassees = await purgePastEvents(RETENTION_EVENEMENTS_JOURS);
  const journalAudit = await purgeAuditLog();
  const { links, sessions } = await purgeAccessTokens();
  const abonnementsMorts = await purgeDeadSubscriptions();

  return {
    presencesExpirees,
    activitesPassees,
    journalAudit,
    liensDeConnexion: links,
    sessions,
    abonnementsMorts,
  };
}
