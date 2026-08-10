/**
 * Notifications, réglables cercle par cercle et personne par personne.
 *
 * Deux principes tiennent ce fichier :
 *
 * 1. **Une notification est une divulgation.** Les destinataires sont calculés par la règle
 *    de visibilité elle-même (`readersOfPublication`), jamais par une requête écrite ici.
 *    Personne ne peut donc être notifié de ce qu'il ne verrait pas à l'écran.
 *
 * 2. **Chaque notification doit être justifiable.** Le contenu envoyé ne dit ni qui, ni où :
 *    seulement le cercle concerné et la nature du signal. Un téléphone posé sur une table
 *    ne doit pas apprendre à un tiers qu'une famille est au parc du Gué jusqu'à midi.
 *    Le détail s'affiche à l'ouverture de l'application.
 */

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "./db";
import { asDateOrNull } from "./db/rows";
import * as s from "./db/schema";
import { readersOfPublication } from "./visibility";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
};

export type PushTarget = {
  accountId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/** Injectable : les tests n'envoient rien, la production passe par web-push. */
export type Sender = (target: PushTarget, payload: PushPayload) => Promise<void>;

/* ------------------------------------------------------------- abonnements */

export async function subscribe(
  accountId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
): Promise<void> {
  await db
    .insert(s.pushSubscription)
    .values({
      accountId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    })
    .onConflictDoUpdate({
      target: s.pushSubscription.endpoint,
      set: {
        accountId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        failedAt: null,
      },
    });
}

/**
 * On ne supprime que ses propres abonnements : sans le compte dans la condition, il
 * suffirait de connaître l'adresse d'un appareil pour couper les notifications d'autrui.
 */
export async function unsubscribe(accountId: string, endpoint: string): Promise<void> {
  await db
    .delete(s.pushSubscription)
    .where(
      and(
        eq(s.pushSubscription.endpoint, endpoint),
        eq(s.pushSubscription.accountId, accountId),
      ),
    );
}

/* ----------------------------------------------------------------- réglages */

export type ReglageCercle = {
  circleId: string;
  circleName: string;
  onPresence: boolean;
  onAttendance: boolean;
  pausedUntil: Date | null;
};

/** Les réglages d'un compte pour chacun de ses cercles, valeurs par défaut comprises. */
export async function prefsParCercle(accountId: string): Promise<ReglageCercle[]> {
  const rows = await db.execute<{
    circle_id: string;
    circle_name: string;
    on_presence: boolean;
    on_attendance: boolean;
    paused_until: Date | null;
  }>(sql`
    select
      c.id as circle_id,
      c.name as circle_name,
      coalesce(np.on_presence, true) as on_presence,
      coalesce(np.on_attendance, true) as on_attendance,
      np.paused_until
    from circle_membership m
    join circle c on c.id = m.circle_id and c.archived_at is null
    left join notification_pref np
      on np.account_id = m.account_id and np.circle_id = c.id
    where m.account_id = ${accountId}
      and m.left_at is null
    order by c.name asc
  `);

  return rows.map((r) => ({
    circleId: r.circle_id,
    circleName: r.circle_name,
    onPresence: r.on_presence,
    onAttendance: r.on_attendance,
    pausedUntil: asDateOrNull(r.paused_until),
  }));
}

/** Les personnes mises en sourdine dans un cercle. */
export async function mutedIn(accountId: string, circleId: string): Promise<Set<string>> {
  const rows = await db
    .select({ mutedAccountId: s.notificationMute.mutedAccountId })
    .from(s.notificationMute)
    .where(
      and(
        eq(s.notificationMute.accountId, accountId),
        eq(s.notificationMute.circleId, circleId),
      ),
    );
  return new Set(rows.map((r) => r.mutedAccountId));
}

export type NotificationPrefs = {
  onPresence: boolean;
  onAttendance: boolean;
  pausedUntil: Date | null;
};

/** Par défaut, on est notifié de tout dans un cercle qu'on vient de rejoindre. */
export const PREFS_PAR_DEFAUT: NotificationPrefs = {
  onPresence: true,
  onAttendance: true,
  pausedUntil: null,
};

export async function setPrefs(
  accountId: string,
  circleId: string,
  prefs: Partial<NotificationPrefs>,
): Promise<void> {
  await db
    .insert(s.notificationPref)
    .values({ accountId, circleId, ...PREFS_PAR_DEFAUT, ...prefs })
    .onConflictDoUpdate({
      target: [s.notificationPref.accountId, s.notificationPref.circleId],
      set: prefs,
    });
}

/** Mise en pause temporaire, en heures. Zéro heure lève la pause. */
export async function pauseCircle(
  accountId: string,
  circleId: string,
  hours: number,
): Promise<void> {
  await db
    .insert(s.notificationPref)
    .values({
      accountId,
      circleId,
      ...PREFS_PAR_DEFAUT,
      pausedUntil: hours > 0 ? new Date(Date.now() + hours * 3_600_000) : null,
    })
    .onConflictDoUpdate({
      target: [s.notificationPref.accountId, s.notificationPref.circleId],
      set: { pausedUntil: hours > 0 ? new Date(Date.now() + hours * 3_600_000) : null },
    });
}

/**
 * Ne plus être notifié d'une personne, sans couper le lien : on continue de la voir dans
 * l'application, elle ne fait simplement plus sonner le téléphone.
 */
export async function muteMember(
  accountId: string,
  circleId: string,
  mutedAccountId: string,
): Promise<void> {
  await db
    .insert(s.notificationMute)
    .values({ accountId, circleId, mutedAccountId })
    .onConflictDoNothing();
}

export async function unmuteMember(
  accountId: string,
  circleId: string,
  mutedAccountId: string,
): Promise<void> {
  await db
    .delete(s.notificationMute)
    .where(
      and(
        eq(s.notificationMute.accountId, accountId),
        eq(s.notificationMute.circleId, circleId),
        eq(s.notificationMute.mutedAccountId, mutedAccountId),
      ),
    );
}

/* -------------------------------------------------------------- destinataires */

export type Recipient = {
  accountId: string;
  circleId: string;
  circleName: string;
};

/**
 * Qui doit être notifié d'une publication.
 *
 * Départ obligé : la liste de ceux qui la voient. On n'en retire ensuite que des gens —
 * jamais on n'en ajoute.
 */
export async function recipientsFor(publicationId: string): Promise<Recipient[]> {
  const lecteurs = await readersOfPublication(publicationId);
  if (lecteurs.length === 0) return [];

  const rows = await db.execute<{
    account_id: string;
    circle_id: string;
    circle_name: string;
  }>(sql`
    select distinct
      m.account_id,
      c.id as circle_id,
      c.name as circle_name
    from publication p
    join publication_circle pc on pc.publication_id = p.id
    join circle c on c.id = pc.circle_id and c.archived_at is null
    join circle_membership m
      on m.circle_id = c.id
     and m.left_at is null
     and m.account_id = any(${sql.param(lecteurs)}::uuid[])
    left join notification_pref np
      on np.account_id = m.account_id and np.circle_id = c.id
    where p.id = ${publicationId}
      -- l'auteur n'est pas notifié de sa propre sortie
      and m.account_id <> p.author_id
      -- réglages du cercle, valeurs par défaut si rien n'a été réglé
      and coalesce(
            case when p.kind = 'presence' then np.on_presence else np.on_attendance end,
            true
          )
      and (np.paused_until is null or np.paused_until <= now())
      -- personne mise en sourdine dans ce cercle
      and not exists (
        select 1 from notification_mute nm
        where nm.account_id = m.account_id
          and nm.circle_id = c.id
          and nm.muted_account_id = p.author_id
      )
  `);

  return rows.map((r) => ({
    accountId: r.account_id,
    circleId: r.circle_id,
    circleName: r.circle_name,
  }));
}

/**
 * Le contenu envoyé au téléphone. Ni le nom de la personne, ni le lieu : seulement le
 * cercle et la nature du signal, pour qu'un écran verrouillé posé sur une table ne raconte
 * rien de plus qu'il ne faut.
 */
export function payloadFor(
  kind: "presence" | "attendance",
  circleName: string,
): PushPayload {
  return {
    title: circleName,
    body:
      kind === "presence"
        ? "Une sortie est en cours"
        : "Une inscription vient d'être ajoutée",
    url: kind === "presence" ? "/maintenant" : "/agenda",
  };
}

/* ---------------------------------------------------------------- envoi */

export type NotifyReport = { sent: number; failed: number; recipients: number };

export async function notifyPublication(
  publicationId: string,
  send: Sender,
): Promise<NotifyReport> {
  const [publication] = await db
    .select({ kind: s.publication.kind })
    .from(s.publication)
    .where(eq(s.publication.id, publicationId))
    .limit(1);
  if (!publication) return { sent: 0, failed: 0, recipients: 0 };

  const recipients = await recipientsFor(publicationId);
  const report: NotifyReport = { sent: 0, failed: 0, recipients: recipients.length };

  // Une personne peut être destinataire par plusieurs cercles : on ne la prévient qu'une fois.
  const parCompte = new Map<string, Recipient>();
  for (const r of recipients) if (!parCompte.has(r.accountId)) parCompte.set(r.accountId, r);

  for (const recipient of parCompte.values()) {
    const abonnements = await db
      .select()
      .from(s.pushSubscription)
      .where(
        and(
          eq(s.pushSubscription.accountId, recipient.accountId),
          isNull(s.pushSubscription.failedAt),
        ),
      );

    for (const abonnement of abonnements) {
      try {
        await send(
          {
            accountId: recipient.accountId,
            endpoint: abonnement.endpoint,
            p256dh: abonnement.p256dh,
            auth: abonnement.auth,
          },
          payloadFor(publication.kind, recipient.circleName),
        );
        await db
          .update(s.pushSubscription)
          .set({ lastUsedAt: new Date() })
          .where(eq(s.pushSubscription.id, abonnement.id));
        report.sent += 1;
      } catch {
        // Un abonnement mort (téléphone réinitialisé, autorisation retirée) est écarté
        // plutôt que réessayé indéfiniment.
        await db
          .update(s.pushSubscription)
          .set({ failedAt: new Date() })
          .where(eq(s.pushSubscription.id, abonnement.id));
        report.failed += 1;
      }
    }
  }

  return report;
}

/** L'expéditeur de production. Chargé à la demande pour ne pas exiger les clés en test. */
export async function webPushSender(): Promise<Sender> {
  const webpush = (await import("web-push")).default;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error("Clés VAPID manquantes — npx web-push generate-vapid-keys");
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:contact@example.ch",
    publicKey,
    privateKey,
  );

  return async (target, payload) => {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
    );
  };
}
